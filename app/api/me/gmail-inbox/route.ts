import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { listRecentGmail, createGmailDraft, mailboxEnabled, manageGmailMessage, listGmailLabels } from '@/lib/gmail-read';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * OPTION B (post-CASA) — endpoints NATIFS Gmail, ENTIÈREMENT GATÉS.
 *
 * GET  /api/me/gmail-inbox        → lit les mails reçus du client (gmail.readonly)
 * POST /api/me/gmail-inbox        → crée un brouillon natif Gmail (gmail.compose)
 *                                   body { to, subject, htmlBody, replyTo?, threadId? }
 *
 * Tant que GMAIL_OPTION_B ≠ on → renvoie { enabled:false } sans toucher Gmail.
 * Aucun impact sur l'existant (Option A gmail.send reste seule active).
 */
export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const dossier = req.nextUrl.searchParams.get('dossier') || 'INBOX';
  const veutDossiers = req.nextUrl.searchParams.get('labels') === '1';

  // ── Gmail d'abord, s'il est activé ──
  if (await mailboxEnabled(user.id)) {
    if (veutDossiers) {
      const { enabled, labels } = await listGmailLabels(user.id);
      return NextResponse.json({ ok: true, provider: 'gmail', enabled, labels });
    }
    const { enabled, messages } = await listRecentGmail(user.id, { max: 15 });
    return NextResponse.json({ ok: true, provider: 'gmail', enabled, messages });
  }

  // ── Sinon le domaine personnalisé, par IMAP ──
  //
  // Fondateur, 2026-08-11 : « on ne voit pas les mails reçus, ni les
  // brouillons, ni la corbeille, ni les dossiers — que ce soit en domaine
  // personnalisé ou Gmail, on doit voir tout ça ».
  //
  // Cet endpoint ne connaissait QUE Gmail, et seulement derrière le drapeau
  // Option B. Un client sur son propre domaine n'avait donc AUCUNE vue de sa
  // boîte : l'écran affichait le CRM (`/api/me/inbox`), c'est-à-dire les
  // échanges enregistrés par les agents, pas sa messagerie.
  //
  // Les briques IMAP existaient déjà et servaient au tri automatique. Elles
  // n'avaient simplement jamais été branchées sur l'affichage.
  try {
    const { listImapInbox, listImapFolders } = await import('@/lib/agents/imap-mailbox');
    if (veutDossiers) {
      const { enabled, folders } = await listImapFolders(user.id);
      return NextResponse.json({
        ok: true, provider: 'imap', enabled,
        labels: (folders || []).map((f: string) => ({ id: f, name: f })),
      });
    }
    const { enabled, messages } = await listImapInbox(user.id, 25, dossier);
    return NextResponse.json({
      ok: true, provider: 'imap', enabled, dossier,
      messages: (messages || []).map((m: any) => ({
        id: String(m.uid), from: m.from, subject: m.subject,
        snippet: m.snippet || '', date: m.date,
      })),
    });
  } catch {
    return NextResponse.json({ ok: true, provider: 'aucun', enabled: false, messages: [], labels: [] });
  }
}

// PATCH → gestion de la boîte (corbeille/archive/lu/déplacer). Gaté Option B.
export async function PATCH(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  if (!(await mailboxEnabled(user.id))) return NextResponse.json({ ok: false, enabled: false, error: 'Option B non activée' }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const messageId = String(body.messageId || '').trim();
  const action = String(body.action || '').trim() as 'trash' | 'archive' | 'read' | 'unread' | 'move' | 'star' | 'unstar';
  const valid = ['trash', 'archive', 'read', 'unread', 'move', 'star', 'unstar'];
  if (!messageId || !valid.includes(action)) return NextResponse.json({ ok: false, error: 'messageId + action valides requis' }, { status: 400 });
  const res = await manageGmailMessage(user.id, messageId, action, body.labelId);
  return NextResponse.json({ ok: !!res.ok, ...res });
}

export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  if (!(await mailboxEnabled(user.id))) return NextResponse.json({ ok: false, enabled: false, error: 'Option B non activée' }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const to = String(body.to || '').trim();
  const subject = String(body.subject || '').trim();
  const htmlBody = String(body.htmlBody || '').trim();
  if (!to || !subject || !htmlBody) return NextResponse.json({ ok: false, error: 'to, subject, htmlBody requis' }, { status: 400 });
  const res = await createGmailDraft(user.id, { to, subject, htmlBody, replyTo: body.replyTo, threadId: body.threadId });
  return NextResponse.json({ ok: !!res.draftId, ...res });
}
