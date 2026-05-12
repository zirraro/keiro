/**
 * POST /api/instagram/refresh-profile
 *
 * Re-fetches the Instagram Business profile (handle, profile picture,
 * followers count, media count) from the Graph API and caches it on
 * the user's profile row. Called by the workspace when it detects the
 * connection card is showing zeroes despite the account being marked
 * as connected — the OAuth callback enrichment can fail silently
 * (rate limit, expired page token, network blip) and we don't want
 * the user to stare at "0 followers · 0 posts" until they reconnect.
 *
 * The call uses whatever token we have stored, in priority order:
 *   1. instagram_igaa_token (graph.instagram.com — most reliable)
 *   2. facebook_page_access_token (graph.facebook.com)
 *   3. instagram_access_token (legacy user token, last resort)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';

async function fetchProfile(host: 'instagram' | 'facebook', igId: string, token: string) {
  const base = host === 'instagram' ? 'https://graph.instagram.com/v21.0' : 'https://graph.facebook.com/v21.0';
  const url = `${base}/${igId}?fields=username,profile_picture_url,followers_count,media_count&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { ok: false as const, status: res.status, body: body.slice(0, 200) };
  }
  const data = await res.json();
  return {
    ok: true as const,
    username: data.username as string | undefined,
    profile_picture_url: data.profile_picture_url as string | undefined,
    followers_count: typeof data.followers_count === 'number' ? data.followers_count : undefined,
    media_count: typeof data.media_count === 'number' ? data.media_count : undefined,
  };
}

export async function POST() {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ ok: false, error: 'Vous devez être connecté' }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: profile } = await supabase
    .from('profiles')
    .select('instagram_business_account_id, instagram_igaa_token, facebook_page_access_token, instagram_access_token')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.instagram_business_account_id) {
    return NextResponse.json({ ok: false, error: 'Instagram non connecté' }, { status: 400 });
  }

  const igId = profile.instagram_business_account_id;
  const attempts: Array<{ source: string; ok: boolean; status?: number; body?: string }> = [];
  let result: Awaited<ReturnType<typeof fetchProfile>> | null = null;

  if (profile.instagram_igaa_token) {
    const r = await fetchProfile('instagram', igId, profile.instagram_igaa_token);
    attempts.push({ source: 'igaa', ok: r.ok, ...(r.ok ? {} : { status: r.status, body: r.body }) });
    if (r.ok) result = r;
  }
  if (!result && profile.facebook_page_access_token) {
    const r = await fetchProfile('facebook', igId, profile.facebook_page_access_token);
    attempts.push({ source: 'fb_page', ok: r.ok, ...(r.ok ? {} : { status: r.status, body: r.body }) });
    if (r.ok) result = r;
  }
  if (!result && profile.instagram_access_token) {
    const r = await fetchProfile('instagram', igId, profile.instagram_access_token);
    attempts.push({ source: 'ig_user', ok: r.ok, ...(r.ok ? {} : { status: r.status, body: r.body }) });
    if (r.ok) result = r;
  }

  if (!result || !result.ok) {
    return NextResponse.json({ ok: false, error: 'IG Graph API a refusé tous les tokens stockés', attempts }, { status: 502 });
  }

  const patch: Record<string, any> = { instagram_last_sync_at: new Date().toISOString() };
  if (result.username) patch.instagram_username = result.username;
  if (result.profile_picture_url) patch.instagram_profile_picture_url = result.profile_picture_url;
  if (typeof result.followers_count === 'number') patch.instagram_followers_count = result.followers_count;
  if (typeof result.media_count === 'number') patch.instagram_media_count = result.media_count;

  await supabase.from('profiles').update(patch).eq('id', user.id);

  return NextResponse.json({
    ok: true,
    instagram_username: result.username,
    instagram_followers_count: result.followers_count,
    instagram_media_count: result.media_count,
    instagram_profile_picture_url: result.profile_picture_url,
    attempts,
  });
}
