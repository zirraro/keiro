import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { optimizeGbpListing } from '@/lib/agents/gbp-optimizer';

export const runtime = 'nodejs';
export const maxDuration = 120;

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// Agent SEO Fiche = packs Pro et au-dessus (décision founder).
const SEO_PLANS = new Set(['pro', 'fondateurs', 'business', 'elite', 'agence', 'admin']);

async function resolveUser(req: NextRequest): Promise<{ userId: string | null; isCron: boolean }> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get('authorization') === `Bearer ${cronSecret}`) {
    return { userId: req.nextUrl.searchParams.get('user_id'), isCron: true };
  }
  const { user } = await getAuthUser();
  return { userId: user?.id || null, isCron: false };
}

/**
 * GET /api/agents/gbp-optimize — optimise la fiche Google (description) avec gate
 * qualité. Mode auto (applique) ou review (propose au client). Pro+ uniquement.
 */
export async function GET(req: NextRequest) {
  const { userId } = await resolveUser(req);
  if (!userId) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const supabase = getSupabase();

  // Gating pack.
  const { data: prof } = await supabase.from('profiles').select('plan').eq('id', userId).maybeSingle();
  if (!SEO_PLANS.has(String(prof?.plan || '').toLowerCase())) {
    return NextResponse.json({ ok: false, reason: 'plan_locked', upsell: 'Agent SEO Fiche disponible à partir du pack Pro.' });
  }

  const out: any = { ok: true };
  try {
    // 1) Google Post (fraîcheur) — throttle 4j séparé.
    const fourDaysAgo = new Date(Date.now() - 4 * 86400000).toISOString();
    const { data: recentPost } = await supabase.from('agent_logs')
      .select('id').eq('user_id', userId).eq('agent', 'gmaps').eq('action', 'gbp_post_published')
      .gte('created_at', fourDaysAgo).limit(1).maybeSingle();
    if (!recentPost) {
      const { publishGbpPost } = await import('@/lib/agents/gbp-optimizer');
      out.post = await publishGbpPost(supabase, userId);
    } else { out.post = { skipped: 'throttled_4d' }; }

    // 2) Optimisation description — throttle 7j.
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: recent } = await supabase.from('agent_logs')
      .select('id').eq('user_id', userId).eq('agent', 'gmaps')
      .in('action', ['gbp_optimize_applied', 'gbp_optimize_proposed'])
      .gte('created_at', sevenDaysAgo).limit(1).maybeSingle();
    out.description = recent ? { skipped: 'throttled_7d' } : await optimizeGbpListing(supabase, userId);

    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message?.substring(0, 200) }, { status: 500 });
  }
}

/**
 * POST /api/agents/gbp-optimize — le client valide une proposition (mode review).
 * Body: { proposed: string, location: string, notification_id?: string }
 */
export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = getSupabase();
  const body = await req.json().catch(() => ({}));
  const proposed = String(body?.proposed || '').trim();
  if (!proposed) return NextResponse.json({ error: 'proposed requis' }, { status: 400 });

  const { getValidToken, updateLocationDescription } = await import('@/lib/google-business-oauth');
  const { data: prof } = await supabase.from('profiles').select('google_business_location_id').eq('id', user.id).single();
  if (!prof?.google_business_location_id) return NextResponse.json({ error: 'Fiche non connectée' }, { status: 400 });
  const token = await getValidToken(supabase, user.id);
  if (!token) return NextResponse.json({ error: 'Token expiré' }, { status: 400 });

  const applied = await updateLocationDescription(token, prof.google_business_location_id, proposed);
  await supabase.from('agent_logs').insert({
    agent: 'gmaps', action: applied ? 'gbp_optimize_applied' : 'gbp_optimize_apply_failed',
    user_id: user.id, status: applied ? 'ok' : 'error',
    data: { via: 'client_approval', description: proposed.substring(0, 300) }, created_at: new Date().toISOString(),
  });
  return NextResponse.json({ ok: applied, applied });
}
