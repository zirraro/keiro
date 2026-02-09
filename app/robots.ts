import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://www.keiroai.com';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/mon-compte/',
          '/debug-*',
          '/_next/',
          '/admin/'
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
