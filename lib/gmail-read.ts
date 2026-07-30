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
import { getValidGmailToken, buildRawGmailMessage, listGmailDrafts, deleteGmailDraft } from '@/lib/gmail-oauth';
import { logGoogleDataAccess } from '@/lib/security/access-log';
import { createClient } from '@supabase/supabase-js';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export function optionBEnabled(): boolean {
  return process.env.GMAIL_OPTION_B === 'on';
}

/**
 * Option B activée pour CE user : soit globalement (env GMAIL_OPTION_B, env de test),
 * soit par-utilisateur via le toggle Hugo (org_agent_configs email.config.full_mailbox).
 * Permet à un test user d'activer la gestion complète (readonly+compose+modify) sans
 * changer le comportement des autres clients.
 */
export async function mailboxEnabled(userId: string): Promise<boolean> {
  if (process.env.GMAIL_OPTION_B === 'on') return true;
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data } = await sb.from('org_agent_configs').select('config').eq('user_id', userId).eq('agent_id', 'email').order('created_at', { ascending: false }).limit(1).maybeSingle();
    return !!(data?.config as any)?.full_mailbox;
  } catch { return false; }
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
  if (!(await mailboxEnabled(userId))) return { enabled: false, messages: [] };
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
  if (!(await mailboxEnabled(userId))) return { enabled: false };
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
  action: 'trash' | 'archive' | 'read' | 'unread' | 'move' | 'star' | 'unstar' | 'label',
  labelId?: string,
): Promise<{ enabled: boolean; ok?: boolean }> {
  if (!(await mailboxEnabled(userId))) return { enabled: false };
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
    else if (action === 'label') { body.addLabelIds = labelId ? [labelId] : []; } // ajoute un libellé SANS retirer de l'INBOX
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
  if (!(await mailboxEnabled(userId))) return { enabled: false, labels: [] };
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

/** Lit le CORPS texte complet d'un message (pour rédiger une vraie réponse). gmail.readonly. */
export async function getGmailMessageBody(userId: string, messageId: string): Promise<{ enabled: boolean; body?: string; from?: string; subject?: string; threadId?: string }> {
  if (!(await mailboxEnabled(userId))) return { enabled: false };
  const tok = await getValidGmailToken(userId);
  if (!tok || !messageId) return { enabled: false };
  try {
    const r = await fetch(`${GMAIL_API}/messages/${messageId}?format=full`, { headers: { Authorization: `Bearer ${tok.accessToken}` } });
    if (!r.ok) return { enabled: true };
    const m = await r.json();
    const hs = m.payload?.headers || [];
    const decode = (data: string) => { try { return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); } catch { return ''; } };
    let text = '';
    const walk = (part: any) => {
      if (!part) return;
      if (part.mimeType === 'text/plain' && part.body?.data) { text += decode(part.body.data) + '\n'; return; }
      if (part.mimeType === 'text/html' && part.body?.data && !text) { text += decode(part.body.data).replace(/<[^>]+>/g, ' ') + '\n'; }
      (part.parts || []).forEach(walk);
    };
    if (m.payload?.body?.data) text = decode(m.payload.body.data);
    else walk(m.payload);
    return { enabled: true, body: text.trim().slice(0, 4000), from: header(hs, 'From'), subject: header(hs, 'Subject'), threadId: m.threadId };
  } catch {
    return { enabled: true };
  }
}

/**
 * Nettoie les brouillons devenus obsolètes : si le client a lui-même répondu
 * dans le fil APRÈS que Hugo a préparé un brouillon (un message SENT plus récent
 * existe dans le thread), le brouillon ne sert plus → on le supprime.
 * Founder 25/07 : « si hugo voit que j'ai répondu moi meme il nettoie les draft ».
 * gmail.modify. Best-effort, jamais bloquant.
 */
export async function cleanStaleGmailDrafts(userId: string): Promise<{ enabled: boolean; deleted: number }> {
  if (!(await mailboxEnabled(userId))) return { enabled: false, deleted: 0 };
  const tok = await getValidGmailToken(userId);
  if (!tok) return { enabled: false, deleted: 0 };
  let deleted = 0;
  try {
    const drafts = await listGmailDrafts(tok.accessToken, 25).catch(() => []);
    for (const d of drafts) {
      if (!d.threadId || !d.messageId) continue;
      try {
        const tr = await fetch(`${GMAIL_API}/threads/${d.threadId}?format=minimal`, { headers: { Authorization: `Bearer ${tok.accessToken}` } });
        if (!tr.ok) continue;
        const thread = await tr.json();
        const msgs: any[] = thread.messages || [];
        const draftMsg = msgs.find(m => m.id === d.messageId);
        const draftTime = draftMsg ? Number(draftMsg.internalDate || 0) : 0;
        // Un message ENVOYÉ (SENT) plus récent que le brouillon = le client a
        // répondu lui-même → le brouillon d'Hugo est caduc.
        const clientReplied = msgs.some(m => (m.labelIds || []).includes('SENT') && Number(m.internalDate || 0) > draftTime && m.id !== d.messageId);
        if (clientReplied) {
          if (await deleteGmailDraft(tok.accessToken, d.id)) deleted++;
        }
      } catch { /* skip this draft */ }
    }
    logGoogleDataAccess(userId, 'clean_stale_drafts', 'gmail.modify');
  } catch { /* best-effort */ }
  return { enabled: true, deleted };
}

/**
 * NETTOYAGE EN MASSE — pour les boîtes réelles (30 000+ mails).
 *
 * 2026-07-30 — Le triage classait 25 messages par passage via le modèle : sur
 * une boîte de 34 000 mails, c'est une goutte d'eau, et faire juger 34 000
 * messages par un LLM serait long et coûteux pour rien.
 *
 * Gmail sait déjà reconnaître ses propres catégories. On s'en sert : on
 * sélectionne par requête (`category:promotions`, `category:social`,
 * `list:` = listes de diffusion) et on applique l'action à 1000 messages par
 * appel avec `batchModify`. Aucun coût de modèle, et une boîte entière traitée
 * en quelques minutes. Le modèle ne sert plus qu'au reliquat ambigu.
 *
 * `TRASH` et `INBOX` étant des libellés côté Gmail, batchModify suffit pour
 * corbeille et archivage — et rien n'est supprimé définitivement.
 */
export async function bulkModifyByQuery(
  userId: string,
  opts: {
    query: string;
    action: 'trash' | 'archive' | 'label';
    labelId?: string;
    /** Plafond de sécurité, pour ne jamais partir en boucle infinie. */
    maxMessages?: number;
    dryRun?: boolean;
  },
): Promise<{ enabled: boolean; matched: number; modified: number; error?: string }> {
  if (!(await mailboxEnabled(userId))) return { enabled: false, matched: 0, modified: 0 };
  const tok = await getValidGmailToken(userId);
  if (!tok) return { enabled: false, matched: 0, modified: 0 };

  const cap = Math.min(Math.max(opts.maxMessages || 5000, 1), 120_000);
  const auth = { Authorization: `Bearer ${tok.accessToken}`, 'Content-Type': 'application/json' };
  let pageToken: string | undefined;
  let matched = 0;
  let modified = 0;

  try {
    do {
      const url = new URL(`${GMAIL_API}/messages`);
      url.searchParams.set('q', opts.query);
      url.searchParams.set('maxResults', '500');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const lr = await fetch(url.toString(), { headers: { Authorization: `Bearer ${tok.accessToken}` } });
      if (!lr.ok) return { enabled: true, matched, modified, error: `list HTTP ${lr.status}` };
      const ld = await lr.json();
      const ids: string[] = (ld.messages || []).map((m: any) => m.id);
      pageToken = ld.nextPageToken;
      matched += ids.length;
      if (ids.length === 0) break;

      if (!opts.dryRun) {
        // batchModify accepte 1000 ids par appel.
        for (let i = 0; i < ids.length; i += 1000) {
          const chunk = ids.slice(i, i + 1000);
          const body: Record<string, any> = { ids: chunk };
          if (opts.action === 'trash') body.addLabelIds = ['TRASH'];
          else if (opts.action === 'archive') body.removeLabelIds = ['INBOX'];
          else if (opts.action === 'label' && opts.labelId) body.addLabelIds = [opts.labelId];
          else return { enabled: true, matched, modified, error: 'label sans labelId' };

          const br = await fetch(`${GMAIL_API}/messages/batchModify`, { method: 'POST', headers: auth, body: JSON.stringify(body) });
          if (!br.ok) return { enabled: true, matched, modified, error: `batchModify HTTP ${br.status}` };
          modified += chunk.length;
        }
      }
    } while (pageToken && matched < cap);

    logGoogleDataAccess(userId, `bulk_${opts.action}`, 'gmail.modify', { query: opts.query, matched, modified });
    return { enabled: true, matched, modified };
  } catch (e: any) {
    return { enabled: true, matched, modified, error: e?.message?.slice(0, 160) };
  }
}

/**
 * RANGEMENT AUTOMATIQUE EN DOSSIERS, à l'échelle de la boîte.
 *
 * 2026-07-30 — Gmail trie déjà en Promotions / Réseaux / Mises à jour et
 * calcule l'importance, mais il ne crée AUCUN dossier métier. C'est là que Hugo
 * apporte quelque chose : Factures & Admin, Clients, Prospects, À traiter.
 *
 * Le rangement se fait par requête + batchModify, donc sur toute la boîte —
 * l'ancien tri au fil du modèle n'en traitait que quelques dizaines. Les
 * dossiers ne retirent pas de la boîte de réception : on classe sans faire
 * disparaître, le client garde la main.
 */
export async function bulkFileIntoFolders(
  userId: string,
  opts: { crmClientEmails?: string[]; crmProspectEmails?: string[]; dryRun?: boolean } = {},
): Promise<{ enabled: boolean; filed: Record<string, number>; error?: string }> {
  const filed: Record<string, number> = {};
  if (!(await mailboxEnabled(userId))) return { enabled: false, filed };

  const ensure = async (name: string) => (await getOrCreateGmailLabel(userId, name)).id;

  // Factures, banque, impôts : reconnaissables à des mots-clés stables.
  const ADMIN_Q = 'in:inbox (subject:facture OR subject:invoice OR subject:"reçu" OR subject:devis OR subject:virement OR subject:"relevé" OR subject:prélèvement OR subject:échéance OR from:urssaf OR from:impots.gouv.fr OR from:ameli OR from:banque OR from:stripe OR from:qonto)';
  // Ce qui attend vraiment une action : Gmail a déjà calculé l'importance.
  const TODO_Q = 'in:inbox is:important is:unread category:primary';

  const plan: Array<{ folder: string; query: string }> = [
    { folder: 'Factures & Admin', query: ADMIN_Q },
    { folder: 'À traiter', query: TODO_Q },
  ];

  // Clients et prospects : on interroge par paquets d'expéditeurs connus du CRM.
  const chunk = (arr: string[], n: number) => arr.reduce<string[][]>((a, v, i) => (i % n ? a[a.length - 1].push(v) : a.push([v]), a), []);
  for (const [folder, emails] of [['Clients', opts.crmClientEmails || []], ['Prospects', opts.crmProspectEmails || []]] as const) {
    for (const group of chunk([...new Set(emails.filter(Boolean))], 40)) {
      plan.push({ folder, query: `in:inbox from:(${group.join(' OR ')})` });
    }
  }

  try {
    for (const step of plan) {
      const labelId = await ensure(step.folder);
      if (!labelId) continue;
      const r = await bulkModifyByQuery(userId, { query: step.query, action: 'label', labelId, maxMessages: 20_000, dryRun: opts.dryRun });
      const n = opts.dryRun ? r.matched : r.modified;
      filed[step.folder] = (filed[step.folder] || 0) + n;
      if (r.error) return { enabled: true, filed, error: r.error };
    }
    return { enabled: true, filed };
  } catch (e: any) {
    return { enabled: true, filed, error: e?.message?.slice(0, 160) };
  }
}

/** Crée un libellé (dossier) Gmail. Retourne l'id (existant ou créé). gmail.modify. */
export async function getOrCreateGmailLabel(userId: string, name: string): Promise<{ enabled: boolean; id?: string }> {
  if (!(await mailboxEnabled(userId))) return { enabled: false };
  const tok = await getValidGmailToken(userId);
  if (!tok || !name.trim()) return { enabled: false };
  try {
    // Existe déjà ?
    const lr = await fetch(`${GMAIL_API}/labels`, { headers: { Authorization: `Bearer ${tok.accessToken}` } });
    if (lr.ok) {
      const ld = await lr.json();
      const existing = (ld.labels || []).find((l: any) => (l.name || '').toLowerCase() === name.trim().toLowerCase());
      if (existing) return { enabled: true, id: existing.id };
    }
    const r = await fetch(`${GMAIL_API}/labels`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), labelListVisibility: 'labelShow', messageListVisibility: 'show' }),
    });
    if (!r.ok) return { enabled: true };
    const d = await r.json();
    logGoogleDataAccess(userId, 'create_label', 'gmail.modify', { name: name.trim() });
    return { enabled: true, id: d.id };
  } catch {
    return { enabled: true };
  }
}
