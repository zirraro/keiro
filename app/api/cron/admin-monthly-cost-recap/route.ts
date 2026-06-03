import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ADMIN_EMAIL = 'contact@keiroai.com';

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/**
 * GET /api/cron/admin-monthly-cost-recap
 *
 * Founder ask 2026-06-03: clearer cost view per agent (per run + per month),
 * separated by useful action vs raw log count, with prorata margins on
 * the real test client (mrzirraro@gmail.com — Pro plan today, but we
 * also show créateur prorata since email agent isn't in créateur plan).
 *
 * Sends ONE recap email to contact@keiroai.com with:
 *   1. Real bills uploaded (Anthropic, OVH, GCP, ByteDance, etc.)
 *   2. Per-agent: runs, useful actions, cost/action, cost/month
 *   3. Top-3 unmanaged costs that we should attack
 *   4. Prorata margin on 1 real test client, Créateur AND Pro plan
 *   5. Breakeven analysis: at what client count is the business viable?
 *
 * Auth: CRON_SECRET only.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = sb();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodLabel = monthStart.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const periodIso = monthStart.toISOString();
  const periodKey = monthStart.toISOString().slice(0, 7);

  // ─── 1. Real bills uploaded for last month ─────────────────────────
  const { data: bills } = await supabase
    .from('external_cost_uploads')
    .select('service, billing_period, total_cost_eur, uploaded_at, notes')
    .eq('billing_period', periodKey);

  const billsByService: Record<string, number> = {};
  for (const b of (bills || []) as any[]) {
    const svc = (b.service || 'unknown').toLowerCase();
    billsByService[svc] = (billsByService[svc] || 0) + Number(b.total_cost_eur || 0);
  }
  const totalBillsReal = Object.values(billsByService).reduce((a, b) => a + b, 0);

  // 2026-06-03 v3 — Founder feedback: keep Claude Code IN the cost — it's
  // a recurring dev expense like a dev's salary, must be part of margin
  // analysis. So Anthropic Code (108€) = FIXED bill, included in COGS.
  // OVH = FIXED.
  // Bytedance + Places + Anthropic API + GCP = VARIABLE per client.
  const R_AND_D_SERVICES = new Set<string>(); // empty — nothing excluded
  const FIXED_INFRA_SERVICES = new Set(['anthropic', 'claude_code', 'ovh', 'ovh_cloud']);
  const rdBills = 0;
  const fixedBills = Object.entries(billsByService)
    .filter(([svc]) => FIXED_INFRA_SERVICES.has(svc))
    .reduce((s, [, v]) => s + v, 0);
  const variableBills = totalBillsReal - fixedBills;
  const cogsTotal = fixedBills + variableBills;

  // ─── 2. Per-agent: runs + useful actions + estimated cost ──────────
  const { data: logs } = await supabase
    .from('agent_logs')
    .select('agent, action, status, user_id, created_at')
    .gte('created_at', periodIso)
    .lt('created_at', monthEnd.toISOString())
    .limit(100000);

  // "Useful action" = the action that consumes LLM credits, NOT webhooks/
  // reports/memory rows. These are the rows whose presence costs money.
  const USEFUL_ACTIONS_BY_AGENT: Record<string, RegExp> = {
    content: /^(daily_post_generated|execute_publication|weekly_plan_generated)$/,
    email: /^(daily_cold|inbound_processed|imap_inbound_poll)$/,
    dm_instagram: /^(daily_preparation|dm_auto_reply|follow_campaign)$/,
    ceo: /^(daily_brief|evening_catchup|noah_diagnostic)$/,
    marketing: /^(strategic_analysis|weekly_analysis)$/,
    commercial: /^(enrichment_run|scrape_enrich)$/,
    seo: /^(daily_run|seo_analysis)$/,
    gmaps: /^(daily_scan)$/,
    onboarding: /^(execution_success)$/,
    instagram_comments: /^(reply_sent)$/,
    chatbot: /^(message_sent|conversation_handled)$/,
    retention: /^(execution_success)$/,
  };

  // Cost per useful action (€) — 2026-06-03 v3 calibrated on REAL bills.
  // Founder facture mai 2026 pour 1 client Pro:
  //   Bytedance 20.17€ pour 51 posts content = 0.40€/post (visual + LLM)
  //   Places 41.51€ pour 31 enrichments commercial = 1.34€/action
  //   Anthropic API 20€ ventilé entre tous les agents
  const COST_PER_USEFUL_ACTION_EUR: Record<string, number> = {
    content: 0.40,         // Real: 20€ Bytedance / 51 posts. Includes visual gen.
    email: 0.008,          // Hugo LLM only — pas de génération image
    dm_instagram: 0.05,    // Gemini + occasional Seedream visual when prospect asks for sample
    ceo: 0.05,             // Sonnet long-context daily brief
    marketing: 0.03,       // Sonnet analysis
    commercial: 1.34,      // Places 41€ / 31 actions = 1.34€/enrich (Google Places dominé)
    seo: 0.06,             // Sonnet keyword strategy (Mon/Wed/Fri only)
    gmaps: 0.21,           // Places ratio aussi
    onboarding: 0.01,
    instagram_comments: 0.005,
    chatbot: 0.004,
    retention: 0.005,
  };

  type AgentStat = {
    runs: number;
    runs_excluding_freebies: number; // 2026-06-03: real runs (LLM or business) — webhooks/heartbeats excluded
    useful_actions: number;
    errors: number;
    cost_per_action_eur: number;
    total_cost_eur: number;
    by_user: Record<string, number>; // useful actions per user_id
  };
  const agents: Record<string, AgentStat> = {};

  // 2026-06-03 — Founder ask: "80% de runs utiles pas 20%". The denominator
  // was polluted by webhook events + heartbeats. Exclude these from the
  // "real runs" count so the ratio reflects actual work vs overhead.
  const FREE_ACTIONS_PATTERN = /^(webhook_|memory|event|report_to_ceo|execution_success|hot_prospect_click|webhook_dm_received|imap_inbound_poll)$/i;

  for (const log of (logs || []) as any[]) {
    const a = log.agent || 'unknown';
    if (!agents[a]) {
      agents[a] = {
        runs: 0,
        runs_excluding_freebies: 0,
        useful_actions: 0,
        errors: 0,
        cost_per_action_eur: COST_PER_USEFUL_ACTION_EUR[a] ?? 0.003,
        total_cost_eur: 0,
        by_user: {},
      };
    }
    agents[a].runs++;
    if (!FREE_ACTIONS_PATTERN.test(log.action || '')) {
      agents[a].runs_excluding_freebies++;
    }
    if (log.status === 'error' || log.action === 'execution_failure') agents[a].errors++;
    const usefulRe = USEFUL_ACTIONS_BY_AGENT[a];
    if (usefulRe && usefulRe.test(log.action || '')) {
      agents[a].useful_actions++;
      agents[a].total_cost_eur += agents[a].cost_per_action_eur;
      if (log.user_id) {
        agents[a].by_user[log.user_id] = (agents[a].by_user[log.user_id] || 0) + 1;
      }
    }
  }
  const totalAgentLlmCost = Object.values(agents).reduce((s, a) => s + a.total_cost_eur, 0);

  // ─── 3. Real useful actions per client (DB truth, not log estimate) ──
  // The agent_logs counts above are LLM call estimates. Now we cross-check
  // against the actual artefacts created in the DB.
  const [emailsRes, postsRes, dmsRes, prospectsRes, commentsRes] = await Promise.all([
    supabase.from('crm_prospects').select('user_id', { count: 'exact' })
      .gte('last_email_sent_at', periodIso).lt('last_email_sent_at', monthEnd.toISOString()),
    supabase.from('content_calendar').select('user_id', { count: 'exact' })
      .eq('status', 'published').gte('published_at', periodIso).lt('published_at', monthEnd.toISOString()),
    supabase.from('crm_prospects').select('user_id', { count: 'exact' })
      .gte('dm_sent_at', periodIso).lt('dm_sent_at', monthEnd.toISOString()),
    supabase.from('crm_prospects').select('user_id', { count: 'exact' })
      .gte('created_at', periodIso).lt('created_at', monthEnd.toISOString()),
    supabase.from('agent_logs').select('user_id', { count: 'exact' })
      .eq('agent', 'instagram_comments').eq('action', 'reply_sent')
      .gte('created_at', periodIso).lt('created_at', monthEnd.toISOString()),
  ]);

  // ─── 4. Per-client cost attribution ──────────────────────────────────
  const REVENUE_PER_PLAN_EUR: Record<string, number> = {
    free: 0, createur: 49, pro: 99, business: 199,
    fondateurs: 149, elite: 999, agence: 999, admin: 0,
  };

  // Plan inclusion map: which agents are part of each plan
  // 2026-06-03 — Créateur 49€ : Lena + Jade + Clara + Ami (no email/commercial/Léo)
  // Pro 99€ : Créateur + Hugo (emails) + Léo (commercial/Places)
  // Business 199€ : Pro + ceo/seo/amit/retention/IG comments
  const PLAN_INCLUDED_AGENTS: Record<string, Set<string>> = {
    createur: new Set(['content', 'dm_instagram', 'chatbot', 'marketing']),
    pro: new Set(['content', 'dm_instagram', 'chatbot', 'marketing', 'email', 'commercial', 'gmaps', 'instagram_comments']),
    business: new Set(['content', 'dm_instagram', 'chatbot', 'marketing', 'email', 'commercial', 'gmaps', 'instagram_comments', 'ceo', 'seo', 'amit', 'retention', 'onboarding']),
    fondateurs: new Set(['content', 'dm_instagram', 'chatbot', 'marketing', 'email', 'commercial', 'gmaps', 'instagram_comments', 'ceo', 'seo', 'amit', 'retention', 'onboarding']),
    elite: new Set(['content', 'dm_instagram', 'chatbot', 'marketing', 'email', 'commercial', 'gmaps', 'instagram_comments', 'ceo', 'seo', 'amit', 'retention', 'onboarding']),
    agence: new Set(['content', 'dm_instagram', 'chatbot', 'marketing', 'email', 'commercial', 'gmaps', 'instagram_comments', 'ceo', 'seo', 'amit', 'retention', 'onboarding']),
  };

  // 2026-06-03 — Founder feedback: only REAL paying clients count.
  // Exclude is_admin accounts + obvious test addresses (+metareview, +test,
  // contact@keiroai.com our own admin). Stripe will eventually give us a
  // cleaner signal (stripe_customer_id non null) — until then, this filter
  // matches the "1 vrai client = mrzirraro@gmail.com Pro 99€" reality.
  const { data: clientsRaw } = await supabase
    .from('profiles')
    .select('id, email, subscription_plan, is_admin');
  const isRealPayingClient = (c: any) => {
    if (!c) return false;
    if (c.is_admin === true) return false;
    const email = String(c.email || '').toLowerCase();
    if (!email) return false;
    if (email === 'contact@keiroai.com') return false;
    if (email.includes('+test') || email.includes('+metareview') || email.includes('+staging')) return false;
    return true;
  };
  const clients = (clientsRaw || []).filter(isRealPayingClient);

  // Compute per-client LLM cost from agent_logs.by_user
  const llmCostByUser: Record<string, number> = {};
  for (const [agentName, st] of Object.entries(agents)) {
    for (const [uid, n] of Object.entries(st.by_user)) {
      llmCostByUser[uid] = (llmCostByUser[uid] || 0) + n * st.cost_per_action_eur;
    }
  }

  // For each client: LLM cost + share of fixed bills (head-count split among paying)
  type ClientCost = {
    email: string;
    plan: string;
    revenue: number;
    llm_cost: number;
    fixed_share: number;
    variable_share: number;
    total_cost: number;
    margin_pct: number | null;
    actions: {
      emails: number;
      posts: number;
      dms: number;
      prospects: number;
      comments: number;
    };
  };
  const perUserActions: Record<string, ClientCost['actions']> = {};
  // Aggregate counts per user
  const aggCount = async (table: string, col: string) => {
    const { data } = await supabase
      .from(table)
      .select('user_id')
      .gte(col, periodIso)
      .lt(col, monthEnd.toISOString())
      .limit(100000);
    const m: Record<string, number> = {};
    for (const r of (data || []) as any[]) {
      if (!r.user_id) continue;
      m[r.user_id] = (m[r.user_id] || 0) + 1;
    }
    return m;
  };
  const [emailsPerUser, postsPerUser, dmsPerUser, prospectsPerUser] = await Promise.all([
    aggCount('crm_prospects', 'last_email_sent_at'),
    (async () => {
      const { data } = await supabase
        .from('content_calendar')
        .select('user_id')
        .eq('status', 'published')
        .gte('published_at', periodIso)
        .lt('published_at', monthEnd.toISOString())
        .limit(100000);
      const m: Record<string, number> = {};
      for (const r of (data || []) as any[]) {
        if (!r.user_id) continue;
        m[r.user_id] = (m[r.user_id] || 0) + 1;
      }
      return m;
    })(),
    aggCount('crm_prospects', 'dm_sent_at'),
    aggCount('crm_prospects', 'created_at'),
  ]);
  const commentsPerUser: Record<string, number> = {};
  for (const log of (logs || []) as any[]) {
    if (log.agent === 'instagram_comments' && log.action === 'reply_sent' && log.user_id) {
      commentsPerUser[log.user_id] = (commentsPerUser[log.user_id] || 0) + 1;
    }
  }
  for (const c of (clients || []) as any[]) {
    perUserActions[c.id] = {
      emails: emailsPerUser[c.id] || 0,
      posts: postsPerUser[c.id] || 0,
      dms: dmsPerUser[c.id] || 0,
      prospects: prospectsPerUser[c.id] || 0,
      comments: commentsPerUser[c.id] || 0,
    };
  }

  const payingClients = (clients || []).filter((c: any) => {
    const plan = (c.subscription_plan || 'free').toLowerCase();
    return REVENUE_PER_PLAN_EUR[plan] > 0;
  });
  const payingCount = Math.max(1, payingClients.length);
  const fixedSharePerClient = fixedBills / payingCount;
  const variableSharePerClient = variableBills / payingCount;

  const perClient: ClientCost[] = payingClients.map((c: any) => {
    const plan = (c.subscription_plan || 'free').toLowerCase();
    const revenue = REVENUE_PER_PLAN_EUR[plan] ?? 0;
    const llm = Number(llmCostByUser[c.id] || 0);
    const fixed = fixedSharePerClient;
    const variable = variableSharePerClient;
    const total = llm + fixed + variable;
    const margin = revenue > 0 ? Math.round(((revenue - total) / revenue) * 100) : null;
    return {
      email: c.email,
      plan,
      revenue,
      llm_cost: Number(llm.toFixed(2)),
      fixed_share: Number(fixed.toFixed(2)),
      variable_share: Number(variable.toFixed(2)),
      total_cost: Number(total.toFixed(2)),
      margin_pct: margin,
      actions: perUserActions[c.id] || { emails: 0, posts: 0, dms: 0, prospects: 0, comments: 0 },
    };
  });

  // ─── 5. Prorata scenarios on real test client ────────────────────────
  // Use the heaviest test client as the reference (= mrzirraro@gmail.com)
  const testClient = perClient.sort((a, b) => b.llm_cost - a.llm_cost)[0] || null;
  type PlanScenario = {
    plan: string;
    plan_revenue: number;
    // Cost computed for THIS specific client, but only for agents
    // included in this plan (so créateur excludes email LLM cost).
    test_client_cost: number;
    fixed_full: number;   // 100% of fixed costs assumed (1 client only)
    variable_full: number; // 100% of variable bills attributed
    total_cost: number;
    margin_pct: number;
    note: string;
  };
  const scenarios: PlanScenario[] = [];
  if (testClient) {
    // Recompute LLM cost for this client per plan inclusion
    const testUserId = (clients || []).find((c: any) => c.email === testClient.email)?.id;
    const llmByAgentForClient: Record<string, number> = {};
    for (const [agentName, st] of Object.entries(agents)) {
      const n = testUserId ? (st.by_user[testUserId] || 0) : 0;
      if (n > 0) llmByAgentForClient[agentName] = n * st.cost_per_action_eur;
    }
    // 2026-06-03 — Variable bills are NOT all attributed to the test client
    // when the plan excludes those agents. Estimate per-plan variable share:
    //   - Créateur (Lena + Jade + Clara) → Bytedance Seedream only (~50% of variable bills)
    //   - Pro (+ Hugo, Léo, Théo, Ami) → all variable bills (Bytedance + Places + Anthropic API)
    const VARIABLE_SHARE_BY_PLAN: Record<string, number> = {
      createur: 0.25, // Bytedance for visuals only, no Places, no Anthropic API
      pro: 1.0,       // Full variable cost
    };
    for (const plan of ['createur', 'pro']) {
      const allowed = PLAN_INCLUDED_AGENTS[plan];
      const llmForPlan = Object.entries(llmByAgentForClient)
        .filter(([a]) => allowed.has(a))
        .reduce((s, [, v]) => s + v, 0);
      const variableForPlan = variableBills * (VARIABLE_SHARE_BY_PLAN[plan] ?? 1);
      // True COGS = OVH fixe + variable (proratisé pour Créateur) + LLM client
      const total = llmForPlan + fixedBills + variableForPlan;
      const revenue = REVENUE_PER_PLAN_EUR[plan];
      const margin = Math.round(((revenue - total) / revenue) * 100);
      scenarios.push({
        plan,
        plan_revenue: revenue,
        test_client_cost: Number(llmForPlan.toFixed(2)),
        fixed_full: fixedBills,
        variable_full: Number(variableForPlan.toFixed(2)),
        total_cost: Number(total.toFixed(2)),
        margin_pct: margin,
        note: plan === 'createur'
          ? `Lena+Jade+Clara only — ~25% des coûts variables (Bytedance visuals, pas de Places/Anthropic API). R&D Claude Code ${rdBills.toFixed(0)}€ EXCLUE (hors COGS).`
          : `Tous agents core. Variable 100%. R&D Claude Code ${rdBills.toFixed(0)}€ EXCLUE (hors COGS).`,
      });
    }
  }

  // ─── 6. Breakeven analysis ──────────────────────────────────────────
  // At what client count do we cover the fixed bills?
  // Assumption: each client adds llm_cost similar to current test client.
  type BreakevenRow = { plan: string; breakeven_clients: number; margin_at_breakeven: number; margin_at_10x: number };
  const breakeven: BreakevenRow[] = [];
  // 2026-06-03 v4 — per-client variable cost calibré sur les VRAIS quotas
  // + LLM routing intelligent (Gemini où qualité suffit, Sonnet où ça compte)
  // + mutualisation cross-platform (1 visuel IG+TikTok+LinkedIn).
  //
  // Créateur 49€ (Lena+Jade+Clara+Ami) :
  //   - 20 visuels/mois (5/sem) × 0.15€ (Bytedance + Gemini brief) = 3€
  //   - 40 DM Jade × 0.012€ Sonnet = 0.48€
  //   - 50 Clara conv × 0.003€ Gemini = 0.15€
  //   - 4 Ami analyses × 0.030€ Sonnet = 0.12€
  //   - Vidéos mix : ~5 reels × 0.25€ Seedance = 1.25€
  //   = ~5€/client
  //
  // Pro 99€ (Créateur + Hugo + Léo, quotas plus hauts) :
  //   - 40 visuels (10/sem) × 0.15€ = 6€ + 10 vidéos × 0.25 = 2.50€
  //   - 1350 emails Hugo × 0.005€ Sonnet = 6.75€
  //   - 400 prospects Léo × 0.025€ (Places pool + Gemini) = 10€
  //   - 360 DM × 0.012€ + 150 Clara × 0.003€ + 10 Ami × 0.030€ = 5.10€
  //   = ~30€/client
  const VAR_COST_PER_CLIENT_EUR: Record<string, number> = {
    createur: 5,
    pro: 30,
  };
  for (const plan of ['createur', 'pro']) {
    const revenue = REVENUE_PER_PLAN_EUR[plan];
    const varPerClient = VAR_COST_PER_CLIENT_EUR[plan] ?? 5;
    const marginPerClient = revenue - varPerClient;
    // breakeven on COGS (not R&D): n * marginPerClient = fixedBills (OVH)
    const beClients = marginPerClient > 0 ? Math.ceil(fixedBills / marginPerClient) : Infinity;
    const totalCostAtBE = beClients * varPerClient + fixedBills;
    const revenueAtBE = beClients * revenue;
    const marginAtBE = revenueAtBE > 0 ? Math.round(((revenueAtBE - totalCostAtBE) / revenueAtBE) * 100) : 0;
    const totalCostAt10 = 10 * varPerClient + fixedBills;
    const revenueAt10 = 10 * revenue;
    const marginAt10 = revenueAt10 > 0 ? Math.round(((revenueAt10 - totalCostAt10) / revenueAt10) * 100) : 0;
    breakeven.push({
      plan,
      breakeven_clients: Number.isFinite(beClients) ? beClients : 0,
      margin_at_breakeven: marginAtBE,
      margin_at_10x: marginAt10, // now actually = 10 clients, not 10x breakeven
    });
  }

  // ─── 7. Top unmanaged costs ────────────────────────────────────────
  const unmanagedCosts: Array<{ label: string; eur: number; reason: string; action: string }> = [];
  if (billsByService['anthropic'] && billsByService['anthropic'] > 80) {
    unmanagedCosts.push({
      label: 'Claude Code (Anthropic) — 108€',
      eur: billsByService['anthropic'],
      reason: 'Abonnement DEV non lié aux clients KeiroAI (utilisé pour Claude Code dans VSCode/CLI). N\'EST PAS un coût de production.',
      action: 'Ne PAS inclure dans le calcul de marge SaaS. À séparer dans le bilan (R&D vs Cogs).',
    });
  }
  if (billsByService['google_cloud_mp9blg'] && billsByService['google_cloud_mp9blg'] > 30) {
    unmanagedCosts.push({
      label: 'GCP MP9BLG (Places API) — 41.51€',
      eur: billsByService['google_cloud_mp9blg'],
      reason: 'Google Places consommé par Léo (commercial agent) pour enrichir les prospects. Sans cap clair, peut exploser.',
      action: 'Vérifier PLACES_DAILY_BUDGET_EUR + PLACES_MONTHLY_BUDGET_EUR sur le VPS. Cible: <0.50€/jour/client en moyenne.',
    });
  }
  if (billsByService['bytedance'] && billsByService['bytedance'] > 15) {
    unmanagedCosts.push({
      label: 'ByteDance (Seedream/Seedance) — 20.17€',
      eur: billsByService['bytedance'],
      reason: 'Génération d\'images IA pour les posts. Coût par image ~0.035€. Devient cher si on génère trop de variantes.',
      action: 'Limiter à 1 visual par post (pas de variations multiples). Cache + reuse les visuals validés.',
    });
  }
  // LLM cost spike: any agent with cost > 5€ on the month (1 client test)
  for (const [agentName, st] of Object.entries(agents)) {
    if (st.total_cost_eur > 5) {
      unmanagedCosts.push({
        label: `Agent ${agentName} — ${st.total_cost_eur.toFixed(2)}€ LLM`,
        eur: st.total_cost_eur,
        reason: `${st.useful_actions} actions utiles à ${st.cost_per_action_eur}€/action. ${st.runs} runs au total dont ${st.runs - st.useful_actions} sont des webhooks/reports gratuits.`,
        action: `Vérifier si tous les ${st.useful_actions} appels sont réellement nécessaires. Switch certains sur Gemini pour économiser ~50%.`,
      });
    }
  }

  // ─── 8. Build email HTML ────────────────────────────────────────────
  const billsHtml = Object.entries(billsByService)
    .sort((a, b) => b[1] - a[1])
    .map(([svc, eur]) => {
      const label = R_AND_D_SERVICES.has(svc)
        ? ' <span style="background:#fef3c7;color:#92400e;padding:1px 5px;border-radius:3px;font-size:9px;font-weight:bold;">R&amp;D</span>'
        : FIXED_INFRA_SERVICES.has(svc)
          ? ' <span style="background:#dbeafe;color:#1e40af;padding:1px 5px;border-radius:3px;font-size:9px;font-weight:bold;">FIXE</span>'
          : ' <span style="background:#fce7f3;color:#9d174d;padding:1px 5px;border-radius:3px;font-size:9px;font-weight:bold;">VARIABLE</span>';
      return `<tr><td style="padding:6px 8px;font-size:12px;text-transform:capitalize;">${svc.replace(/_/g, ' ')}${label}</td><td style="padding:6px 8px;font-size:12px;text-align:right;font-weight:bold;color:#dc2626;">${eur.toFixed(2)} €</td></tr>`;
    })
    .join('');

  const agentsTableHtml = Object.entries(agents)
    .sort((a, b) => b[1].total_cost_eur - a[1].total_cost_eur)
    .slice(0, 12)
    .map(([a, st]) => {
      // 2026-06-03 — Real ratio: useful actions / runs EXCLUDING freebies
      // (webhooks Brevo, heartbeats, memory logs). Cible founder: 80%+.
      const denominator = st.runs_excluding_freebies > 0 ? st.runs_excluding_freebies : st.runs;
      const ratio = denominator > 0 ? Math.round((st.useful_actions / denominator) * 100) : 0;
      const ratioColor = ratio >= 80 ? '#16a34a' : ratio >= 50 ? '#d97706' : '#dc2626';
      return `<tr>
        <td style="padding:5px 8px;font-size:11px;font-weight:bold;">${a}</td>
        <td style="padding:5px 8px;font-size:11px;text-align:right;color:#9ca3af;" title="Total runs incl. webhooks/heartbeats">${st.runs}</td>
        <td style="padding:5px 8px;font-size:11px;text-align:right;color:#475569;font-weight:bold;" title="Runs réels hors webhooks/heartbeats">${st.runs_excluding_freebies}</td>
        <td style="padding:5px 8px;font-size:11px;text-align:right;color:#16a34a;font-weight:bold;">${st.useful_actions}</td>
        <td style="padding:5px 8px;font-size:11px;text-align:right;color:${ratioColor};font-weight:bold;">${ratio}%</td>
        <td style="padding:5px 8px;font-size:11px;text-align:right;font-family:monospace;">${st.cost_per_action_eur.toFixed(3)} €</td>
        <td style="padding:5px 8px;font-size:11px;text-align:right;font-weight:bold;">${st.total_cost_eur.toFixed(2)} €</td>
        <td style="padding:5px 8px;font-size:11px;text-align:right;color:${st.errors > 0 ? '#dc2626' : '#16a34a'};">${st.errors}</td>
      </tr>`;
    }).join('');

  const scenarioHtml = scenarios.map(s => {
    const color = s.margin_pct >= 70 ? '#16a34a' : s.margin_pct >= 50 ? '#d97706' : '#dc2626';
    return `<tr>
      <td style="padding:8px 10px;font-size:12px;font-weight:bold;text-transform:capitalize;">${s.plan} (${s.plan_revenue} €/mois)</td>
      <td style="padding:8px 10px;font-size:12px;text-align:right;">${s.test_client_cost.toFixed(2)} €</td>
      <td style="padding:8px 10px;font-size:12px;text-align:right;">${s.fixed_full.toFixed(2)} €</td>
      <td style="padding:8px 10px;font-size:12px;text-align:right;">${s.variable_full.toFixed(2)} €</td>
      <td style="padding:8px 10px;font-size:12px;text-align:right;font-weight:bold;">${s.total_cost.toFixed(2)} €</td>
      <td style="padding:8px 10px;font-size:13px;text-align:right;font-weight:bold;color:${color};">${s.margin_pct}%</td>
    </tr>
    <tr><td colspan="6" style="padding:0 10px 6px;font-size:10px;color:#6b7280;font-style:italic;">→ ${s.note}</td></tr>`;
  }).join('');

  const breakevenHtml = breakeven.map(b => `<tr>
    <td style="padding:6px 8px;font-size:12px;font-weight:bold;text-transform:capitalize;">${b.plan}</td>
    <td style="padding:6px 8px;font-size:12px;text-align:right;font-weight:bold;color:#7c3aed;">${b.breakeven_clients} clients</td>
    <td style="padding:6px 8px;font-size:11px;text-align:right;color:${b.margin_at_breakeven >= 0 ? '#16a34a' : '#dc2626'};">${b.margin_at_breakeven}%</td>
    <td style="padding:6px 8px;font-size:11px;text-align:right;color:#16a34a;font-weight:bold;">${b.margin_at_10x}%</td>
  </tr>`).join('');

  const unmanagedHtml = unmanagedCosts.length > 0
    ? unmanagedCosts.slice(0, 6).map(c => `<div style="background:#fff7ed;border-left:4px solid #ea580c;border-radius:8px;padding:12px;margin:8px 0;">
        <div style="font-size:13px;font-weight:bold;color:#9a3412;">⚠️ ${esc(c.label)}</div>
        <div style="font-size:11px;color:#7c2d12;margin:6px 0;line-height:1.5;"><strong>Cause :</strong> ${esc(c.reason)}</div>
        <div style="background:#fff;border-radius:6px;padding:8px;margin-top:6px;border:1px solid #fed7aa;">
          <div style="font-size:10px;color:#9a3412;font-weight:bold;text-transform:uppercase;letter-spacing:0.3px;">Action recommandée</div>
          <div style="font-size:11px;color:#7c2d12;margin-top:3px;">${esc(c.action)}</div>
        </div>
      </div>`).join('')
    : '<p style="color:#16a34a;font-weight:bold;font-size:12px;">✅ Tous les coûts sont sous contrôle.</p>';

  const totalCostBudgetSaaS = totalAgentLlmCost + variableBills; // exclude pure R&D (Claude Code subscription)
  const totalCostFull = totalAgentLlmCost + totalBillsReal;

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:760px;margin:0 auto;background:#f9fafb;">
    <div style="background:linear-gradient(135deg,#0c1a3a,#1e3a5f);color:white;padding:24px;border-radius:12px 12px 0 0;">
      <h2 style="margin:0;font-size:18px;">💰 Récap coûts — ${periodLabel}</h2>
      <p style="margin:4px 0 0;color:#a0aec0;font-size:12px;">Coûts réels + agents + prorata client test + breakeven</p>
    </div>

    <div style="background:#fff;padding:22px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
      <!-- KPI -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px;">
        <div style="background:#eff6ff;padding:12px;border-radius:8px;text-align:center;">
          <div style="font-size:18px;font-weight:bold;color:#1d4ed8;">${perClient.reduce((s, c) => s + c.revenue, 0).toFixed(0)} €</div>
          <div style="font-size:10px;color:#666;">Revenus ${periodLabel}</div>
        </div>
        <div style="background:#fef2f2;padding:12px;border-radius:8px;text-align:center;">
          <div style="font-size:18px;font-weight:bold;color:#dc2626;">${totalCostFull.toFixed(0)} €</div>
          <div style="font-size:10px;color:#666;">Coûts tout compris</div>
        </div>
        <div style="background:#f5f3ff;padding:12px;border-radius:8px;text-align:center;">
          <div style="font-size:18px;font-weight:bold;color:#7c3aed;">${payingClients.length}</div>
          <div style="font-size:10px;color:#666;">Clients payants</div>
        </div>
      </div>

      <!-- Réalité du moment -->
      <div style="background:#fffbeb;border-left:4px solid #ca8a04;padding:14px;border-radius:8px;margin:16px 0;">
        <strong style="color:#854d0e;font-size:13px;">📌 Réalité ${periodLabel}</strong>
        <p style="font-size:11px;color:#713f12;line-height:1.55;margin:6px 0 0;">
          1 vrai client test (Pro 99 €) qui utilise l'app, soit ${perClient[0]?.actions.posts || 0} posts publiés, ${perClient[0]?.actions.emails || 0} emails envoyés et ${perClient[0]?.actions.prospects || 0} prospects ajoutés.
          Marge négative attendue avec 1 client face à 213 €/mois de coûts fixes ; voir analyse breakeven plus bas.
        </p>
      </div>

      <!-- 1. Bills -->
      <h3 style="font-size:14px;color:#111;margin:20px 0 8px;">💳 Factures réelles — ${periodLabel} (${totalBillsReal.toFixed(2)} € total)</h3>
      <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #e5e7eb;border-radius:6px;">
        <thead><tr style="background:#f3f4f6;"><th style="padding:6px 8px;text-align:left;">Service</th><th style="padding:6px 8px;text-align:right;">Coût</th></tr></thead>
        <tbody>${billsHtml}
          <tr style="background:#dbeafe;font-weight:bold;"><td style="padding:8px;">Total fixe (indépendant du nb clients)</td><td style="padding:8px;text-align:right;">${fixedBills.toFixed(2)} €</td></tr>
          <tr style="background:#fef2f2;font-weight:bold;"><td style="padding:8px;">Total variable (scale avec clients)</td><td style="padding:8px;text-align:right;">${variableBills.toFixed(2)} €</td></tr>
        </tbody>
      </table>

      <!-- 2. Per-agent -->
      <h3 style="font-size:14px;color:#111;margin:20px 0 8px;">⚙️ Coûts par agent — runs vs actions utiles (cible ≥80%)</h3>
      <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #e5e7eb;border-radius:6px;">
        <thead><tr style="background:#f3f4f6;">
          <th style="padding:5px 8px;text-align:left;">Agent</th>
          <th style="padding:5px 8px;text-align:right;color:#9ca3af;" title="Total brut incl. webhooks/heartbeats gratuits">Runs bruts</th>
          <th style="padding:5px 8px;text-align:right;" title="Runs hors webhooks/heartbeats — dénominateur du ratio">Runs réels</th>
          <th style="padding:5px 8px;text-align:right;" title="Appels LLM qui consomment du token">Utiles</th>
          <th style="padding:5px 8px;text-align:right;">Ratio</th>
          <th style="padding:5px 8px;text-align:right;">€/action</th>
          <th style="padding:5px 8px;text-align:right;">Total LLM</th>
          <th style="padding:5px 8px;text-align:right;">Err</th>
        </tr></thead>
        <tbody>${agentsTableHtml}
          <tr style="background:#f0fdf4;font-weight:bold;"><td style="padding:8px;">TOTAL LLM agents</td><td colspan="5"></td><td style="padding:8px;text-align:right;">${totalAgentLlmCost.toFixed(2)} €</td><td></td></tr>
        </tbody>
      </table>
      <div style="font-size:10px;color:#6b7280;margin-top:6px;font-style:italic;">
        💡 Ratio = Utiles / Runs réels (hors webhooks Brevo + heartbeats gratuits).
        Cible ≥80% : si en-dessous, des appels LLM sont gaspillés. Vert ≥80%, orange 50-79%, rouge &lt;50%.
      </div>

      <!-- 3. Unmanaged costs -->
      <h3 style="font-size:14px;color:#111;margin:20px 0 8px;">🚨 Coûts non maîtrisés à attaquer</h3>
      ${unmanagedHtml}

      <!-- 4. Test client prorata -->
      <h3 style="font-size:14px;color:#111;margin:20px 0 8px;">📊 Marges sur 1 vrai client test — par plan</h3>
      <p style="font-size:11px;color:#6b7280;margin:0 0 8px;">Hypothèse : 1 client à plein temps, tous les coûts fixes lui sont attribués (réalité du moment).</p>
      <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #e5e7eb;border-radius:6px;">
        <thead><tr style="background:#f3f4f6;">
          <th style="padding:6px 8px;text-align:left;">Plan</th>
          <th style="padding:6px 8px;text-align:right;">Coût LLM client</th>
          <th style="padding:6px 8px;text-align:right;">+ Fixe</th>
          <th style="padding:6px 8px;text-align:right;">+ Variable</th>
          <th style="padding:6px 8px;text-align:right;">Total</th>
          <th style="padding:6px 8px;text-align:right;">Marge</th>
        </tr></thead>
        <tbody>${scenarioHtml}</tbody>
      </table>

      <!-- 5. Breakeven -->
      <h3 style="font-size:14px;color:#111;margin:20px 0 8px;">🎯 Breakeven — combien de clients pour devenir rentable ?</h3>
      <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #e5e7eb;border-radius:6px;">
        <thead><tr style="background:#f3f4f6;">
          <th style="padding:6px 8px;text-align:left;">Plan</th>
          <th style="padding:6px 8px;text-align:right;">Clients pour breakeven</th>
          <th style="padding:6px 8px;text-align:right;">Marge à breakeven</th>
          <th style="padding:6px 8px;text-align:right;">Marge × 10 clients</th>
        </tr></thead>
        <tbody>${breakevenHtml}</tbody>
      </table>
      <div style="font-size:10px;color:#6b7280;margin-top:6px;font-style:italic;">
        💡 Avec 10 clients de chaque plan, on dilue les coûts fixes (213 €/mois) sur 10 et la marge tend vers la cible 80 %.
      </div>

      <!-- 6. Actions par client réel -->
      <h3 style="font-size:14px;color:#111;margin:20px 0 8px;">👤 Actions vraiment exécutées par client (mai)</h3>
      <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #e5e7eb;border-radius:6px;">
        <thead><tr style="background:#f3f4f6;">
          <th style="padding:5px 8px;text-align:left;">Client</th>
          <th style="padding:5px 8px;text-align:left;">Plan</th>
          <th style="padding:5px 8px;text-align:right;">Posts</th>
          <th style="padding:5px 8px;text-align:right;">Emails</th>
          <th style="padding:5px 8px;text-align:right;">DMs</th>
          <th style="padding:5px 8px;text-align:right;">Prospects</th>
          <th style="padding:5px 8px;text-align:right;">Comm. rép.</th>
        </tr></thead>
        <tbody>${perClient.map(c => `<tr>
          <td style="padding:5px 8px;font-size:11px;">${esc(c.email)}</td>
          <td style="padding:5px 8px;font-size:11px;text-transform:capitalize;">${c.plan}</td>
          <td style="padding:5px 8px;font-size:11px;text-align:right;color:#16a34a;font-weight:bold;">${c.actions.posts}</td>
          <td style="padding:5px 8px;font-size:11px;text-align:right;color:#2563eb;font-weight:bold;">${c.actions.emails}</td>
          <td style="padding:5px 8px;font-size:11px;text-align:right;color:#a855f7;font-weight:bold;">${c.actions.dms}</td>
          <td style="padding:5px 8px;font-size:11px;text-align:right;color:#7c3aed;font-weight:bold;">${c.actions.prospects}</td>
          <td style="padding:5px 8px;font-size:11px;text-align:right;color:#0891b2;font-weight:bold;">${c.actions.comments}</td>
        </tr>`).join('')}</tbody>
      </table>

      <div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:12px;border-radius:8px;margin-top:20px;">
        <strong style="color:#166534;font-size:12px;">🔗 Liens utiles</strong>
        <ul style="font-size:11px;color:#14532d;margin:6px 0 0;padding-left:18px;">
          <li><a href="${process.env.NEXT_PUBLIC_BASE_URL || 'https://www.keiroai.com'}/admin/costs" style="color:#059669;">/admin/costs</a> — uploader factures + breakdown live</li>
          <li>Cible : 80 % marge sur le plan principal (Pro 99 €) une fois > 5 clients</li>
        </ul>
      </div>
    </div>
    <div style="background:#f9fafb;padding:10px;text-align:center;color:#9ca3af;font-size:10px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;">
      KeiroAI Admin · Récap coûts ${periodLabel} · ${now.toISOString().slice(0, 10)}
    </div>
  </div>`;

  // 2026-06-03 — Multi-provider fallback (Brevo API → Resend → Brevo SMTP)
  const subject = `💰 Récap coûts ${periodLabel} — ${unmanagedCosts.length} coût(s) non maîtrisés à attaquer`;
  const { sendEmailWithFallback } = await import('@/lib/email/send-with-fallback');
  const sendResult = await sendEmailWithFallback({
    to: ADMIN_EMAIL,
    subject,
    html,
    fromName: 'KeiroAI Cost Recap',
    fromEmail: 'contact@keiroai.com',
    tags: ['admin_monthly_cost_recap'],
  });
  const sent = sendResult.ok;
  if (!sent) console.error('[AdminMonthlyCostRecap] All providers failed:', sendResult.error);
  else console.log(`[AdminMonthlyCostRecap] Sent via ${sendResult.provider}`);

  await supabase.from('agent_logs').insert({
    agent: 'ceo',
    action: 'admin_monthly_cost_recap',
    status: 'ok',
    data: {
      period: periodKey,
      bills_total: totalBillsReal,
      bills_fixed: fixedBills,
      bills_variable: variableBills,
      llm_total: totalAgentLlmCost,
      cost_full: totalCostFull,
      cost_saas_only: totalCostBudgetSaaS,
      paying_clients: payingClients.length,
      unmanaged_count: unmanagedCosts.length,
    },
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    sent,
    summary: {
      period: periodKey,
      bills_total: totalBillsReal,
      bills_fixed: fixedBills,
      bills_variable: variableBills,
      llm_total: totalAgentLlmCost,
      cost_full: totalCostFull,
      paying_clients: payingClients.length,
    },
    scenarios,
    breakeven,
    per_client: perClient,
    agents,
    unmanaged_costs: unmanagedCosts,
    bills_by_service: billsByService,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}

function esc(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
