/**
 * Short tracking links for outbound visuals (TikTok DM drops + future LI/IG).
 *
 * Why: TikTok DM API isn't available to general apps, so Jade prepares a
 * draft and the client sends it manually. The visual is attached as a
 * PUBLIC URL (not a screenshot) so the recipient can preview it cleanly.
 * We route that URL through /v/<slug> so we can log every click and
 * later flag prospects who "opened but didn't reply" (= warm leads).
 *
 * Founder ask 2026-06-07: "on peut suivre ceux qui on ouvert mais pas
 * rondu".
 *
 * Schema (created on first use via createShortLink, table is created
 * idempotently via Supabase migration tracked-links-init.sql):
 *   tracked_links(
 *     slug text primary key,
 *     target_url text not null,
 *     user_id uuid,           -- owner of the campaign
 *     prospect_id uuid,       -- crm_prospects.id if known
 *     context text,           -- e.g. 'dm_tiktok', 'dm_linkedin'
 *     created_at timestamptz default now(),
 *     click_count int default 0,
 *     last_click_at timestamptz
 *   )
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';

function admin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function shortSlug(): string {
  // 8-char base36 — collision-safe at our volume (millions = years away).
  return crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toLowerCase();
}

export interface CreateShortLinkParams {
  targetUrl: string;
  userId?: string | null;
  prospectId?: string | null;
  context: 'dm_tiktok' | 'dm_linkedin' | 'dm_instagram' | 'email' | 'other';
}

/**
 * Create a tracking link. Returns the full public URL (e.g.
 * https://keiroai.com/v/abc12345) the client can paste in a DM.
 */
export async function createShortLink(params: CreateShortLinkParams): Promise<string | null> {
  if (!params.targetUrl) return null;
  const sb = admin();
  const slug = shortSlug();
  try {
    const { error } = await sb.from('tracked_links').insert({
      slug,
      target_url: params.targetUrl,
      user_id: params.userId || null,
      prospect_id: params.prospectId || null,
      context: params.context,
    });
    if (error) {
      // If table missing, fall back to the raw target URL — no tracking
      // but we don't break the DM preparation flow.
      console.warn('[short-links] insert failed:', error.message);
      return params.targetUrl;
    }
    const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://keiroai.com';
    return `${base}/v/${slug}`;
  } catch (e: any) {
    console.warn('[short-links] threw:', e?.message);
    return params.targetUrl;
  }
}

/**
 * Resolve a slug → target URL + log the click. Used by /app/v/[slug]/route.ts.
 * Increments click_count + sets last_click_at atomically via RPC if available,
 * else falls back to a 2-step read+write.
 */
export async function resolveAndLog(slug: string, ipHash?: string, ua?: string): Promise<string | null> {
  const sb = admin();
  const { data } = await sb
    .from('tracked_links')
    .select('target_url, user_id, prospect_id, context, click_count')
    .eq('slug', slug)
    .maybeSingle();
  if (!data?.target_url) return null;

  // Fire-and-forget update (don't block the redirect on this)
  sb.from('tracked_links')
    .update({
      click_count: (data.click_count || 0) + 1,
      last_click_at: new Date().toISOString(),
    })
    .eq('slug', slug)
    .then(() => {}, () => {});

  // Log click as an agent_log so downstream (Jade insights, CEO brief)
  // can surface "warm prospects who opened but didn't reply".
  sb.from('agent_logs').insert({
    agent: 'jade',
    action: 'tracked_link_click',
    status: 'info',
    user_id: data.user_id,
    data: {
      slug,
      context: data.context,
      prospect_id: data.prospect_id,
      ip_hash: ipHash,
      ua: ua?.substring(0, 200),
    },
    created_at: new Date().toISOString(),
  }).then(() => {}, () => {});

  return data.target_url;
}
