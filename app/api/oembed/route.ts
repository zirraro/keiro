import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

/**
 * GET /api/oembed?url=https://www.instagram.com/p/xxx/
 * oEmbed endpoint for displaying Instagram post previews.
 * Required for Meta App Review (Meta oEmbed Read permission).
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');

  if (!url) {
    return NextResponse.json({
      version: '1.0',
      type: 'rich',
      provider_name: 'KeiroAI',
      provider_url: 'https://keiroai.com',
      title: 'KeiroAI — Marketing Intelligence',
      description: 'Plateforme SaaS de marketing IA pour commerces locaux',
      thumbnail_url: 'https://keiroai.com/keiro-logo.png',
      html: '<div style="max-width:600px;padding:20px;font-family:Arial;"><h3>KeiroAI</h3><p>Marketing Intelligence pour commerces locaux</p></div>',
      width: 600,
      height: 400,
    });
  }

  // Fetch Instagram oEmbed via Meta API
  try {
    const oembedUrl = `https://graph.facebook.com/v25.0/instagram_oembed?url=${encodeURIComponent(url)}&access_token=${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;
    const res = await fetch(oembedUrl);

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }

    // Fallback: return basic oEmbed
    return NextResponse.json({
      version: '1.0',
      type: 'rich',
      provider_name: 'Instagram',
      provider_url: 'https://www.instagram.com',
      url,
      html: `<blockquote class="instagram-media" data-instgrm-permalink="${url}"><a href="${url}">Voir sur Instagram</a></blockquote><script async src="//www.instagram.com/embed.js"></script>`,
      width: 540,
      height: 640,
    });
  } catch {
    return NextResponse.json({
      version: '1.0',
      type: 'link',
      url,
      title: 'Instagram Post',
      provider_name: 'Instagram',
    });
  }
}
