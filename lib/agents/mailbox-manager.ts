/**
 * HUGO — GESTION AUTONOME DE LA BOÎTE MAIL (Option B, gmail.modify).
 * Founder 25/07 : Hugo doit gérer la boîte "en véritable expert administratif" —
 * nettoyer (supprimer pubs/spam), archiver le bruit, TAGUER et RANGER dans des
 * dossiers (libellés), repérer l'important, et POSER UNE QUESTION en cas de doute.
 *
 * Il agit tout seul sur les cas CLAIRS et n'agit PAS sur les cas sensibles/ambigus
 * (il les remonte au client). Gaté : inerte si Option B off (mailboxEnabled).
 */
import { listRecentGmail, manageGmailMessage, getOrCreateGmailLabel, mailboxEnabled, createGmailDraft, getGmailMessageBody } from '@/lib/gmail-read';
import { callClaudeHaiku } from '@/lib/agents/gemini';
import { getValidGmailToken, sendViaGmail } from '@/lib/gmail-oauth';
import { getEmailReplyMode } from '@/lib/agents/hugo-reply';
import { createClient } from '@supabase/supabase-js';

const senderEmail = (from: string) => { const m = (from || '').match(/<([^>]+)>/); return (m ? m[1] : from || '').trim(); };

type Decision = { i: number; action: 'trash' | 'archive' | 'label' | 'keep' | 'ask' | 'reply'; label?: string; important?: boolean; reason?: string; question?: string };

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

export async function triageMailbox(userId: string, opts: { max?: number; dryRun?: boolean } = {}): Promise<TriageResult> {
  const empty: TriageResult = { enabled: false, processed: 0, trashed: 0, archived: 0, labeled: 0, kept: 0, replied: 0, drafted: 0, questions: [], summary: '' };
  if (!(await mailboxEnabled(userId))) return empty;

  const { enabled, messages } = await listRecentGmail(userId, { max: opts.max || 25, query: 'in:inbox' });
  if (!enabled || messages.length === 0) return { ...empty, enabled, summary: enabled ? 'Boîte déjà vide/propre.' : '' };

  // Contexte pour rédiger les réponses + mode d'envoi (toggle Hugo : auto_send | draft).
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const replyMode = await getEmailReplyMode(sb, userId).catch(() => 'auto_send' as const);
  let bizName = ''; let bizCtx = '';
  try {
    const { data: dos } = await sb.from('business_dossiers').select('business_name, business_type, business_description, dossier_data').eq('user_id', userId).maybeSingle();
    bizName = dos?.business_name || '';
    bizCtx = [dos?.business_type, dos?.business_description, typeof dos?.dossier_data === 'object' ? JSON.stringify(dos?.dossier_data).slice(0, 1500) : ''].filter(Boolean).join(' | ');
  } catch { /* best-effort */ }
  const tok = await getValidGmailToken(userId);

  const listText = messages.map((m, i) => `${i}. De: ${m.from} | Objet: ${m.subject} | ${m.snippet.slice(0, 160)}`).join('\n');
  let decisions: Decision[] = [];
  try {
    const raw = await callClaudeHaiku({ system: SYSTEM, message: listText, maxTokens: 2000 });
    const jsonStr = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
    decisions = (JSON.parse(jsonStr).decisions || []) as Decision[];
  } catch {
    return { ...empty, enabled: true, summary: 'Analyse indisponible, aucun changement.' };
  }

  const res: TriageResult = { enabled: true, processed: 0, trashed: 0, archived: 0, labeled: 0, kept: 0, replied: 0, drafted: 0, questions: [], summary: '' };
  const labelCache: Record<string, string> = {};
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
      if (d.action === 'trash') { await manageGmailMessage(userId, m.id, 'trash'); res.trashed++; }
      else if (d.action === 'archive') { await manageGmailMessage(userId, m.id, 'archive'); res.archived++; }
      else if (d.action === 'reply' && (res.replied + res.drafted) < 5 && tok?.accessToken) {
        // Réponse ÉLITE fondée sur le contenu réel du mail + le dossier business.
        const full = await getGmailMessageBody(userId, m.id).catch(() => null);
        const prompt = `Email reçu :\nDe : ${m.from}\nObjet : ${m.subject}\n\n${(full?.body || m.snippet).slice(0, 4000)}\n\nRédige la réponse.`;
        let subject = m.subject?.startsWith('Re:') ? m.subject : `Re: ${m.subject || ''}`;
        let body = '';
        try {
          const raw = await callClaudeHaiku({ system: REPLY_SYSTEM, message: prompt, maxTokens: 1200 });
          const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
          if (j.subject) subject = j.subject; body = j.body || '';
        } catch { body = ''; }
        if (body) {
          const htmlBody = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
          const to = senderEmail(m.from);
          if (replyMode === 'auto_send') {
            await sendViaGmail(tok.accessToken, to, subject, htmlBody, bizName || undefined, tok.email, m.from);
            res.replied++;
            await manageGmailMessage(userId, m.id, 'archive').catch(() => {});
          } else {
            await createGmailDraft(userId, { to, subject, htmlBody, fromName: bizName || undefined, fromEmail: tok.email, replyTo: m.from, threadId: full?.threadId });
            res.drafted++;
          }
        } else { res.kept++; }
      }
      else if (d.action === 'label' && d.label) {
        let labelId = labelCache[d.label];
        if (!labelId) { const lr = await getOrCreateGmailLabel(userId, d.label); labelId = lr.id || ''; if (labelId) labelCache[d.label] = labelId; }
        if (labelId) { await manageGmailMessage(userId, m.id, 'move', labelId); res.labeled++; }
      } else { res.kept++; }
      if (d.important) { await manageGmailMessage(userId, m.id, 'star'); }
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
