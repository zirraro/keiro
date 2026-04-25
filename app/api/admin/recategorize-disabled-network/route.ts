import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/recategorize-disabled-network
 *
 * Scans content_calendar for draft/approved posts on platforms the
 * client doesn't have OAuth tokens for (TikTok, LinkedIn). Marks them
 * as 'skipped' with publish_diagnostic so the planning calendar
 * stops showing them as actionable. Idempotent — already-skipped
 * posts pass through.
 *
 * Body: { user_id?: string }   // omit to run for all clients (admin)
 */
export async function POST(req: NextRequest) {
  const { user } = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: caller } = await sb.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!caller?.is_admin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const targetUid: string | null = body.user_id || null;

  // Fetch profiles in scope.
  const profilesQuery = sb.from('profiles').select('id, tiktok_access_token, linkedin_access_token, linkedin_refresh_token');
  const { data: profiles } = targetUid
    ? await profilesQuery.eq('id', targetUid)
    : await profilesQuery.not('subscription_plan', 'is', null);

  let totalSkipped = 0;
  const perUser: Array<{ user_id: string; tiktok: number; linkedin: number }> = [];

  for (const p of (profiles || []) as any[]) {
    const disabledPlatforms: string[] = [];
    if (!p.tiktok_access_token) disabledPlatforms.push('tiktok');
    if (!p.linkedin_access_token && !p.linkedin_refresh_token) disabledPlatforms.push('linkedin');
    if (disabledPlatforms.length === 0) continue;

    const stats: Record<string, number> = {};
    for (const plat of disabledPlatforms) {
      const { data, error } = await sb
        .from('content_calendar')
        .update({
          status: 'skipped',
          publish_diagnostic: `network_disabled:${plat}_no_token`,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', p.id)
        .eq('platform', plat)
        .in('status', ['draft', 'approved'])
        .select('id');
      if (error) {
        console.warn(`[recategorize] ${p.id} ${plat}:`, error.message);
        continue;
      }
      stats[plat] = data?.length ?? 0;
      totalSkipped += stats[plat];
    }
    if (stats.tiktok || stats.linkedin) {
      perUser.push({
        user_id: p.id,
        tiktok: stats.tiktok || 0,
        linkedin: stats.linkedin || 0,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    total_skipped: totalSkipped,
    per_user: perUser,
  });
}
