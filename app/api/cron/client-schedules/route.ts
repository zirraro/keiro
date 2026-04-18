import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

/**
 * GET /api/cron/client-schedules
 * Returns all active clients with their per-agent custom schedules.
 * Used by the VPS worker to fire agents at client-specific times.
 *
 * Response: { clients: [{ user_id, email, plan, agents: { content: { schedule: ["09:00","18:00"], config: {...} }, ... } }] }
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get all non-free profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, subscription_plan')
    .not('subscription_plan', 'is', null)
    .neq('subscription_plan', 'free');

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ clients: [] });
  }

  const userIds = profiles.map(p => p.id);

  // Get all agent configs for these users
  const { data: configs } = await supabase
    .from('org_agent_configs')
    .select('user_id, agent_id, config')
    .in('user_id', userIds);

  // Build per-client agent map
  const clientMap: Record<string, {
    user_id: string;
    email: string;
    plan: string;
    agents: Record<string, { active: boolean; schedule: string[] | null; config: Record<string, any> }>;
  }> = {};

  for (const profile of profiles) {
    clientMap[profile.id] = {
      user_id: profile.id,
      email: profile.email,
      plan: profile.subscription_plan,
      agents: {},
    };
  }

  // Default schedule hours (UTC) per agent — used when client has no custom schedule
  const DEFAULT_SCHEDULES: Record<string, string[]> = {
    content:      ['07:00', '10:00', '13:30', '17:00'],
    email:        ['07:00', '10:00', '13:30', '17:00'],
    commercial:   ['07:00', '14:00'],
    dm_instagram: ['07:00', '13:30', '17:00'],
    seo:          ['07:00'],
    gmaps:        ['10:00'],
    ceo:          ['05:00', '20:00'],
    marketing:    ['05:00'],
  };

  for (const cfg of (configs || [])) {
    const client = clientMap[cfg.user_id];
    if (!client) continue;

    const isActive = cfg.config?.auto_mode === true || cfg.config?.setup_completed === true;
    const customSchedule = cfg.config?.custom_schedule?.[cfg.agent_id] || null;
    const defaultSched = DEFAULT_SCHEDULES[cfg.agent_id] || null;

    client.agents[cfg.agent_id] = {
      active: isActive,
      schedule: customSchedule || defaultSched,
      config: cfg.config || {},
    };
  }

  return NextResponse.json({
    clients: Object.values(clientMap).filter(c => Object.keys(c.agents).length > 0),
    generated_at: new Date().toISOString(),
  });
}
