import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://keiro.ai';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/dashboard/',
          '/debug-*',
          '/_next/',
          '/admin/'
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
