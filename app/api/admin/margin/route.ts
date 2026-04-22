import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { isAdmin } from '@/lib/credits/server';
import { computeClientMargin, listAllClientMargins } from '@/lib/credits/margin';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/admin/margin
 *   → Aggregate: every paying client's live margin snapshot
 *     (sorted worst → best, so the red flags are at the top)
 *
 * GET /api/admin/margin?user_id=<uuid>
 *   → Single client's detailed breakdown
 *
 * Auth: admin user only (bearer on the profiles.is_admin flag). The
 * fallback CRON_SECRET path is accepted for scripting.
 */
export async function GET(req: NextRequest) {
  // Admin-only — either logged-in admin or CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  const authedViaCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!authedViaCron) {
    const { user, error } = await getAuthUser();
    if (error || !user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    const admin = await isAdmin(user.id);
    if (!admin) {
      return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 });
    }
  }

  const target = req.nextUrl.searchParams.get('user_id');
  if (target) {
    const snap = await computeClientMargin(target);
    return NextResponse.json({ ok: true, snapshot: snap });
  }

  const rows = await listAllClientMargins();
  const summary = {
    total_clients: rows.length,
    blocked: rows.filter(r => r.status === 'blocked').length,
    warn: rows.filter(r => r.status === 'warn').length,
    healthy: rows.filter(r => r.status === 'healthy').length,
    total_revenue_ht: rows.reduce((s, r) => s + r.revenueHT, 0),
    total_cogs: rows.reduce((s, r) => s + r.cogs.total, 0),
    avg_margin_pct: rows.length ? rows.reduce((s, r) => s + r.margin_pct, 0) / rows.length : 0,
  };
  return NextResponse.json({ ok: true, summary, rows });
}
