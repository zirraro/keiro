import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';

/**
 * GET /api/agents/settings?agent_id=xxx
 * Get agent settings for the authenticated user.
 *
 * POST /api/agents/settings
 * Update agent settings.
 * Body: { agent_id: string, auto_mode?: boolean, ...other settings }
 */

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

  const agentId = req.nextUrl.searchParams.get('agent_id');
  if (!agentId) return NextResponse.json({ error: 'agent_id requis' }, { status: 400 });

  const supabase = getSupabase();

  // Get user plan
  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_plan')
    .eq('id', user.id)
    .single();

  // Check org_agent_configs for per-agent settings.
  // NOTE: .maybeSingle() returns null when multiple rows match — some
  // accounts have duplicate (user_id, agent_id) rows, which made the
  // agents page falsely report "not activated" for agents the user had
  // actually turned on. Order by created_at and take the most recent.
  const { data: configRows } = await supabase
    .from('org_agent_configs')
    .select('config, created_at')
    .eq('user_id', user.id)
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(1);
  const config = configRows?.[0];

  return NextResponse.json({
    ok: true,
    agent_id: agentId,
    auto_mode: config?.config?.auto_mode ?? false,
    settings: config?.config || {},
    subscription_plan: profile?.subscription_plan || 'free',
  });
}

export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

  const body = await req.json();
  const { agent_id, auto_mode, ...otherSettings } = body;

  if (!agent_id) return NextResponse.json({ error: 'agent_id requis' }, { status: 400 });

  const supabase = getSupabase();

  // Upsert into org_agent_configs. Same duplicate-row defence as GET —
  // pick the most recent row when several exist, otherwise the update
  // writes to an old row and the next read (which also picks the newest)
  // silently reverts the toggle.
  const { data: existingRows } = await supabase
    .from('org_agent_configs')
    .select('id, config, created_at')
    .eq('user_id', user.id)
    .eq('agent_id', agent_id)
    .order('created_at', { ascending: false })
    .limit(1);
  const existing = existingRows?.[0];

  const newConfig = {
    ...(existing?.config || {}),
    ...otherSettings,
    ...(auto_mode !== undefined ? { auto_mode } : {}),
  };

  if (existing) {
    await supabase.from('org_agent_configs').update({ config: newConfig }).eq('id', existing.id);
  } else {
    await supabase.from('org_agent_configs').insert({
      user_id: user.id,
      agent_id: agent_id,
      config: newConfig,
    });
  }

  return NextResponse.json({ ok: true, auto_mode: newConfig.auto_mode, settings: newConfig });
}
