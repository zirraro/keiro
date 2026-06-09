/**
 * Daily cost check — projeté fin de mois vs revenu mensuel.
 * Alerte admin par email si la projection dépasse certains seuils.
 *
 * Founder rule 2026-06-09 : "pilotage fin pour maitriser nos marges
 * au plus pres du reel... savoir quand faut payer/depasser le budget".
 *
 * Cron quotidien 07:00 UTC (avant le CEO brief 05:00 mais avant
 * la matinée). Si la marge projetée est < 70%, admin reçoit un email
 * détaillé.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function authOk(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const tok = auth.replace(/^Bearer\s+/i, '');
  return !!tok && tok === (process.env.CRON_SECRET || '');
}

const PLAN_REV: Record<string, number> = {
  createur: 49, pro: 99, fondateurs: 79, business: 199, elite: 299, agence: 499, admin: 0,
};

export async function GET(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const supabase = sb();

  const now = new Date();
  const monthStart = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const daysElapsed = Math.max(1, Math.ceil((now.getTime() - monthStart.getTime()) / (24 * 3600 * 1000)));
  const daysInMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getDate();

  // 1. MTD cost
  const { data: events } = await supabase
    .from('api_cost_events')
    .select('cost_eur, provider, user_id')
    .gte('created_at', monthStart.toISOString())
    .limit(100000);

  const totalMtd = (events || []).reduce((sum, e: any) => sum + (parseFloat(e.cost_eur) || 0), 0);
  const dailyAvg = totalMtd / daysElapsed;
  const projection = dailyAvg * daysInMonth;

  // 2. Revenue estimate
  const { data: clients } = await supabase
    .from('profiles')
    .select('id, subscription_plan, email')
    .neq('subscription_plan', 'free')
    .neq('subscription_plan', null);
  let monthlyRevenue = 0;
  for (const c of (clients || []) as any[]) {
    monthlyRevenue += PLAN_REV[c.subscription_plan] || 0;
  }

  const marginPct = monthlyRevenue > 0 ? Math.round(((monthlyRevenue - projection) / monthlyRevenue) * 100) : 0;

  // 3. Top spikes — clients with >5x avg spend
  const byUser: Record<string, number> = {};
  for (const e of (events || []) as any[]) {
    if (e.user_id) byUser[e.user_id] = (byUser[e.user_id] || 0) + (parseFloat(e.cost_eur) || 0);
  }
  const userSpends = Object.values(byUser);
  const avgPerUser = userSpends.length > 0 ? userSpends.reduce((a, b) => a + b, 0) / userSpends.length : 0;
  const spikes: Array<{ user_id: string; email: string; spent_eur: number; ratio: number }> = [];
  if (avgPerUser > 0) {
    const emailMap = Object.fromEntries((clients || []).map((c: any) => [c.id, c.email]));
    for (const [uid, spent] of Object.entries(byUser)) {
      if (spent > avgPerUser * 5) {
        spikes.push({
          user_id: uid,
          email: emailMap[uid] || '?',
          spent_eur: Math.round(spent * 100) / 100,
          ratio: Math.round((spent / avgPerUser) * 10) / 10,
        });
      }
    }
  }

  // 4. Decision : do we alert ?
  const alerts: string[] = [];
  if (marginPct < 70 && marginPct >= 60) alerts.push(`⚠️ MARGE PROJETÉE ${marginPct}% — sous le seuil 70%`);
  if (marginPct < 60) alerts.push(`🚨 MARGE PROJETÉE ${marginPct}% — sous le seuil critique 60%`);
  if (projection > monthlyRevenue) alerts.push(`🚨 PROJECTION ${projection.toFixed(2)}€ DÉPASSE REVENU ${monthlyRevenue}€`);
  if (spikes.length > 0) alerts.push(`⚡ ${spikes.length} client(s) en spike (>5× avg)`);

  // 5. Send admin email if alerts
  let emailSent = false;
  if (alerts.length > 0) {
    try {
      const html = renderAlertEmail({ marginPct, monthlyRevenue, totalMtd, projection, dailyAvg, daysElapsed, daysInMonth, alerts, spikes });
      const brevoKey = process.env.BREVO_API_KEY;
      if (brevoKey) {
        const r = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': brevoKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: { name: 'KeiroAI Cost Pilot', email: 'contact@keiroai.com' },
            to: [{ email: 'contact@keiroai.com' }],
            subject: `[KeiroAI] ${marginPct < 60 ? '🚨' : '⚠️'} Marge projetée ${marginPct}% — ${alerts.length} alerte(s)`,
            htmlContent: html,
          }),
        });
        emailSent = r.ok;
      }
    } catch (e: any) {
      console.error('[daily-cost-check] email failed:', e.message);
    }
  }

  return NextResponse.json({
    ok: true,
    mtd_eur: Math.round(totalMtd * 100) / 100,
    projection_eur: Math.round(projection * 100) / 100,
    monthly_revenue_eur: monthlyRevenue,
    margin_pct: marginPct,
    days_elapsed: daysElapsed,
    days_in_month: daysInMonth,
    spikes: spikes.slice(0, 10),
    alerts,
    email_sent: emailSent,
  });
}

function renderAlertEmail(d: any): string {
  return `
<!DOCTYPE html><html><body style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9fa;">
  <div style="background: #fff; border-radius: 12px; padding: 24px;">
    <h1 style="color: ${d.marginPct < 60 ? '#dc2626' : '#d97706'}; margin-bottom: 8px;">
      ${d.marginPct < 60 ? '🚨' : '⚠️'} Marge mensuelle projetée : ${d.marginPct}%
    </h1>
    <p style="color: #666;">Jour ${d.daysElapsed}/${d.daysInMonth} du mois</p>

    <h2 style="margin-top: 24px;">📊 Chiffres clés</h2>
    <table style="width:100%; border-collapse: collapse;">
      <tr><td style="padding: 6px 0; color: #666;">Dépense MTD</td><td style="text-align: right; font-weight: bold;">${d.totalMtd.toFixed(2)} €</td></tr>
      <tr><td style="padding: 6px 0; color: #666;">Moyenne quotidienne</td><td style="text-align: right; font-weight: bold;">${d.dailyAvg.toFixed(2)} €</td></tr>
      <tr><td style="padding: 6px 0; color: #666;">Projection fin de mois</td><td style="text-align: right; font-weight: bold;">${d.projection.toFixed(2)} €</td></tr>
      <tr><td style="padding: 6px 0; color: #666;">Revenu mensuel estimé</td><td style="text-align: right; font-weight: bold;">${d.monthlyRevenue} €</td></tr>
    </table>

    <h2 style="margin-top: 24px;">🚨 Alertes</h2>
    <ul>${d.alerts.map((a: string) => `<li style="margin: 8px 0; color: #dc2626;">${a}</li>`).join('')}</ul>

    ${d.spikes.length > 0 ? `
    <h2 style="margin-top: 24px;">⚡ Clients en spike (top 10)</h2>
    <table style="width:100%; border-collapse: collapse; font-size: 13px;">
      <thead><tr style="background: #f3f4f6;"><th style="padding: 8px; text-align: left;">Email</th><th style="padding: 8px; text-align: right;">Dépensé</th><th style="padding: 8px; text-align: right;">vs avg</th></tr></thead>
      <tbody>
        ${d.spikes.slice(0, 10).map((s: any) => `<tr style="border-top: 1px solid #e5e7eb;"><td style="padding: 6px 8px;">${s.email}</td><td style="text-align: right; padding: 6px 8px;">${s.spent_eur.toFixed(2)} €</td><td style="text-align: right; padding: 6px 8px;">${s.ratio}×</td></tr>`).join('')}
      </tbody>
    </table>
    ` : ''}

    <div style="margin-top: 24px; padding: 16px; background: #f3f4f6; border-radius: 8px;">
      <a href="https://www.keiroai.com/admin/cost-margin/live" style="color: #0c1a3a; font-weight: bold; text-decoration: none;">→ Ouvrir le Live Cost Pilot</a>
    </div>
  </div>
</body></html>`;
}
