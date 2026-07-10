import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * HEALTH-SCORE CLIENT (réservoir Fable 5 §4.2) — anti-churn PROACTIF.
 * Calcule un score de santé par client actif (activité récente des agents +
 * agents pausés) et FLAGGE les clients à risque AVANT la résiliation.
 * Signal ADMIN uniquement (règle : alertes admin-only ; le play de rétention
 * client — message Clara — reste une action délibérée, jamais auto ici).
 * 0 coût LLM.
 */
function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function run() {
  const supabase = sb();
  const { data: clients } = await supabase
    .from('profiles')
    .select('id, email, company_name, subscription_plan, is_admin')
    .neq('subscription_plan', 'free')
    .not('subscription_plan', 'is', null)
    .limit(1000);

  const since7d = new Date(Date.now() - 7 * 86400000).toISOString();
  const results: any[] = [];
  const atRisk: any[] = [];

  for (const c of clients || []) {
    if (c.is_admin) continue;
    // Signal 1 — activité agents des 7 derniers jours (livrables réels).
    let activity = 0;
    try {
      const { count } = await supabase.from('agent_logs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', c.id).gte('created_at', since7d);
      activity = count || 0;
    } catch { /* best-effort */ }

    // Signal 2 — agents en pause (auto_paused / active=false).
    let pausedAgents = 0, totalConfigs = 0;
    try {
      const { data: cfgs } = await supabase.from('org_agent_configs').select('config').eq('user_id', c.id);
      totalConfigs = (cfgs || []).length;
      for (const r of cfgs || []) {
        const cfg: any = r.config || {};
        const pausedUntil = cfg.auto_paused_until ? new Date(cfg.auto_paused_until).getTime() : 0;
        if (cfg.active === false || (pausedUntil && pausedUntil > Date.now())) pausedAgents++;
      }
    } catch { /* best-effort */ }

    // Score 0-100 : activité (0-70) + agents actifs (0-30).
    const activityScore = Math.min(70, activity * 2); // 35 runs/sem = plein
    const toggleScore = totalConfigs > 0 ? Math.round(30 * (1 - pausedAgents / totalConfigs)) : 30;
    const score = activityScore + toggleScore;
    const band = score >= 55 ? 'healthy' : score >= 30 ? 'watch' : 'at_risk';

    results.push({ user: c.id.slice(0, 8), plan: c.subscription_plan, activity, pausedAgents, score, band });
    if (band === 'at_risk') atRisk.push({ id: c.id, company: c.company_name || c.email, plan: c.subscription_plan, score, activity });

    // Trace le score (consultable par le digest / dashboard admin).
    await supabase.from('agent_logs').insert({
      agent: 'system', action: 'client_health', status: band === 'at_risk' ? 'warning' : 'ok',
      data: { user_id: c.id, score, band, activity_7d: activity, paused_agents: pausedAgents },
      created_at: new Date().toISOString(),
    }).then(() => {}, () => {});
  }

  // Alerte ADMIN groupée si des clients sont à risque (jamais côté client).
  if (atRisk.length > 0) {
    try {
      const { sendBrevoCompat } = await import('@/lib/email/brevo-compat');
      const rows = atRisk.sort((a, b) => a.score - b.score).slice(0, 20)
        .map(r => `<tr><td style="padding:4px 8px;">${r.company}</td><td style="padding:4px 8px;">${r.plan}</td><td style="padding:4px 8px;text-align:right;color:#ef4444;font-weight:bold;">${r.score}/100</td><td style="padding:4px 8px;text-align:right;">${r.activity} runs/7j</td></tr>`).join('');
      await sendBrevoCompat({
        sender: { name: 'KeiroAI', email: 'contact@keiroai.com' },
        to: [{ email: 'contact@keiroai.com' }],
        subject: `⚠️ ${atRisk.length} client(s) à risque de churn — health-score`,
        htmlContent: `<div style="font-family:Arial,sans-serif;color:#333;"><h3>Clients à risque (score santé bas)</h3><p style="color:#6b7280;font-size:13px;">Faible activité et/ou agents en pause. Play de rétention à déclencher (message Clara, offre d'aide) AVANT la résiliation.</p><table style="border-collapse:collapse;font-size:13px;width:100%;"><thead><tr style="background:#f3f4f6;"><th style="padding:6px 8px;text-align:left;">Client</th><th style="padding:6px 8px;text-align:left;">Plan</th><th style="padding:6px 8px;text-align:right;">Score</th><th style="padding:6px 8px;text-align:right;">Activité</th></tr></thead><tbody>${rows}</tbody></table></div>`,
      });
    } catch { /* best-effort */ }
  }

  return NextResponse.json({ ok: true, checked: results.length, at_risk: atRisk.length, results: results.slice(0, 50) });
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return run();
}
export async function POST(req: NextRequest) { return GET(req); }
