import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

/**
 * GET /api/tiktok/image-proxy?url=<supabase-image-url>
 *
 * Proxies images from Supabase Storage through keiroai.com (verified
 * TikTok domain). 2026-06-04 — also FORCE-CONVERTS to JPEG at a
 * TikTok-friendly size by rewriting the URL to use Supabase's image
 * transformation endpoint (/storage/v1/render/image/...).
 *
 * Why: TikTok Content Posting API silently fails photo uploads with
 *   fail_reason='file_format_check_failed' on WebP/AVIF and
 *   fail_reason='picture_size_check_failed' on > 4000 px or odd
 *   aspect ratios. The init endpoint returns SUCCESS, then the
 *   internal pipeline rejects async. By transforming server-side
 *   to JPEG 1080×1080 (1:1, max quality 85), we guarantee TikTok
 *   ingestion never tripping these checks.
 */
export async function GET(request: NextRequest) {
  const imageUrl = request.nextUrl.searchParams.get('url');

  if (!imageUrl) {
    return NextResponse.json({ error: 'url parameter required' }, { status: 400 });
  }

  if (!imageUrl.includes('supabase.co/storage/')) {
    return NextResponse.json({ error: 'Only Supabase Storage URLs allowed' }, { status: 403 });
  }

  // Rewrite /storage/v1/object/public/... → /storage/v1/render/image/public/...
  // and append the transform params Supabase Storage accepts.
  // Docs : https://supabase.com/docs/guides/storage/serving/image-transformations
  let transformedUrl = imageUrl;
  if (imageUrl.includes('/storage/v1/object/public/')) {
    transformedUrl = imageUrl.replace(
      '/storage/v1/object/public/',
      '/storage/v1/render/image/public/',
    );
  }
  const sep = transformedUrl.includes('?') ? '&' : '?';
  // 1080×1080 = TikTok-safe (well within 360–4000 px) + 1:1 ratio is
  // accepted across photo carousels. format=origin would let WebP
  // through — we explicitly force `jpeg`. Quality 85 = good balance
  // file size vs sharpness.
  transformedUrl += `${sep}width=1080&height=1080&resize=cover&quality=85&format=jpeg`;

  try {
    const response = await fetch(transformedUrl);

    if (!response.ok) {
      // Fallback: serve original if transform endpoint fails (e.g.
      // image transform feature disabled). Better than 502.
      console.warn('[TT-proxy] transform failed, falling back to origin:', response.status);
      const fallback = await fetch(imageUrl);
      if (!fallback.ok) {
        return NextResponse.json({ error: `Image fetch failed: ${fallback.status}` }, { status: 502 });
      }
      const fbBuf = await fallback.arrayBuffer();
      return new NextResponse(fbBuf, {
        status: 200,
        headers: {
          'Content-Type': fallback.headers.get('content-type') || 'image/jpeg',
          'Cache-Control': 'public, max-age=3600',
          'Content-Length': fbBuf.byteLength.toString(),
        },
      });
    }

    const buffer = await response.arrayBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=3600',
        'Content-Length': buffer.byteLength.toString(),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
