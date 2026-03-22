import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import type { Metadata } from 'next';
import BlogContent from './BlogContent';

// Force dynamic rendering so newly published articles appear immediately
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

export const metadata: Metadata = {
  title: 'Blog & Masterclass Marketing | Keiro',
  description: 'Articles, guides pratiques et masterclass pour booster le marketing de ton commerce avec l\'IA et les agents IA. Instagram, TikTok, SEO, prospection automatique.',
  alternates: {
    canonical: '/blog',
  },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: 'https://www.keiroai.com/blog',
    title: 'Blog & Masterclass Marketing | Keiro',
    description: 'Articles et masterclass pour automatiser le marketing de ton business avec l\'IA.',
    siteName: 'Keiro',
  },
};

interface BlogPost {
  id: string;
  slug: string;
  title: string;
  meta_description: string;
  excerpt: string;
  keywords_primary: string;
  published_at: string;
  content_html: string;
  thumbnail?: string;
}

function extractThumbnail(html: string | null): string | undefined {
  if (!html) return undefined;
  const matches = [...html.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi)];
  const valid = matches.find(m => m[1] && !m[1].includes('bytepluses.com') && m[1].includes('supabase'));
  return valid?.[1];
}

async function getPosts(): Promise<BlogPost[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('blog_posts')
    .select('id, slug, title, meta_description, excerpt, keywords_primary, published_at, content_html')
    .eq('status', 'published')
    .order('published_at', { ascending: false });

  if (error) {
    console.error('[Blog] Error fetching posts:', error);
    return [];
  }

  return ((data || []) as BlogPost[]).map(p => ({
    ...p,
    thumbnail: extractThumbnail(p.content_html),
  }));
}

export default async function BlogListingPage() {
  const posts = await getPosts();

  return <BlogContent posts={posts} />;
}
