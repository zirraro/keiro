/**
 * HUGO — GESTION AUTONOME DE LA BOÎTE MAIL.
 * Founder 25/07 : Hugo doit gérer la boîte "en véritable expert administratif" —
 * nettoyer (supprimer pubs/spam), archiver le bruit, TAGUER et RANGER dans des
 * dossiers, repérer l'important, RÉPONDRE aux vrais mails (envoi auto ou brouillon
 * selon le toggle), et POSER UNE QUESTION en cas de doute.
 *
 * DEUX providers, même logique (parité Gmail ↔ domaine perso) :
 *   - Gmail / Workspace (Option B, gmail.modify) → lib/gmail-read + gmail-oauth
 *   - Nom de domaine via IMAP (OVH, Gandi, Zoho, 365…) → lib/agents/imap-mailbox
 *
 * Il agit tout seul sur les cas CLAIRS et n'agit PAS sur les cas sensibles/ambigus
 * (il les remonte au client). Gaté : inerte si aucun provider n'est connecté.
 */
import { listRecentGmail, manageGmailMessage, getOrCreateGmailLabel, mailboxEnabled, createGmailDraft, getGmailMessageBody, cleanStaleGmailDrafts } from '@/lib/gmail-read';
import { callClaudeHaiku } from '@/lib/agents/gemini';
import { getValidGmailToken, sendViaGmail } from '@/lib/gmail-oauth';
import { getEmailReplyMode } from '@/lib/agents/hugo-reply';
import { hasImap, listImapInbox, getImapMessageBody, manageImapMessage, getOrCreateImapFolder } from '@/lib/agents/imap-mailbox';
import { createImapDraft, sendImapDraft } from '@/lib/agents/imap-drafts';
import { createClient } from '@supabase/supabase-js';

const senderEmail = (from: string) => { const m = (from || '').match(/<([^>]+)>/); return (m ? m[1] : from || '').trim(); };
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

type Decision = { i: number; action: 'trash' | 'archive' | 'label' | 'keep' | 'ask' | 'reply'; label?: string; important?: boolean; reason?: string; question?: string };

interface MailLite { id: string; from: string; subject: string; snippet: string }

/** Abstraction provider : Gmail ou IMAP, mêmes opérations pour la boucle de tri. */
interface MailOps {
  provider: 'gmail' | 'imap';
  list(max: number): Promise<{ enabled: boolean; messages: MailLite[] }>;
  body(id: string): Promise<{ body?: string; threadRef?: string }>;
  trash(id: string): Promise<void>;
  archive(id: string): Promise<void>;
  moveToFolder(id: string, folder: string): Promise<void>;
  star(id: string): Promise<void>;
  sendReply(id: string, to: string, subject: string, html: string, replyTo: string, threadRef?: string): Promise<void>;
  draftReply(id: string, to: string, subject: string, html: string, replyTo: string, threadRef?: string): Promise<void>;
}

const SYSTEM = `Tu es Hugo, assistant administratif email de NIVEAU ÉLITE. Tu gères la boîte de réception d'un commerçant/entrepreneur pour qu'il ne rate RIEN d'important et garde une boîte propre et rangée. On te donne une liste de mails (expéditeur, objet, extrait). Pour CHAQUE mail, décide une action :

- "trash" : pub/marketing/spam évident, newsletters promotionnelles sans valeur, notifications inutiles. (Nettoyage.)
- "archive" : notifications/newsletters informatives SANS action requise (retire de la boîte, garde l'archive).
- "label" : mail important à RANGER dans un dossier. Donne un "label" parmi : "Prospects" (réponse d'un prospect/lead), "Clients" (message d'un client existant), "Factures & Admin" (factures, banque, impôts, contrats, RH), "À traiter" (demande qui exige une action/réponse).
- "reply" : un VRAI humain (client, prospect, partenaire) pose une question ou attend une réponse à laquelle on peut répondre utilement → Hugo rédige la réponse. NE choisis "reply" QUE pour un message humain qui attend clairement une réponse. JAMAIS pour une pub, une newsletter, une notification automatique, un no-reply.
- "keep" : à laisser en boîte, rien à faire.
- "ask" : DOUTE ou enjeu élevé (argent, juridique, décision importante, expéditeur inconnu au ton pressant) → NE PAS agir, poser une question courte au propriétaire dans "question".

Règles : sois PRUDENT — en cas de doute sur "trash", préfère "archive" ou "ask". Ne mets JAMAIS en trash un mail qui pourrait être un client, un prospect, une facture, une administration, ou une réponse attendue. En cas de doute entre "reply" et "ask" (enjeu élevé), choisis "ask". Marque "important": true pour tout ce qui mérite l'attention du propriétaire.

LANGUE : "question" et "reason" s'adressent au propriétaire de la boîte et doivent être écrits en FRANÇAIS, quelle que soit la langue du mail analysé. Une question posée en anglais à un commerçant français est inutilisable.

Réponds UNIQUEMENT en JSON : {"decisions":[{"i":0,"action":"trash","label":null,"important":false,"reason":"pub","question":null}, ...]}. Pas de markdown.`;

export interface TriageResult {
  enabled: boolean;
  provider?: 'gmail' | 'imap';
  processed: number;
  trashed: number;
  archived: number;
  labeled: number;
  kept: number;
  replied: number;
  drafted: number;
  questions: { from: string; subject: string; question: string }[];
  summary: string;
}

// Libellés de traçabilité (le « filtre rapide » demandé par le founder 25/07) :
// le client retrouve d'un clic ce que Hugo a envoyé vs préparé en brouillon.
const LABEL_REPLIED = 'Hugo · Répondu ✅';
const LABEL_DRAFTED = 'Hugo · Brouillon ✍️';

/** Construit l'abstraction Gmail (Option B). */
function gmailOps(userId: string, tokenGetter: () => Promise<{ accessToken: string; email: string } | null>, bizName: string): MailOps {
  const tagCache: Record<string, string> = {};
  const tag = async (id: string, label: string, keepInInbox: boolean) => {
    try {
      let lid = tagCache[label];
      if (!lid) { const lr = await getOrCreateGmailLabel(userId, label); lid = lr.id || ''; if (lid) tagCache[label] = lid; }
      if (lid) await manageGmailMessage(userId, id, keepInInbox ? 'label' : 'move', lid);
    } catch { /* best-effort */ }
  };
  return {
    provider: 'gmail',
    async list(max) {
      const r = await listRecentGmail(userId, { max, query: 'in:inbox' });
      return { enabled: r.enabled, messages: (r.messages || []).map(m => ({ id: m.id, from: m.from, subject: m.subject, snippet: m.snippet })) };
    },
    async body(id) { const b = await getGmailMessageBody(userId, id).catch(() => null); return { body: b?.body, threadRef: b?.threadId }; },
    async trash(id) { await manageGmailMessage(userId, id, 'trash'); },
    async archive(id) { await manageGmailMessage(userId, id, 'archive'); },
    async moveToFolder(id, folder) { const lr = await getOrCreateGmailLabel(userId, folder); if (lr.id) await manageGmailMessage(userId, id, 'move', lr.id); },
    async star(id) { await manageGmailMessage(userId, id, 'star'); },
    async sendReply(id, to, subject, html, replyTo) {
      const tok = await tokenGetter(); if (!tok?.accessToken) throw new Error('no gmail token');
      await sendViaGmail(tok.accessToken, to, subject, html, bizName || undefined, tok.email, replyTo);
      await tag(id, LABEL_REPLIED, false); // répondu → tag + sort de l'INBOX
    },
    async draftReply(id, to, subject, html, replyTo, threadRef) {
      const tok = await tokenGetter();
      await createGmailDraft(userId, { to, subject, htmlBody: html, fromName: bizName || undefined, fromEmail: tok?.email, replyTo, threadId: threadRef });
      await tag(id, LABEL_DRAFTED, true); // brouillon prêt → tag mais reste en INBOX (tu valides)
    },
  };
}

/** Construit l'abstraction IMAP (nom de domaine perso). uid stocké en string. */
function imapOps(userId: string): MailOps {
  const folderCache: Record<string, string> = {};
  return {
    provider: 'imap',
    async list(max) {
      const r = await listImapInbox(userId, max);
      return { enabled: r.enabled, messages: r.messages.map(m => ({ id: String(m.uid), from: m.from, subject: m.subject, snippet: m.snippet })) };
    },
    async body(id) { const b = await getImapMessageBody(userId, Number(id)).catch(() => null); return { body: b?.body, threadRef: b?.messageId }; },
    async trash(id) { await manageImapMessage(userId, Number(id), 'trash'); },
    async archive(id) { await manageImapMessage(userId, Number(id), 'archive'); },
    async moveToFolder(id, folder) {
      let path = folderCache[folder];
      if (!path) { const r = await getOrCreateImapFolder(userId, folder); path = r.path || ''; if (path) folderCache[folder] = path; }
      if (path) await manageImapMessage(userId, Number(id), 'move', path);
    },
    async star(id) { await manageImapMessage(userId, Number(id), 'star'); },
    async sendReply(id, to, subject, html, _replyTo, threadRef) {
      const d = await createImapDraft(userId, { to, subject, html, inReplyTo: threadRef });
      if (d.created && d.uid != null) { await sendImapDraft(userId, d.uid); }
      await manageImapMessage(userId, Number(id), 'archive').catch(() => {});
    },
    async draftReply(_id, to, subject, html, _replyTo, threadRef) {
      await createImapDraft(userId, { to, subject, html, inReplyTo: threadRef });
    },
  };
}

export async function triageMailbox(userId: string, opts: { max?: number; dryRun?: boolean; bulk?: boolean } = {}): Promise<TriageResult> {
  const empty: TriageResult = { enabled: false, processed: 0, trashed: 0, archived: 0, labeled: 0, kept: 0, replied: 0, drafted: 0, questions: [], summary: '' };

  // Contexte + mode d'envoi (toggle Hugo : auto_send | draft).
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  let bizName = ''; let bizCtx = '';
  try {
    const { data: dos } = await sb.from('business_dossiers').select('business_name, business_type, business_description, dossier_data').eq('user_id', userId).maybeSingle();
    bizName = dos?.business_name || '';
    bizCtx = [dos?.business_type, dos?.business_description, typeof dos?.dossier_data === 'object' ? JSON.stringify(dos?.dossier_data).slice(0, 1500) : ''].filter(Boolean).join(' | ');
  } catch { /* best-effort */ }

  // Sélection du provider : Gmail Option B en priorité, sinon IMAP domaine perso.
  let ops: MailOps | null = null;
  if (await mailboxEnabled(userId)) ops = gmailOps(userId, () => getValidGmailToken(userId), bizName);
  else if (await hasImap(userId)) ops = imapOps(userId);
  if (!ops) return empty;

  const replyMode = await getEmailReplyMode(sb, userId).catch(() => 'auto_send' as const);

  // ── PASSE EN MASSE (Gmail) : PROTÉGER → RANGER → NETTOYER ──
  // Une vraie boîte fait 100 000+ mails : un modèle qui en juge 25 par passage
  // n'y change rien, et en faire juger 100 000 serait long et cher. On travaille
  // donc en opérateurs de recherche Gmail + batchModify (1000 par appel), et le
  // modèle ne s'occupe plus que du reliquat ambigu.
  //
  // L'ORDRE EST LA CORRECTION PRINCIPALE (retour fondateur 30/07) : on RANGE
  // avant de nettoyer, parce qu'un message étiqueté devient intouchable pour la
  // phase de nettoyage. Auparavant l'inverse envoyait à la corbeille des mails
  // de clients tombés dans l'onglet Promotions. Le détail des règles est dans
  // lib/agents/mailbox-rules.ts.
  const bulk: { trashed: number; archived: number; labeled: number; folders: Record<string, number> } = { trashed: 0, archived: 0, labeled: 0, folders: {} };
  if (ops.provider === 'gmail' && opts.bulk !== false) {
    try {
      const { bulkModifyByQuery, getOrCreateGmailLabel } = await import('@/lib/gmail-read');
      const { buildMailboxPlan } = await import('@/lib/agents/mailbox-rules');

      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
      const { data: crm } = await sb.from('crm_prospects').select('email,status').eq('user_id', userId).not('email', 'is', null).limit(2000);
      const clients = (crm || []).filter((p: any) => ['client', 'gagne', 'signe'].includes(String(p.status))).map((p: any) => p.email);
      const prospects = (crm || []).filter((p: any) => !['client', 'gagne', 'signe'].includes(String(p.status))).map((p: any) => p.email);

      // Réglages client : noms de dossiers et expéditeurs protégés.
      const { data: cfgRow } = await sb.from('org_agent_configs').select('config').eq('user_id', userId).eq('agent_id', 'email').order('created_at', { ascending: false }).limit(1).maybeSingle();
      const cfg = (cfgRow?.config || {}) as any;
      const names = Array.isArray(cfg.email_dossiers) ? cfg.email_dossiers : [];
      const plan = buildMailboxPlan({
        crmClients: clients,
        crmProspects: prospects,
        protectedSenders: Array.isArray(cfg.email_expediteurs_proteges) ? cfg.email_expediteurs_proteges : [],
        folderNames: names.length >= 4 ? { admin: names[0], todo: names[1], clients: names[2], prospects: names[3] } : undefined,
      });

      // ÉTAPE 1 — RANGER D'ABORD. C'est ce qui protège : une fois étiqueté, un
      // message est exclu du nettoyage (les requêtes de nettoyage excluent
      // -has:userlabels). L'ordre inverse envoyait à la corbeille des mails de
      // clients tombés dans l'onglet Promotions.
      const labelIds: Record<string, string | undefined> = {};
      for (const step of plan.file) {
        if (!labelIds[step.folder]) labelIds[step.folder] = (await getOrCreateGmailLabel(userId, step.folder)).id;
        const labelId = labelIds[step.folder];
        if (!labelId) continue;
        const r = await bulkModifyByQuery(userId, { query: step.query, action: 'label', labelId, maxMessages: 60_000, dryRun: !!opts.dryRun });
        const n = opts.dryRun ? r.matched : r.modified;
        bulk.labeled += n;
        bulk.folders[step.folder] = (bulk.folders[step.folder] || 0) + n;
      }

      // ÉTAPE 2 — NETTOYER le reste, en épargnant tout ce qui vient d'être
      // rangé, ce que le client a suivi, et la Principale.
      for (const step of plan.clean) {
        const r = await bulkModifyByQuery(userId, { query: step.query, action: step.action, maxMessages: 60_000, dryRun: !!opts.dryRun });
        const n = opts.dryRun ? r.matched : r.modified;
        if (step.action === 'trash') bulk.trashed += n; else bulk.archived += n;
      }
    } catch (e: any) {
      console.warn('[mailbox] passe en masse indisponible:', e?.message);
    }
  }

  const { enabled, messages } = await ops.list(opts.max || 25);
  if (!enabled || messages.length === 0) {
    const bulkTotal = bulk.trashed + bulk.archived;
    return { ...empty, enabled, provider: ops.provider, trashed: bulk.trashed, archived: bulk.archived,
      summary: !enabled ? '' : bulkTotal > 0 ? `${bulk.trashed} pub(s) à la corbeille, ${bulk.archived} archivé(s) — plus rien à trier dans la boîte.` : 'Boîte déjà vide/propre.' };
  }

  const listText = messages.map((m, i) => `${i}. De: ${m.from} | Objet: ${m.subject} | ${(m.snippet || '').slice(0, 160)}`).join('\n');
  let decisions: Decision[] = [];
  try {
    const raw = await callClaudeHaiku({ system: SYSTEM, message: listText, maxTokens: 2000 });
    const jsonStr = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
    decisions = (JSON.parse(jsonStr).decisions || []) as Decision[];
  } catch {
    return { ...empty, enabled: true, provider: ops.provider, summary: 'Analyse indisponible, aucun changement.' };
  }

  const res: TriageResult = { enabled: true, provider: ops.provider, processed: 0, trashed: 0, archived: 0, labeled: 0, kept: 0, replied: 0, drafted: 0, questions: [], summary: '' };
  const REPLY_SYSTEM = `Tu es Hugo, assistant email de NIVEAU ÉLITE de "${bizName || 'ce commerce'}". Contexte du business : ${bizCtx || 'commerce local'}.\nTu réponds à un email reçu, en français (ou dans la langue du message si elle diffère). Réponse professionnelle, chaleureuse, concise, orientée solution — jamais robotique, jamais de "en tant qu'IA". Signe simplement "${bizName || ''}". Ne promets rien d'irréaliste ; en cas d'info manquante, propose un échange. Réponds UNIQUEMENT en JSON : {"subject":"...","body":"..."} (body en texte simple avec sauts de ligne, sans markdown).`;

  for (const d of decisions) {
    const m = messages[d.i];
    if (!m) continue;
    res.processed++;
    if (d.action === 'ask' && d.question) {
      res.questions.push({ from: m.from, subject: m.subject, question: d.question });
      continue; // on n'agit PAS
    }
    if (opts.dryRun) {
      // 2026-07-30 — Un dry run doit annoncer ce qui SERAIT fait. Avant, on
      // sortait avant d'incrémenter : le rapport affichait « 0 supprimé,
      // 0 archivé » sur 25 mails analysés, donc il ne servait à rien.
      if (d.action === 'trash') res.trashed++;
      else if (d.action === 'archive') res.archived++;
      else if (d.action === 'reply') res.replied++;
      else if (d.action === 'label') res.labeled++;
      else res.kept++;
      continue;
    }
    try {
      if (d.action === 'trash') { await ops.trash(m.id); res.trashed++; }
      else if (d.action === 'archive') { await ops.archive(m.id); res.archived++; }
      else if (d.action === 'reply' && (res.replied + res.drafted) < 5) {
        // Réponse ÉLITE fondée sur le contenu réel du mail + le dossier business.
        const full = await ops.body(m.id).catch(() => ({} as { body?: string; threadRef?: string }));
        const prompt = `Email reçu :\nDe : ${m.from}\nObjet : ${m.subject}\n\n${(full.body || m.snippet || '').slice(0, 4000)}\n\nRédige la réponse.`;
        let subject = m.subject?.startsWith('Re:') ? m.subject : `Re: ${m.subject || ''}`;
        let body = '';
        try {
          const raw = await callClaudeHaiku({ system: REPLY_SYSTEM, message: prompt, maxTokens: 1200 });
          const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
          if (j.subject) subject = j.subject; body = j.body || '';
        } catch { body = ''; }
        if (body) {
          const html = escapeHtml(body);
          const to = senderEmail(m.from);
          if (replyMode === 'auto_send') { await ops.sendReply(m.id, to, subject, html, m.from, full.threadRef); res.replied++; }
          else { await ops.draftReply(m.id, to, subject, html, m.from, full.threadRef); res.drafted++; }
        } else { res.kept++; }
      }
      else if (d.action === 'label' && d.label) { await ops.moveToFolder(m.id, d.label); res.labeled++; }
      else { res.kept++; }
      if (d.important) { await ops.star(m.id).catch(() => {}); }
    } catch { /* best-effort par mail */ }
  }

  // Nettoyage des brouillons caducs (le client a répondu lui-même) — Gmail.
  let staleCleaned = 0;
  if (ops.provider === 'gmail' && !opts.dryRun) {
    try { staleCleaned = (await cleanStaleGmailDrafts(userId)).deleted; } catch { /* best-effort */ }
  }

  const replyBit = replyMode === 'auto_send' ? (res.replied ? `, ${res.replied} réponse(s) envoyée(s)` : '') : (res.drafted ? `, ${res.drafted} brouillon(s) de réponse préparé(s)` : '');
  const staleBit = staleCleaned ? `, ${staleCleaned} brouillon(s) caduc(s) nettoyé(s)` : '';
  // Le total inclut la passe en masse : c'est elle qui traite le gros du volume
  // sur une vraie boîte, la passe modèle ne fait que le reliquat.
  res.trashed += bulk.trashed;
  res.archived += bulk.archived;
  res.labeled += bulk.labeled;
  const folderBit = Object.keys(bulk.folders).length ? ' — dossiers : ' + Object.entries(bulk.folders).filter(([, n]) => n > 0).map(([f, n]) => f + ' (' + n + ')').join(', ') : '';
  const bulkBit = (bulk.trashed + bulk.archived) > 0
    ? ` (dont ${bulk.trashed} pub(s) et ${bulk.archived} notification(s) traitées en masse)`
    : '';
  res.summary = `${res.trashed} supprimé(s), ${res.archived} archivé(s), ${res.labeled} rangé(s)${replyBit}${staleBit}, ${res.kept} gardé(s)${res.questions.length ? `, ${res.questions.length} question(s)` : ''}${bulkBit}.`;

  // Hugo pose ses questions au client (in-app) — il n'a pas agi sur ces mails.
  if (res.questions.length > 0) {
    try {
      const { notifyClient } = await import('@/lib/agents/notify-client');
      const q = res.questions.slice(0, 5).map(x => `• « ${x.subject} » (${x.from.replace(/<[^>]+>/, '').trim()}) : ${x.question}`).join('\n');
      await notifyClient(sb, {
        userId, agent: 'email', type: 'action',
        title: { fr: 'Hugo a des questions sur ta boîte', en: 'Hugo has questions about your inbox' },
        message: { fr: `J'ai trié ta boîte (${res.summary}). J'ai un doute sur ${res.questions.length} mail(s), je préfère te demander avant d'agir :\n${q}`, en: `I sorted your inbox (${res.summary}). I'm unsure about ${res.questions.length} email(s) and prefer to ask first:\n${q}` },
        data: { agent: 'email', kind: 'mailbox_triage' },
      });
    } catch { /* notif best-effort */ }
  }

  return res;
}
