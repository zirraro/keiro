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
  const underDelivered: any[] = [];
  const needFeed: string[] = []; // clients dont le stock de prospects envoyables est bas

  // Volume PROMIS (plancher hebdo de posts publiés) par plan. Le client paie un
  // service = un volume régulier. En-dessous du plancher = sous-livraison → alerte
  // admin (founder 2026-07-19 : "le client paie un service on lui fournit le volume promis").
  const weeklyPostFloor = (plan: string | null): number => {
    const p = (plan || '').toLowerCase();
    if (p.includes('elite')) return 12;
    if (p.includes('business')) return 10;
    if (p.includes('pro')) return 7;
    if (p.includes('crea') || p.includes('créa') || p.includes('creator') || p.includes('starter')) return 5;
    return 4; // plan payant inconnu → plancher conservateur
  };

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

    // Signal 3 — VOLUME LIVRÉ sur 7j (posts publiés / prospects ajoutés / mails envoyés).
    let posts7d = 0, prospects7d = 0, emails7d = 0;
    try {
      const { count } = await supabase.from('content_calendar')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', c.id).eq('status', 'published').gte('published_at', since7d);
      posts7d = count || 0;
    } catch { /* best-effort */ }
    try {
      const { count } = await supabase.from('crm_prospects')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', c.id).gte('created_at', since7d);
      prospects7d = count || 0;
    } catch { /* best-effort */ }
    try {
      const { count } = await supabase.from('crm_activities')
        .select('id, crm_prospects!inner(user_id)', { count: 'exact', head: true })
        .eq('crm_prospects.user_id', c.id).eq('type', 'email').gte('created_at', since7d);
      emails7d = count || 0;
    } catch { /* best-effort */ }

    // PIPELINE PROSPECTS (founder 2026-07-21) : pour tenir le volume email promis,
    // il faut assez de prospects ENVOYABLES (email valide, jamais contactés). Si le
    // stock est bas → on déclenche recherche + enrichissement (cost-cappés par plan
    // dans les endpoints → pas de runaway). "Autant de recherches que nécessaire."
    let sendable = 0;
    try {
      const { count } = await supabase.from('crm_prospects')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', c.id)
        .not('email', 'is', null)
        .eq('email_sequence_status', 'not_started');
      sendable = count || 0;
    } catch { /* best-effort */ }
    if (activity > 0 && sendable < 40) needFeed.push(c.id);

    const floor = weeklyPostFloor(c.subscription_plan);
    // Sous-livraison de posts = signal fort (le cœur du service). On flag aussi
    // quand un client actif (activité > 0 = agents branchés) n'a eu AUCUN post.
    const postsShort = activity > 0 && posts7d < floor;
    if (postsShort) {
      underDelivered.push({
        id: c.id, company: c.company_name || c.email, plan: c.subscription_plan,
        posts7d, floor, prospects7d, emails7d,
      });
    }

    results.push({ user: c.id.slice(0, 8), plan: c.subscription_plan, activity, pausedAgents, score, band, posts7d, prospects7d, emails7d, floor });
    if (band === 'at_risk') atRisk.push({ id: c.id, company: c.company_name || c.email, plan: c.subscription_plan, score, activity });

    // Trace le score (consultable par le digest / dashboard admin).
    await supabase.from('agent_logs').insert({
      agent: 'system', action: 'client_health', status: (band === 'at_risk' || postsShort) ? 'warning' : 'ok',
      data: { user_id: c.id, score, band, activity_7d: activity, paused_agents: pausedAgents, posts_7d: posts7d, prospects_7d: prospects7d, emails_7d: emails7d, posts_floor: floor, under_delivered: postsShort },
      created_at: new Date().toISOString(),
    }).then(() => {}, () => {});
  }

  // AUTO-RATTRAPAGE du volume (founder 2026-07-19 : "pas d'alerte à contact, on
  // contrôle en AUTO et on actionne ce qu'il faut pour arriver aux volumes prévus.
  // Super important de livrer."). Pour chaque client sous-livré, on DÉCLENCHE le
  // rattrapage — il réutilise TOUS les gardes existants (toggles réseau, caps
  // journaliers, espacement, quality gate, publish-mode auto/manuel). Fire-and-
  // forget : on ne bloque pas le cron sur les générations (lourdes).
  const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://keiroai.com';
  const cron = process.env.CRON_SECRET || '';
  const remediated: string[] = [];
  for (const u of underDelivered.slice(0, 40)) {
    if (!u.id) continue;
    // 1) POSTS — slot catch_up : génère le prochain post manquant (respecte les gardes).
    fetch(`${site}/api/agents/content?slot=catch_up&user_id=${u.id}`, {
      headers: { Authorization: `Bearer ${cron}` },
    }).catch(() => {});
    // 2) MAILS — Hugo daily (self-cap 20/j/domaine, warm-up respecté) si 0 mail sur 7j.
    if (u.emails7d === 0) {
      fetch(`${site}/api/agents/email/daily?user_id=${u.id}`, {
        headers: { Authorization: `Bearer ${cron}` },
      }).catch(() => {});
    }
    remediated.push(u.company);
  }
  if (remediated.length > 0) {
    await supabase.from('agent_logs').insert({
      agent: 'system', action: 'volume_auto_remediation', status: 'ok',
      data: { count: remediated.length, clients: remediated.slice(0, 40), note: 'catch_up posts + email daily déclenchés pour tenir le volume promis' },
      created_at: new Date().toISOString(),
    }).then(() => {}, () => {});
  }

  // PROSPECTION PILOTÉE PAR LA DEMANDE (founder 2026-07-21) : pour les clients dont
  // le stock de prospects envoyables est bas, on déclenche une recherche gmaps
  // (SELF-CAPPÉE par plan → marge protégée, pas de runaway €350) + l'enrichissement.
  // "Autant de recherches que nécessaire" — mais dans le budget du plan.
  for (const uid of needFeed.slice(0, 25)) {
    fetch(`${site}/api/agents/gmaps?user_id=${uid}`, {
      method: 'POST', headers: { Authorization: `Bearer ${cron}`, 'Content-Type': 'application/json' }, body: '{}',
    }).catch(() => {});
  }
  if (needFeed.length > 0) {
    // Rafraîchit le pool + enrichit (cost-cappé) pour transformer les prospects trouvés en envoyables.
    fetch(`${site}/api/cron/prospect-pool-refresh`, { headers: { Authorization: `Bearer ${cron}` } }).catch(() => {});
    await supabase.from('agent_logs').insert({
      agent: 'system', action: 'prospect_feed_triggered', status: 'ok',
      data: { count: needFeed.length, clients: needFeed.slice(0, 25), note: 'recherche gmaps + enrichissement déclenchés pour alimenter le volume email' },
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
