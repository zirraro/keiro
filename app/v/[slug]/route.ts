/**
 * GET /v/[slug]
 *
 * Tracking short-link with rich preview support. When a social media
 * crawler hits the URL (TikTok, IG, Discord, Slack, etc.) we return an
 * HTML page with og:image meta pointing at the actual visual — so the
 * link unfurls as an image preview inside DMs instead of a bare blue URL.
 *
 * When a real browser hits it → 302 redirect to the target URL.
 *
 * Founder ask 2026-06-07: "il faut de preference que l'url montre
 * l'apercu en image tu vois c'est un url image qui s'affiche et pas
 * juste un lien".
 *
 * Every hit logs an agent_log so we can flag prospects who opened but
 * didn't reply.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { resolveAndLog } from '@/lib/tracking/short-links';

export const runtime = 'nodejs';

function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

// Common social-media link-preview bots — these get the OG HTML so the
// link unfurls as an image. Real users get the 302 redirect.
const PREVIEW_BOT_PATTERNS = [
  /facebookexternalhit/i,
  /tiktokbot/i,
  /tiktok\/i,
  /tiktok-link-preview/i,
  /twitterbot/i,
  /linkedinbot/i,
  /discordbot/i,
  /slackbot/i,
  /whatsapp/i,
  /telegrambot/i,
  /instagram/i,
  /pinterest/i,
  /skypeuripreview/i,
  /embedly/i,
];

function isPreviewBot(ua: string): boolean {
  if (!ua) return false;
  return PREVIEW_BOT_PATTERNS.some((re) => re.test(ua));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function previewHtml(targetUrl: string, slug: string): string {
  const safe = escapeHtml(targetUrl);
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://keiroai.com';
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta http-equiv="refresh" content="0;url=${safe}" />
<title>Aperçu</title>
<meta property="og:type" content="article" />
<meta property="og:title" content="Aperçu" />
<meta property="og:image" content="${safe}" />
<meta property="og:image:secure_url" content="${safe}" />
<meta property="og:image:type" content="image/jpeg" />
<meta property="og:image:width" content="1080" />
<meta property="og:image:height" content="1920" />
<meta property="og:url" content="${base}/v/${escapeHtml(slug)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="${safe}" />
<link rel="canonical" href="${safe}" />
</head>
<body>
<script>window.location.replace(${JSON.stringify(targetUrl)});</script>
<noscript><a href="${safe}">Voir l'image</a></noscript>
</body>
</html>`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!slug || !/^[a-z0-9]{4,16}$/.test(slug)) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const fwdIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
  const ua = req.headers.get('user-agent') || '';
  const target = await resolveAndLog(slug, hashIp(fwdIp), ua);
  if (!target) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  // Bot crawling → return preview HTML so the link unfurls as an image.
  if (isPreviewBot(ua)) {
    return new NextResponse(previewHtml(target, slug), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  }
  // Real browser → redirect to the actual image.
  return NextResponse.redirect(target, 302);
}
