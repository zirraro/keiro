/**
 * Brevo health check — vérifie que la clé API est valide.
 *
 * Founder ask 2026-06-10 : "pourquoi le client mrzirraro@gmail.com
 * ne reçoit plus de mail de noah".
 * Diagnostic : la clé Brevo était révoquée, tous les emails échouaient
 * silencieusement (le code avait .catch(() => {}) qui swallowait).
 *
 * Ce cron tourne toutes les 6h. Si la clé est invalide :
 *   1. Log un error dans agent_logs
 *   2. (Si possible) Envoie un fallback via console + un Slack/SMS
 *      d'urgence — mais on ne peut pas s'auto-envoyer un email si
 *      la clé est cassée. Donc on dépend de l'admin pour voir le log.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function authOk(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const tok = auth.replace(/^Bearer\s+/i, '');
  return !!tok && tok === (process.env.CRON_SECRET || '');
}

export async function GET(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const supabase = sb();

  const key = process.env.BREVO_API_KEY;
  if (!key) {
    await supabase.from('agent_logs').insert({
      agent: 'ops',
      action: 'brevo_health_check',
      status: 'error',
      error_message: 'BREVO_API_KEY missing in env',
      data: { severity: 'critical' },
    });
    return NextResponse.json({ ok: false, healthy: false, error: 'BREVO_API_KEY missing' });
  }

  try {
    const res = await fetch('https://api.brevo.com/v3/account', {
      method: 'GET',
      headers: { 'api-key': key, 'accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      // 2026-06-13 — Resend is the primary fallback (sendEmailWithFallback).
      // When Brevo is down but Resend is configured, emails do NOT fail
      // silently — so this is a WARNING (regenerate the key when convenient),
      // not a CRITICAL outage. Only critical if BOTH providers are unavailable.
      const resendCovers = !!process.env.RESEND_API_KEY;
      await supabase.from('agent_logs').insert({
        agent: 'ops',
        action: 'brevo_health_check',
        status: resendCovers ? 'warn' : 'error',
        error_message: `Brevo API ${res.status}: ${data.message || data.code || 'unknown'}${resendCovers ? ' (Resend prend le relais — non bloquant)' : ''}`,
        data: {
          severity: resendCovers ? 'warning' : 'critical',
          status_code: res.status,
          brevo_response: data,
          key_prefix: key.substring(0, 15),
          impact: resendCovers
            ? 'Brevo KO mais Resend assure la livraison — régénérer la clé Brevo quand possible'
            : 'ALL emails fail: Brevo down AND no Resend fallback configured',
        },
      });
      return NextResponse.json({
        ok: true,
        healthy: false,
        status: res.status,
        message: data.message || 'Brevo rejected the API key',
        key_prefix: key.substring(0, 15),
        action_required: 'Generate new key at https://app.brevo.com/settings/keys/api',
      });
    }

    // Healthy
    await supabase.from('agent_logs').insert({
      agent: 'ops',
      action: 'brevo_health_check',
      status: 'success',
      data: {
        email: data?.email,
        plan: data?.plan,
        credits_remaining: data?.plan?.[0]?.credits || null,
      },
    });
    return NextResponse.json({
      ok: true,
      healthy: true,
      account: data?.email,
      plan: data?.plan,
    });
  } catch (e: any) {
    await supabase.from('agent_logs').insert({
      agent: 'ops',
      action: 'brevo_health_check',
      status: 'error',
      error_message: `Brevo unreachable: ${e?.message?.substring(0, 200)}`,
      data: { severity: 'warning' },
    });
    return NextResponse.json({ ok: true, healthy: false, error: e?.message });
  }
}
