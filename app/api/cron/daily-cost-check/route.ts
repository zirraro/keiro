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

import { sendBrevoCompat } from '@/lib/email/brevo-compat';
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

  // 2. Rôle des comptes (founder 03/07, affiné) — 3 catégories :
  //   • 'reference'  = mrzirraro@gmail.com : compte KeiroAI à VRAIE activité →
  //                    sa conso simule le coût d'un client actif (projection).
  //   • 'supervision'= contact@ (admin) + metareview (Meta review + alias
  //                    mrzirraro+metareview) : doivent coûter ~0. On surveille
  //                    qu'ils NE dépassent PAS le budget supervision (sinon =
  //                    appel non désiré / qqch de cassé / Meta qui review).
  //   • 'client'     = tout le reste = vrai client payant externe.
  const normalizeEmail = (email: string): string => {
    const e = (email || '').toLowerCase().trim();
    const [local, domain] = e.split('@');
    if (!domain) return e;
    if (domain === 'gmail.com' || domain === 'googlemail.com') return `${local.split('+')[0].replace(/\./g, '')}@gmail.com`;
    return `${local.split('+')[0]}@${domain}`;
  };
  // Comparé sur l'email BRUT (l'alias +metareview doit rester distinct de la référence).
  const SUPERVISION_EMAILS = new Set(['contact@keiroai.com', 'admin@keiroai.com', 'metareview@keiroai.com', 'mrzirraro+metareview@gmail.com']);
  const REFERENCE_EMAILS = new Set(['mrzirraro@gmail.com']); // compte KeiroAI = client simulé
  const SUPERVISION_BUDGET_EUR = 5; // budget mensuel projeté toléré pour la supervision (au-delà = anomalie)
  const accountRole = (email: string): 'reference' | 'supervision' | 'client' => {
    const raw = (email || '').toLowerCase().trim();
    if (SUPERVISION_EMAILS.has(raw)) return 'supervision';
    if (REFERENCE_EMAILS.has(normalizeEmail(email))) return 'reference';
    return 'client';
  };

  const { data: clients } = await supabase
    .from('profiles')
    .select('id, subscription_plan, email')
    .neq('subscription_plan', 'free')
    .neq('subscription_plan', null);
  let monthlyRevenue = 0;   // tous plans confondus (référence)
  let realRevenue = 0;      // vrais clients externes uniquement = revenu réellement encaissé
  let realClientCount = 0;
  for (const c of (clients || []) as any[]) {
    const rev = PLAN_REV[c.subscription_plan] || 0;
    monthlyRevenue += rev;
    if (accountRole(c.email) === 'client') { realRevenue += rev; realClientCount++; }
  }

  // Marge basée sur le revenu RÉEL (vrais clients). Sans vrai client, pas de
  // marge → burn interne + simulation via le compte référence (plus bas).
  const marginPct = realRevenue > 0 ? Math.round(((realRevenue - projection) / realRevenue) * 100) : 0;

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

  // 3b. Répartition par PLAN + par CLIENT (founder 2026-07-03 : "combien de
  //     clients, combien de plans différents, quels coûts dépassent le clou").
  const projFactor = daysInMonth / daysElapsed; // MTD → projeté fin de mois
  const clientCount = (clients || []).length;
  const planAgg: Record<string, { count: number; revenue: number; mtdCost: number }> = {};
  const emailMapAll = Object.fromEntries((clients || []).map((c: any) => [c.id, c.email]));
  const planMap = Object.fromEntries((clients || []).map((c: any) => [c.id, c.subscription_plan]));
  for (const c of (clients || []) as any[]) {
    const plan = c.subscription_plan || 'inconnu';
    if (!planAgg[plan]) planAgg[plan] = { count: 0, revenue: 0, mtdCost: 0 };
    planAgg[plan].count++;
    planAgg[plan].revenue += PLAN_REV[plan] || 0;
  }
  for (const [uid, spent] of Object.entries(byUser)) {
    const plan = planMap[uid] || 'inconnu';
    if (!planAgg[plan]) planAgg[plan] = { count: 0, revenue: 0, mtdCost: 0 };
    planAgg[plan].mtdCost += spent;
  }
  const planRows = Object.entries(planAgg)
    .map(([plan, a]) => {
      const projCost = a.mtdCost * projFactor;
      const marginPctPlan = a.revenue > 0 ? Math.round(((a.revenue - projCost) / a.revenue) * 100) : (projCost > 0 ? -999 : 100);
      return { plan, count: a.count, revenue: a.revenue, mtdCost: a.mtdCost, projCost, marginPct: marginPctPlan };
    })
    .sort((x, y) => y.revenue - x.revenue);

  // 3c. DÉTAIL par client : on NOMME chaque client payant (founder 03/07 :
  //     "dis-moi qui ils sont"), on marque le compte admin/test, et on classe
  //     par marge — seuil "dans le clou" = 70% (< 70% = à surveiller, < 0 = en perte).
  const WATCH_MARGIN = 70; // en-dessous = plus dans le clou, à surveiller de près
  const clientRows = (clients || []).map((c: any) => {
    const spent = byUser[c.id] || 0;
    const plan = c.subscription_plan || 'inconnu';
    const price = PLAN_REV[plan] || 0;
    const projCost = spent * projFactor;
    const role = accountRole(c.email);
    const marginPctC = price > 0 ? Math.round(((price - projCost) / price) * 100) : (projCost > 0 ? -999 : 100);
    // Le statut dépend du rôle : un vrai client a une marge à protéger ; la
    // supervision doit rester sous son budget ; la référence est une simulation.
    let status: string;
    if (role === 'supervision') status = projCost > SUPERVISION_BUDGET_EUR ? 'supervision-over' : 'supervision';
    else if (role === 'reference') status = 'reference';
    else status = marginPctC < 0 || (price === 0 && projCost > 0) ? 'perte'
      : marginPctC < WATCH_MARGIN ? 'surveiller' : 'ok';
    return {
      email: c.email || '?',
      plan,
      price,
      role,
      mtdCost: Math.round(spent * 100) / 100,
      projCost: Math.round(projCost * 100) / 100,
      marginPct: marginPctC,
      status,
    };
  }).sort((a, b) => b.projCost - a.projCost);
  const clientsInLoss = clientRows.filter(r => r.status === 'perte');
  const clientsToWatch = clientRows.filter(r => r.status === 'surveiller');

  // Agrégats par rôle (founder 03/07).
  const referenceRows = clientRows.filter(r => r.role === 'reference');
  const supervisionRows = clientRows.filter(r => r.role === 'supervision');
  const referenceProjCost = referenceRows.reduce((s, r) => s + r.projCost, 0);
  const supervisionProjCost = supervisionRows.reduce((s, r) => s + r.projCost, 0);
  const supervisionOverBudget = supervisionProjCost > SUPERVISION_BUDGET_EUR;

  // 3c-bis. Coût ATTRIBUÉ aux clients vs coût SYSTÈME/TESTS (user_id null).
  //     Révèle que la marge globale est plombée par nos propres tests +
  //     prospection KeiroAI, pas par les clients (founder 03/07).
  const attributedMtd = Object.values(byUser).reduce((a, b) => a + b, 0);
  const unattributedMtd = Math.max(0, totalMtd - attributedMtd); // système / tests / prospection KeiroAI
  const unattributedPct = totalMtd > 0 ? Math.round((unattributedMtd / totalMtd) * 100) : 0;

  // 3d. Coût PAR PROVIDER (où part le budget). Le champ `provider` est
  //     TOUJOURS renseigné (contrairement à `agent`, souvent null en prod →
  //     ne pas s'y fier pour l'attribution). C'est le vrai révélateur du coût.
  const byProvider: Record<string, number> = {};
  const byAgent: Record<string, number> = {};
  for (const e of (events || []) as any[]) {
    const cost = parseFloat(e.cost_eur) || 0;
    byProvider[e.provider || 'autre'] = (byProvider[e.provider || 'autre'] || 0) + cost;
    byAgent[e.agent || 'non-taggé'] = (byAgent[e.agent || 'non-taggé'] || 0) + cost;
  }
  const providerRows = Object.entries(byProvider)
    .map(([provider, cost]) => ({ provider, cost: Math.round(cost * 100) / 100, pct: totalMtd > 0 ? Math.round((cost / totalMtd) * 100) : 0 }))
    .sort((a, b) => b.cost - a.cost);
  const agentRows = Object.entries(byAgent)
    .map(([agent, cost]) => ({ agent, cost: Math.round(cost * 100) / 100, pct: totalMtd > 0 ? Math.round((cost / totalMtd) * 100) : 0 }))
    .sort((a, b) => b.cost - a.cost);

  // 3e. Coût PAR POST : coût MÉDIA (image/vidéo/voix) attribué au contenu, /
  //     posts publiés MTD. On s'appuie sur `provider` (fiable) et non sur
  //     `agent`. Un coût/post ~0€ = les posts ont réutilisé des visuels de la
  //     librairie (0 coût) — c'est bon signe, pas un bug.
  const MEDIA_PROVIDERS = new Set(['seedream', 'seedance', 'kling', 'elevenlabs']);
  const mediaCostMtd = (events || []).reduce((s: number, e: any) => s + (MEDIA_PROVIDERS.has(e.provider) ? (parseFloat(e.cost_eur) || 0) : 0), 0);
  const { count: postsPublishedMtd } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'published')
    .gte('published_at', monthStart.toISOString());
  const posts = postsPublishedMtd || 0;
  const costPerPost = posts > 0 ? mediaCostMtd / posts : 0;
  const TARGET_COST_PER_POST = 0.60; // seuil cible €/post média (image+vidéo). Au-delà = à optimiser.

  // 4. Decision : do we alert ?
  // ⚠️ Sans VRAI client (que des comptes admin/test), la "marge" n'a pas de
  //    sens : on ne compare pas un revenu fictif au coût. On reporte juste le
  //    burn interne (tests + prospection) au-delà d'un seuil absolu.
  const noRealClients = realClientCount === 0;
  const BURN_ALERT_EUR = 60; // seuil de burn mensuel projeté à signaler quand 0 client réel
  const alerts: string[] = [];
  // Supervision : doit rester ~0. Un dépassement = appel non désiré / anomalie.
  if (supervisionOverBudget) {
    alerts.push(`🔧 SUPERVISION en dépassement : ${supervisionProjCost.toFixed(2)}€/mois projeté > budget ${SUPERVISION_BUDGET_EUR}€ (${supervisionRows.map(r => r.email.split('@')[0]).join(', ')}). Appel non désiré ou anomalie à vérifier.`);
  }
  if (noRealClients) {
    if (projection > BURN_ALERT_EUR) {
      alerts.push(`ℹ️ 0 client réel — burn interne projeté ${projection.toFixed(2)}€/mois (référence ${referenceProjCost.toFixed(2)}€ + prospection/tests). Marge non applicable.`);
    }
  } else {
    if (marginPct < 70 && marginPct >= 60) alerts.push(`⚠️ MARGE RÉELLE ${marginPct}% — sous le seuil 70%`);
    if (marginPct < 60) alerts.push(`🚨 MARGE RÉELLE ${marginPct}% — sous le seuil critique 60%`);
    if (projection > realRevenue) alerts.push(`🚨 PROJECTION ${projection.toFixed(2)}€ DÉPASSE REVENU RÉEL ${realRevenue}€`);
  }
  if (clientsInLoss.length > 0) alerts.push(`💸 ${clientsInLoss.length} client(s) EN PERTE (coût projeté > prix du plan)`);
  if (clientsToWatch.length > 0) alerts.push(`🟠 ${clientsToWatch.length} client(s) à surveiller (marge < ${WATCH_MARGIN}%)`);
  if (posts > 0 && costPerPost > TARGET_COST_PER_POST) alerts.push(`📈 Coût/post ${costPerPost.toFixed(2)}€ > cible ${TARGET_COST_PER_POST.toFixed(2)}€`);
  if (spikes.length > 0) alerts.push(`⚡ ${spikes.length} client(s) en spike (>5× avg)`);

  // 5. Send admin email if alerts
  let emailSent = false;
  if (alerts.length > 0) {
    try {
      const html = renderAlertEmail({
        marginPct, monthlyRevenue, realRevenue, realClientCount, noRealClients, totalMtd, projection, dailyAvg, daysElapsed, daysInMonth, alerts, spikes,
        clientCount, planRows, clientRows, clientsInLoss, clientsToWatch, agentRows, providerRows,
        referenceRows, supervisionRows, referenceProjCost, supervisionProjCost, supervisionOverBudget, supervisionBudget: SUPERVISION_BUDGET_EUR,
        attributedMtd, unattributedMtd, unattributedPct, watchMargin: WATCH_MARGIN,
        posts, costPerPost, mediaCostMtd, targetCostPerPost: TARGET_COST_PER_POST,
      });
      const brevoKey = process.env.BREVO_API_KEY;
      if (brevoKey) {
        const subject = noRealClients
          ? `[KeiroAI] 🧪 Burn interne ${projection.toFixed(0)}€/mois — 0 client réel (${alerts.length} note(s))`
          : `[KeiroAI] ${marginPct < 60 ? '🚨' : '⚠️'} Marge réelle ${marginPct}% — ${alerts.length} alerte(s)`;
        const r = await sendBrevoCompat({
            sender: { name: 'KeiroAI Cost Pilot', email: 'contact@keiroai.com' },
            to: [{ email: 'contact@keiroai.com' }],
            subject,
            htmlContent: html,
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
    client_count: clientCount,
    real_client_count: realClientCount,
    real_revenue_eur: realRevenue,
    no_real_clients: noRealClients,
    reference_proj_cost_eur: Math.round(referenceProjCost * 100) / 100,
    supervision_proj_cost_eur: Math.round(supervisionProjCost * 100) / 100,
    supervision_budget_eur: SUPERVISION_BUDGET_EUR,
    supervision_over_budget: supervisionOverBudget,
    clients: clientRows,
    clients_in_loss: clientsInLoss,
    clients_to_watch: clientsToWatch,
    attributed_cost_mtd_eur: Math.round(attributedMtd * 100) / 100,
    unattributed_cost_mtd_eur: Math.round(unattributedMtd * 100) / 100,
    unattributed_pct: unattributedPct,
    plans: planRows,
    cost_by_provider: providerRows,
    cost_by_agent: agentRows,
    posts_published_mtd: posts,
    media_cost_mtd_eur: Math.round(mediaCostMtd * 100) / 100,
    cost_per_post_eur: Math.round(costPerPost * 100) / 100,
    spikes: spikes.slice(0, 10),
    alerts,
    email_sent: emailSent,
  });
}

function renderAlertEmail(d: any): string {
  return `
<!DOCTYPE html><html><body style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9fa;">
  <div style="background: #fff; border-radius: 12px; padding: 24px;">
    ${d.noRealClients ? `
    <h1 style="color: #4f46e5; margin-bottom: 8px;">🧪 Burn interne : ${d.projection.toFixed(2)} €/mois projeté</h1>
    <p style="color: #666;">Jour ${d.daysElapsed}/${d.daysInMonth} · <strong>0 client réel externe</strong>. Compte référence (mrzirraro = KeiroAI, simule un client actif) : <strong>${d.referenceProjCost.toFixed(2)} €/mois</strong>. Supervision (admin + Meta review) : <strong style="color:${d.supervisionOverBudget ? '#dc2626' : '#059669'};">${d.supervisionProjCost.toFixed(2)} €</strong> / budget ${d.supervisionBudget} €.</p>
    ` : `
    <h1 style="color: ${d.marginPct < 60 ? '#dc2626' : '#d97706'}; margin-bottom: 8px;">
      ${d.marginPct < 60 ? '🚨' : '⚠️'} Marge réelle projetée : ${d.marginPct}%
    </h1>
    <p style="color: #666;">Jour ${d.daysElapsed}/${d.daysInMonth} · ${d.realClientCount} client(s) réel(s) · revenu réel ${d.realRevenue} €</p>
    `}

    <h2 style="margin-top: 24px;">📊 Chiffres clés</h2>
    <table style="width:100%; border-collapse: collapse;">
      <tr><td style="padding: 6px 0; color: #666;">Comptes</td><td style="text-align: right; font-weight: bold;">${d.realClientCount} client${d.realClientCount > 1 ? 's' : ''} réel${d.realClientCount > 1 ? 's' : ''} · ${d.referenceRows.length} référence · ${d.supervisionRows.length} supervision</td></tr>
      <tr><td style="padding: 6px 0; color: #666;">Revenu réel encaissé</td><td style="text-align: right; font-weight: bold;">${d.realRevenue} €${d.monthlyRevenue !== d.realRevenue ? ` <span style="color:#94a3b8;font-weight:normal;">(${d.monthlyRevenue} € en comptant les comptes internes)</span>` : ''}</td></tr>
      <tr><td style="padding: 6px 0; color: #666;">Dépense MTD</td><td style="text-align: right; font-weight: bold;">${d.totalMtd.toFixed(2)} €</td></tr>
      <tr><td style="padding: 6px 0; color: #666;">— attribué aux clients</td><td style="text-align: right;">${d.attributedMtd.toFixed(2)} €</td></tr>
      <tr><td style="padding: 6px 0; color: #b45309;">— système / tests / prospection KeiroAI</td><td style="text-align: right; color:#b45309; font-weight:bold;">${d.unattributedMtd.toFixed(2)} € (${d.unattributedPct}%)</td></tr>
      <tr><td style="padding: 6px 0; color: #666;">Moyenne quotidienne</td><td style="text-align: right; font-weight: bold;">${d.dailyAvg.toFixed(2)} €</td></tr>
      <tr><td style="padding: 6px 0; color: #666;">Projection fin de mois</td><td style="text-align: right; font-weight: bold;">${d.projection.toFixed(2)} €</td></tr>
      <tr><td style="padding: 6px 0; color: #666;">Posts publiés (mois) · coût/post</td><td style="text-align: right; font-weight: bold; color:${d.posts > 0 && d.costPerPost > d.targetCostPerPost ? '#dc2626' : '#059669'};">${d.posts} · ${d.costPerPost.toFixed(2)} €${d.posts > 0 ? ` (cible ${d.targetCostPerPost.toFixed(2)})` : ''}</td></tr>
    </table>

    <h2 style="margin-top: 24px;">🚨 Alertes</h2>
    <ul>${d.alerts.map((a: string) => `<li style="margin: 8px 0; color: #dc2626;">${a}</li>`).join('')}</ul>

    <h2 style="margin-top: 24px;">📦 Marge par plan</h2>
    <table style="width:100%; border-collapse: collapse; font-size: 13px;">
      <thead><tr style="background: #f3f4f6;"><th style="padding: 8px; text-align: left;">Plan</th><th style="padding: 8px; text-align: right;">Clients</th><th style="padding: 8px; text-align: right;">Revenu</th><th style="padding: 8px; text-align: right;">Coût proj.</th><th style="padding: 8px; text-align: right;">Marge</th></tr></thead>
      <tbody>
        ${d.planRows.map((p: any) => `<tr style="border-top: 1px solid #e5e7eb;"><td style="padding: 6px 8px; text-transform:capitalize;">${p.plan}</td><td style="text-align:right; padding:6px 8px;">${p.count}</td><td style="text-align:right; padding:6px 8px;">${p.revenue} €</td><td style="text-align:right; padding:6px 8px;">${p.projCost.toFixed(2)} €</td><td style="text-align:right; padding:6px 8px; font-weight:bold; color:${p.marginPct < 60 ? '#dc2626' : p.marginPct < 70 ? '#d97706' : '#059669'};">${p.marginPct <= -999 ? 'n/a' : p.marginPct + '%'}</td></tr>`).join('')}
      </tbody>
    </table>

    <h2 style="margin-top: 24px;">👤 Comptes — qui ils sont</h2>
    <table style="width:100%; border-collapse: collapse; font-size: 13px;">
      <thead><tr style="background: #f3f4f6;"><th style="padding: 8px; text-align: left;">Email</th><th style="padding: 8px; text-align: left;">Rôle</th><th style="padding: 8px; text-align: right;">Coût proj.</th><th style="padding: 8px; text-align: right;">Marge</th><th style="padding: 8px; text-align: center;">État</th></tr></thead>
      <tbody>
        ${d.clientRows.map((c: any) => {
          const map: any = {
            'perte':            { b: '🔴 perte', col: '#dc2626' },
            'surveiller':       { b: '🟠 surveiller', col: '#d97706' },
            'ok':               { b: '✅ ok', col: '#059669' },
            'reference':        { b: '🎯 référence', col: '#4f46e5' },
            'supervision':      { b: '🔧 supervision', col: '#059669' },
            'supervision-over': { b: '🔧 dépassement', col: '#dc2626' },
          };
          const roleLabel: any = { reference: 'référence (simulation client)', supervision: 'supervision', client: 'client' };
          const m = map[c.status] || map['ok'];
          const showMargin = c.role === 'client';
          return `<tr style="border-top: 1px solid #e5e7eb;"><td style="padding: 6px 8px;">${c.email}</td><td style="padding: 6px 8px; color:#64748b;">${roleLabel[c.role]}</td><td style="text-align:right; padding:6px 8px;">${c.projCost.toFixed(2)} €</td><td style="text-align:right; padding:6px 8px; font-weight:bold; color:${m.col};">${showMargin ? (c.marginPct <= -999 ? 'n/a' : c.marginPct + '%') : '—'}</td><td style="text-align:center; padding:6px 8px; color:${m.col};">${m.b}</td></tr>`;
        }).join('')}
      </tbody>
    </table>
    <p style="font-size:11px;color:#94a3b8;margin-top:6px;">🎯 <strong>référence</strong> = mrzirraro (compte KeiroAI à vraie activité) : simule le coût d'un client actif. 🔧 <strong>supervision</strong> = admin + Meta review : doivent coûter ~0 (budget ${d.supervisionBudget} €) ; un dépassement = appel non désiré ou anomalie. Vrai client : ✅ ok ≥ ${d.watchMargin}% · 🟠 &lt; ${d.watchMargin}% · 🔴 en perte.</p>

    ${d.providerRows.length > 0 ? `
    <h2 style="margin-top: 24px;">🔌 Où part le budget (par provider)</h2>
    <table style="width:100%; border-collapse: collapse; font-size: 13px;">
      <tbody>
        ${d.providerRows.slice(0, 10).map((a: any) => `<tr style="border-top: 1px solid #e5e7eb;"><td style="padding: 6px 8px; text-transform:capitalize;">${a.provider}</td><td style="text-align:right; padding:6px 8px; font-weight:bold;">${a.cost.toFixed(2)} €</td><td style="text-align:right; padding:6px 8px; color:#666;">${a.pct}%</td></tr>`).join('')}
      </tbody>
    </table>
    <p style="font-size:11px;color:#94a3b8;margin-top:6px;">Coût média (image/vidéo/voix) ce mois : ${d.mediaCostMtd.toFixed(2)} € · ${d.posts} posts publiés.</p>` : ''}

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
