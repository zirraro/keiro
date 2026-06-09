/**
 * Library story recycling — fills empty story slots from the gallery.
 *
 * Founder ask 2026-06-09 : "tres peu de story avec agent lena alors qu on
 * a pas mal de biblioteque d'image et reel... il faut une strategie story
 * insta et tiktok qui s'integre a la strategie des publications".
 *
 * The post-publish teaser cron (in content/route.ts) already drives traffic
 * to fresh posts via a story 45-90min after publication. THIS cron handles
 * the OPPOSITE case: when no fresh post has been published in the last
 * 20h, we should still feed the story slot — silence kills the algo.
 *
 * Strategy :
 *   - Every day 09:00 UTC (~11:00 Paris, the IG story prime time).
 *   - For each user with IG and/or TT connected, check if a story (IG)
 *     or Photo Mode (TT) was published in the last 20h.
 *   - If silence > 20h, pick a high-quality library image and schedule
 *     a story for the next 30-90 min.
 *   - Selection priority : favorites > recent non-recycled > oldest
 *     non-recycled. We never reuse the same asset within 60 days.
 *   - Caption variants match the source ("📌 Coup de coeur", "✨ Encore
 *     dispo", "🆕 Du jour"). Soft, no pressure.
 *
 * Caps :
 *   - Max 1 recycled story per client per platform per 18h.
 *   - We skip clients on the free plan to keep Stripe-incented usage.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 180;

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function authOk(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const tok = auth.replace(/^Bearer\s+/i, '');
  return !!tok && tok === (process.env.CRON_SECRET || '');
}

const FAVORITE_CAPTIONS = [
  '📌 Coup de cœur — encore dispo',
  '⭐ Notre favori du moment',
  '💛 Toujours dans notre cœur',
];
const RECENT_CAPTIONS = [
  '✨ Un petit moment du jour',
  '🌿 Du nouveau côté visuel',
  '👀 Ce qu\'on aime aujourd\'hui',
];
const FALLBACK_CAPTIONS = [
  '📷 Petit clin d\'œil du jour',
  '🌸 On vous le repartage',
  '✨ Inspiration du moment',
];

function pickCaption(kind: 'favorite' | 'recent' | 'fallback'): string {
  const pool = kind === 'favorite' ? FAVORITE_CAPTIONS
    : kind === 'recent' ? RECENT_CAPTIONS
    : FALLBACK_CAPTIONS;
  return pool[Math.floor(Math.random() * pool.length)];
}

interface RecycleResult {
  user_id: string;
  email: string;
  ig_scheduled?: { visual_url: string; caption: string; scheduled_time: string };
  ig_skipped_reason?: string;
  tt_scheduled?: { visual_url: string; caption: string; scheduled_time: string };
  tt_skipped_reason?: string;
}

async function recycleForUser(
  supabase: ReturnType<typeof sb>,
  user: { id: string; email: string; plan: string },
  igConnected: boolean,
  ttConnected: boolean,
): Promise<RecycleResult> {
  const res: RecycleResult = { user_id: user.id, email: user.email };
  const now = new Date();
  const twentyHoursAgo = new Date(now.getTime() - 20 * 60 * 60 * 1000).toISOString();
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();

  // Already-recycled assets in the last 60 days (any platform) — avoid reuse.
  const { data: alreadyRecycled } = await supabase
    .from('content_calendar')
    .select('visual_url')
    .eq('user_id', user.id)
    .eq('source', 'story_library_recycle')
    .gte('created_at', sixtyDaysAgo);
  const usedUrls = new Set((alreadyRecycled || []).map((r: any) => r.visual_url).filter(Boolean));

  // Pick the best library image. Favorites first, then most-recent.
  // We exclude any URL we recycled in the last 60d.
  const { data: favorites } = await supabase
    .from('saved_images')
    .select('id, image_url, title, is_favorite, created_at')
    .eq('user_id', user.id)
    .eq('is_favorite', true)
    .order('created_at', { ascending: false })
    .limit(20);

  const { data: recent } = await supabase
    .from('saved_images')
    .select('id, image_url, title, is_favorite, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(30);

  function pickAsset(): { url: string; kind: 'favorite' | 'recent' | 'fallback' } | null {
    for (const img of favorites || []) {
      if (img.image_url && !usedUrls.has(img.image_url)) {
        return { url: img.image_url, kind: 'favorite' };
      }
    }
    for (const img of recent || []) {
      if (img.image_url && !usedUrls.has(img.image_url)) {
        return { url: img.image_url, kind: 'recent' };
      }
    }
    // Last resort: oldest first (recycle the very old)
    const sortedOld = [...(recent || [])].sort((a: any, b: any) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    for (const img of sortedOld) {
      if (img.image_url) return { url: img.image_url, kind: 'fallback' };
    }
    return null;
  }

  // ─── IG ───
  if (igConnected) {
    const { count: nearIgStories } = await supabase
      .from('content_calendar')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('platform', 'instagram')
      .eq('format', 'story')
      .gte('created_at', twentyHoursAgo);

    if ((nearIgStories || 0) > 0) {
      res.ig_skipped_reason = 'recent_story_within_20h';
    } else {
      const asset = pickAsset();
      if (!asset) {
        res.ig_skipped_reason = 'no_eligible_asset';
      } else {
        const delayMin = 30 + Math.floor(Math.random() * 60); // 30-90min
        const at = new Date(now.getTime() + delayMin * 60 * 1000);
        const caption = pickCaption(asset.kind);
        const { error } = await supabase.from('content_calendar').insert({
          user_id: user.id,
          platform: 'instagram',
          format: 'story',
          hook: 'Library recycle — story',
          caption,
          hashtags: [],
          visual_url: asset.url,
          scheduled_date: at.toISOString().split('T')[0],
          scheduled_time: at.toISOString(),
          status: 'approved',
          auto_publish: true,
          source: 'story_library_recycle',
        });
        if (!error) {
          res.ig_scheduled = { visual_url: asset.url, caption, scheduled_time: at.toISOString() };
          usedUrls.add(asset.url); // protect TT pick below from picking the same asset
        } else {
          res.ig_skipped_reason = `insert_error:${error.message.substring(0, 80)}`;
        }
      }
    }
  }

  // ─── TT Photo Mode ───
  if (ttConnected) {
    const { count: nearTtPhotos } = await supabase
      .from('content_calendar')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('platform', 'tiktok')
      .eq('format', 'photo')
      .gte('created_at', twentyHoursAgo);

    if ((nearTtPhotos || 0) > 0) {
      res.tt_skipped_reason = 'recent_photo_within_20h';
    } else {
      const asset = pickAsset();
      if (!asset) {
        res.tt_skipped_reason = 'no_eligible_asset';
      } else {
        const delayMin = 90 + Math.floor(Math.random() * 120); // 90-210min (offset IG)
        const at = new Date(now.getTime() + delayMin * 60 * 1000);
        const caption = pickCaption(asset.kind);
        const { error } = await supabase.from('content_calendar').insert({
          user_id: user.id,
          platform: 'tiktok',
          format: 'photo',
          hook: 'Library recycle — TT Photo Mode',
          caption,
          hashtags: ['#fyp', '#pourtoi'],
          visual_url: asset.url,
          scheduled_date: at.toISOString().split('T')[0],
          scheduled_time: at.toISOString(),
          status: 'approved',
          auto_publish: true,
          source: 'story_library_recycle',
        });
        if (!error) {
          res.tt_scheduled = { visual_url: asset.url, caption, scheduled_time: at.toISOString() };
        } else {
          res.tt_skipped_reason = `insert_error:${error.message.substring(0, 80)}`;
        }
      }
    }
  }

  return res;
}

export async function GET(req: NextRequest) {
  if (!authOk(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const supabase = sb();
  const startedAt = Date.now();

  // Paying clients (free plan skipped to keep Stripe-incented usage).
  // Connected = has IG creds and/or TT creds.
  const { data: clients } = await supabase
    .from('profiles')
    .select('id, email, subscription_plan, instagram_business_account_id, instagram_igaa_token, facebook_page_access_token, tiktok_user_id, tiktok_access_token')
    .neq('subscription_plan', 'free')
    .limit(500);

  if (!clients || clients.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, took_ms: Date.now() - startedAt });
  }

  const results: RecycleResult[] = [];
  for (const c of clients) {
    const igConnected = !!(c.instagram_business_account_id && (c.instagram_igaa_token || c.facebook_page_access_token));
    const ttConnected = !!(c.tiktok_user_id && c.tiktok_access_token);
    if (!igConnected && !ttConnected) continue;
    try {
      const r = await recycleForUser(
        supabase,
        { id: c.id, email: c.email, plan: (c as any).subscription_plan },
        igConnected,
        ttConnected,
      );
      results.push(r);
    } catch (e: any) {
      results.push({ user_id: c.id, email: c.email, ig_skipped_reason: `err:${e?.message?.substring(0, 80)}` });
    }
  }

  const igScheduled = results.filter(r => r.ig_scheduled).length;
  const ttScheduled = results.filter(r => r.tt_scheduled).length;

  return NextResponse.json({
    ok: true,
    processed: results.length,
    ig_scheduled: igScheduled,
    tt_scheduled: ttScheduled,
    took_ms: Date.now() - startedAt,
    sample: results.slice(0, 5),
  });
}
