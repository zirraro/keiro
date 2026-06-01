import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ADMIN_EMAIL = 'contact@keiroai.com';

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/**
 * GET /api/cron/admin-health-digest
 *
 * Daily rollup of Noah catch-up diagnostics. Fires at ~22h Paris
 * (after all evening briefs landed). Sends ONE consolidated email to
 * contact@keiroai.com with: top causes ranked by severity, scale
 * impact (% of base affected), and the union of proposed fixes.
 *
 * Founder ask 2026-05-26: "des mails quotidien d'alerte avec
 * recommendation et root cause identification reel du problem".
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
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const { data: diagnostics } = await supabase
    .from('agent_logs')
    .select('user_id, data, created_at')
    .eq('agent', 'ceo')
    .eq('action', 'noah_diagnostic')
    .gte('created_at', since24h)
    .order('created_at', { ascending: false })
    .limit(500);

  if (!diagnostics || diagnostics.length === 0) {
    return NextResponse.json({ ok: true, sent: false, message: 'No diagnostics today — service healthy.' });
  }

  // Aggregate by cause
  const byCause: Record<string, {
    cause: string;
    severity: string;
    incidents: number;
    clients: Map<string, string>; // user_id → email (for explicit display)
    agents: Set<string>;
    fixes: Set<string>;
    last_seen: string;
    sample_error: string;
  }> = {};
  let p0 = 0, p1 = 0, p2 = 0;
  for (const row of diagnostics) {
    const gaps = (row.data?.gaps || []) as Array<any>;
    const clientEmail = row.data?.client_email || row.user_id || 'unknown';
    for (const g of gaps) {
      const key = g.cause || 'unknown';
      if (!byCause[key]) {
        byCause[key] = {
          cause: key,
          severity: g.severity || 'P2',
          incidents: 0,
          clients: new Map(),
          agents: new Set(),
          fixes: new Set(),
          last_seen: row.created_at,
          sample_error: g.raw_error || '',
        };
      }
      const b = byCause[key];
      b.incidents++;
      if (row.user_id) b.clients.set(row.user_id, clientEmail);
      if (g.agent) b.agents.add(g.agent);
      for (const f of (g.fixes || [])) b.fixes.add(f);
      if (g.severity === 'P0') p0++;
      else if (g.severity === 'P1') p1++;
      else p2++;
    }
  }

  const causes = Object.values(byCause).sort((a, b) => {
    const sev = { P0: 0, P1: 1, P2: 2 } as const;
    const sa = sev[a.severity as keyof typeof sev] ?? 2;
    const sb2 = sev[b.severity as keyof typeof sev] ?? 2;
    if (sa !== sb2) return sa - sb2;
    return b.incidents - a.incidents;
  });

  // Scale impact denominator
  const { count: totalActive } = await supabase
    .from('profiles').select('id', { count: 'exact', head: true })
    .not('subscription_plan', 'is', null)
    .neq('subscription_plan', 'free');
  const totalBase = totalActive || 1;

  const SEV_COLOR: Record<string, { bg: string; border: string }> = {
    P0: { bg: '#fef2f2', border: '#dc2626' },
    P1: { bg: '#fff7ed', border: '#ea580c' },
    P2: { bg: '#f9fafb', border: '#6b7280' },
  };

  const causeBlocks = causes.map(c => {
    const sev = SEV_COLOR[c.severity] || SEV_COLOR.P2;
    const impactPct = Math.round((c.clients.size / totalBase) * 100);
    const scope = c.clients.size === 1
      ? 'isolé'
      : impactPct >= 50
        ? `systémique (${c.clients.size}/${totalBase}, ${impactPct}%)`
        : `partiel (${c.clients.size}/${totalBase}, ${impactPct}%)`;
    const clientList = Array.from(c.clients.values()).slice(0, 25).join(', ');
    const extraClients = c.clients.size > 25 ? ` (+${c.clients.size - 25} autres)` : '';
    return `
<div style="background:${sev.bg};border-left:4px solid ${sev.border};border-radius:8px;padding:14px;margin:10px 0;">
  <div style="font-size:11px;color:${sev.border};font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;">
    ${c.severity} · ${Array.from(c.agents).join(', ')} · ${scope}
  </div>
  <div style="font-size:14px;color:#1f2937;font-weight:bold;margin:6px 0;">
    ${c.cause}
  </div>
  <div style="font-size:12px;color:#4b5563;">
    <strong>${c.incidents}</strong> incident${c.incidents > 1 ? 's' : ''} sur ${c.clients.size} client${c.clients.size > 1 ? 's' : ''} dans les 24h.
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px;margin:8px 0;">
    <div style="font-size:10px;font-weight:bold;color:#374151;text-transform:uppercase;letter-spacing:0.3px;">Clients concernés</div>
    <div style="font-size:11px;color:#1f2937;margin-top:4px;line-height:1.5;">${clientList}${extraClients}</div>
  </div>
  ${c.sample_error ? `<div style="font-size:11px;color:#6b7280;font-family:monospace;background:#f3f4f6;padding:6px 8px;border-radius:4px;margin:8px 0;">${c.sample_error.slice(0, 220)}</div>` : ''}
  <div style="margin-top:8px;">
    <div style="font-size:11px;font-weight:bold;color:#059669;">Action recommandée :</div>
    <ul style="margin:4px 0 0;padding-left:18px;font-size:12px;color:#374151;">
      ${Array.from(c.fixes).map(f => `<li>${f}</li>`).join('')}
    </ul>
  </div>
</div>`;
  }).join('');

  const summaryLine = p0 > 0
    ? `<strong style="color:#dc2626;">${p0} P0 bloquant${p0 > 1 ? 's' : ''}</strong>${p1 > 0 ? ` · ${p1} P1` : ''}${p2 > 0 ? ` · ${p2} P2` : ''}`
    : p1 > 0
      ? `${p1} P1 important${p1 > 1 ? 's' : ''}${p2 > 0 ? ` · ${p2} P2` : ''}`
      : `${p2} P2 mineur${p2 > 1 ? 's' : ''}`;

  const adminHtml = `<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;">
    <div style="background:#0c1a3a;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;">
      <h2 style="margin:0;font-size:18px;">📊 Service Health — Digest 24h</h2>
      <div style="font-size:12px;color:#a0aec0;margin-top:6px;">
        ${diagnostics.length} brief${diagnostics.length > 1 ? 's' : ''} concerné${diagnostics.length > 1 ? 's' : ''} · ${summaryLine}
      </div>
    </div>
    <div style="background:#fff;border:1px solid #e5e7eb;border-top:0;padding:20px 22px;">
      ${p0 > 0 ? `<div style="background:#fef2f2;border:2px solid #dc2626;border-radius:10px;padding:14px;margin:0 0 16px;">
        <strong style="color:#991b1b;font-size:14px;">🚨 Action P0 requise — fix sous 24h</strong>
        <div style="font-size:12px;color:#7f1d1d;margin-top:4px;">${p0} cause${p0 > 1 ? 's' : ''} bloquante${p0 > 1 ? 's' : ''} détectée${p0 > 1 ? 's' : ''}. À traiter en priorité absolue.</div>
      </div>` : ''}

      <h3 style="font-size:14px;color:#374151;margin:16px 0 8px;">Causes racines (triées par sévérité)</h3>
      ${causeBlocks}

      <div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:14px;border-radius:8px;margin-top:18px;">
        <strong style="color:#166534;font-size:12px;">📋 Workflow attendu</strong>
        <ol style="font-size:11px;color:#14532d;margin:6px 0 0;padding-left:18px;">
          <li>Reviewer la liste ci-dessus, choisir les fix prioritaires</li>
          <li>Demander à Claude d'implémenter les solutions proposées</li>
          <li>Une fois déployé : la catch-up suivante validera silencieusement (plus d'alerte = fix OK)</li>
          <li>Console détaillée : <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'https://www.keiroai.com'}/admin/service-health" style="color:#059669;">/admin/service-health</a></li>
        </ol>
      </div>
    </div>
    <div style="background:#f9fafb;padding:10px;text-align:center;color:#9ca3af;font-size:10px;border-radius:0 0 12px 12px;">
      Source : agent_logs(agent='ceo', action='noah_diagnostic') · Digest quotidien automatique
    </div>
  </div>`;

  // 2026-06-01 — Email send disabled. The unified admin evening digest
  // (lib/agents/admin-digest.ts) reads the same noah_diagnostic rows and
  // renders the Service Health section inside the single daily email.
  // This endpoint stays callable for the /admin/service-health console
  // and returns the rendered HTML + summary so other callers can embed it.
  void ADMIN_EMAIL; void adminHtml;

  // Persist a summary row so the unified digest knows the snapshot was
  // computed (helpful for ordering in the evening pipeline).
  try {
    await supabase.from('agent_logs').insert({
      agent: 'ceo',
      action: 'admin_health_snapshot',
      status: p0 > 0 ? 'error' : 'ok',
      data: {
        p0, p1, p2,
        total_incidents: p0 + p1 + p2,
        unique_causes: causes.length,
        clients_affected: new Set(diagnostics.map(d => d.user_id)).size,
        top_causes: causes.slice(0, 5).map(c => ({
          cause: c.cause,
          severity: c.severity,
          incidents: c.incidents,
          clients: Array.from(c.clients.values()).slice(0, 5),
          agents: Array.from(c.agents),
          fixes: Array.from(c.fixes),
          sample_error: c.sample_error,
        })),
      },
      created_at: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error('[AdminHealthDigest] snapshot persist failed:', e.message);
  }

  return NextResponse.json({
    ok: true,
    sent: false, // Always false — unified digest handles delivery
    summary: { p0, p1, p2, total_incidents: p0 + p1 + p2, unique_causes: causes.length, clients_affected: new Set(diagnostics.map(d => d.user_id)).size },
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
