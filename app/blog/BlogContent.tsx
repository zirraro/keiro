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

const MASTERCLASS_MODULES = [
  {
    id: 'mc-1',
    title: 'Automatiser sa publication Instagram & TikTok',
    description: 'Apprenez a configurer vos agents IA pour publier automatiquement du contenu professionnel sur vos reseaux sociaux, sans y passer des heures.',
    icon: '📱',
    duration: '45 min',
    level: 'Debutant',
    topics: ['Publication automatique', 'Calendrier editorial', 'Formats optimaux', 'Hashtags intelligents'],
    color: 'from-pink-500 to-rose-500',
  },
  {
    id: 'mc-2',
    title: 'SEO local : dominer Google Maps et le referencement',
    description: 'Votre fiche Google Maps est votre vitrine numerique. Decouvrez comment l\'agent SEO optimise automatiquement votre visibilite locale.',
    icon: '🔍',
    duration: '35 min',
    level: 'Debutant',
    topics: ['Fiche Google My Business', 'Avis clients', 'Mots-cles locaux', 'Schema markup'],
    color: 'from-amber-500 to-orange-500',
  },
  {
    id: 'mc-3',
    title: 'Prospection automatique : de 0 a 50 leads/mois',
    description: 'Configurez vos agents Commercial et Email pour prospecter automatiquement, qualifier les leads et relancer les prospects tides.',
    icon: '🤝',
    duration: '50 min',
    level: 'Intermediaire',
    topics: ['Lead scraping', 'Sequences email', 'Scoring prospects', 'DMs strategiques'],
    color: 'from-blue-500 to-cyan-500',
  },
  {
    id: 'mc-4',
    title: 'Creer du contenu IA qui convertit',
    description: 'Images, videos, legendes — comment utiliser Keiro pour generer du contenu professionnel qui engage votre audience et genere des ventes.',
    icon: '✨',
    duration: '40 min',
    level: 'Debutant',
    topics: ['Prompts efficaces', 'Visuels Instagram', 'Videos TikTok', 'Legendes qui convertissent'],
    color: 'from-purple-500 to-violet-600',
  },
  {
    id: 'mc-5',
    title: 'Email marketing automatise pour TPE',
    description: 'Newsletters, sequences de bienvenue, relances panier abandonne — tout automatise avec l\'agent Hugo.',
    icon: '📧',
    duration: '30 min',
    level: 'Intermediaire',
    topics: ['Templates email', 'Sequences automatiques', 'Segmentation', 'A/B testing'],
    color: 'from-green-500 to-emerald-500',
  },
  {
    id: 'mc-6',
    title: 'Gestion financiere simplifiee avec l\'IA',
    description: 'Tresorerie, previsions, alertes — comment l\'agent Louis surveille vos finances et vous alerte sur les anomalies.',
    icon: '💰',
    duration: '25 min',
    level: 'Intermediaire',
    topics: ['Suivi tresorerie', 'Previsions', 'Obligations fiscales', 'Metriques cles'],
    color: 'from-cyan-600 to-blue-700',
  },
];

export default function BlogContent({ posts }: { posts: BlogPost[] }) {
  const [activeTab, setActiveTab] = useState<Tab>('articles');

  return (
    <main className="min-h-screen page-studio-bg">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#0c1a3a] to-[#1e3a5f] text-white py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">Blog & Masterclass</h1>
          <p className="text-lg text-white/90 max-w-2xl mx-auto">
            Guides pratiques, masterclass et strategies pour automatiser le marketing de ton business avec l&apos;IA.
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
              Masterclass
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
                  Voir les masterclass en attendant →
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
          /* ─── MASTERCLASS TAB ─── */
          <>
            <div className="mb-8">
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-2xl border border-purple-200 p-6 flex flex-col md:flex-row items-center gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-blue-500 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl">🎓</span>
                </div>
                <div className="flex-1 text-center md:text-left">
                  <h2 className="text-lg font-bold text-neutral-900">Masterclass Keiro — Automatisation Marketing</h2>
                  <p className="text-sm text-neutral-600 mt-1">
                    Apprenez a configurer et utiliser vos 15 agents IA pour automatiser 100% de votre marketing. Des modules courts et actionables.
                  </p>
                </div>
                <div className="text-center flex-shrink-0">
                  <div className="text-2xl font-bold text-purple-600">6</div>
                  <div className="text-[10px] text-neutral-500 font-medium">modules</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {MASTERCLASS_MODULES.map((module, index) => (
                <div
                  key={module.id}
                  className="bg-white rounded-xl border border-neutral-200 overflow-hidden hover:shadow-lg hover:border-purple-200 transition-all duration-200 group"
                >
                  {/* Module header with gradient */}
                  <div className={`bg-gradient-to-r ${module.color} p-4 flex items-center gap-3`}>
                    <span className="text-2xl">{module.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-white/80 text-[10px] font-bold uppercase">Module {index + 1}</span>
                        <span className="bg-white/20 text-white text-[10px] px-2 py-0.5 rounded-full">{module.duration}</span>
                        <span className="bg-white/20 text-white text-[10px] px-2 py-0.5 rounded-full">{module.level}</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-5">
                    <h3 className="font-bold text-neutral-900 mb-2 group-hover:text-purple-700 transition-colors">
                      {module.title}
                    </h3>
                    <p className="text-sm text-neutral-600 mb-4">
                      {module.description}
                    </p>

                    {/* Topics */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {module.topics.map((topic) => (
                        <span key={topic} className="bg-neutral-100 text-neutral-600 text-[11px] px-2 py-0.5 rounded-full">
                          {topic}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="bg-purple-100 text-purple-700 text-xs font-semibold px-3 py-1 rounded-full">
                        A venir prochainement
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Notify */}
            <div className="mt-8 bg-gradient-to-r from-[#0c1a3a] to-purple-900 rounded-2xl p-6 text-center text-white">
              <h3 className="font-bold text-lg mb-2">Soyez prevenu du lancement des masterclass</h3>
              <p className="text-purple-200 text-sm mb-4">
                Les masterclass seront disponibles gratuitement pour tous les plans payants.
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
