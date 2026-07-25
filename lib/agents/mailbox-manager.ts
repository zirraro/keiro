/**
 * HUGO — GESTION AUTONOME DE LA BOÎTE MAIL (Option B, gmail.modify).
 * Founder 25/07 : Hugo doit gérer la boîte "en véritable expert administratif" —
 * nettoyer (supprimer pubs/spam), archiver le bruit, TAGUER et RANGER dans des
 * dossiers (libellés), repérer l'important, et POSER UNE QUESTION en cas de doute.
 *
 * Il agit tout seul sur les cas CLAIRS et n'agit PAS sur les cas sensibles/ambigus
 * (il les remonte au client). Gaté : inerte si Option B off (mailboxEnabled).
 */
import { listRecentGmail, manageGmailMessage, getOrCreateGmailLabel, mailboxEnabled } from '@/lib/gmail-read';
import { callClaudeHaiku } from '@/lib/agents/gemini';
import { createClient } from '@supabase/supabase-js';

type Decision = { i: number; action: 'trash' | 'archive' | 'label' | 'keep' | 'ask'; label?: string; important?: boolean; reason?: string; question?: string };

const SYSTEM = `Tu es Hugo, assistant administratif email de NIVEAU ÉLITE. Tu gères la boîte de réception d'un commerçant/entrepreneur pour qu'il ne rate RIEN d'important et garde une boîte propre et rangée. On te donne une liste de mails (expéditeur, objet, extrait). Pour CHAQUE mail, décide une action :

- "trash" : pub/marketing/spam évident, newsletters promotionnelles sans valeur, notifications inutiles. (Nettoyage.)
- "archive" : notifications/newsletters informatives SANS action requise (retire de la boîte, garde l'archive).
- "label" : mail important à RANGER dans un dossier. Donne un "label" parmi : "Prospects" (réponse d'un prospect/lead), "Clients" (message d'un client existant), "Factures & Admin" (factures, banque, impôts, contrats, RH), "À traiter" (demande qui exige une action/réponse).
- "keep" : à laisser en boîte, rien à faire.
- "ask" : DOUTE ou enjeu élevé (argent, juridique, décision importante, expéditeur inconnu au ton pressant) → NE PAS agir, poser une question courte au propriétaire dans "question".

Règles : sois PRUDENT — en cas de doute sur "trash", préfère "archive" ou "ask". Ne mets JAMAIS en trash un mail qui pourrait être un client, un prospect, une facture, une administration, ou une réponse attendue. Marque "important": true pour tout ce qui mérite l'attention du propriétaire.

Réponds UNIQUEMENT en JSON : {"decisions":[{"i":0,"action":"trash","label":null,"important":false,"reason":"pub","question":null}, ...]}. Pas de markdown.`;

export interface TriageResult {
  enabled: boolean;
  processed: number;
  trashed: number;
  archived: number;
  labeled: number;
  kept: number;
  questions: { from: string; subject: string; question: string }[];
  summary: string;
}

export async function triageMailbox(userId: string, opts: { max?: number; dryRun?: boolean } = {}): Promise<TriageResult> {
  const empty: TriageResult = { enabled: false, processed: 0, trashed: 0, archived: 0, labeled: 0, kept: 0, questions: [], summary: '' };
  if (!(await mailboxEnabled(userId))) return empty;

  const { enabled, messages } = await listRecentGmail(userId, { max: opts.max || 25, query: 'in:inbox' });
  if (!enabled || messages.length === 0) return { ...empty, enabled, summary: enabled ? 'Boîte déjà vide/propre.' : '' };

  const listText = messages.map((m, i) => `${i}. De: ${m.from} | Objet: ${m.subject} | ${m.snippet.slice(0, 160)}`).join('\n');
  let decisions: Decision[] = [];
  try {
    const raw = await callClaudeHaiku({ system: SYSTEM, message: listText, maxTokens: 2000 });
    const jsonStr = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
    decisions = (JSON.parse(jsonStr).decisions || []) as Decision[];
  } catch {
    return { ...empty, enabled: true, summary: 'Analyse indisponible, aucun changement.' };
  }

  const res: TriageResult = { enabled: true, processed: 0, trashed: 0, archived: 0, labeled: 0, kept: 0, questions: [], summary: '' };
  const labelCache: Record<string, string> = {};

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
      else if (d.action === 'label' && d.label) {
        let labelId = labelCache[d.label];
        if (!labelId) { const lr = await getOrCreateGmailLabel(userId, d.label); labelId = lr.id || ''; if (labelId) labelCache[d.label] = labelId; }
        if (labelId) { await manageGmailMessage(userId, m.id, 'move', labelId); res.labeled++; }
      } else { res.kept++; }
      if (d.important) { await manageGmailMessage(userId, m.id, 'star'); }
    } catch { /* best-effort par mail */ }
  }

  res.summary = `${res.trashed} supprimé(s), ${res.archived} archivé(s), ${res.labeled} rangé(s), ${res.kept} gardé(s)${res.questions.length ? `, ${res.questions.length} question(s)` : ''}.`;

  // Hugo pose ses questions au client (in-app) — il n'a pas agi sur ces mails.
  if (res.questions.length > 0) {
    try {
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
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
