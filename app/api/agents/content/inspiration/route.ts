import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/agents/content/inspiration
 * Body: { handle: string, save?: boolean }
 *
 * Analyses an Instagram handle and returns the style brief. When
 * save=true, persists it to the user's content config so the next
 * generation pulls it automatically.
 */
export async function POST(req: NextRequest) {
  const { user } = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const handle = String(body.handle || '').trim();
  if (!handle) return NextResponse.json({ ok: false, error: 'handle required' }, { status: 400 });

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: profile } = await sb
    .from('profiles')
    .select('facebook_page_access_token, instagram_business_account_id, instagram_igaa_token')
    .eq('id', user.id)
    .maybeSingle();

  const ownerToken = profile?.facebook_page_access_token || profile?.instagram_igaa_token || undefined;
  const ownerBizId = profile?.instagram_business_account_id || undefined;

  const { analyzeIgAccount } = await import('@/lib/visuals/ig-inspiration');
  const brief = await analyzeIgAccount({
    handle,
    ownerIgToken: ownerToken,
    ownerIgBusinessId: ownerBizId,
    language: 'fr',
  });

  if (!brief) {
    return NextResponse.json({ ok: false, error: 'Could not analyze account' }, { status: 500 });
  }

  if (body.save === true) {
    // Persist the brief to org_agent_configs.config.inspiration so
    // generateDailyPost reads it on subsequent runs.
    const { data: existing } = await sb
      .from('org_agent_configs')
      .select('config')
      .eq('user_id', user.id)
      .eq('agent_id', 'content')
      .maybeSingle();
    const merged = { ...(existing?.config || {}), inspiration: brief };
    await sb.from('org_agent_configs').upsert({
      user_id: user.id,
      agent_id: 'content',
      config: merged,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,agent_id' });
  }

  return NextResponse.json({ ok: true, brief });
}

/**
 * GET /api/agents/content/inspiration
 * Returns the currently saved inspiration brief (if any).
 */
export async function GET() {
  const { user } = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data } = await sb
    .from('org_agent_configs')
    .select('config')
    .eq('user_id', user.id)
    .eq('agent_id', 'content')
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    brief: data?.config?.inspiration || null,
  });
}

/**
 * DELETE /api/agents/content/inspiration
 * Clears the saved inspiration brief.
 */
export async function DELETE() {
  const { user } = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: existing } = await sb
    .from('org_agent_configs')
    .select('config')
    .eq('user_id', user.id)
    .eq('agent_id', 'content')
    .maybeSingle();
  if (existing?.config?.inspiration) {
    const { inspiration: _drop, ...rest } = existing.config as any;
    void _drop;
    await sb.from('org_agent_configs').upsert({
      user_id: user.id,
      agent_id: 'content',
      config: rest,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,agent_id' });
  }
  return NextResponse.json({ ok: true });
}
