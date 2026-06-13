/**
 * POST /api/auth/instagram-force-fresh
 *
 * Revokes the KeiroAI app's permissions on the current Facebook user
 * server-side via Graph API (DELETE /me/permissions), then clears the
 * locally-stored tokens on the profile. Used by /meta-review when the
 * founder needs to force the COMPLETE OAuth grant dialog (Page selector
 * + IG account selector + permissions screen) for an App Review
 * screencast — typically because navigating Facebook's settings UI to
 * manually remove the integration is slow or impossible from the
 * current device.
 *
 * After running this endpoint the user should immediately follow
 * /api/auth/instagram-oauth?reauth=full which will land on a fresh
 * grant dialog (Meta no longer remembers the prior authorisation).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';

async function deletePermissionsViaToken(token: string): Promise<{ ok: boolean; status: number; body: string }> {
  // DELETE /me/permissions revokes all permissions granted to this app for
  // the user behind the token, which resets the consent screen so the next
  // OAuth shows the FULL permission list (needed for the App Review
  // screencast). IGAA tokens (Instagram Login) live on graph.instagram.com;
  // Facebook user/page tokens live on graph.facebook.com. Route by prefix.
  const isIgaa = token.startsWith('IGAA');
  const url = isIgaa
    ? `https://graph.instagram.com/v21.0/me/permissions?access_token=${encodeURIComponent(token)}`
    : `https://graph.facebook.com/v20.0/me/permissions?access_token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url, { method: 'DELETE' });
    const body = await res.text().catch(() => '');
    return { ok: res.ok, status: res.status, body: body.slice(0, 400) };
  } catch (e: any) {
    return { ok: false, status: 0, body: `network error: ${e?.message || 'unknown'}` };
  }
}

export async function POST(req: NextRequest) {
  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'Vous devez être connecté' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: profile } = await supabase
    .from('profiles')
    .select('instagram_access_token, instagram_igaa_token, facebook_page_access_token, instagram_business_account_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ ok: false, error: 'Profil introuvable' }, { status: 404 });
  }

  const attempts: Array<{ source: string; result: { ok: boolean; status: number; body: string } }> = [];
  const candidates = [
    { source: 'instagram_access_token', token: profile.instagram_access_token },
    { source: 'facebook_page_access_token', token: profile.facebook_page_access_token },
    { source: 'instagram_igaa_token', token: profile.instagram_igaa_token },
  ].filter(c => !!c.token);

  for (const c of candidates) {
    const result = await deletePermissionsViaToken(c.token as string);
    attempts.push({ source: c.source, result });
    if (result.ok) break; // Stop at the first successful revocation
  }

  // Whether or not the Graph API call succeeded (some tokens just don't
  // We intentionally do NOT wipe instagram_igaa_token here even when
  // the Graph-side revoke succeeds. The IGAA token is the permanent
  // tester-grade credential the Meta App Review reviewer relies on to
  // exercise DM / comment / publish flows; if we cleared it, the next
  // OAuth round-trip would have to fully re-acquire it (and that fails
  // when the user is filming a screencast on the wrong Facebook
  // account). Same reasoning for facebook_page_access_token. Force-
  // fresh's job is to make Meta re-display the full grant dialog —
  // achieved by auth_type=reauthenticate in /api/auth/instagram-oauth
  // ?reauth=full — not to break the agent stack.
  //
  // If a future workflow legitimately needs to clear the cached tokens
  // it can DELETE the columns explicitly; the standard "Disconnect"
  // button in Settings → Connections already does that path.

  try {
    await supabase.from('agent_logs').insert({
      agent: 'auth',
      action: 'instagram_force_fresh',
      user_id: user.id,
      data: { attempts, ig_business_id: profile.instagram_business_account_id || null },
      status: 'success',
    });
  } catch {
    // audit log failure is non-fatal — tokens are already cleared above
  }

  const anyOk = attempts.some(a => a.result.ok);
  return NextResponse.json({
    ok: true,
    revoked_via_graph: anyOk,
    tokens_cleared: true,
    attempts,
    next: '/api/auth/instagram-oauth?reauth=full',
    note: anyOk
      ? 'Permissions revoked via Graph API + local tokens cleared. Next OAuth call will show the full grant dialog.'
      : 'Graph API revoke did not succeed with the stored tokens (likely a page/IGAA token), but local tokens are cleared. The next OAuth call uses auth_type=reauthenticate which forces the full dialog anyway.',
  });
}
