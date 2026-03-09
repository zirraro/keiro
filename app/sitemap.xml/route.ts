import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const BASE_URL = 'https://www.keiroai.com';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function GET() {
  const supabase = getSupabase();

  // Fetch all published blog posts
  const { data: posts } = await supabase
    .from('blog_posts')
    .select('slug, updated_at, published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false });

  const now = new Date().toISOString();

  // Static pages
  const staticPages = [
    { url: '/', changefreq: 'daily', priority: '1.0', lastmod: now },
    { url: '/pricing', changefreq: 'weekly', priority: '0.8', lastmod: now },
    { url: '/blog', changefreq: 'daily', priority: '0.8', lastmod: now },
  ];

  // Blog posts
  const blogPages = (posts || []).map((post: any) => ({
    url: `/blog/${post.slug}`,
    changefreq: 'monthly',
    priority: '0.7',
    lastmod: post.updated_at || post.published_at,
  }));

  const allPages = [...staticPages, ...blogPages];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages
  .map(
    (page) => `  <url>
    <loc>${BASE_URL}${page.url}</loc>
    <lastmod>${page.lastmod}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
