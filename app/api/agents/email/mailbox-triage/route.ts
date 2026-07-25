import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { triageMailbox } from '@/lib/agents/mailbox-manager';
import { mailboxEnabled } from '@/lib/gmail-read';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/**
 * POST /api/agents/email/mailbox-triage — Hugo trie/nettoie/range la boîte en
 * autonomie (Option B). body { dryRun? }. Gaté : enabled:false si Option B off.
 * Auth : session client OU (Bearer CRON_SECRET + ?user_id=) pour déclenchement
 * depuis le chat ("trie ma boîte", "réponds aux mails importants", …).
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  const isCron = !!(cronSecret && authHeader === `Bearer ${cronSecret}`);
  const uidParam = req.nextUrl.searchParams.get('user_id');

  let userId: string | null = null;
  if (isCron && uidParam) {
    userId = uidParam;
  } else {
    const { user, error } = await getAuthUser();
    if (error || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    userId = user.id;
  }

  if (!(await mailboxEnabled(userId))) return NextResponse.json({ ok: false, enabled: false, error: 'Option B non activée' }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const result = await triageMailbox(userId, { dryRun: !!body.dryRun });
  return NextResponse.json({ ok: true, ...result });
}
