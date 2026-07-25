/**
 * OPTION B (post-CASA) — accès NATIF à la boîte Gmail du client.
 *
 * Deux capacités, correspondant aux 2 scopes RESTREINTS demandés en Option B :
 *   - gmail.readonly → listRecentGmail : lire les mails reçus (réponses prospects)
 *   - gmail.compose  → createGmailDraft : créer un brouillon NATIF dans Gmail
 *
 * ⚠️ ENTIÈREMENT GATÉ derrière GMAIL_OPTION_B=on. Tant que le flag est OFF (prod
 * aujourd'hui, Option A gmail.send approuvée), CES FONCTIONS SONT INERTES : elles
 * renvoient { enabled:false } sans jamais appeler Gmail. → zéro impact sur
 * l'existant. À n'activer qu'APRÈS validation CASA + nouvelle vérif Google.
 *
 * Tout accès est journalisé (logGoogleDataAccess) — jamais le contenu, seulement
 * qui/quand/quel scope (exigence CASA ASVS V7 + Google Limited Use).
 */
import { getValidGmailToken, buildRawGmailMessage } from '@/lib/gmail-oauth';
import { logGoogleDataAccess } from '@/lib/security/access-log';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export function optionBEnabled(): boolean {
  return process.env.GMAIL_OPTION_B === 'on';
}

export interface InboxMessage {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  unread: boolean;
}

function header(headers: any[], name: string): string {
  const h = (headers || []).find((x) => (x.name || '').toLowerCase() === name.toLowerCase());
  return h?.value || '';
}

/**
 * Lit les N derniers mails REÇUS de la boîte du client (gmail.readonly).
 * Renvoie { enabled:false } si Option B off ou compte non connecté.
 */
export async function listRecentGmail(
  userId: string,
  opts: { max?: number; query?: string } = {},
): Promise<{ enabled: boolean; messages: InboxMessage[] }> {
  if (!optionBEnabled()) return { enabled: false, messages: [] };
  const tok = await getValidGmailToken(userId);
  if (!tok) return { enabled: false, messages: [] };

  const max = Math.min(Math.max(opts.max || 15, 1), 50);
  const q = opts.query || 'in:inbox -category:promotions -category:social';
  try {
    const listRes = await fetch(
      `${GMAIL_API}/messages?maxResults=${max}&q=${encodeURIComponent(q)}`,
      { headers: { Authorization: `Bearer ${tok.accessToken}` } },
    );
    if (!listRes.ok) return { enabled: true, messages: [] };
    const list = await listRes.json();
    const ids: string[] = (list.messages || []).map((m: any) => m.id);
    logGoogleDataAccess(userId, 'read_inbox', 'gmail.readonly', { count: ids.length });

    const messages: InboxMessage[] = [];
    for (const id of ids) {
      const mRes = await fetch(
        `${GMAIL_API}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${tok.accessToken}` } },
      );
      if (!mRes.ok) continue;
      const m = await mRes.json();
      const hs = m.payload?.headers || [];
      messages.push({
        id: m.id,
        threadId: m.threadId,
        from: header(hs, 'From'),
        subject: header(hs, 'Subject'),
        snippet: m.snippet || '',
        date: header(hs, 'Date'),
        unread: Array.isArray(m.labelIds) && m.labelIds.includes('UNREAD'),
      });
    }
    return { enabled: true, messages };
  } catch {
    return { enabled: true, messages: [] };
  }
}

/**
 * Crée un brouillon NATIF dans le Gmail du client (gmail.compose). Le client le
 * retrouve dans son dossier Brouillons, le relit et l'envoie lui-même.
 * Renvoie { enabled:false } si Option B off.
 */
export async function createGmailDraft(
  userId: string,
  params: { to: string; subject: string; htmlBody: string; fromName?: string; fromEmail?: string; replyTo?: string; threadId?: string },
): Promise<{ enabled: boolean; draftId?: string }> {
  if (!optionBEnabled()) return { enabled: false };
  const tok = await getValidGmailToken(userId);
  if (!tok) return { enabled: false };

  const raw = buildRawGmailMessage({
    to: params.to,
    subject: params.subject,
    htmlBody: params.htmlBody,
    fromName: params.fromName,
    fromEmail: params.fromEmail || tok.email,
    replyTo: params.replyTo,
  });
  try {
    const res = await fetch(`${GMAIL_API}/drafts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { raw, ...(params.threadId ? { threadId: params.threadId } : {}) } }),
    });
    if (!res.ok) return { enabled: true };
    const d = await res.json();
    logGoogleDataAccess(userId, 'create_draft', 'gmail.compose', { draft_id: String(d.id || '') });
    return { enabled: true, draftId: d.id };
  } catch {
    return { enabled: true };
  }
}

/**
 * GESTION DE LA BOÎTE (gmail.modify, Option B) — corbeille / archivage / lu /
 * déplacement de libellé. Founder 25/07 : gérer la boîte "dans ses moindres
 * détails" (trier, ranger). Gaté : inerte si Option B off.
 *
 * action: 'trash' (corbeille) | 'archive' (retire INBOX) | 'read' (marque lu) |
 *         'unread' | 'move' (ajoute labelId + retire INBOX) | 'star' | 'unstar'
 */
export async function manageGmailMessage(
  userId: string,
  messageId: string,
  action: 'trash' | 'archive' | 'read' | 'unread' | 'move' | 'star' | 'unstar',
  labelId?: string,
): Promise<{ enabled: boolean; ok?: boolean }> {
  if (!optionBEnabled()) return { enabled: false };
  const tok = await getValidGmailToken(userId);
  if (!tok || !messageId) return { enabled: false };
  const auth = { Authorization: `Bearer ${tok.accessToken}`, 'Content-Type': 'application/json' };
  try {
    if (action === 'trash') {
      const r = await fetch(`${GMAIL_API}/messages/${messageId}/trash`, { method: 'POST', headers: auth });
      logGoogleDataAccess(userId, 'trash_message', 'gmail.modify', { id: messageId });
      return { enabled: true, ok: r.ok };
    }
    const body: { addLabelIds?: string[]; removeLabelIds?: string[] } = {};
    if (action === 'archive') body.removeLabelIds = ['INBOX'];
    else if (action === 'read') body.removeLabelIds = ['UNREAD'];
    else if (action === 'unread') body.addLabelIds = ['UNREAD'];
    else if (action === 'star') body.addLabelIds = ['STARRED'];
    else if (action === 'unstar') body.removeLabelIds = ['STARRED'];
    else if (action === 'move') { body.addLabelIds = labelId ? [labelId] : []; body.removeLabelIds = ['INBOX']; }
    const r = await fetch(`${GMAIL_API}/messages/${messageId}/modify`, { method: 'POST', headers: auth, body: JSON.stringify(body) });
    logGoogleDataAccess(userId, `modify_${action}`, 'gmail.modify', { id: messageId });
    return { enabled: true, ok: r.ok };
  } catch {
    return { enabled: true, ok: false };
  }
}

/** Liste les libellés Gmail du client (pour "déplacer vers…" / organiser). */
export async function listGmailLabels(userId: string): Promise<{ enabled: boolean; labels: { id: string; name: string }[] }> {
  if (!optionBEnabled()) return { enabled: false, labels: [] };
  const tok = await getValidGmailToken(userId);
  if (!tok) return { enabled: false, labels: [] };
  try {
    const r = await fetch(`${GMAIL_API}/labels`, { headers: { Authorization: `Bearer ${tok.accessToken}` } });
    if (!r.ok) return { enabled: true, labels: [] };
    const d = await r.json();
    // On expose les libellés utilisateur (pas les system sauf utiles) pour le tri.
    const labels = (d.labels || [])
      .filter((l: any) => l.type === 'user' || ['IMPORTANT', 'STARRED', 'SPAM'].includes(l.id))
      .map((l: any) => ({ id: l.id, name: l.name }));
    return { enabled: true, labels };
  } catch {
    return { enabled: true, labels: [] };
  }
}
