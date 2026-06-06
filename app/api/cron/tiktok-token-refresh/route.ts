/**
 * GET /api/cron/tiktok-token-refresh
 *
 * Proactive TikTok token refresh — runs hourly. Scans clients whose
 * `tiktok_token_expiry` is within the next 2 hours and calls
 * /v2/oauth/token/ to refresh in silence. The refresh_token (365j)
 * stays alive as long as we use it within its lifetime, so this
 * effectively keeps every client connected indefinitely without any
 * human action.
 *
 * Why proactive (vs lazy refresh at publish time):
 * - Lazy refresh runs ONLY when a publish is attempted. If a client
 *   has no scheduled post for the day, the token expires uncovered.
 *   Next publish → token already expired → 401 → fallback path tries
 *   to refresh but if anything goes wrong (TikTok 5xx, network blip)
 *   we have to email the client.
 * - Proactive refresh runs every hour regardless of publish activity.
 *   Token never goes stale.
 *
 * Founder ask 2026-06-06: "tiktok a ete reconnecte par contre attention
 * on doit essayer de garder tiktok connecter avec refresh au besoin et
 * publication avant expiration journalier pour refresh car tu m'a dis
 * que le token etait valide 1an on essaie de pas faire reconnecter le
 * client tout les jours quand meme".
 *
 * Auth: CRON_SECRET. Scheduled hourly from worker scheduler.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { refreshTikTokToken } from '@/lib/tiktok';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) {
    return NextResponse.json({ ok: false, error: 'TIKTOK_CLIENT_KEY/SECRET not configured' }, { status: 500 });
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Pick clients whose token expires in the next 2 hours AND who still
  // have a refresh_token. Refresh well before expiry so a tiktok api
  // hiccup leaves us time to retry on the next hourly tick.
  const in2h = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
  const { data: clients } = await sb
    .from('profiles')
    .select('id, email, tiktok_username, tiktok_refresh_token, tiktok_token_expiry')
    .not('tiktok_refresh_token', 'is', null)
    .not('tiktok_token_expiry', 'is', null)
    .lte('tiktok_token_expiry', in2h);

  if (!clients || clients.length === 0) {
    return NextResponse.json({ ok: true, scanned: 0, refreshed: 0 });
  }

  const results: any[] = [];
  let refreshed = 0;
  let failed = 0;

  for (const c of clients as any[]) {
    try {
      const r = await refreshTikTokToken(c.tiktok_refresh_token, clientKey, clientSecret);
      const newExpiry = new Date(Date.now() + (r.expires_in || 86400) * 1000).toISOString();
      await sb
        .from('profiles')
        .update({
          tiktok_access_token: r.access_token,
          tiktok_refresh_token: r.refresh_token || c.tiktok_refresh_token,
          tiktok_token_expiry: newExpiry,
        })
        .eq('id', c.id);
      refreshed++;
      results.push({ user_id: c.id, email: c.email, status: 'refreshed', new_expiry: newExpiry });
      console.log(`[tiktok-token-refresh] ✅ ${c.email} (${c.id}) — new expiry ${newExpiry}`);
    } catch (e: any) {
      failed++;
      const errMsg = (e?.message || 'unknown').substring(0, 200);
      results.push({ user_id: c.id, email: c.email, status: 'failed', error: errMsg });
      console.warn(`[tiktok-token-refresh] ❌ ${c.email}:`, errMsg);
      // Log the failure so the digest / lifecycle cron can email the
      // client to reconnect (refresh_token may have been revoked).
      try {
        await sb.from('agent_logs').insert({
          agent: 'content',
          action: 'tiktok_token_refresh_failed',
          status: 'error',
          user_id: c.id,
          data: { error: errMsg, source: 'proactive_cron' },
          error_message: errMsg,
          created_at: new Date().toISOString(),
        });
      } catch { /* logging best-effort */ }
    }
  }

  return NextResponse.json({ ok: true, scanned: clients.length, refreshed, failed, results: results.slice(0, 30) });
}
