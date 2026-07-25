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
 */
export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  if (!(await mailboxEnabled(user.id))) return NextResponse.json({ ok: false, enabled: false, error: 'Option B non activée' }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const result = await triageMailbox(user.id, { dryRun: !!body.dryRun });
  return NextResponse.json({ ok: true, ...result });
}
