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
 * Fires on the 2nd of each month at 09:00 UTC. Computes:
 *   - Real bills uploaded from external_cost_uploads (last month)
 *   - Per-agent cost estimate from agent_logs
 *   - Per-client revenue vs cost margin
 *   - Plan-level margin breakdown (créateur 49€, pro 99€, business 199€)
 *
 * Sends ONE email to contact@keiroai.com with the breakdown + alerts
 * when any plan is below 60% margin (target healthy SaaS margin).
 *
 * Founder ask 2026-06-02: "analyser le cout de chaque agent par rapport
 * aux action et faire un rapport dans l'espace admin keiroai et aussi
 * envoyer un mail recap a mail admin".
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
  const periodKey = monthStart.toISOString().slice(0, 7); // YYYY-MM

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

  // ─── 2. Per-agent action breakdown for last month ──────────────────
  const { data: logs } = await supabase
    .from('agent_logs')
    .select('agent, user_id, action, status, created_at')
    .gte('created_at', periodIso)
    .lt('created_at', monthEnd.toISOString())
    .limit(50000);

  const COST_PER_AGENT_CALL_EUR: Record<string, number> = {
    content: 0.015, dm_instagram: 0.005, email: 0.005, ceo: 0.02,
    seo: 0.05, gmaps: 0.003, marketing: 0.015, instagram_comments: 0.003,
    chatbot: 0.003, retention: 0.003, commercial: 0.005,
    onboarding: 0.005,
  };
  const agentCosts: Record<string, { runs: number; eur: number; errors: number }> = {};
  for (const log of (logs || []) as any[]) {
    const a = log.agent || 'unknown';
    if (!agentCosts[a]) agentCosts[a] = { runs: 0, eur: 0, errors: 0 };
    agentCosts[a].runs++;
    agentCosts[a].eur += COST_PER_AGENT_CALL_EUR[a] ?? 0.003;
    if (log.status === 'error') agentCosts[a].errors++;
  }
  const totalAgentEstimate = Object.values(agentCosts).reduce((a, b) => a + b.eur, 0);

  // ─── 3. Per-client revenue vs cost ──────────────────────────────────
  const REVENUE_PER_PLAN_EUR: Record<string, number> = {
    free: 0, createur: 49, pro: 99, business: 199,
    fondateurs: 149, elite: 999, agence: 999, admin: 0,
  };
  const { data: clients } = await supabase
    .from('profiles')
    .select('id, email, subscription_plan');

  const llmCostByUser: Record<string, number> = {};
  for (const log of (logs || []) as any[]) {
    if (!log.user_id) continue;
    const coef = COST_PER_AGENT_CALL_EUR[log.agent] ?? 0.003;
    llmCostByUser[log.user_id] = (llmCostByUser[log.user_id] || 0) + coef;
  }

  const perPlan: Record<string, { clients: number; revenue: number; cost: number }> = {};
  let totalRevenue = 0;
  let totalCostAttributable = 0;
  const perClient: Array<{ email: string; plan: string; revenue: number; cost: number; margin: number | null }> = [];

  for (const c of (clients || []) as any[]) {
    const plan = (c.subscription_plan || 'free').toLowerCase();
    const revenue = REVENUE_PER_PLAN_EUR[plan] ?? 0;
    if (revenue === 0) continue;
    const cost = Number(llmCostByUser[c.id] || 0);
    const margin = revenue > 0 ? Math.round(((revenue - cost) / revenue) * 100) : null;
    if (!perPlan[plan]) perPlan[plan] = { clients: 0, revenue: 0, cost: 0 };
    perPlan[plan].clients++;
    perPlan[plan].revenue += revenue;
    perPlan[plan].cost += cost;
    totalRevenue += revenue;
    totalCostAttributable += cost;
    perClient.push({ email: c.email, plan, revenue, cost: Number(cost.toFixed(2)), margin });
  }

  // Apportion the real third-party bills across paying clients (head count)
  const payingCount = Math.max(1, perClient.length);
  const realBillsPerClient = totalBillsReal / payingCount;
  for (const p of perClient) {
    p.cost = Number((p.cost + realBillsPerClient).toFixed(2));
    p.margin = p.revenue > 0 ? Math.round(((p.revenue - p.cost) / p.revenue) * 100) : null;
  }
  for (const plan of Object.keys(perPlan)) {
    perPlan[plan].cost += realBillsPerClient * perPlan[plan].clients;
  }

  const globalMarginPct = totalRevenue > 0
    ? Math.round(((totalRevenue - totalCostAttributable - totalBillsReal) / totalRevenue) * 100)
    : 0;

  // ─── 4. Build email HTML ────────────────────────────────────────────
  const billsHtml = Object.entries(billsByService)
    .sort((a, b) => b[1] - a[1])
    .map(([svc, eur]) => `<tr><td style="padding:6px 8px;font-size:12px;text-transform:capitalize;">${svc}</td><td style="padding:6px 8px;font-size:12px;text-align:right;font-weight:bold;color:#dc2626;">${eur.toFixed(2)} €</td></tr>`)
    .join('');

  const agentsTableHtml = Object.entries(agentCosts)
    .sort((a, b) => b[1].eur - a[1].eur)
    .slice(0, 12)
    .map(([a, st]) => `<tr><td style="padding:5px 8px;font-size:11px;">${a}</td><td style="padding:5px 8px;font-size:11px;text-align:right;">${st.runs}</td><td style="padding:5px 8px;font-size:11px;text-align:right;color:${st.errors > 0 ? '#dc2626' : '#16a34a'};">${st.errors}</td><td style="padding:5px 8px;font-size:11px;text-align:right;font-weight:bold;">${st.eur.toFixed(2)} €</td></tr>`)
    .join('');

  const planAlerts: string[] = [];
  const planRowsHtml = Object.entries(perPlan)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .map(([plan, st]) => {
      const margin = st.revenue > 0 ? Math.round(((st.revenue - st.cost) / st.revenue) * 100) : 0;
      const color = margin >= 70 ? '#16a34a' : margin >= 50 ? '#d97706' : '#dc2626';
      if (margin < 60) {
        planAlerts.push(`⚠️ Plan <strong>${plan}</strong> à ${margin}% de marge seulement (${st.cost.toFixed(2)}€ coût sur ${st.revenue}€ revenu, ${st.clients} client(s))`);
      }
      return `<tr><td style="padding:6px 8px;font-size:12px;text-transform:capitalize;">${plan}</td><td style="padding:6px 8px;font-size:12px;text-align:right;">${st.clients}</td><td style="padding:6px 8px;font-size:12px;text-align:right;">${st.revenue.toFixed(2)} €</td><td style="padding:6px 8px;font-size:12px;text-align:right;">${st.cost.toFixed(2)} €</td><td style="padding:6px 8px;font-size:12px;text-align:right;font-weight:bold;color:${color};">${margin}%</td></tr>`;
    }).join('');

  const alertsBlock = planAlerts.length > 0
    ? `<div style="background:#fef2f2;border-left:4px solid #dc2626;padding:14px;border-radius:8px;margin:16px 0;"><strong style="color:#991b1b;font-size:13px;">🚨 Marges sous le seuil 60%</strong><ul style="margin:8px 0 0;padding-left:18px;font-size:12px;color:#7f1d1d;">${planAlerts.map(a => `<li>${a}</li>`).join('')}</ul></div>`
    : `<div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:14px;border-radius:8px;margin:16px 0;"><strong style="color:#166534;font-size:13px;">✅ Toutes les marges plan sont au-dessus du seuil 60%</strong></div>`;

  const totalCostAllSources = totalAgentEstimate + totalBillsReal;
  const totalMarginPct = totalRevenue > 0 ? Math.round(((totalRevenue - totalCostAllSources) / totalRevenue) * 100) : 0;

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:720px;margin:0 auto;background:#f9fafb;">
    <div style="background:linear-gradient(135deg,#0c1a3a,#1e3a5f);color:white;padding:24px;border-radius:12px 12px 0 0;">
      <h2 style="margin:0;font-size:18px;">💰 Récap coûts mensuel — ${periodLabel}</h2>
      <p style="margin:4px 0 0;color:#a0aec0;font-size:12px;">Factures réelles + estimations + marges par plan client</p>
    </div>

    <div style="background:#fff;padding:22px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
      <!-- Top KPI -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px;">
        <div style="background:#eff6ff;padding:12px;border-radius:8px;text-align:center;">
          <div style="font-size:18px;font-weight:bold;color:#1d4ed8;">${totalRevenue.toFixed(0)} €</div>
          <div style="font-size:10px;color:#666;">Revenus</div>
        </div>
        <div style="background:#fef2f2;padding:12px;border-radius:8px;text-align:center;">
          <div style="font-size:18px;font-weight:bold;color:#dc2626;">${totalCostAllSources.toFixed(0)} €</div>
          <div style="font-size:10px;color:#666;">Coûts total</div>
        </div>
        <div style="background:${totalMarginPct >= 60 ? '#f0fdf4' : '#fef2f2'};padding:12px;border-radius:8px;text-align:center;">
          <div style="font-size:18px;font-weight:bold;color:${totalMarginPct >= 60 ? '#16a34a' : '#dc2626'};">${totalMarginPct}%</div>
          <div style="font-size:10px;color:#666;">Marge globale</div>
        </div>
        <div style="background:#f5f3ff;padding:12px;border-radius:8px;text-align:center;">
          <div style="font-size:18px;font-weight:bold;color:#7c3aed;">${perClient.length}</div>
          <div style="font-size:10px;color:#666;">Clients payants</div>
        </div>
      </div>

      ${alertsBlock}

      <!-- Plans -->
      <h3 style="font-size:14px;color:#111;margin:20px 0 8px;">📊 Marges par plan</h3>
      <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #e5e7eb;border-radius:6px;">
        <thead><tr style="background:#f3f4f6;"><th style="padding:6px 8px;text-align:left;">Plan</th><th style="padding:6px 8px;text-align:right;">Clients</th><th style="padding:6px 8px;text-align:right;">Revenu</th><th style="padding:6px 8px;text-align:right;">Coût</th><th style="padding:6px 8px;text-align:right;">Marge</th></tr></thead>
        <tbody>${planRowsHtml}</tbody>
      </table>

      <!-- Real bills -->
      ${billsHtml ? `
      <h3 style="font-size:14px;color:#111;margin:20px 0 8px;">💳 Factures réelles uploadées (${periodLabel})</h3>
      <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #e5e7eb;border-radius:6px;">
        <thead><tr style="background:#f3f4f6;"><th style="padding:6px 8px;text-align:left;">Service</th><th style="padding:6px 8px;text-align:right;">Coût</th></tr></thead>
        <tbody>${billsHtml}<tr style="background:#fef2f2;font-weight:bold;"><td style="padding:8px;">TOTAL</td><td style="padding:8px;text-align:right;">${totalBillsReal.toFixed(2)} €</td></tr></tbody>
      </table>
      ` : `<div style="background:#fff7ed;border-left:4px solid #ea580c;padding:12px;border-radius:8px;margin:16px 0;font-size:12px;color:#9a3412;">⚠️ Aucune facture réelle uploadée pour ${periodLabel}. Va sur <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'https://www.keiroai.com'}/admin/costs" style="color:#c2410c;">/admin/costs</a> pour ajouter les factures Anthropic, Bytedance, OVH, Google Cloud.</div>`}

      <!-- Per-agent cost estimate -->
      <h3 style="font-size:14px;color:#111;margin:20px 0 8px;">⚙️ Coût estimé par agent (top 12)</h3>
      <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #e5e7eb;border-radius:6px;">
        <thead><tr style="background:#f3f4f6;"><th style="padding:5px 8px;text-align:left;">Agent</th><th style="padding:5px 8px;text-align:right;">Runs</th><th style="padding:5px 8px;text-align:right;">Erreurs</th><th style="padding:5px 8px;text-align:right;">Coût estimé</th></tr></thead>
        <tbody>${agentsTableHtml}</tbody>
      </table>
      <div style="font-size:10px;color:#9ca3af;margin-top:6px;font-style:italic;">Coûts basés sur les coefficients lib/agents (token avg × runs). Pour la vraie facture, voir /admin/costs.</div>

      <!-- Console link -->
      <div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:12px;border-radius:8px;margin-top:18px;">
        <strong style="color:#166534;font-size:12px;">🔗 Console détaillée</strong>
        <ul style="font-size:11px;color:#14532d;margin:6px 0 0;padding-left:18px;">
          <li><a href="${process.env.NEXT_PUBLIC_BASE_URL || 'https://www.keiroai.com'}/admin/costs" style="color:#059669;">/admin/costs</a> — uploader factures + breakdown live</li>
          <li>Cible: marge ≥ 70% sur chaque plan (≥ 60% acceptable)</li>
        </ul>
      </div>
    </div>
    <div style="background:#f9fafb;padding:10px;text-align:center;color:#9ca3af;font-size:10px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;">
      KeiroAI Admin · Récap coûts mensuel · ${now.toISOString().slice(0, 10)}
    </div>
  </div>`;

  const BREVO_KEY = process.env.BREVO_API_KEY;
  let sent = false;
  if (BREVO_KEY) {
    try {
      const subject = `💰 Récap coûts ${periodLabel} — ${totalMarginPct}% marge globale${planAlerts.length > 0 ? ` (${planAlerts.length} alerte${planAlerts.length > 1 ? 's' : ''})` : ''}`;
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { accept: 'application/json', 'api-key': BREVO_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({
          sender: { name: 'KeiroAI Cost Recap', email: 'contact@keiroai.com' },
          to: [{ email: ADMIN_EMAIL }],
          subject,
          htmlContent: html,
          tags: ['admin_monthly_cost_recap'],
        }),
      });
      sent = res.ok;
    } catch (e: any) {
      console.error('[AdminMonthlyCostRecap] Brevo failed:', e.message);
    }
  }

  await supabase.from('agent_logs').insert({
    agent: 'ceo',
    action: 'admin_monthly_cost_recap',
    status: 'ok',
    data: {
      period: periodKey,
      total_revenue: totalRevenue,
      total_bills_real: totalBillsReal,
      total_agent_estimate: totalAgentEstimate,
      total_cost_all: totalCostAllSources,
      margin_pct: totalMarginPct,
      paying_clients: perClient.length,
      alerts_count: planAlerts.length,
    },
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    sent,
    summary: {
      period: periodKey,
      total_revenue: totalRevenue,
      total_bills_real: totalBillsReal,
      total_agent_estimate: totalAgentEstimate,
      total_cost_all: totalCostAllSources,
      margin_pct: totalMarginPct,
      paying_clients: perClient.length,
      alerts: planAlerts,
    },
    per_client: perClient,
    per_plan: perPlan,
    bills_by_service: billsByService,
    agents: agentCosts,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
