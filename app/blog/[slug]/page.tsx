import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';

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

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) {
    return { title: 'Article non trouve' };
  }

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
    },
    twitter: {
      card: 'summary_large_image',
      title: post.meta_title,
      description: post.meta_description,
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) {
    notFound();
  }

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

      <main className="min-h-screen bg-white">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white py-12">
          <div className="max-w-3xl mx-auto px-4 sm:px-6">
            <Link
              href="/blog"
              className="inline-flex items-center text-white/80 hover:text-white text-sm mb-6 transition-colors"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Retour au blog
            </Link>

            <div className="flex items-center gap-3 mb-4">
              <span className="bg-white/20 text-white text-xs font-medium px-3 py-1 rounded-full">
                {post.keywords_primary}
              </span>
              <time className="text-white/70 text-sm" dateTime={post.published_at}>
                {publishedDate}
              </time>
            </div>

            <h1 className="text-3xl sm:text-4xl font-bold leading-tight">
              {post.title}
            </h1>
          </div>
        </div>

        {/* Content */}
        <article className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
          <div
            className="prose prose-lg prose-neutral max-w-none
              prose-headings:text-neutral-900 prose-headings:font-bold
              prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4
              prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3
              prose-p:text-neutral-700 prose-p:leading-relaxed prose-p:mb-4
              prose-a:text-purple-600 prose-a:font-medium prose-a:no-underline hover:prose-a:underline
              prose-ul:my-4 prose-li:text-neutral-700
              prose-strong:text-neutral-900
              prose-blockquote:border-purple-500 prose-blockquote:bg-purple-50 prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:rounded-r-lg"
            dangerouslySetInnerHTML={{ __html: post.content_html }}
          />

          {/* FAQ section */}
          {post.schema_faq && post.schema_faq.length > 0 && (
            <section className="mt-12 border-t border-neutral-200 pt-8">
              <h2 className="text-2xl font-bold text-neutral-900 mb-6">Questions frequentes</h2>
              <div className="space-y-6">
                {post.schema_faq.map((faq, i) => (
                  <div key={i} className="bg-neutral-50 rounded-lg p-5">
                    <h3 className="font-semibold text-neutral-900 mb-2">{faq.question}</h3>
                    <p className="text-neutral-700 text-sm leading-relaxed">{faq.answer}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* CTA */}
          <section className="mt-12 bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl p-8 text-center text-white">
            <h2 className="text-2xl font-bold mb-3">
              Pret a booster ton marketing ?
            </h2>
            <p className="text-white/90 mb-6 max-w-lg mx-auto">
              Genere des visuels marketing professionnels en quelques secondes grace a l&apos;IA. Essai gratuit, sans carte bancaire.
            </p>
            <Link
              href="/generate"
              className="inline-block bg-white text-purple-700 font-bold px-8 py-3 rounded-lg hover:bg-neutral-100 transition-colors"
            >
              Essayer gratuitement
            </Link>
          </section>
        </article>
      </main>
    </>
  );
}
