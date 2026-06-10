/**
 * Daily admin digest of client directive failures across all agents.
 * Founder rule: ONE email per day, regrouping all clients × all
 * agents — never per-failure, never per-client.
 *
 * Schedule: 06:30 UTC (07:30 Paris standard) — before the founder
 * starts reading agent reports.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { sendBrevoCompat } from '@/lib/email/brevo-compat';
export const runtime = 'nodejs';
export const maxDuration = 60;

function authOk(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const tok = auth.replace(/^Bearer\s+/i, '');
  return !!tok && tok === (process.env.CRON_SECRET || '');
}

async function sendAdminEmail(subject: string, html: string) {
  const apiKey = process.env.BREVO_API_KEY;
  const adminEmail = process.env.ADMIN_EMAIL || 'mrzirraro@gmail.com';
  if (!apiKey) return { ok: false, error: 'BREVO_API_KEY missing' };
  const res = await sendBrevoCompat({
      sender: { name: 'KeiroAI Admin', email: 'admin@keiroai.com' },
      to: [{ email: adminEmail }],
      subject,
      htmlContent: html,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    return { ok: false, error: `Brevo HTTP ${res.status}: ${txt.substring(0, 200)}` };
  }
  return { ok: true };
}

export async function GET(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Pull all unsent failures from the last 24h
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: failures } = await supabase
    .from('directive_failures')
    .select('id, user_id, agent_id, directive_type, raw_text, reason, severity, created_at')
    .is('sent_to_admin_at', null)
    .gte('created_at', since)
    .order('agent_id', { ascending: true })
    .order('created_at', { ascending: false });

  if (!failures || failures.length === 0) {
    return NextResponse.json({ ok: true, count: 0, sent: false });
  }

  // Enrich with client emails — one query
  const userIds = [...new Set(failures.map((f: any) => f.user_id).filter(Boolean))] as string[];
  const emailById = new Map<string, string>();
  if (userIds.length) {
    for (const uid of userIds) {
      const { data: { user } } = await supabase.auth.admin.getUserById(uid);
      if (user?.email) emailById.set(uid, user.email);
    }
  }

  // Group by agent
  const byAgent: Record<string, any[]> = {};
  for (const f of failures as any[]) {
    if (!byAgent[f.agent_id]) byAgent[f.agent_id] = [];
    byAgent[f.agent_id].push(f);
  }

  // Build HTML digest
  let html = `<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 720px; margin: 0 auto;">`;
  html += `<h2 style="color:#0c1a3a;margin-bottom:4px">Digest directives clients — échecs ${failures.length} (24h)</h2>`;
  html += `<p style="color:#475569;margin-top:0">Liste des ordres reçus par chat que les agents n'ont pas pu honorer automatiquement. Action requise pour les "high".</p>`;

  for (const [agentId, list] of Object.entries(byAgent)) {
    html += `<div style="margin-top:18px;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">`;
    html += `<h3 style="margin:0 0 8px 0;color:#0f172a">Agent <code>${agentId}</code> — ${list.length} échec${list.length > 1 ? 's' : ''}</h3>`;
    html += `<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#f1f5f9"><th style="text-align:left;padding:6px;border:1px solid #e2e8f0">Client</th><th style="text-align:left;padding:6px;border:1px solid #e2e8f0">Type</th><th style="text-align:left;padding:6px;border:1px solid #e2e8f0">Demande</th><th style="text-align:left;padding:6px;border:1px solid #e2e8f0">Raison</th><th style="text-align:left;padding:6px;border:1px solid #e2e8f0">Sév.</th></tr></thead><tbody>`;
    for (const f of list) {
      const sevColor = f.severity === 'high' ? '#dc2626' : f.severity === 'low' ? '#64748b' : '#d97706';
      html += `<tr>`;
      html += `<td style="padding:6px;border:1px solid #e2e8f0;color:#0f172a">${emailById.get(f.user_id) || f.user_id?.substring(0, 8) || '—'}</td>`;
      html += `<td style="padding:6px;border:1px solid #e2e8f0;color:#475569">${f.directive_type || 'custom'}</td>`;
      html += `<td style="padding:6px;border:1px solid #e2e8f0;color:#475569">${(f.raw_text || '').substring(0, 120)}</td>`;
      html += `<td style="padding:6px;border:1px solid #e2e8f0;color:#475569">${(f.reason || '').substring(0, 200)}</td>`;
      html += `<td style="padding:6px;border:1px solid #e2e8f0;color:${sevColor};font-weight:bold;text-transform:uppercase">${f.severity}</td>`;
      html += `</tr>`;
    }
    html += `</tbody></table>`;
    html += `</div>`;
  }

  html += `<p style="margin-top:18px;color:#64748b;font-size:12px">— KeiroAI · digest automatique quotidien</p>`;
  html += `</div>`;

  const result = await sendAdminEmail(
    `[KeiroAI] ${failures.length} ordres clients non honorés (24h)`,
    html,
  );

  if (result.ok) {
    // Mark as sent
    await supabase
      .from('directive_failures')
      .update({ sent_to_admin_at: new Date().toISOString() })
      .in('id', failures.map((f: any) => f.id));
  }

  return NextResponse.json({ ok: result.ok, count: failures.length, sent: result.ok, error: result.ok ? null : (result as any).error });
}
