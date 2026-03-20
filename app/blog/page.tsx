import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import type { Metadata } from 'next';

// Force dynamic rendering so newly published articles appear immediately
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

export const metadata: Metadata = {
  title: 'Blog Marketing | Keiro',
  description: 'Conseils, guides et astuces pour booster le marketing de ton commerce avec l\'IA. Instagram, TikTok, visuels, strategies pour restaurants, boutiques, coaches et plus.',
  alternates: {
    canonical: '/blog',
  },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: 'https://www.keiroai.com/blog',
    title: 'Blog Marketing | Keiro',
    description: 'Conseils et guides pour booster le marketing de ton commerce avec l\'IA.',
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

  return (
    <main className="min-h-screen page-studio-bg">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#0c1a3a] to-[#1e3a5f] text-white py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">Blog Marketing</h1>
          <p className="text-lg text-white/90 max-w-2xl mx-auto">
            Guides pratiques, conseils et strategies pour booster le marketing de ton commerce grace a l&apos;intelligence artificielle.
          </p>
        </div>
      </div>

      {/* Articles Grid */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        {posts.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-neutral-900 mb-2">Bientot des articles</h2>
            <p className="text-neutral-600">
              Notre blog est en cours de preparation. Reviens bientot pour des guides marketing pratiques !
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => {
              const date = new Date(post.published_at).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              });

              return (
                <Link
                  key={post.id}
                  href={`/blog/${post.slug}`}
                  className="group bg-white rounded-xl border border-neutral-200 overflow-hidden hover:shadow-lg hover:border-purple-200 transition-all duration-200"
                >
                  {/* Thumbnail image */}
                  {post.thumbnail ? (
                    <div className="aspect-[16/9] overflow-hidden bg-neutral-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={post.thumbnail}
                        alt={post.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <div className="aspect-[16/9] bg-gradient-to-br from-purple-100 to-[#0c1a3a]/10 flex items-center justify-center">
                      <svg className="w-12 h-12 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}

                  <div className="p-5">
                    {/* Keyword badge + date */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="bg-purple-100 text-purple-700 text-xs font-medium px-2.5 py-0.5 rounded-full truncate max-w-[60%]">
                        {post.keywords_primary}
                      </span>
                      <time className="text-xs text-neutral-500" dateTime={post.published_at}>
                        {date}
                      </time>
                    </div>

                    {/* Title */}
                    <h2 className="text-lg font-bold text-neutral-900 mb-2 line-clamp-2 group-hover:text-purple-700 transition-colors">
                      {post.title}
                    </h2>

                    {/* Excerpt */}
                    <p className="text-sm text-neutral-600 line-clamp-3">
                      {post.excerpt || post.meta_description}
                    </p>

                    {/* Read more */}
                    <div className="mt-4 flex items-center text-sm font-medium text-purple-600 group-hover:text-purple-700">
                      Lire l&apos;article
                      <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* CTA */}
        <div className="mt-16 bg-white rounded-2xl border border-neutral-200 p-8 text-center">
          <h2 className="text-2xl font-bold text-neutral-900 mb-3">
            Envie de passer a l&apos;action ?
          </h2>
          <p className="text-neutral-600 mb-6 max-w-lg mx-auto">
            Genere tes visuels marketing en quelques secondes avec l&apos;IA. Gratuit pour commencer.
          </p>
          <Link
            href="/generate"
            className="inline-block bg-gradient-to-r from-[#0c1a3a] to-[#1e3a5f] text-white font-bold px-8 py-3 rounded-lg hover:opacity-90 transition-opacity"
          >
            Creer un visuel gratuit
          </Link>
        </div>
      </div>
    </main>
  );
}
