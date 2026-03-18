import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ReadingProgress, TableOfContents, MobileTableOfContents, ArticleBody, ShareButtons } from './ArticleContent';

// Force dynamic rendering so newly published articles appear immediately
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

interface BlogPost {
  id: string;
  slug: string;
  title: string;
  meta_title: string;
  meta_description: string;
  content_html: string;
  excerpt: string;
  keywords_primary: string;
  keywords_secondary: string[];
  schema_faq: Array<{ question: string; answer: string }>;
  internal_links: Array<{ url: string; anchor: string }>;
  status: string;
  published_at: string;
  created_at: string;
  updated_at: string;
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function getPost(slug: string): Promise<BlogPost | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();

  if (error || !data) return null;
  return data as BlogPost;
}

/**
 * Server-side: fix expired Seedream URLs in article content.
 * Detects temporary BytePlus URLs and triggers async regeneration.
 */
async function fixExpiredImages(post: BlogPost): Promise<string> {
  let html = post.content_html || '';

  // Check for expired Seedream temporary URLs
  const hasExpiredUrls = /src=["']https:\/\/ark\.ap-southeast\.bytepluses\.com[^"']+["']/i.test(html);
  // Check for unprocessed placeholder tags
  const hasPlaceholders = /data-seo-generate="true"/i.test(html);

  if (hasExpiredUrls || hasPlaceholders) {
    // Trigger async regeneration (fire-and-forget)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret) {
      fetch(`${baseUrl}/api/agents/seo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cronSecret}`,
        },
        body: JSON.stringify({ action: 'regenerate_images', article_id: post.id }),
      }).catch(() => { /* fire and forget */ });
    }

    // For now, strip broken Seedream temp URLs and leave placeholder-style fallback
    // The client component will show nice placeholders for broken images
  }

  return html;
}

/** Extract headings from HTML for table of contents */
function extractHeadings(html: string): Array<{ id: string; text: string; level: number }> {
  const headings: Array<{ id: string; text: string; level: number }> = [];
  const regex = /<h([23])[^>]*>([^<]+)<\/h[23]>/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const level = parseInt(match[1]);
    const text = match[2].replace(/<[^>]+>/g, '').trim();
    const id = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    if (text && id) {
      headings.push({ id, text, level });
    }
  }

  return headings;
}

/** Inject IDs into heading tags for anchor navigation */
function injectHeadingIds(html: string, headings: Array<{ id: string; text: string; level: number }>): string {
  let result = html;
  for (const h of headings) {
    const escapedText = h.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match this specific heading and add id if it doesn't already have one
    const regex = new RegExp(`(<h${h.level})(?![^>]*\\bid=)([^>]*>\\s*${escapedText})`, 'i');
    result = result.replace(regex, `$1 id="${h.id}"$2`);
  }
  return result;
}

/** Calculate reading time */
function getReadingTime(html: string): number {
  const text = html.replace(/<[^>]+>/g, '');
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) {
    return { title: 'Article non trouve' };
  }

  // Extract first image for OG + hero
  const allImgMatches = [...(post.content_html?.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi) || [])];
  const firstValidImg = allImgMatches.find(m => m[1] && !m[1].includes('bytepluses.com'));
  const ogImage = firstValidImg?.[1] || undefined;

  return {
    title: post.meta_title,
    description: post.meta_description,
    keywords: [post.keywords_primary, ...(post.keywords_secondary || [])],
    alternates: {
      canonical: `/blog/${post.slug}`,
    },
    openGraph: {
      type: 'article',
      locale: 'fr_FR',
      url: `https://www.keiroai.com/blog/${post.slug}`,
      title: post.meta_title,
      description: post.meta_description,
      siteName: 'Keiro',
      publishedTime: post.published_at,
      modifiedTime: post.updated_at,
      ...(ogImage ? { images: [{ url: ogImage, width: 1792, height: 1024 }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: post.meta_title,
      description: post.meta_description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) {
    notFound();
  }

  // Fix expired images (async, non-blocking)
  const contentHtml = await fixExpiredImages(post);
  const headings = extractHeadings(contentHtml);
  const processedHtml = injectHeadingIds(contentHtml, headings);
  const readingTime = getReadingTime(contentHtml);

  // Extract hero image (first valid Supabase image)
  const allImgs = [...(contentHtml.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi) || [])];
  const heroImage = allImgs.find(m => m[1] && !m[1].includes('bytepluses.com') && m[1].includes('supabase'))?.[1];

  const publishedDate = new Date(post.published_at).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Schema.org Article structured data
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.meta_description,
    datePublished: post.published_at,
    dateModified: post.updated_at,
    wordCount: contentHtml.replace(/<[^>]+>/g, '').split(/\s+/).length,
    author: {
      '@type': 'Organization',
      name: 'KeiroAI',
      url: 'https://www.keiroai.com',
    },
    publisher: {
      '@type': 'Organization',
      name: 'KeiroAI',
      url: 'https://www.keiroai.com',
      logo: {
        '@type': 'ImageObject',
        url: 'https://www.keiroai.com/icon.png',
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://www.keiroai.com/blog/${post.slug}`,
    },
  };

  // Schema.org FAQ structured data
  const faqSchema = post.schema_faq && post.schema_faq.length > 0
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: post.schema_faq.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: faq.answer,
          },
        })),
      }
    : null;

  // Get related articles
  const supabase = getSupabase();
  const { data: relatedPostsRaw } = await supabase
    .from('blog_posts')
    .select('slug, title, excerpt, keywords_primary, published_at, content_html')
    .eq('status', 'published')
    .neq('slug', post.slug)
    .order('published_at', { ascending: false })
    .limit(3);

  // Extract thumbnails for related posts
  const relatedPosts = (relatedPostsRaw || []).map((rp: any) => {
    const imgMatches = [...(rp.content_html || '').matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi)];
    const validImg = imgMatches.find((m: any) => m[1] && !m[1].includes('bytepluses.com') && m[1].includes('supabase'));
    return { ...rp, thumbnail: validImg?.[1] || null, content_html: undefined };
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      {faqSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      )}

      <ReadingProgress />

      <main className="min-h-screen bg-white">
        {/* Hero Header */}
        <header className="relative bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 text-white overflow-hidden">
          {/* Subtle pattern overlay */}
          <div className="absolute inset-0 opacity-5" style={{
            backgroundImage: 'radial-gradient(circle at 25% 25%, #a855f7 1px, transparent 1px), radial-gradient(circle at 75% 75%, #0c1a3a 1px, transparent 1px)',
            backgroundSize: '40px 40px'
          }} />

          <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-8 pb-14 sm:pt-10 sm:pb-16">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-sm text-white/50 mb-8">
              <Link href="/" className="hover:text-white/80 transition-colors">Accueil</Link>
              <span>/</span>
              <Link href="/blog" className="hover:text-white/80 transition-colors">Blog</Link>
              <span>/</span>
              <span className="text-white/70 truncate max-w-[200px]">{post.keywords_primary}</span>
            </nav>

            {/* Meta info */}
            <div className="flex items-center gap-4 mb-6 flex-wrap">
              <span className="bg-purple-500/20 text-purple-300 text-xs font-medium px-3 py-1.5 rounded-full border border-purple-500/20">
                {post.keywords_primary}
              </span>
              <div className="flex items-center gap-3 text-sm text-white/50">
                <time dateTime={post.published_at}>
                  {publishedDate}
                </time>
                <span className="w-1 h-1 rounded-full bg-white/30" />
                <span>{readingTime} min de lecture</span>
              </div>
            </div>

            {/* Title */}
            <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-bold leading-[1.15] tracking-tight">
              {post.title}
            </h1>

            {/* Excerpt/description below title */}
            {post.excerpt && (
              <p className="mt-5 text-lg text-white/60 leading-relaxed max-w-2xl">
                {post.excerpt}
              </p>
            )}
          </div>

          {/* Bottom gradient fade */}
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent" />
        </header>

        {/* Hero Image — full-width, cinematic */}
        {heroImage && (
          <div className="max-w-4xl mx-auto px-4 sm:px-6 -mt-4 mb-8 relative z-10">
            <div className="relative overflow-hidden rounded-2xl shadow-2xl bg-neutral-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={heroImage}
                alt={post.title}
                className="w-full h-auto object-cover"
                style={{ maxHeight: '480px', objectFit: 'cover' }}
                loading="eager"
              />
            </div>
          </div>
        )}

        {/* Table of Contents (desktop sidebar) */}
        <TableOfContents headings={headings} />

        {/* Article Content */}
        <article className="max-w-3xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 pb-8">
          <MobileTableOfContents headings={headings} />
          <ArticleBody html={processedHtml} />

          {/* Share + tags divider */}
          <div className="mt-14 pt-8 border-t border-neutral-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <ShareButtons title={post.title} slug={post.slug} />
              {post.keywords_secondary && post.keywords_secondary.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {post.keywords_secondary.map((kw, i) => (
                    <span key={i} className="text-[11px] bg-neutral-100 text-neutral-500 px-2.5 py-1 rounded-full">
                      {kw}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </article>

        {/* FAQ Section */}
        {post.schema_faq && post.schema_faq.length > 0 && (
          <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-8">
            <div className="border-t border-neutral-100 pt-12">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-neutral-900">Questions frequentes</h2>
              </div>
              <div className="space-y-4">
                {post.schema_faq.map((faq, i) => (
                  <details key={i} className="group bg-neutral-50 rounded-xl border border-neutral-100 overflow-hidden">
                    <summary className="flex items-center justify-between cursor-pointer px-6 py-4 text-neutral-900 font-semibold text-[15px] leading-snug hover:bg-neutral-100 transition-colors list-none">
                      <span>{faq.question}</span>
                      <svg className="w-5 h-5 text-neutral-400 shrink-0 ml-4 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </summary>
                    <div className="px-6 pb-5 text-neutral-600 text-sm leading-relaxed border-t border-neutral-100 pt-4">
                      {faq.answer}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* CTA Section */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-8">
          <div className="relative overflow-hidden bg-gradient-to-br from-purple-600 via-purple-700 to-[#1e3a5f] rounded-2xl p-8 sm:p-12 text-center text-white">
            {/* Background decoration */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/4" />

            <div className="relative">
              <h2 className="text-2xl sm:text-3xl font-bold mb-4 tracking-tight">
                Pret a transformer ton marketing ?
              </h2>
              <p className="text-white/80 mb-8 max-w-lg mx-auto leading-relaxed">
                Genere des visuels marketing professionnels en quelques secondes grace a l&apos;IA.
                Rejoint les entrepreneurs qui boostent leur presence en ligne.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  href="/generate"
                  className="inline-flex items-center gap-2 bg-white text-purple-700 font-bold px-8 py-3.5 rounded-xl hover:bg-neutral-100 transition-colors shadow-lg shadow-purple-900/20"
                >
                  Essayer gratuitement
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
                <Link
                  href="/pricing"
                  className="text-white/70 hover:text-white text-sm font-medium transition-colors"
                >
                  Voir les tarifs
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Related Articles */}
        {relatedPosts && relatedPosts.length > 0 && (
          <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16">
            <div className="border-t border-neutral-100 pt-12">
              <h2 className="text-xl font-bold text-neutral-900 mb-6">Articles similaires</h2>
              <div className="grid sm:grid-cols-3 gap-5">
                {relatedPosts.map((related: any) => (
                  <Link
                    key={related.slug}
                    href={`/blog/${related.slug}`}
                    className="group block bg-neutral-50 rounded-xl overflow-hidden hover:bg-purple-50 border border-neutral-100 hover:border-purple-200 transition-all duration-200 hover:shadow-lg"
                  >
                    {related.thumbnail ? (
                      <div className="aspect-[16/9] overflow-hidden bg-neutral-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={related.thumbnail}
                          alt={related.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <div className="aspect-[16/9] bg-gradient-to-br from-purple-100 to-[#0c1a3a]/5 flex items-center justify-center">
                        <svg className="w-8 h-8 text-purple-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                    <div className="p-4">
                      <span className="text-[10px] font-medium text-purple-500 uppercase tracking-wider">
                        {related.keywords_primary}
                      </span>
                      <h3 className="text-sm font-semibold text-neutral-900 mt-1.5 mb-1.5 leading-snug group-hover:text-purple-700 transition-colors line-clamp-2">
                        {related.title}
                      </h3>
                      <p className="text-xs text-neutral-500 leading-relaxed line-clamp-2">
                        {related.excerpt}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Footer signature */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-12">
          <div className="border-t border-neutral-100 pt-6 flex items-center justify-between text-xs text-neutral-400">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-[#1e3a5f]" />
              <span>Publie par <strong className="text-neutral-600">KeiroAI</strong></span>
            </div>
            <Link href="/blog" className="hover:text-purple-600 transition-colors">
              Tous les articles
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
