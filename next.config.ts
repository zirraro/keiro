import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // Hide the X-Powered-By: Next.js header so enterprise security
  // scanners don't flag a tech-stack disclosure. Vercel did this
  // automatically; we have to opt-in on self-hosted.
  poweredByHeader: false,
  serverExternalPackages: ['ffmpeg-static', 'fluent-ffmpeg'],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // Serve the static oEmbed demo page for Meta App Review. The demo must
  // not be wrapped by the root Next layout (navbar, vortex background,
  // chatbot widget) — it is a standalone HTML file in /public so the Meta
  // reviewer sees a clean single-purpose demo page.
  async rewrites() {
    return [
      { source: '/oembed-demo', destination: '/oembed-demo.html' },
    ];
  },
  async headers() {
    return [
      // Standard security headers for every route except the oembed demo.
      {
        source: '/((?!oembed-demo).*)',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://vercel.live https://*.vercel-scripts.com https://www.googletagmanager.com https://www.google-analytics.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https: http:; media-src 'self' blob: https:; connect-src 'self' https: wss:; frame-src 'self' https://js.stripe.com https://vercel.live https://www.youtube-nocookie.com https://www.youtube.com; object-src 'none'; base-uri 'self'; form-action 'self';" },
        ],
      },
      // Looser CSP for /oembed-demo so the instagram.com embed.js script and
      // its iframe can actually run. Meta's reviewer must see a working
      // Instagram embed on this page — without these relaxations the script
      // is blocked by our default CSP.
      {
        source: '/oembed-demo(.*)',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Content-Security-Policy', value: "default-src 'self' https://www.instagram.com; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.instagram.com https://*.instagram.com https://*.cdninstagram.com; style-src 'self' 'unsafe-inline' https://www.instagram.com; img-src 'self' data: blob: https:; frame-src 'self' https://www.instagram.com https://*.instagram.com; connect-src 'self' https://www.instagram.com https://*.instagram.com https://graph.facebook.com; base-uri 'self';" },
        ],
      },
      // 2026-06-09 — Aggressive cache for static assets to reduce VPS
      // bandwidth and improve perceived perf. _next/static is content-
      // hashed by Next so 1-year immutable is safe.
      {
        source: '/_next/static/(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/_next/image(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=2592000' }],
      },
      // Static files in /public (favicon, manifest, etc.) — cached 1 week
      // with revalidate so updates eventually propagate.
      {
        source: '/(favicon.ico|robots.txt|manifest.webmanifest|icon.svg|og-image.png)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' }],
      },
    ];
  },
};

export default nextConfig;
