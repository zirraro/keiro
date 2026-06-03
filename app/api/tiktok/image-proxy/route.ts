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

    // Probe source metadata
    const meta = await sharp(sourceBuffer).metadata();
    const srcW = meta.width || 0;
    const srcH = meta.height || 0;
    const srcRatio = srcW > 0 ? srcW / srcH : 1;

    // Decide TikTok-safe target. TikTok accepts 1:1 to 9:16 (= ratio
    // 1.0 down to 0.5625). If source ratio is between 1.0 and 0.5625,
    // keep it but cap on the long edge. Else crop to 1:1.
    let targetW: number;
    let targetH: number;
    if (srcRatio >= 0.5625 && srcRatio <= 1.0) {
      // Already in vertical range — scale longest edge to 1440
      const maxEdge = 1440;
      if (srcH >= srcW) {
        targetH = Math.min(maxEdge, srcH);
        targetW = Math.round(targetH * srcRatio);
      } else {
        targetW = Math.min(maxEdge, srcW);
        targetH = Math.round(targetW / srcRatio);
      }
    } else {
      // Source is landscape or too narrow — force 1:1 crop
      targetW = 1080;
      targetH = 1080;
    }

    const jpegBuffer = await sharp(sourceBuffer)
      .rotate() // auto-orient using EXIF
      .resize(targetW, targetH, { fit: 'cover', position: 'centre' })
      .flatten({ background: { r: 255, g: 255, b: 255 } }) // strip alpha
      .jpeg({ quality: 86, progressive: false, mozjpeg: true })
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
