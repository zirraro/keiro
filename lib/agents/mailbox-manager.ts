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
import { listRecentGmail, manageGmailMessage, getOrCreateGmailLabel, mailboxEnabled, createGmailDraft, getGmailMessageBody } from '@/lib/gmail-read';
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

/** Construit l'abstraction Gmail (Option B). */
function gmailOps(userId: string, tokenGetter: () => Promise<{ accessToken: string; email: string } | null>, bizName: string): MailOps {
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
      await manageGmailMessage(userId, id, 'archive').catch(() => {});
    },
    async draftReply(_id, to, subject, html, replyTo, threadRef) {
      const tok = await tokenGetter();
      await createGmailDraft(userId, { to, subject, htmlBody: html, fromName: bizName || undefined, fromEmail: tok?.email, replyTo, threadId: threadRef });
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

export async function triageMailbox(userId: string, opts: { max?: number; dryRun?: boolean } = {}): Promise<TriageResult> {
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

  const { enabled, messages } = await ops.list(opts.max || 25);
  if (!enabled || messages.length === 0) return { ...empty, enabled, provider: ops.provider, summary: enabled ? 'Boîte déjà vide/propre.' : '' };

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
    if (opts.dryRun) { continue; }
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

  const replyBit = replyMode === 'auto_send' ? (res.replied ? `, ${res.replied} réponse(s) envoyée(s)` : '') : (res.drafted ? `, ${res.drafted} brouillon(s) de réponse préparé(s)` : '');
  res.summary = `${res.trashed} supprimé(s), ${res.archived} archivé(s), ${res.labeled} rangé(s)${replyBit}, ${res.kept} gardé(s)${res.questions.length ? `, ${res.questions.length} question(s)` : ''}.`;

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
