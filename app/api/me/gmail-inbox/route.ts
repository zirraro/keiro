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
  if (!(await mailboxEnabled(user.id))) return NextResponse.json({ ok: true, enabled: false, messages: [], labels: [] });
  // ?labels=1 → liste des libellés (pour "déplacer vers…" / organiser).
  if (req.nextUrl.searchParams.get('labels') === '1') {
    const { enabled, labels } = await listGmailLabels(user.id);
    return NextResponse.json({ ok: true, enabled, labels });
  }
  const { enabled, messages } = await listRecentGmail(user.id, { max: 15 });
  return NextResponse.json({ ok: true, enabled, messages });
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
