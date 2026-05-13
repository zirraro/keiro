/**
 * Showcase mirror — replicates posts from the "showcase" account
 * (mrzirraro@gmail.com) into the "metareview" account
 * (mrzirraro+metareview@gmail.com) so the Meta App Review reviewer
 * sees a populated content workspace instead of an empty grid.
 *
 * Strategy:
 *   - Mirror is content_calendar-only (no actual re-publish to social
 *     networks — avoids double posts on real IG accounts).
 *   - Fires after a successful publish to instagram / tiktok / linkedin.
 *   - Idempotent: matches by (user_id, visual_url) so re-running won't
 *     duplicate.
 *   - Silent failure: if anything goes wrong the original publish is
 *     not affected.
 *
 * Toggle:
 *   process.env.SHOWCASE_MIRROR_ENABLED defaults to '1'. Set to '0' to
 *   disable (e.g. after Meta App Review is approved and the mechanism
 *   is no longer needed).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const SHOWCASE_USER_EMAIL = 'mrzirraro@gmail.com';
const METAREVIEW_USER_EMAIL = 'mrzirraro+metareview@gmail.com';
// Hard-coded UUIDs so we don't pay an auth.admin.listUsers() roundtrip
// on every publish. These match the IDs we already confirmed via the
// populate script.
const SHOWCASE_USER_ID = 'd7d3ae4a-c420-40e1-b2c9-b983d960d1fb';
const METAREVIEW_USER_ID = '84ab08f0-f653-4c82-be28-4dd6a65dfbf2';

export interface MirrorablePost {
  platform: 'instagram' | 'tiktok' | 'linkedin';
  format?: string;
  pillar?: string;
  hook?: string;
  caption: string;
  hashtags?: string[];
  visual_url: string;
  visual_description?: string;
}

/**
 * Call this AFTER a successful publish from one of the publish routes.
 * Does nothing if:
 *   - The publisher isn't the showcase account
 *   - The mirror is disabled via env
 *   - The mirror row already exists for the visual_url
 */
export async function mirrorToShowcaseAccount(
  supabase: SupabaseClient,
  publisherUserId: string,
  post: MirrorablePost,
): Promise<{ mirrored: boolean; reason?: string }> {
  if (process.env.SHOWCASE_MIRROR_ENABLED === '0') {
    return { mirrored: false, reason: 'disabled_by_env' };
  }
  if (publisherUserId !== SHOWCASE_USER_ID) {
    return { mirrored: false, reason: 'not_showcase_account' };
  }

  try {
    // Gate: only fire the mirror if the metareview account currently
    // has @keiro_ai (or any IG Business account) connected. Without
    // this, we'd be populating a calendar that the reviewer cannot
    // actually publish from — which is confusing during App Review.
    const { data: metareviewProfile } = await supabase
      .from('profiles')
      .select('instagram_business_account_id, instagram_username')
      .eq('id', METAREVIEW_USER_ID)
      .maybeSingle();

    if (!metareviewProfile?.instagram_business_account_id) {
      return { mirrored: false, reason: 'metareview_ig_not_connected' };
    }

    // If a 'scheduled' row already exists for this visual_url (typical
    // case — populate-metareview-gallery.mjs queued matching slots on
    // both accounts), flip it to 'published' rather than inserting a
    // duplicate. This keeps the metareview content workspace in lock-
    // step with the showcase account: scheduled before, published after.
    const { data: existing } = await supabase
      .from('content_calendar')
      .select('id, status')
      .eq('user_id', METAREVIEW_USER_ID)
      .eq('visual_url', post.visual_url)
      .maybeSingle();

    const now = new Date();

    if (existing) {
      if (existing.status === 'published') {
        return { mirrored: false, reason: 'already_published' };
      }
      const { error } = await supabase
        .from('content_calendar')
        .update({
          status: 'published',
          published_at: now.toISOString(),
        })
        .eq('id', existing.id);
      if (error) {
        console.warn(`[ShowcaseMirror] Update failed for ${METAREVIEW_USER_EMAIL}: ${error.message}`);
        return { mirrored: false, reason: error.message };
      }
      console.log(`[ShowcaseMirror] ✓ Flipped existing scheduled row to published for ${METAREVIEW_USER_EMAIL}`);
      return { mirrored: true };
    }

    // No matching scheduled row — insert a fresh published row.
    const { error } = await supabase.from('content_calendar').insert({
      user_id: METAREVIEW_USER_ID,
      platform: post.platform,
      format: post.format || 'post',
      pillar: post.pillar || null,
      hook: post.hook || null,
      caption: post.caption,
      hashtags: post.hashtags || [],
      visual_url: post.visual_url,
      visual_description: `Mirrored from ${SHOWCASE_USER_EMAIL} publish (showcase mode). ${post.visual_description || ''}`.trim(),
      status: 'published',
      scheduled_date: now.toISOString().split('T')[0],
      published_at: now.toISOString(),
    });

    if (error) {
      console.warn(`[ShowcaseMirror] Insert failed for ${METAREVIEW_USER_EMAIL}: ${error.message}`);
      return { mirrored: false, reason: error.message };
    }

    // Mirror into saved_images so the reviewer sees the asset in the
    // /library gallery too — it's the most-visited surface during the
    // App Review walkthrough.
    try {
      await supabase.from('saved_images').insert({
        user_id: METAREVIEW_USER_ID,
        image_url: post.visual_url,
        title: post.hook?.substring(0, 80) || post.caption.substring(0, 80) || 'Showcase post',
      });
    } catch { /* non-fatal */ }

    console.log(`[ShowcaseMirror] ✓ Inserted new published row for ${METAREVIEW_USER_EMAIL}`);
    return { mirrored: true };
  } catch (e: any) {
    console.warn(`[ShowcaseMirror] Unexpected error: ${e?.message}`);
    return { mirrored: false, reason: e?.message };
  }
}
