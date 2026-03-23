'use client';

import { useState } from 'react';
import Link from 'next/link';

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

type Tab = 'articles' | 'masterclass';

// Curated YouTube videos — selected for small business owners
// Replace youtubeId with real IDs when ready
const CURATED_VIDEOS = [
  {
    id: 'v-1',
    title: 'Comment EXPLOSER sur Instagram en 2026',
    description: 'Strategies completes pour faire exploser votre compte Instagram : algorithme, contenus viraux et engagement.',
    youtubeId: '', // placeholder
    category: 'Instagram',
    duration: '18 min',
    level: 'Debutant',
    color: 'from-pink-500 to-rose-500',
    tags: ['Algorithme', 'Reels', 'Engagement'],
  },
  {
    id: 'v-2',
    title: 'Strategie Instagram Complete pour 2026',
    description: 'Guide complet : Reels, Stories, Posts, Hashtags — tout pour reussir sur Instagram.',
    youtubeId: '',
    category: 'Instagram',
    duration: '25 min',
    level: 'Debutant',
    color: 'from-purple-500 to-violet-600',
    tags: ['Stories', 'Hashtags', 'Calendrier'],
  },
  {
    id: 'v-3',
    title: 'Vendre avec Instagram : La Methode Complete',
    description: 'Transformez votre compte Instagram en machine a vendre : strategie de A a Z.',
    youtubeId: '',
    category: 'Vente',
    duration: '32 min',
    level: 'Intermediaire',
    color: 'from-amber-500 to-orange-500',
    tags: ['Tunnel de vente', 'DMs', 'Conversion'],
  },
  {
    id: 'v-4',
    title: 'Copywriting Instagram : Legendes qui Vendent',
    description: 'Formules, accroches et appels a l\'action qui convertissent vraiment sur Instagram.',
    youtubeId: '',
    category: 'Copywriting',
    duration: '22 min',
    level: 'Intermediaire',
    color: 'from-blue-500 to-cyan-500',
    tags: ['Accroches', 'AIDA', 'CTA'],
  },
  {
    id: 'v-5',
    title: 'TikTok pour les Commercants : Guide Debutant',
    description: 'Comment les petits commerces utilisent TikTok pour attirer des clients locaux.',
    youtubeId: '',
    category: 'TikTok',
    duration: '15 min',
    level: 'Debutant',
    color: 'from-gray-700 to-gray-900',
    tags: ['Videos courtes', 'Tendances', 'Local'],
  },
  {
    id: 'v-6',
    title: 'Google Maps : Optimiser sa Fiche pour Etre N1',
    description: 'Les techniques pour dominer Google Maps dans votre zone et attirer des clients en magasin.',
    youtubeId: '',
    category: 'SEO Local',
    duration: '20 min',
    level: 'Debutant',
    color: 'from-green-500 to-emerald-500',
    tags: ['Google Maps', 'Avis', 'Visibilite'],
  },
  {
    id: 'v-7',
    title: 'Email Marketing : Sequences qui Convertissent',
    description: 'Creer des sequences email automatiques qui transforment vos prospects en clients fideles.',
    youtubeId: '',
    category: 'Email',
    duration: '28 min',
    level: 'Intermediaire',
    color: 'from-cyan-500 to-blue-600',
    tags: ['Automation', 'Sequences', 'Newsletter'],
  },
  {
    id: 'v-8',
    title: 'Publicite Meta Ads pour Petit Budget',
    description: 'Comment lancer des campagnes Facebook/Instagram Ads efficaces avec moins de 10EUR/jour.',
    youtubeId: '',
    category: 'Publicite',
    duration: '35 min',
    level: 'Intermediaire',
    color: 'from-red-500 to-orange-500',
    tags: ['Meta Ads', 'Budget', 'Ciblage'],
  },
];

const CATEGORIES = ['Tous', ...Array.from(new Set(CURATED_VIDEOS.map(v => v.category)))];

export default function BlogContent({ posts }: { posts: BlogPost[] }) {
  const [activeTab, setActiveTab] = useState<Tab>('articles');
  const [videoCategory, setVideoCategory] = useState('Tous');
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);

  const filteredVideos = videoCategory === 'Tous'
    ? CURATED_VIDEOS
    : CURATED_VIDEOS.filter(v => v.category === videoCategory);

  return (
    <main className="min-h-screen page-studio-bg pb-24 lg:pb-0">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#0c1a3a] to-[#1e3a5f] text-white py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">Blog & Masterclass</h1>
          <p className="text-lg text-white/90 max-w-2xl mx-auto">
            Articles, videos selectionnees et strategies pour automatiser le marketing de ton business avec l&apos;IA.
          </p>

          {/* Tabs */}
          <div className="mt-8 inline-flex items-center gap-1 bg-white/10 rounded-full p-1">
            <button
              onClick={() => setActiveTab('articles')}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                activeTab === 'articles'
                  ? 'bg-white text-[#0c1a3a] shadow'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              Articles
            </button>
            <button
              onClick={() => setActiveTab('masterclass')}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                activeTab === 'masterclass'
                  ? 'bg-white text-[#0c1a3a] shadow'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              Masterclass Video
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        {activeTab === 'articles' ? (
          /* ─── ARTICLES TAB ─── */
          <>
            {posts.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-neutral-900 mb-2">Bientot des articles</h2>
                <p className="text-neutral-600 mb-4">
                  Notre blog est en cours de preparation. Reviens bientot pour des guides marketing pratiques !
                </p>
                <button
                  onClick={() => setActiveTab('masterclass')}
                  className="text-purple-600 font-semibold hover:underline text-sm"
                >
                  Voir les videos masterclass en attendant →
                </button>
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
                        <div className="flex items-center justify-between mb-3">
                          <span className="bg-purple-100 text-purple-700 text-xs font-medium px-2.5 py-0.5 rounded-full truncate max-w-[60%]">
                            {post.keywords_primary}
                          </span>
                          <time className="text-xs text-neutral-500" dateTime={post.published_at}>
                            {date}
                          </time>
                        </div>
                        <h2 className="text-lg font-bold text-neutral-900 mb-2 line-clamp-2 group-hover:text-purple-700 transition-colors">
                          {post.title}
                        </h2>
                        <p className="text-sm text-neutral-600 line-clamp-3">
                          {post.excerpt || post.meta_description}
                        </p>
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
          </>
        ) : (
          /* ─── MASTERCLASS VIDEO TAB ─── */
          <>
            {/* Header */}
            <div className="mb-8">
              <div className="bg-gradient-to-r from-red-50 to-purple-50 rounded-2xl border border-red-200/50 p-6 flex flex-col md:flex-row items-center gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-red-500 to-rose-600 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-red-500/20">
                  <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
                <div className="flex-1 text-center md:text-left">
                  <h2 className="text-lg font-bold text-neutral-900">Masterclass Video — Marketing pour Commercants</h2>
                  <p className="text-sm text-neutral-600 mt-1">
                    Selection de videos pour maitriser Instagram, TikTok, SEO, email marketing et publicite. Regardez, apprenez, et laissez vos agents IA executer.
                  </p>
                </div>
                <div className="text-center flex-shrink-0">
                  <div className="text-2xl font-bold text-red-600">{CURATED_VIDEOS.length}</div>
                  <div className="text-[10px] text-neutral-500 font-medium">videos selectionnees</div>
                </div>
              </div>
            </div>

            {/* Category filter */}
            <div className="flex flex-wrap gap-2 mb-6">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setVideoCategory(cat)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    videoCategory === cat
                      ? 'bg-purple-600 text-white shadow-md'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Video grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {filteredVideos.map((video) => (
                <div
                  key={video.id}
                  className="bg-white rounded-xl border border-neutral-200 overflow-hidden hover:shadow-lg hover:border-purple-200 transition-all duration-200 group"
                >
                  {/* Video player / placeholder */}
                  <div className="relative aspect-video">
                    {playingVideo === video.id && video.youtubeId ? (
                      <iframe
                        src={`https://www.youtube-nocookie.com/embed/${video.youtubeId}?autoplay=1`}
                        title={video.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="absolute inset-0 w-full h-full"
                      />
                    ) : (
                      <button
                        onClick={() => video.youtubeId ? setPlayingVideo(video.id) : undefined}
                        className={`w-full h-full bg-gradient-to-br ${video.color} flex flex-col items-center justify-center gap-3 ${video.youtubeId ? 'cursor-pointer' : 'cursor-default'}`}
                      >
                        <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                          <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                        {!video.youtubeId && (
                          <span className="text-white/70 text-xs font-medium bg-black/20 px-3 py-1 rounded-full">
                            Bientot disponible
                          </span>
                        )}
                      </button>
                    )}

                    {/* Badges */}
                    <div className="absolute top-2 left-2 flex gap-1.5">
                      <span className="bg-black/60 text-white text-[10px] font-medium px-2 py-0.5 rounded-full backdrop-blur-sm">
                        {video.category}
                      </span>
                      <span className="bg-black/60 text-white text-[10px] font-medium px-2 py-0.5 rounded-full backdrop-blur-sm">
                        {video.level}
                      </span>
                    </div>
                    <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] font-semibold px-2 py-0.5 rounded backdrop-blur-sm">
                      {video.duration}
                    </div>
                  </div>

                  <div className="p-4">
                    <h3 className="font-bold text-neutral-900 text-sm mb-1.5 group-hover:text-purple-700 transition-colors line-clamp-2">
                      {video.title}
                    </h3>
                    <p className="text-xs text-neutral-500 mb-3 line-clamp-2">
                      {video.description}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {video.tags.map((tag) => (
                        <span key={tag} className="bg-purple-50 text-purple-600 text-[10px] font-medium px-2 py-0.5 rounded-full">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* CTA - let Keiro agents handle it */}
            <div className="mt-10 bg-gradient-to-r from-[#0c1a3a] to-purple-900 rounded-2xl p-6 text-center text-white">
              <h3 className="font-bold text-lg mb-2">Tu as appris les strategies — maintenant automatise-les</h3>
              <p className="text-purple-200 text-sm mb-4">
                Vos 15 agents IA executent ces strategies a votre place : publication, SEO, prospection, emails — tout en automatique.
              </p>
              <Link
                href="/assistant"
                className="inline-block px-6 py-3 bg-white text-[#0c1a3a] font-bold rounded-xl hover:shadow-lg transition-all text-sm"
              >
                Decouvrir vos agents IA →
              </Link>
            </div>
          </>
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
