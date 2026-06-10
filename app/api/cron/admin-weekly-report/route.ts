/**
 * Weekly admin report — Mondays 06:00 UTC (~08:00 Paris).
 * Email HTML stylisé que l'admin peut imprimer en PDF côté Brevo.
 * Reprend les KPI clés de la semaine pour TOUS les agents + top
 * incidents + top wins + lien vers /admin/agents/reports pour
 * approfondir.
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

const ACTIVE_AGENTS = ['content', 'dm_instagram', 'email', 'commercial', 'reviews', 'ceo', 'marketing', 'seo', 'instagram_comments', 'onboarding', 'retention'];

export async function GET(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const supabase = sb();
  const now = new Date();
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const since14d = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();

  // ── Per-agent totals 7d ──
  const { data: logs7d } = await supabase
    .from('agent_logs')
    .select('agent, status, created_at')
    .gte('created_at', since7d)
    .limit(50000);
  const { data: logsPrev7d } = await supabase
    .from('agent_logs')
    .select('agent, status, created_at')
    .gte('created_at', since14d)
    .lt('created_at', since7d)
    .limit(50000);

  type Stat = { ok: number; err: number };
  const cur: Record<string, Stat> = {};
  const prev: Record<string, Stat> = {};
  for (const l of (logs7d || []) as any[]) {
    if (!cur[l.agent]) cur[l.agent] = { ok: 0, err: 0 };
    if (l.status === 'error' || l.status === 'failed') cur[l.agent].err++; else cur[l.agent].ok++;
  }
  for (const l of (logsPrev7d || []) as any[]) {
    if (!prev[l.agent]) prev[l.agent] = { ok: 0, err: 0 };
    if (l.status === 'error' || l.status === 'failed') prev[l.agent].err++; else prev[l.agent].ok++;
  }

  // ── Top incidents : anomalies marked P0/P1 on past 7d ──
  const { data: anomalies7d } = await supabase
    .from('anomaly_alerts')
    .select('severity, kind, agent, title, count_in_window, first_seen, resolved_at, resolution_reason')
    .gte('first_seen', since7d)
    .order('severity', { ascending: true })
    .order('count_in_window', { ascending: false })
    .limit(50);

  // ── Top wins : publish volume content + emails sent ──
  const { data: published } = await supabase
    .from('content_calendar')
    .select('platform, status')
    .eq('status', 'published')
    .gte('published_at', since7d)
    .limit(5000);
  const publishedByPlatform: Record<string, number> = {};
  for (const p of (published || []) as any[]) {
    publishedByPlatform[p.platform] = (publishedByPlatform[p.platform] || 0) + 1;
  }

  const { count: emailsSent } = await supabase
    .from('crm_activities').select('id', { count: 'exact', head: true })
    .eq('type', 'email').gte('created_at', since7d);
  const { count: prospectsAdded } = await supabase
    .from('crm_prospects').select('id', { count: 'exact', head: true })
    .gte('created_at', since7d);
  const { count: reviewsAnswered } = await supabase
    .from('agent_logs').select('id', { count: 'exact', head: true })
    .eq('agent', 'reviews').eq('status', 'ok').gte('created_at', since7d);

  // ── Knowledge mutualised — newly written this week ──
  const { count: newLearnings } = await supabase
    .from('agent_knowledge').select('id', { count: 'exact', head: true })
    .eq('category', 'error_pattern').gte('created_at', since7d);

  // ── Build HTML ──
  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>KeiroAI — Rapport hebdo</title></head>`;
  html += `<body style="font-family:system-ui,-apple-system,sans-serif;max-width:720px;margin:24px auto;color:#0f172a;background:#fff">`;
  html += `<h1 style="color:#0c1a3a;margin:0 0 4px 0">📊 Rapport hebdo KeiroAI</h1>`;
  html += `<p style="color:#64748b;margin:0 0 16px 0;font-size:13px">Semaine du ${new Date(since7d).toLocaleDateString('fr-FR')} au ${now.toLocaleDateString('fr-FR')}</p>`;

  // KPI strip
  const totalOk = Object.values(cur).reduce((s, v) => s + v.ok, 0);
  const totalErr = Object.values(cur).reduce((s, v) => s + v.err, 0);
  const successPct = totalOk + totalErr > 0 ? Math.round((totalOk / (totalOk + totalErr)) * 100) : 100;
  html += `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">`;
  html += kpi('Runs', `${totalOk + totalErr}`, '#0891b2');
  html += kpi('Succès', `${successPct}%`, successPct >= 95 ? '#059669' : successPct >= 80 ? '#d97706' : '#dc2626');
  html += kpi('Erreurs', `${totalErr}`, totalErr > 0 ? '#dc2626' : '#059669');
  html += kpi('Publications', `${(published || []).length}`, '#7c3aed');
  html += kpi('Emails', `${emailsSent || 0}`, '#0891b2');
  html += kpi('Prospects', `+${prospectsAdded || 0}`, '#059669');
  html += `</div>`;

  // Volume highlights
  html += `<h2 style="color:#0c1a3a;font-size:16px;border-bottom:1px solid #e2e8f0;padding-bottom:4px">📤 Volume publié</h2>`;
  html += `<ul style="font-size:13px;color:#475569">`;
  if (publishedByPlatform.instagram) html += `<li>Instagram : <strong>${publishedByPlatform.instagram} posts</strong></li>`;
  if (publishedByPlatform.tiktok) html += `<li>TikTok : <strong>${publishedByPlatform.tiktok} vidéos/photos</strong></li>`;
  if (publishedByPlatform.linkedin) html += `<li>LinkedIn : <strong>${publishedByPlatform.linkedin} posts</strong></li>`;
  if (reviewsAnswered) html += `<li>Avis Google répondus : <strong>${reviewsAnswered}</strong></li>`;
  html += `</ul>`;

  // Per-agent table with delta vs last week
  html += `<h2 style="color:#0c1a3a;font-size:16px;border-bottom:1px solid #e2e8f0;padding-bottom:4px;margin-top:20px">⚙️ Par agent · 7j vs semaine précédente</h2>`;
  html += `<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:#f1f5f9"><th style="text-align:left;padding:6px;border:1px solid #e2e8f0">Agent</th><th style="text-align:right;padding:6px;border:1px solid #e2e8f0">Runs</th><th style="text-align:right;padding:6px;border:1px solid #e2e8f0">Errors</th><th style="text-align:right;padding:6px;border:1px solid #e2e8f0">Success</th><th style="text-align:right;padding:6px;border:1px solid #e2e8f0">Δ vs prev</th></tr></thead><tbody>`;
  for (const ag of ACTIVE_AGENTS) {
    const c = cur[ag] || { ok: 0, err: 0 };
    const p = prev[ag] || { ok: 0, err: 0 };
    const curTotal = c.ok + c.err;
    if (curTotal === 0 && p.ok + p.err === 0) continue;
    const curRate = curTotal > 0 ? Math.round((c.ok / curTotal) * 100) : 0;
    const prevTotal = p.ok + p.err;
    const delta = prevTotal > 0 ? curTotal - prevTotal : null;
    const deltaStr = delta === null ? '—' : delta > 0 ? `+${delta}` : `${delta}`;
    const deltaColor = delta === null ? '#94a3b8' : delta > 0 ? '#059669' : delta < 0 ? '#dc2626' : '#475569';
    const rateColor = curRate >= 95 ? '#059669' : curRate >= 80 ? '#d97706' : '#dc2626';
    html += `<tr><td style="padding:6px;border:1px solid #e2e8f0"><code>${ag}</code></td>`;
    html += `<td style="padding:6px;border:1px solid #e2e8f0;text-align:right">${curTotal}</td>`;
    html += `<td style="padding:6px;border:1px solid #e2e8f0;text-align:right;color:${c.err > 0 ? '#dc2626' : '#94a3b8'}">${c.err}</td>`;
    html += `<td style="padding:6px;border:1px solid #e2e8f0;text-align:right;color:${rateColor};font-weight:bold">${curRate}%</td>`;
    html += `<td style="padding:6px;border:1px solid #e2e8f0;text-align:right;color:${deltaColor}">${deltaStr}</td></tr>`;
  }
  html += `</tbody></table>`;

  // Anomalies summary
  const anomActive = (anomalies7d || []).filter((a: any) => !a.resolved_at);
  const anomResolved = (anomalies7d || []).filter((a: any) => a.resolved_at);
  html += `<h2 style="color:#0c1a3a;font-size:16px;border-bottom:1px solid #e2e8f0;padding-bottom:4px;margin-top:20px">🚨 Anomalies (7j)</h2>`;
  html += `<p style="font-size:13px;color:#475569">Détectées : <strong>${(anomalies7d || []).length}</strong> · Résolues : <strong>${anomResolved.length}</strong> · Actives : <strong style="color:${anomActive.length > 0 ? '#dc2626' : '#059669'}">${anomActive.length}</strong></p>`;
  if (anomActive.length > 0) {
    html += `<ul style="font-size:12px;color:#475569">`;
    for (const a of anomActive.slice(0, 10) as any[]) {
      const sevColor = a.severity === 'P0' ? '#dc2626' : a.severity === 'P1' ? '#ea580c' : '#64748b';
      html += `<li style="margin:4px 0"><span style="background:${sevColor};color:#fff;font-weight:bold;font-size:10px;padding:1px 6px;border-radius:4px">${a.severity}</span> <code>${a.agent}</code> · ${a.title} <span style="color:#94a3b8">×${a.count_in_window}</span></li>`;
    }
    html += `</ul>`;
  }

  // Knowledge mutualised
  html += `<h2 style="color:#0c1a3a;font-size:16px;border-bottom:1px solid #e2e8f0;padding-bottom:4px;margin-top:20px">🧠 Knowledge mutualisée</h2>`;
  html += `<p style="font-size:13px;color:#475569"><strong>${newLearnings || 0}</strong> nouveau(x) pattern(s) ajouté(s) cette semaine — propagé(s) à tous les clients du même profil sans intervention manuelle.</p>`;

  // CTA
  html += `<div style="margin-top:24px;padding:14px;background:#0c1a3a;border-radius:8px;text-align:center">`;
  html += `<a href="https://keiroai.com/admin/agents/control" style="color:#fff;text-decoration:none;font-weight:bold">🎛️ Ouvrir le Control Center →</a><br/>`;
  html += `<a href="https://keiroai.com/admin/agents/reports" style="color:#a5f3fc;font-size:12px;text-decoration:none">📊 Rapports détaillés (filtrer, exporter CSV/PDF)</a>`;
  html += `</div>`;

  html += `<p style="margin-top:16px;color:#94a3b8;font-size:11px;text-align:center">— KeiroAI · rapport hebdo automatique tous les lundis 08:00 Paris</p>`;
  html += `</body></html>`;

  function kpi(label: string, val: string, color: string): string {
    return `<div style="flex:1;min-width:90px;border:1px solid #e2e8f0;border-radius:8px;padding:8px;background:#fff"><div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px">${label}</div><div style="font-size:18px;font-weight:bold;color:${color};margin-top:2px">${val}</div></div>`;
  }

  // ── Send via Brevo ──
  const apiKey = process.env.BREVO_API_KEY;
  const adminEmail = process.env.ADMIN_EMAIL || 'mrzirraro@gmail.com';
  if (!apiKey) return NextResponse.json({ ok: false, error: 'BREVO_API_KEY missing' });

  const res = await sendBrevoCompat({
      sender: { name: 'KeiroAI Weekly', email: 'admin@keiroai.com' },
      to: [{ email: adminEmail }],
      subject: `📊 KeiroAI hebdo · ${(published || []).length} publi · ${emailsSent || 0} emails · ${anomActive.length} alertes`,
      htmlContent: html,
  });

  return NextResponse.json({
    ok: res.ok,
    runs: totalOk + totalErr,
    errors: totalErr,
    success_rate: successPct,
    publications: (published || []).length,
    emails: emailsSent || 0,
    prospects: prospectsAdded || 0,
    new_learnings: newLearnings || 0,
    anomalies_active: anomActive.length,
  });
}
