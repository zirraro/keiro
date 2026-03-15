import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

/**
 * GET /api/tiktok/image-proxy?url=<supabase-image-url>
 *
 * Proxies images from Supabase Storage through keiroai.com domain.
 * Required because TikTok Content Posting API (photo) only accepts
 * images from verified domains, and keiroai.com is our verified domain.
 */
export async function GET(request: NextRequest) {
  const imageUrl = request.nextUrl.searchParams.get('url');

  if (!imageUrl) {
    return NextResponse.json({ error: 'url parameter required' }, { status: 400 });
  }

  // Only allow Supabase Storage URLs for security
  if (!imageUrl.includes('supabase.co/storage/')) {
    return NextResponse.json({ error: 'Only Supabase Storage URLs allowed' }, { status: 403 });
  }

  try {
    const response = await fetch(imageUrl);

    if (!response.ok) {
      return NextResponse.json({ error: `Failed to fetch image: ${response.status}` }, { status: 502 });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = await response.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'Content-Length': buffer.byteLength.toString(),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
