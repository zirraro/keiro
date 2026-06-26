import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/cron/security-check
 *
 * Contrôle de sécurité AUTOMATIQUE et RÉGULIER (lecture seule — ne modifie rien).
 * Vérifie que la posture de sécurité ne régresse pas et alerte sinon. Lancé par
 * le scheduler 1×/jour. Auth : Bearer CRON_SECRET (ou admin connecté).
 *
 * Chaque échec "hard" écrit une ligne agent_logs status='error' → remontée
 * automatique dans le digest admin du matin.
 */
function auth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://keiroai.com';
  const checks: Array<{ name: string; ok: boolean; hard: boolean; detail: string }> = [];
  const add = (name: string, ok: boolean, hard: boolean, detail = '') => checks.push({ name, ok, hard, detail });

  // 1. En-têtes de sécurité sur la home (HSTS, CSP, anti-clickjacking, nosniff).
  try {
    const r = await fetch(base, { redirect: 'manual' });
    const h = r.headers;
    add('HSTS', !!h.get('strict-transport-security'), true);
    add('CSP', !!h.get('content-security-policy'), true);
    add('X-Frame-Options', !!h.get('x-frame-options'), true, h.get('x-frame-options') || '');
    add('X-Content-Type-Options', (h.get('x-content-type-options') || '').includes('nosniff'), true);
  } catch (e: any) {
    add('Security headers', false, true, `fetch failed: ${e?.message}`);
  }

  // 2. security.txt joignable (politique de divulgation).
  try {
    const r = await fetch(`${base}/.well-known/security.txt`);
    add('security.txt', r.ok, false, `HTTP ${r.status}`);
  } catch { add('security.txt', false, false); }

  // 3. Divulgation Google "Limited Use" présente dans la politique de confidentialité.
  try {
    const r = await fetch(`${base}/legal/privacy`);
    const txt = await r.text();
    add('Privacy Limited Use', /Limited Use/i.test(txt), true);
  } catch { add('Privacy Limited Use', false, true); }

  // 4. Clé de chiffrement des tokens configurée (64 hex).
  const encKey = process.env.TOKEN_ENC_KEY || process.env.SMTP_ENC_KEY || '';
  add('Token encryption key', encKey.length === 64, true);

  // 5. CRON_SECRET configuré et non trivial.
  add('CRON_SECRET strength', (process.env.CRON_SECRET || '').length >= 16, true);

  // 6. service_role jamais exposée côté client.
  add('service_role not public', !process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY, true);

  // 7. Couverture chiffrement des tokens Google (informatif, non-hard).
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data } = await supabase
      .from('profiles')
      .select('gmail_refresh_token, google_business_refresh_token')
      .or('gmail_refresh_token.not.is.null,google_business_refresh_token.not.is.null')
      .limit(500);
    const rows = data || [];
    let enc = 0, plain = 0;
    for (const r of rows as any[]) {
      for (const v of [r.gmail_refresh_token, r.google_business_refresh_token]) {
        if (!v) continue;
        if (String(v).startsWith('gx1:')) enc++; else plain++;
      }
    }
    add('Google tokens encrypted', true, false, `chiffrés=${enc} clair=${plain} (les clairs migrent au prochain refresh)`);
  } catch (e: any) {
    add('Google tokens encrypted', false, false, e?.message);
  }

  // 8. Statut d'enforcement des signatures webhook (informatif).
  add('Webhook signature enforcement', true, false, process.env.ENFORCE_WEBHOOK_SIGNATURES === 'on' ? 'ON' : 'OFF (non-bloquant)');

  const hardFails = checks.filter(c => c.hard && !c.ok);
  const passed = checks.filter(c => c.ok).length;
  const summary = `${passed}/${checks.length} OK${hardFails.length ? ` — ${hardFails.length} échec(s) critique(s): ${hardFails.map(c => c.name).join(', ')}` : ''}`;

  // Trace + alerte automatique (status='error' si régression critique → digest admin).
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    await supabase.from('agent_logs').insert({
      agent: 'security',
      action: 'security_check',
      status: hardFails.length ? 'error' : 'success',
      error_message: hardFails.length ? `Régression sécurité: ${hardFails.map(c => c.name).join(', ')}` : null,
      data: { summary, checks },
      created_at: new Date().toISOString(),
    });
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: hardFails.length === 0, summary, checks });
}
