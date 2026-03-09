export function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.keiroai.com';

  const body = `User-agent: *
Allow: /
Allow: /blog
Allow: /blog/*
Disallow: /api/
Disallow: /admin/
Disallow: /mon-compte
Disallow: /login
Disallow: /library

Sitemap: ${baseUrl}/sitemap.xml
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
}
