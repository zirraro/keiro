import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/tiktok/image-proxy?url=<supabase-image-url>
 *
 * Proxies + RE-ENCODES images for TikTok Content Posting API.
 *
 * 2026-06-04 — Sharp-based re-encode. Earlier we tried Supabase's
 * /render/image/ endpoint to do this server-side but it returns 400
 * (image transformations are a paid plan feature and not enabled).
 * So we fetch the source, decode with Sharp, normalise to a strictly
 * TikTok-safe JPEG, and stream the bytes back.
 *
 * Why : TikTok silently fails photo uploads with
 *   - file_format_check_failed  → WebP / AVIF / PNG-with-alpha
 *   - picture_size_check_failed → odd ratio or > 4000 px
 *
 * Output guarantees :
 *   - Format JPEG (Content-Type: image/jpeg)
 *   - Max edge 1440 px (well under 4000 cap, plenty for IG/TikTok feed)
 *   - Aspect ratio stays original up to TikTok's 1:1 to 9:16 window;
 *     if the source is wider than 1:1 (16:9 etc.) we crop to 1:1 with
 *     `fit: cover` so it lands square (TikTok feed is portrait, square
 *     renders fine).
 */
export async function GET(request: NextRequest) {
  const imageUrl = request.nextUrl.searchParams.get('url');

  if (!imageUrl) {
    return NextResponse.json({ error: 'url parameter required' }, { status: 400 });
  }

  if (!imageUrl.includes('supabase.co/storage/')) {
    return NextResponse.json({ error: 'Only Supabase Storage URLs allowed' }, { status: 403 });
  }

  try {
    const fetchRes = await fetch(imageUrl, { cache: 'no-store' });
    if (!fetchRes.ok) {
      return NextResponse.json({ error: `Image fetch failed: ${fetchRes.status}` }, { status: 502 });
    }
    const sourceBuffer = Buffer.from(await fetchRes.arrayBuffer());

    // Probe source metadata (for debug headers only)
    const meta = await sharp(sourceBuffer).metadata();
    const srcW = meta.width || 0;
    const srcH = meta.height || 0;

    // 2026-06-04 — Force fixed 1440×1440 square on EVERY image.
    // TikTok requires all photos in a carousel to share the same
    // aspect ratio. The previous logic kept the source ratio when
    // valid, which meant 6 different source images = 6 different
    // ratios = TikTok picture_size_check_failed on the whole carousel.
    // Square (1:1) is the safest choice: well inside the 360-4000 px
    // window, accepted as both standalone and carousel, no orientation
    // ambiguity.
    const targetW = 1440;
    const targetH = 1440;

    const jpegBuffer = await sharp(sourceBuffer)
      .rotate() // auto-orient using EXIF
      .resize(targetW, targetH, { fit: 'cover', position: 'centre' })
      .flatten({ background: { r: 255, g: 255, b: 255 } }) // strip alpha → white
      .jpeg({ quality: 86, progressive: false, mozjpeg: true, chromaSubsampling: '4:2:0' })
      .toBuffer();

    return new NextResponse(new Uint8Array(jpegBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=3600',
        'Content-Length': jpegBuffer.byteLength.toString(),
        'X-Source-Format': meta.format || 'unknown',
        'X-Source-Dimensions': `${srcW}x${srcH}`,
        'X-Output-Dimensions': `${targetW}x${targetH}`,
      },
    });
  } catch (error: any) {
    console.error('[tiktok-image-proxy] Failed:', error?.message);
    return NextResponse.json({ error: error.message || 'transform failed' }, { status: 500 });
  }
}
