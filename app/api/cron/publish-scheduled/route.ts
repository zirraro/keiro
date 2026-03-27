import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * GET /api/cron/publish-scheduled
 * Auto-publish scheduled posts that are due.
 * Called via scheduler every 15 minutes.
 * Publishes posts where scheduled_for <= now AND status = 'scheduled'.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const now = new Date().toISOString();

  // Fetch all scheduled posts that are due
  const { data: duePosts, error: fetchError } = await supabase
    .from('scheduled_posts')
    .select(`
      *,
      saved_images (
        id,
        image_url,
        thumbnail_url,
        title
      )
    `)
    .eq('status', 'scheduled')
    .lte('scheduled_for', now)
    .order('scheduled_for', { ascending: true })
    .limit(10); // Process max 10 at a time

  if (fetchError) {
    console.error('[PublishScheduled] Error fetching due posts:', fetchError);
    return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
  }

  if (!duePosts || duePosts.length === 0) {
    console.log('[PublishScheduled] No posts due for publication');
    return NextResponse.json({ ok: true, published: 0, message: 'No posts due' });
  }

  console.log(`[PublishScheduled] Found ${duePosts.length} posts due for publication`);

  const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || null;
  const baseUrl = siteUrl || vercelUrl || 'http://localhost:3000';

  const results: { id: string; platform: string; ok: boolean; error?: string }[] = [];

  for (const post of duePosts) {
    try {
      const imageUrl = post.saved_images?.image_url;
      if (!imageUrl) {
        console.warn(`[PublishScheduled] Post ${post.id}: no image URL, skipping`);
        await supabase.from('scheduled_posts').update({ status: 'failed', error_message: 'Image introuvable' }).eq('id', post.id);
        results.push({ id: post.id, platform: post.platform, ok: false, error: 'No image URL' });
        continue;
      }

      // ── Dedup check: prevent publishing the same image twice ──
      const since7d = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: existingPub } = await supabase
        .from('scheduled_posts')
        .select('id, post_url')
        .eq('status', 'published')
        .eq('platform', post.platform)
        .eq('saved_image_id', post.saved_image_id)
        .gte('published_at', since7d)
        .neq('id', post.id)
        .limit(1);

      if (existingPub && existingPub.length > 0) {
        console.warn(`[PublishScheduled] DUPLICATE: image ${post.saved_image_id} already published as ${existingPub[0].id}`);
        await supabase.from('scheduled_posts').update({
          status: 'failed',
          error_message: `Doublon: cette image a déjà été publiée (${existingPub[0].id})`,
        }).eq('id', post.id);
        results.push({ id: post.id, platform: post.platform, ok: false, error: 'Duplicate image' });
        continue;
      }

      // Get user tokens for this platform
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', post.user_id)
        .single();

      if (!profile) {
        await supabase.from('scheduled_posts').update({ status: 'failed', error_message: 'Profil introuvable' }).eq('id', post.id);
        results.push({ id: post.id, platform: post.platform, ok: false, error: 'No profile' });
        continue;
      }

      let publishResult: { ok: boolean; error?: string } = { ok: false };

      if (post.platform === 'instagram') {
        if (!profile.instagram_access_token) {
          await supabase.from('scheduled_posts').update({ status: 'failed', error_message: 'Instagram non connecté' }).eq('id', post.id);
          results.push({ id: post.id, platform: post.platform, ok: false, error: 'Instagram not connected' });
          continue;
        }

        // Publish to Instagram via internal API
        const res = await fetch(`${baseUrl}/api/library/instagram/publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cronSecret}`,
            'x-user-id': post.user_id,
          },
          body: JSON.stringify({
            imageUrl,
            caption: post.caption || '',
            hashtags: post.hashtags || [],
            mediaType: 'image',
            // Pass user context for auth
            _scheduledPublish: true,
            _userId: post.user_id,
          })
        });
        publishResult = await res.json();

      } else if (post.platform === 'tiktok') {
        if (!profile.tiktok_access_token) {
          await supabase.from('scheduled_posts').update({ status: 'failed', error_message: 'TikTok non connecté' }).eq('id', post.id);
          results.push({ id: post.id, platform: post.platform, ok: false, error: 'TikTok not connected' });
          continue;
        }

        const res = await fetch(`${baseUrl}/api/library/tiktok/publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cronSecret}`,
            'x-user-id': post.user_id,
          },
          body: JSON.stringify({
            videoUrl: imageUrl,
            caption: post.caption || '',
            hashtags: post.hashtags || [],
            privacyLevel: 'SELF_ONLY',
            disableComment: false,
            disableDuet: false,
            disableStitch: false,
            _scheduledPublish: true,
            _userId: post.user_id,
          })
        });
        publishResult = await res.json();
      } else if (post.platform === 'linkedin') {
        if (!profile.linkedin_access_token) {
          await supabase.from('scheduled_posts').update({ status: 'failed', error_message: 'LinkedIn non connecté' }).eq('id', post.id);
          results.push({ id: post.id, platform: post.platform, ok: false, error: 'LinkedIn not connected' });
          continue;
        }

        const res = await fetch(`${baseUrl}/api/library/linkedin/publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cronSecret}`,
            'x-user-id': post.user_id,
          },
          body: JSON.stringify({
            imageUrl: imageUrl || undefined,
            caption: post.caption || '',
            hashtags: post.hashtags || [],
            mediaType: imageUrl ? 'image' : 'text',
            _scheduledPublish: true,
            _userId: post.user_id,
          })
        });
        publishResult = await res.json();
      } else {
        console.log(`[PublishScheduled] Platform ${post.platform} not yet supported for auto-publish`);
        results.push({ id: post.id, platform: post.platform, ok: false, error: 'Platform not supported yet' });
        continue;
      }

      if (publishResult.ok) {
        await supabase.from('scheduled_posts').update({
          status: 'published',
          published_at: new Date().toISOString()
        }).eq('id', post.id);
        console.log(`[PublishScheduled] ✅ Post ${post.id} published to ${post.platform}`);
        results.push({ id: post.id, platform: post.platform, ok: true });
      } else {
        await supabase.from('scheduled_posts').update({
          status: 'failed',
          error_message: publishResult.error || 'Erreur inconnue'
        }).eq('id', post.id);
        console.error(`[PublishScheduled] ❌ Post ${post.id} failed:`, publishResult.error);
        results.push({ id: post.id, platform: post.platform, ok: false, error: publishResult.error });
      }

    } catch (err: any) {
      console.error(`[PublishScheduled] ❌ Post ${post.id} error:`, err.message);
      await supabase.from('scheduled_posts').update({
        status: 'failed',
        error_message: err.message
      }).eq('id', post.id);
      results.push({ id: post.id, platform: post.platform, ok: false, error: err.message });
    }
  }

  const succeeded = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;

  console.log(`[PublishScheduled] Done: ${succeeded} published, ${failed} failed`);

  return NextResponse.json({
    ok: true,
    published: succeeded,
    failed,
    results
  });
}
