/**
 * IMAP MAILBOX MANAGEMENT — l'équivalent domaine-personnalisé de Hugo Option B
 * (gmail.modify), SANS aucun Google OAuth. Permet à Hugo de gérer la boîte d'un
 * client sur nom de domaine (OVH, Gandi, Infomaniak, Zoho, 365-IMAP…) :
 *   - lister l'INBOX               → listImapInbox
 *   - lire le corps d'un mail      → getImapMessageBody
 *   - corbeille / archive / ranger → manageImapMessage (move vers un dossier)
 *   - marquer lu / important       → manageImapMessage ('read' / 'star')
 *   - créer un dossier             → getOrCreateImapFolder
 *   - nomenclature des dossiers    → listImapFolders
 *
 * Réutilise la config IMAP déjà validée (loadImapConfig, dérivée des creds SMTP)
 * de imap-drafts.ts. Connexions courtes : connect → agit → logout.
 *
 * Founder 25/07 : « je veux que tout fonctionne parfaitement pour nom de domaine
 * personnalisé et pour gmail ». Ceci apporte la parité IMAP du triage Gmail.
 */
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { loadImapConfig, hasImap } from '@/lib/agents/imap-drafts';

export { hasImap };

function newClient(cfg: { host: string; port: number; secure: boolean; user: string; pass: string }): ImapFlow {
  return new ImapFlow({
    host: cfg.host, port: cfg.port, secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false, socketTimeout: 20_000,
  } as any);
}

async function findSpecial(client: ImapFlow, use: string, names: RegExp, fallback: string): Promise<string> {
  try {
    const boxes = await client.list();
    const special = boxes.find(b => (b as any).specialUse === use);
    if (special) return special.path;
    const byName = boxes.find(b => names.test(b.path));
    if (byName) return byName.path;
  } catch { /* fall through */ }
  return fallback;
}
const trashPath = (c: ImapFlow) => findSpecial(c, '\\Trash', /^(trash|corbeille|deleted|deleted items|éléments supprimés|\[gmail\]\/trash|inbox\.trash)$/i, 'Trash');
const archivePath = (c: ImapFlow) => findSpecial(c, '\\Archive', /^(archive|archives|all mail|\[gmail\]\/all mail|inbox\.archive)$/i, 'Archive');

export interface ImapMsgLite { uid: number; from: string; subject: string; snippet: string; date?: string }

/** Liste les mails récents de l'INBOX (best-effort, connexion courte). */
export async function listImapInbox(userId: string, max = 25): Promise<{ enabled: boolean; messages: ImapMsgLite[] }> {
  const cfg = await loadImapConfig(userId);
  if (!cfg) return { enabled: false, messages: [] };
  const client = newClient(cfg);
  const messages: ImapMsgLite[] = [];
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const status = await client.status('INBOX', { messages: true });
      const total = status.messages || 0;
      if (total === 0) return { enabled: true, messages: [] };
      const start = Math.max(1, total - max + 1);
      for await (const msg of client.fetch(`${start}:*`, { uid: true, envelope: true, internalDate: true, bodyStructure: false })) {
        const env: any = (msg as any).envelope || {};
        const fromAddr = env.from?.[0];
        const from = fromAddr ? `${fromAddr.name || ''} <${fromAddr.address || ''}>`.trim() : '';
        messages.push({
          uid: (msg as any).uid,
          from,
          subject: env.subject || '(sans objet)',
          snippet: '',
          date: (msg as any).internalDate ? new Date((msg as any).internalDate).toISOString() : undefined,
        });
      }
    } finally { lock.release(); }
    // Ordre : plus récent d'abord.
    messages.reverse();
    return { enabled: true, messages: messages.slice(0, max) };
  } catch {
    return { enabled: true, messages: [] };
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }
}

/** Lit le corps complet d'un mail (texte, max 4000 car.) pour rédiger une réponse. */
export async function getImapMessageBody(userId: string, uid: number): Promise<{ enabled: boolean; body?: string; from?: string; subject?: string; messageId?: string }> {
  const cfg = await loadImapConfig(userId);
  if (!cfg) return { enabled: false };
  const client = newClient(cfg);
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const msg: any = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!msg?.source) return { enabled: true };
      const parsed = await simpleParser(msg.source as Buffer);
      const body = (parsed.text || (parsed.html ? String(parsed.html).replace(/<[^>]+>/g, ' ') : '') || '').trim().slice(0, 4000);
      const f = parsed.from?.value?.[0];
      return { enabled: true, body, from: f ? `${f.name || ''} <${f.address || ''}>`.trim() : '', subject: parsed.subject || '', messageId: parsed.messageId };
    } finally { lock.release(); }
  } catch {
    return { enabled: true };
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }
}

/** Liste les dossiers (nomenclature) de la boîte. */
export async function listImapFolders(userId: string): Promise<{ enabled: boolean; folders: string[] }> {
  const cfg = await loadImapConfig(userId);
  if (!cfg) return { enabled: false, folders: [] };
  const client = newClient(cfg);
  try {
    await client.connect();
    const boxes = await client.list();
    const folders = boxes.map(b => b.path).filter(Boolean);
    return { enabled: true, folders };
  } catch {
    return { enabled: true, folders: [] };
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }
}

/** Crée un dossier s'il n'existe pas et retourne son chemin. */
export async function getOrCreateImapFolder(userId: string, name: string): Promise<{ enabled: boolean; path?: string }> {
  const cfg = await loadImapConfig(userId);
  if (!cfg || !name.trim()) return { enabled: false };
  const client = newClient(cfg);
  try {
    await client.connect();
    const boxes = await client.list();
    const existing = boxes.find(b => b.path.toLowerCase() === name.toLowerCase() || b.name?.toLowerCase() === name.toLowerCase());
    if (existing) return { enabled: true, path: existing.path };
    try { await client.mailboxCreate(name); } catch { /* peut déjà exister */ }
    return { enabled: true, path: name };
  } catch {
    return { enabled: true };
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }
}

/**
 * Agit sur un mail : trash / archive / move (vers un dossier) / read / star.
 * IMAP n'a pas de « libellés » multiples : ranger = DÉPLACER vers un dossier.
 */
export async function manageImapMessage(
  userId: string,
  uid: number,
  action: 'trash' | 'archive' | 'move' | 'read' | 'unread' | 'star',
  folderPath?: string,
): Promise<{ enabled: boolean; ok: boolean }> {
  const cfg = await loadImapConfig(userId);
  if (!cfg) return { enabled: false, ok: false };
  const client = newClient(cfg);
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const u = String(uid);
      if (action === 'read') { await client.messageFlagsAdd(u, ['\\Seen'], { uid: true }); }
      else if (action === 'unread') { await client.messageFlagsRemove(u, ['\\Seen'], { uid: true }); }
      else if (action === 'star') { await client.messageFlagsAdd(u, ['\\Flagged'], { uid: true }); }
      else if (action === 'trash') { const dest = await trashPath(client); await client.messageMove(u, dest, { uid: true }); }
      else if (action === 'archive') { const dest = await archivePath(client); await client.messageMove(u, dest, { uid: true }); }
      else if (action === 'move' && folderPath) { await client.messageMove(u, folderPath, { uid: true }); }
      else { return { enabled: true, ok: false }; }
      return { enabled: true, ok: true };
    } finally { lock.release(); }
  } catch {
    return { enabled: true, ok: false };
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }
}
