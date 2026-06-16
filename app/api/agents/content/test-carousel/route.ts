import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { initTikTokPhotoUpload, refreshTikTokToken } from '@/lib/tiktok';
import { searchPixabayImages } from '@/lib/stock/pixabay';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/agents/content/test-carousel  (CRON only)
 * Experiment: post 5 REAL Pixabay nature photos as a TikTok photo carousel
 * (NO AI, NO i2v) to test whether TikTok distributes real static imagery
 * (isolates the "AI content suppression" hypothesis vs account cold-start).
 * Body: { userId?, query? }
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const userId = body.userId || 'd7d3ae4a-c420-40e1-b2c9-b983d960d1fb';
  const query = body.query || 'nature landscape forest';

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: p } = await supabase.from('profiles')
    .select('tiktok_access_token, tiktok_refresh_token, tiktok_token_expiry')
    .eq('id', userId).maybeSingle();
  if (!p?.tiktok_access_token) return NextResponse.json({ error: 'tiktok_not_connected' }, { status: 400 });

  // Refresh if expired.
  let accessToken = p.tiktok_access_token;
  const expiry = p.tiktok_token_expiry ? new Date(p.tiktok_token_expiry) : null;
  if ((!expiry || expiry <= new Date()) && p.tiktok_refresh_token) {
    try {
      const ck = process.env.TIKTOK_CLIENT_KEY || process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY;
      const cs = process.env.TIKTOK_CLIENT_SECRET;
      if (ck && cs) {
        const r = await refreshTikTokToken(p.tiktok_refresh_token, ck, cs);
        accessToken = r.access_token;
        await supabase.from('profiles').update({
          tiktok_access_token: r.access_token,
          tiktok_refresh_token: r.refresh_token,
          tiktok_token_expiry: new Date(Date.now() + (r.expires_in || 86400) * 1000).toISOString(),
        }).eq('id', userId);
      }
    } catch (e: any) {
      return NextResponse.json({ error: 'token_refresh_failed', detail: e?.message }, { status: 400 });
    }
  }

  const imgs = await searchPixabayImages({ query, count: 8, orientation: 'vertical' });
  const pixUrls = imgs.slice(0, 5).map(i => i.largeImageURL).filter(Boolean);
  if (pixUrls.length < 3) return NextResponse.json({ error: 'not_enough_pixabay_images', got: pixUrls.length }, { status: 502 });

  // TikTok PULL_FROM_URL needs images on our VERIFIED domain. Pixabay URLs are
  // rejected → re-host them on Supabase first (same as the working recycle
  // flow: Supabase URLs get proxied through the verified keiroai.com domain).
  const urls: string[] = [];
  for (let i = 0; i < pixUrls.length; i++) {
    try {
      const r = await fetch(pixUrls[i], { signal: AbortSignal.timeout(20000) });
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 3000) continue;
      const objPath = `tiktok-nature-test/${userId}-${Date.now()}-${i}.jpg`;
      const { error: upErr } = await supabase.storage.from('business-assets').upload(objPath, buf, { contentType: 'image/jpeg', upsert: true });
      if (upErr) continue;
      const { data: pub } = supabase.storage.from('business-assets').getPublicUrl(objPath);
      if (pub?.publicUrl) urls.push(pub.publicUrl);
    } catch { /* skip */ }
  }
  if (urls.length < 3) return NextResponse.json({ error: 'rehost_failed', got: urls.length }, { status: 502 });

  const title = 'La nature comme un instant suspendu 🌿';
  const caption = `Quelques respirations au cœur de la nature 🌿\n\nParfois il suffit de ralentir pour voir la beauté autour de soi.\n\nLaquelle te parle le plus ? 👇\n\n#nature #paysage #naturelovers #beautédelanature #pourtoi #fyp #calme #évasion`;

  try {
    const res = await initTikTokPhotoUpload(accessToken, urls, title, caption, { privacyLevel: 'PUBLIC_TO_EVERYONE' });
    return NextResponse.json({ ok: true, publish_id: res.publish_id, is_draft: res.is_draft, images: urls.length, query });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'publish_failed', images: urls.length }, { status: 500 });
  }
}
