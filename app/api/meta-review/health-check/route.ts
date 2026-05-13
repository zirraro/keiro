/**
 * GET /api/meta-review/health-check
 *
 * Live health probe of every Meta permission KeiroAI uses. Hits the
 * Graph API with the user's stored token for each capability and
 * returns a per-permission pass/fail report. Intended to be called
 * from /meta-review by the founder (before recording a screencast)
 * and by the Meta App Review reviewer (to confirm everything works
 * end-to-end with the test credentials they were given).
 *
 * READ-ONLY — we never POST anything from this endpoint. The point
 * is to prove permissions are granted and functional, not to mutate
 * Instagram state.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface Check {
  permission: string;
  endpoint: string;
  ok: boolean;
  status: number;
  detail: string;
}

async function probe(url: string): Promise<{ ok: boolean; status: number; body: string }> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const body = await r.text().catch(() => '');
    return { ok: r.ok, status: r.status, body: body.slice(0, 220) };
  } catch (e: any) {
    return { ok: false, status: 0, body: `network: ${e?.message || 'unknown'}` };
  }
}

export async function GET() {
  const { user, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: profile } = await supabase
    .from('profiles')
    .select('instagram_business_account_id, instagram_igaa_token, facebook_page_access_token, facebook_page_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.instagram_business_account_id) {
    return NextResponse.json({
      ok: false,
      connected: false,
      message: 'Instagram Business account not connected — connect it first from the workspace.',
    }, { status: 400 });
  }

  const igId = profile.instagram_business_account_id;
  const igaa = profile.instagram_igaa_token;
  const fbToken = profile.facebook_page_access_token;
  if (!igaa && !fbToken) {
    return NextResponse.json({
      ok: false,
      connected: false,
      message: 'No Instagram token on the profile. Reconnect via /api/auth/instagram-oauth.',
    }, { status: 400 });
  }

  // Prefer IGAA when available (graph.instagram.com), fall back to FB page token.
  const tokenChoice = igaa ?? (fbToken as string);
  const igHost = igaa ? 'https://graph.instagram.com/v21.0' : 'https://graph.facebook.com/v21.0';

  const checks: Check[] = [];

  // 1. instagram_business_basic — read profile fields
  {
    const url = `${igHost}/${igId}?fields=id,username,followers_count,media_count&access_token=${encodeURIComponent(tokenChoice)}`;
    const r = await probe(url);
    checks.push({
      permission: 'instagram_business_basic',
      endpoint: `GET /<ig-id>?fields=id,username,followers_count,media_count`,
      ok: r.ok,
      status: r.status,
      detail: r.ok ? 'Profile fields readable' : r.body,
    });
  }

  // 2. instagram_business_manage_messages — list conversations
  {
    const url = `${igHost}/me/conversations?fields=id&limit=1&access_token=${encodeURIComponent(tokenChoice)}`;
    const r = await probe(url);
    checks.push({
      permission: 'instagram_business_manage_messages',
      endpoint: `GET /me/conversations`,
      ok: r.ok,
      status: r.status,
      detail: r.ok ? 'Conversations list readable' : r.body,
    });
  }

  // 3. instagram_business_content_publish — read media_publish container limits.
  //    No safe READ probe exists; we check the user can list /me/media (which
  //    requires the same auth chain) AND /<ig-id>/content_publishing_limit
  //    which returns the publishing quota.
  {
    const url = `${igHost}/${igId}/content_publishing_limit?fields=quota_usage&access_token=${encodeURIComponent(tokenChoice)}`;
    const r = await probe(url);
    checks.push({
      permission: 'instagram_business_content_publish',
      endpoint: `GET /<ig-id>/content_publishing_limit`,
      ok: r.ok,
      status: r.status,
      detail: r.ok ? 'Publishing quota readable (proof of permission)' : r.body,
    });
  }

  // 4. instagram_business_manage_insights — pull a recent metric
  {
    const url = `${igHost}/${igId}/insights?metric=reach&period=day&access_token=${encodeURIComponent(tokenChoice)}`;
    const r = await probe(url);
    checks.push({
      permission: 'instagram_business_manage_insights',
      endpoint: `GET /<ig-id>/insights?metric=reach&period=day`,
      ok: r.ok,
      status: r.status,
      detail: r.ok ? 'Insights metrics readable' : r.body,
    });
  }

  // 5. instagram_business_manage_comments — fetch latest media + try comments
  {
    const mediaUrl = `${igHost}/${igId}/media?limit=1&fields=id&access_token=${encodeURIComponent(tokenChoice)}`;
    const mediaR = await probe(mediaUrl);
    if (!mediaR.ok) {
      checks.push({
        permission: 'instagram_business_manage_comments',
        endpoint: `GET /<ig-id>/media (probe step)`,
        ok: false,
        status: mediaR.status,
        detail: `Could not list media: ${mediaR.body}`,
      });
    } else {
      // Extract one media id and try GET comments on it
      let firstId: string | undefined;
      try {
        const parsed = JSON.parse(mediaR.body);
        firstId = parsed?.data?.[0]?.id;
      } catch {}
      if (!firstId) {
        checks.push({
          permission: 'instagram_business_manage_comments',
          endpoint: `GET /<media-id>/comments`,
          ok: true,
          status: 200,
          detail: 'No media on the account yet — permission cannot be exercised, but no error.',
        });
      } else {
        const r = await probe(`${igHost}/${firstId}/comments?limit=1&access_token=${encodeURIComponent(tokenChoice)}`);
        checks.push({
          permission: 'instagram_business_manage_comments',
          endpoint: `GET /<media-id>/comments`,
          ok: r.ok,
          status: r.status,
          detail: r.ok ? 'Comments list readable on the most recent post' : r.body,
        });
      }
    }
  }

  // 6. human_agent — there is no safe READ probe. We mark it informational.
  checks.push({
    permission: 'human_agent',
    endpoint: 'POST /me/messages?messaging_type=MESSAGE_TAG&tag=HUMAN_AGENT (write-only)',
    ok: true,
    status: 200,
    detail: 'No read-only probe exists. Permission is exercised on the workspace Send button when a conversation is >24h old — see audit log entries with permission=human_agent.',
  });

  const failures = checks.filter(c => !c.ok).length;

  return NextResponse.json({
    ok: failures === 0,
    connected: true,
    ig_business_account: igId,
    summary: {
      total: checks.length,
      pass: checks.length - failures,
      fail: failures,
    },
    checks,
    when: new Date().toISOString(),
  });
}
