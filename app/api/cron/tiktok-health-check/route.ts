import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * TikTok health check (PSAD §3.6, validé founder). Par compte TikTok connecté,
 * lit les vues des derniers posts (video.list). Si streak de 0 vue sur un compte
 * public → SUPPRESSION_SUSPECTED : pose un flag per-client
 * (org_agent_configs.config.tiktok_health_paused) + alerte. Le brief client est
 * déjà pause-aware (prévient + ajuste le %). Détection seule = ZÉRO risque sur
 * le flux de publication. Bounded + best-effort (token frais via cron dédié).
 */
const ZERO_STREAK_FLAG = 3;

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function recentViews(token: string): Promise<number[] | null> {
  try {
    const r = await fetch('https://open.tiktokapis.com/v2/video/list/?fields=view_count,create_time', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_count: 10 }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const v = j?.data?.videos;
    if (!Array.isArray(v)) return null;
    return v.map((x: any) => Number(x.view_count) || 0);
  } catch { return null; }
}

async function run() {
  const supabase = sb();
  const { data: clients } = await supabase
    .from('profiles')
    .select('id, email, tiktok_access_token, tiktok_token_expiry')
    .not('tiktok_access_token', 'is', null);

  const results: any[] = [];
  for (const c of clients || []) {
    const expiry = c.tiktok_token_expiry ? new Date(c.tiktok_token_expiry) : null;
    if (expiry && expiry <= new Date()) { results.push({ user: c.id, skipped: 'token_expired' }); continue; }
    const views = await recentViews(c.tiktok_access_token as string);
    if (!views || views.length < ZERO_STREAK_FLAG) { results.push({ user: c.id, skipped: 'no_data' }); continue; }
    // Count leading zero-view streak (most recent posts).
    let streak = 0;
    for (const v of views) { if (v === 0) streak++; else break; }
    const suspected = streak >= ZERO_STREAK_FLAG;
    if (suspected) {
      // Set per-client health-pause flag in the content config (merge).
      try {
        const { data: cfgRow } = await supabase.from('org_agent_configs').select('id, config')
          .eq('user_id', c.id).eq('agent_id', 'content').order('created_at', { ascending: false }).limit(1).maybeSingle();
        const cfg = { ...((cfgRow as any)?.config || {}), tiktok_health_paused: true, tiktok_health_paused_at: new Date().toISOString(), tiktok_zero_streak: streak };
        if (cfgRow?.id) await supabase.from('org_agent_configs').update({ config: cfg }).eq('id', cfgRow.id);
        else await supabase.from('org_agent_configs').insert({ user_id: c.id, agent_id: 'content', config: cfg });
      } catch { /* best-effort */ }
      await supabase.from('agent_logs').insert({
        agent: 'content', action: 'tiktok_suppression_suspected', status: 'error',
        data: { user_id: c.id, zero_streak: streak, severity: 'warning', note: 'pause protectrice TikTok recommandée — cooldown + contenu natif' },
        created_at: new Date().toISOString(),
      }).then(() => {}, () => {});
    }
    results.push({ user: c.id, streak, suspected });
  }
  return NextResponse.json({ ok: true, checked: results.length, suspected: results.filter(r => r.suspected).length, results });
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return run();
}
export async function POST(req: NextRequest) { return GET(req); }
