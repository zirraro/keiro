'use client';

import { useState } from 'react';
import BookDemoButton from '@/components/BookDemoButton';
import { startCheckout } from '@/lib/stripe/checkout';
import { FadeUp, ScaleIn, SlideInLeft, SlideInRight, StaggerContainer, StaggerItem, CountUp, HeroTextReveal } from '@/components/ui/motion';
import { AnimatedGradientBG } from '@/components/ui/animated-gradient-bg';
import { useLanguage } from '@/lib/i18n/context';

function HomeKeiroInner() {
  const { t, locale, setLocale } = useLanguage();
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');

  return (
    <main className="min-h-dvh bg-white">
      {/* HERO */}
      <section className="relative mx-auto max-w-6xl px-6 pt-16 pb-12 overflow-hidden">
        <AnimatedGradientBG variant="hero" />
        <div className="relative grid lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7">
            <ScaleIn>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs text-blue-700">
              <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
              {t.home.heroBadge}
            </div>
            </ScaleIn>
            <HeroTextReveal
              text={t.home.heroTitle}
              className="mt-4 text-4xl/tight md:text-5xl/tight font-semibold"
              highlightWords={locale === 'fr' ? ['actualité', 'minutes'] : ['news', 'minutes']}
              highlightClassName="gradient-text"
            />
            <FadeUp delay={0.3}>
            <p className="mt-4 text-lg text-neutral-600">
              {t.home.heroSubtitle}
            </p>
            </FadeUp>
            <FadeUp delay={0.5}>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="/generate" className="px-5 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-medium hover:shadow-lg hover:scale-105 transition-all cta-shimmer">
                {t.common.tryFree}
              </a>
              <a href="#exemple" className="px-5 py-3 rounded-xl border border-blue-200 hover:bg-blue-50 transition-colors">
                {t.common.seeExample}
              </a>
              <BookDemoButton variant="outline" size="md" />
            </div>
            </FadeUp>
            <FadeUp delay={0.6}>
            <ul className="mt-6 grid sm:grid-cols-3 gap-4 text-sm">
              <li className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-blue-900">
                <span className="text-blue-500 mr-1">✓</span> {t.home.heroCheck1}
              </li>
              <li className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-blue-900">
                <span className="text-blue-500 mr-1">✓</span> {t.home.heroCheck2}
              </li>
              <li className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-blue-900">
                <span className="text-blue-500 mr-1">✓</span> {t.home.heroCheck3}
              </li>
            </ul>
            </FadeUp>
          </div>
          <SlideInRight delay={0.4} className="lg:col-span-5">
            {/* Assistant IA Preview Card */}
            <div className="rounded-2xl border-2 border-blue-200 shadow-lg overflow-hidden bg-white animate-glow">
              <div className="p-5 border-b border-blue-200 bg-blue-50/50">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white text-xl">
                    🤖
                  </div>
                  <div>
                    <h3 className="font-bold text-blue-900">{t.home.heroCardTitle}</h3>
                    <p className="text-xs text-blue-600">{t.home.heroCardSubtitle}</p>
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-3">
                {/* Stats cards mini */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white rounded-lg p-3 border border-blue-200">
                    <div className="text-xs text-blue-600 font-medium">{t.home.heroCardEngagement}</div>
                    <div className="text-xl font-bold text-blue-900">+347%</div>
                    <div className="text-[10px] text-blue-600">↗ +28% vs semaine</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-blue-200">
                    <div className="text-xs text-blue-600 font-medium">{t.home.heroCardPosts}</div>
                    <div className="text-xl font-bold text-blue-900">24</div>
                    <div className="text-[10px] text-blue-600">{t.home.heroCardCharts}</div>
                  </div>
                </div>

                {/* Insight preview */}
                <div className="bg-white rounded-lg p-3 border border-blue-200">
                  <div className="flex items-start gap-2">
                    <span className="text-lg">🎯</span>
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-blue-900 mb-1">{t.home.heroCardRecommendation}</p>
                      <p className="text-[11px] text-neutral-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: t.home.heroCardRecommendationText }} />
                    </div>
                  </div>
                </div>

                <div className="bg-blue-600 rounded-lg p-3 text-center">
                  <p className="text-xs font-bold text-white">✨ {t.home.heroCardInsights}</p>
                </div>
              </div>

              <div className="p-3 bg-white border-t border-blue-200 text-center">
                <a href="/assistant" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                  {t.home.heroCardDiscover}
                </a>
              </div>
            </div>
          </SlideInRight>
        </div>
      </section>

      {/* OFFRE D'ESSAI 4.99€ - MIS EN AVANT */}
      <section className="bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-600 py-4 border-y border-blue-700">
        <div className="max-w-6xl mx-auto px-6">
          <FadeUp>
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-white">
            <div className="flex items-center gap-3">
              <span className="text-xl">⚡</span>
              <div>
                <p className="font-semibold">{t.home.sprintTitle}</p>
                <p className="text-xs text-blue-100">{t.home.sprintSubtitle}</p>
              </div>
            </div>
            <button onClick={() => startCheckout('sprint')} className="px-5 py-2 rounded-lg bg-white text-blue-600 font-semibold hover:bg-blue-50 transition-all text-sm whitespace-nowrap">
              {t.home.sprintCta}
            </button>
          </div>
          </FadeUp>
        </div>
      </section>

      {/* QUIZ INTERACTIF + ROI CALCULATOR */}
      <QuizAndCalculator />

      {/* VIDÉO WORKFLOW - Compact version */}
      <section className="bg-gradient-to-br from-blue-50/50 to-cyan-50/50 border-b border-blue-100">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="flex flex-col md:flex-row items-center gap-6">
            {/* Texte + Video à gauche */}
            <div className="md:w-2/5">
              <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
                <span>🎬</span>
                <span>{t.home.videoTitle}</span>
              </h3>
              <p className="text-sm text-neutral-600 mb-4">
                {t.home.videoSubtitle}
              </p>

              {/* Vidéo compacte */}
              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="relative bg-neutral-900 aspect-video flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-14 h-14 bg-red-600 rounded-full flex items-center justify-center mx-auto hover:scale-110 transition-transform cursor-pointer">
                      <svg className="w-7 h-7 ml-0.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Points clés à droite */}
            <StaggerContainer className="md:w-3/5 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StaggerItem><div className="bg-white rounded-lg p-3 border border-blue-100 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all">
                <div className="text-xl mb-1">⚡</div>
                <div className="font-semibold text-xs mb-0.5">{t.home.videoCard1Title}</div>
                <div className="text-[10px] text-neutral-600">{t.home.videoCard1Desc}</div>
              </div></StaggerItem>
              <StaggerItem><div className="bg-white rounded-lg p-3 border border-blue-100 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all">
                <div className="text-xl mb-1">🎯</div>
                <div className="font-semibold text-xs mb-0.5">{t.home.videoCard2Title}</div>
                <div className="text-[10px] text-neutral-600">{t.home.videoCard2Desc}</div>
              </div></StaggerItem>
              <StaggerItem><div className="bg-white rounded-lg p-3 border border-blue-100 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all">
                <div className="text-xl mb-1">📈</div>
                <div className="font-semibold text-xs mb-0.5">{t.home.videoCard3Title}</div>
                <div className="text-[10px] text-neutral-600">{t.home.videoCard3Desc}</div>
              </div></StaggerItem>
            </StaggerContainer>
          </div>
        </div>
      </section>

      {/* COMMENT ÇA MARCHE */}
      <section className="border-y bg-neutral-50/60">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <FadeUp><h2 className="text-2xl font-semibold">{t.home.howTitle}</h2></FadeUp>
          <StaggerContainer className="mt-6 grid md:grid-cols-3 gap-6" staggerDelay={0.15}>
            <StaggerItem><Step num="1" title={t.home.step1Title}>
              {t.home.step1Desc}
            </Step></StaggerItem>
            <StaggerItem><Step num="2" title={t.home.step2Title}>
              {t.home.step2Desc}
            </Step></StaggerItem>
            <StaggerItem><Step num="3" title={t.home.step3Title}>
              {t.home.step3Desc}
            </Step></StaggerItem>
          </StaggerContainer>
        </div>
      </section>

      {/* GALERIE & POSTS MULTI-PLATEFORME */}
      <section className="mx-auto max-w-6xl px-6 py-12">
        <FadeUp>
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold">{t.home.galleryTitle}</h2>
          <p className="mt-2 text-neutral-600">{t.home.gallerySubtitle}</p>
        </div>
        </FadeUp>

        <div className="grid lg:grid-cols-2 gap-8 items-center">
          {/* Galerie preview */}
          <SlideInLeft><div className="rounded-2xl border-2 border-blue-200 overflow-hidden bg-white shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all">
            <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-4">
              <h3 className="text-white font-bold flex items-center gap-2">
                <span>📁</span> {t.home.galleryOrganized}
              </h3>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="aspect-square rounded-lg overflow-hidden border border-blue-200 shadow-sm">
                  <img
                    src="https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?q=80&w=400&auto=format&fit=crop"
                    alt="Exemple visuel"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="aspect-square rounded-lg overflow-hidden border border-blue-200 shadow-sm">
                  <img
                    src="https://images.unsplash.com/photo-1557804506-669a67965ba0?q=80&w=400&auto=format&fit=crop"
                    alt="Exemple visuel"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="aspect-square rounded-lg overflow-hidden border border-blue-200 shadow-sm">
                  <img
                    src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=400&auto=format&fit=crop"
                    alt="Exemple visuel"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="aspect-square rounded-lg overflow-hidden border border-blue-200 shadow-sm">
                  <img
                    src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=400&auto=format&fit=crop"
                    alt="Exemple visuel"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="aspect-square rounded-lg overflow-hidden border border-blue-200 shadow-sm">
                  <img
                    src="https://images.unsplash.com/photo-1533750516457-a7f992034fec?q=80&w=400&auto=format&fit=crop"
                    alt="Exemple visuel"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="aspect-square rounded-lg overflow-hidden border border-blue-200 shadow-sm">
                  <img
                    src="https://images.unsplash.com/photo-1552664730-d307ca884978?q=80&w=400&auto=format&fit=crop"
                    alt="Exemple visuel"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-blue-600">
                  <span>✓</span>
                  <span>{t.home.galleryFolder}</span>
                </div>
                <div className="flex items-center gap-2 text-blue-600">
                  <span>✓</span>
                  <span>{t.home.galleryDragDrop}</span>
                </div>
                <div className="flex items-center gap-2 text-blue-600">
                  <span>✓</span>
                  <span>{t.home.galleryEditTitle}</span>
                </div>
              </div>
            </div>
          </div></SlideInLeft>

          {/* Multi-platform automation preview */}
          <SlideInRight><div className="rounded-2xl border-2 border-blue-200 overflow-hidden bg-white shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all">
            <div className="bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-500 p-4">
              <h3 className="text-white font-bold flex items-center gap-2">
                <span>📱</span> {t.home.galleryPostsTitle}
              </h3>
            </div>
            <div className="p-5 space-y-3">
              <div className="bg-white rounded-lg p-3 border border-blue-200">
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-lg">✨</span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-blue-900">{t.home.galleryCaptionTitle}</p>
                    <p className="text-[11px] text-neutral-600 mt-1">
                      "🔥 Cette semaine, on parle de [ton sujet]...<br/>
                      ✅ 3 actions concrètes<br/>
                      💡 Conseil d'expert"
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-blue-200">
                <div className="flex items-start gap-2">
                  <span className="text-lg">#️⃣</span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-blue-900">{t.home.galleryHashtagTitle}</p>
                    <p className="text-[11px] text-blue-600 mt-1">
                      {t.home.galleryHashtagOptimized}
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2 text-blue-600">
                  <span>✓</span>
                  <span>{t.home.galleryPublishInstagram}</span>
                </div>
                <div className="flex items-center gap-2 text-blue-600">
                  <span>✓</span>
                  <span>{t.home.galleryPublishTikTok}</span>
                </div>
                <div className="flex items-center gap-2 text-blue-600">
                  <span>✓</span>
                  <span>{t.home.galleryDrafts}</span>
                </div>
              </div>
            </div>
            <div className="p-3 bg-white border-t border-blue-200 text-center">
              <a href="/library" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                {t.home.galleryViewCta}
              </a>
            </div>
          </div></SlideInRight>
        </div>

        <FadeUp><div className="mt-8 bg-gradient-to-r from-purple-50 via-pink-50 to-cyan-50 rounded-2xl border-2 border-blue-200 p-6 text-center">
          <p className="text-sm text-blue-900" dangerouslySetInnerHTML={{ __html: t.home.galleryMultiPlatform }} />
        </div></FadeUp>

        {/* CTA après Galerie */}
        <div className="mt-10 text-center">
          <a href="/generate" className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold text-lg hover:shadow-xl transition-all hover:scale-105">
            {t.home.galleryCta}
          </a>
          <p className="mt-3 text-sm text-neutral-600">
            {t.home.galleryCtaSub}
          </p>
        </div>
      </section>

      {/* EXEMPLE CONCRET AVANT/APRÈS */}
      <section id="exemple" className="mx-auto max-w-6xl px-6 py-12">
        <FadeUp>
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold">{t.home.beforeAfterTitle}</h2>
          <p className="mt-2 text-neutral-600">{t.home.beforeAfterSubtitle}</p>
        </div>
        </FadeUp>

        <div className="grid lg:grid-cols-2 gap-8 items-start">
          {/* AVANT - Vraiment amateur */}
          <SlideInLeft><div className="relative">
            <div className="absolute -top-3 -left-3 bg-neutral-600 text-white px-4 py-1 rounded-full text-sm font-semibold shadow-lg z-10">
              {t.home.beforeLabel}
            </div>
            <div className="rounded-2xl border-2 border-neutral-300 overflow-hidden bg-white">
              {/* Selfie miroir super amateur */}
              <div className="relative bg-neutral-200">
                <img
                  src="https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?q=40&w=800&auto=format&fit=crop"
                  alt="Selfie miroir salle de sport amateur"
                  className="w-full aspect-square object-cover opacity-85 brightness-110"
                />
              </div>

              {/* Caption Instagram fade */}
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-red-500"></div>
                  <span className="text-sm font-semibold">coach_maxime</span>
                </div>
                <p className="text-sm text-neutral-600 whitespace-pre-line">
                  {t.home.beforeCaption}
                </p>
                <div className="pt-2 border-t border-neutral-200">
                  <p className="text-xs text-neutral-500">{t.home.beforeStats}</p>
                </div>
              </div>

              {/* Résultat */}
              <div className="bg-neutral-100 p-4 text-center border-t border-neutral-200">
                <p className="text-sm font-semibold text-neutral-700">{t.home.beforeResult}</p>
                <p className="text-xs text-neutral-500 mt-1">{t.home.beforeResultSub}</p>
              </div>
            </div>
          </div></SlideInLeft>

          {/* APRÈS - Overlay simple et réaliste Keiro */}
          <SlideInRight><div className="relative">
            <div className="absolute -top-3 -left-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white px-4 py-1 rounded-full text-sm font-semibold shadow-lg z-10 animate-glow">
              {t.home.afterLabel}
            </div>
            <div className="rounded-2xl border-2 border-blue-400 overflow-hidden bg-white shadow-2xl">
              {/* Image pro avec overlay SIMPLE et RÉALISTE */}
              <div className="relative">
                <img
                  src="https://images.unsplash.com/photo-1534258936925-c58bed479fcb?q=95&w=800&auto=format&fit=crop"
                  alt={t.home.afterImageAlt}
                  className="w-full aspect-square object-cover"
                />
                {/* Overlay Keiro - Style discret et professionnel */}
                <div className="absolute inset-0 flex flex-col items-center justify-center p-8">
                  <div className="bg-black/70 backdrop-blur-sm px-8 py-4 rounded-xl">
                    <h3 className="text-2xl md:text-3xl font-bold text-white text-center">
                      {t.home.afterOverlay}
                    </h3>
                  </div>
                </div>
              </div>

              {/* Caption Instagram optimisée par IA */}
              <div className="p-4 space-y-3 bg-gradient-to-b from-white to-blue-50/30">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 ring-2 ring-blue-300"></div>
                  <span className="text-sm font-semibold">coach_maxime</span>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">{t.home.afterBadge}</span>
                </div>
                <p className="text-sm text-neutral-800 leading-relaxed whitespace-pre-line">
                  <span className="font-bold text-blue-600">{t.home.afterCaptionTitle}</span> 💪{'\n\n'}
                  {t.home.afterCaptionBody}{'\n\n'}
                  <span className="font-bold">{t.home.afterCaptionResult}</span>{'\n'}(ou remboursé){'\n\n'}
                  {t.home.afterCaptionCta}{'\n'}
                  <span className="text-xs text-neutral-600">{t.home.afterCaptionLimit}</span>
                </p>
                <p className="text-xs text-blue-600 font-medium">{t.home.afterHashtags}</p>
                <div className="pt-2 border-t border-blue-200">
                  <p className="text-xs text-blue-600 font-bold">{t.home.afterStats}</p>
                </div>
              </div>

              {/* Résultat */}
              <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-4 text-center border-t-2 border-cyan-400">
                <p className="text-sm font-bold text-white">{t.home.afterResult}</p>
                <p className="text-xs text-white/90 mt-1">{t.home.afterResultSub}</p>
              </div>
            </div>
          </div></SlideInRight>
        </div>

        {/* Explication sous les images */}
        <div className="mt-8 bg-blue-50 rounded-2xl border border-blue-200 p-6">
          <h3 className="text-lg font-bold text-blue-900 mb-3">{t.home.changeTitle}</h3>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="flex items-start gap-2">
              <span className="text-blue-500 text-xl">✓</span>
              <div>
                <p className="text-sm font-semibold text-blue-900">{t.home.change1Title}</p>
                <p className="text-xs text-blue-700">{t.home.change1Desc}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-blue-500 text-xl">✓</span>
              <div>
                <p className="text-sm font-semibold text-blue-900">{t.home.change2Title}</p>
                <p className="text-xs text-blue-700">{t.home.change2Desc}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-blue-500 text-xl">✓</span>
              <div>
                <p className="text-sm font-semibold text-blue-900">{t.home.change3Title}</p>
                <p className="text-xs text-blue-700">{t.home.change3Desc}</p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-10 text-center">
          <a href="/generate" className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold text-lg hover:shadow-xl transition-all hover:scale-105">
            {t.home.generateFirstCta}
          </a>
        </div>
      </section>

      {/* ASSISTANT IA MARKETING — DARK SECTION */}
      <section className="relative border-y bg-[#0B1120] overflow-hidden">
        <AnimatedGradientBG variant="dark" />
        <div className="relative mx-auto max-w-6xl px-6 py-12">
          <FadeUp>
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-blue-300 text-xs font-medium mb-4">
              <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse"></span>
              {t.home.aiBadge}
            </div>
            <h2 className="text-3xl font-bold text-white">{t.home.aiTitle}</h2>
            <p className="mt-2 text-blue-200">{t.home.aiSubtitle}</p>
          </div>
          </FadeUp>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Analytics Dashboard Preview */}
            <SlideInLeft><div className="rounded-2xl border border-white/10 overflow-hidden bg-white/5 backdrop-blur-sm shadow-xl">
              <div className="bg-white/10 p-5">
                <h3 className="text-white font-bold text-lg flex items-center gap-2">
                  <span>📊</span> {t.home.aiDashboardTitle}
                </h3>
                <p className="text-blue-300 text-sm mt-1">{t.home.aiDashboardSub}</p>
              </div>

              <div className="p-5 space-y-4">
                {/* Stats cards preview */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                    <div className="text-xs text-blue-300 font-semibold mb-1">{t.home.aiThisWeek}</div>
                    <div className="text-2xl font-bold text-white"><CountUp target={12} /></div>
                    <div className="text-xs text-blue-400">{t.home.aiVisualsGenerated}</div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                    <div className="text-xs text-blue-300 font-semibold mb-1">{t.home.aiEngagement}</div>
                    <div className="text-2xl font-bold text-white"><CountUp target={347} suffix="%" prefix="+" /></div>
                    <div className="text-xs text-blue-400 font-semibold">↗ +40%</div>
                  </div>
                </div>

                {/* Charts preview */}
                <div className="space-y-3">
                  <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                    <p className="text-xs font-semibold text-blue-300 mb-2">{t.home.aiEvolution}</p>
                    <div className="h-20 bg-white/5 rounded flex items-end justify-around p-2">
                      {[40, 60, 45, 80, 70, 95].map((h, i) => (
                        <div key={i} className="bg-gradient-to-t from-blue-500 to-cyan-400 rounded-t" style={{ height: `${h}%`, width: '12%' }}></div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                    <p className="text-xs font-semibold text-blue-300 mb-2">{t.home.aiBestTimes}</p>
                    <div className="h-16 bg-white/5 rounded flex items-center justify-center">
                      <p className="text-xs text-blue-300 font-semibold">{t.home.aiBestTimesValue}</p>
                    </div>
                  </div>

                  <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                    <p className="text-xs font-semibold text-blue-300 mb-2">{t.home.aiTopCategories}</p>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="h-2 bg-gradient-to-r from-blue-500 to-cyan-400 rounded" style={{ width: '80%' }}></div>
                        <span className="text-[10px] text-blue-400">Tech</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-2 bg-gradient-to-r from-blue-400 to-cyan-300 rounded" style={{ width: '60%' }}></div>
                        <span className="text-[10px] text-blue-400">Business</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white/10 rounded-lg p-3 border border-white/10 text-center">
                  <p className="text-xs text-blue-300 font-semibold">{t.home.aiMoreCharts}</p>
                  <p className="text-[10px] text-blue-400 mt-1">{t.home.aiMoreChartsSub}</p>
                </div>
              </div>
            </div></SlideInLeft>

            {/* AI Insights Preview */}
            <SlideInRight><div className="space-y-4">
              <div className="rounded-2xl border border-white/10 overflow-hidden bg-white/5 backdrop-blur-sm shadow-xl">
                <div className="bg-white/10 p-5">
                  <h3 className="text-white font-bold text-lg flex items-center gap-2">
                    <span>🎯</span> {t.home.aiStrategicTitle}
                  </h3>
                  <p className="text-blue-300 text-sm mt-1">{t.home.aiStrategicSub}</p>
                </div>

                <div className="p-5 space-y-3">
                  {/* Insight 1 */}
                  <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                    <div className="flex items-start gap-2 mb-2">
                      <span className="text-2xl">🎯</span>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-white mb-1">{t.home.aiInsight1Title}</p>
                        <p className="text-xs text-blue-200 leading-relaxed mb-2" dangerouslySetInnerHTML={{ __html: t.home.aiInsight1Text }} />
                        <div className="bg-white/10 rounded p-2">
                          <p className="text-[10px] text-blue-300" dangerouslySetInnerHTML={{ __html: t.home.aiInsight1Tip }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Insight 2 */}
                  <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                    <div className="flex items-start gap-2 mb-2">
                      <span className="text-2xl">⏰</span>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-white mb-1">{t.home.aiInsight2Title}</p>
                        <p className="text-xs text-blue-200 leading-relaxed mb-2" dangerouslySetInnerHTML={{ __html: t.home.aiInsight2Text }} />
                        <div className="bg-white/10 rounded p-2">
                          <p className="text-[10px] text-blue-300" dangerouslySetInnerHTML={{ __html: t.home.aiInsight2Tip }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Insight 3 */}
                  <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                    <div className="flex items-start gap-2 mb-2">
                      <span className="text-2xl">🔮</span>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-white mb-1">{t.home.aiInsight3Title}</p>
                        <p className="text-xs text-blue-200 leading-relaxed mb-2" dangerouslySetInnerHTML={{ __html: t.home.aiInsight3Text }} />
                        <div className="bg-white/10 rounded p-2">
                          <p className="text-[10px] text-blue-300" dangerouslySetInnerHTML={{ __html: t.home.aiInsight3Tip }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Features list */}
              <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-5 shadow-lg">
                <h4 className="font-bold text-white mb-3 flex items-center gap-2">
                  <span>✨</span> {t.home.aiFeaturesTitle}
                </h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 text-lg">✓</span>
                    <span className="text-blue-200" dangerouslySetInnerHTML={{ __html: t.home.aiFeature1 }} />
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 text-lg">✓</span>
                    <span className="text-blue-200" dangerouslySetInnerHTML={{ __html: t.home.aiFeature2 }} />
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 text-lg">✓</span>
                    <span className="text-blue-200" dangerouslySetInnerHTML={{ __html: t.home.aiFeature3 }} />
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 text-lg">✓</span>
                    <span className="text-blue-200" dangerouslySetInnerHTML={{ __html: t.home.aiFeature4 }} />
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 text-lg">✓</span>
                    <span className="text-blue-200" dangerouslySetInnerHTML={{ __html: t.home.aiFeature5 }} />
                  </li>
                </ul>
              </div>
            </div></SlideInRight>
          </div>

          {/* CTA */}
          <FadeUp>
          <div className="mt-10 text-center">
            <a href="/assistant" className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold text-lg hover:shadow-xl transition-all hover:scale-105 cta-shimmer">
              {t.home.aiCta}
            </a>
            <p className="mt-3 text-sm text-blue-300">
              {t.home.aiCtaSub}
            </p>
          </div>
          </FadeUp>
        </div>
      </section>

      {/* TÉMOIGNAGES CLIENTS */}
      <section className="mx-auto max-w-6xl px-6 py-12">
        <FadeUp>
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold mb-2">{t.home.testimonialsTitle}</h2>
          <p className="text-neutral-600">{t.home.testimonialsSub}</p>
        </div>
        </FadeUp>

        <StaggerContainer className="grid md:grid-cols-3 gap-6">
          {/* Témoignage 1 */}
          <StaggerItem><div className="bg-white rounded-2xl border-2 border-blue-100 p-6 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all">
            <div className="flex items-center gap-1 mb-4 text-purple-400">
              <span>⭐</span>
              <span>⭐</span>
              <span>⭐</span>
              <span>⭐</span>
              <span>⭐</span>
            </div>
            <p className="text-neutral-700 mb-4 leading-relaxed" dangerouslySetInnerHTML={{ __html: t.home.testimonial1 }} />
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-lg">
                M
              </div>
              <div>
                <div className="font-bold text-neutral-900">{t.home.testimonial1Author}</div>
                <div className="text-sm text-neutral-600">{t.home.testimonial1Business}</div>
              </div>
            </div>
          </div></StaggerItem>

          {/* Témoignage 2 */}
          <StaggerItem><div className="bg-white rounded-2xl border-2 border-blue-100 p-6 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all">
            <div className="flex items-center gap-1 mb-4 text-blue-400">
              <span>⭐</span>
              <span>⭐</span>
              <span>⭐</span>
              <span>⭐</span>
              <span>⭐</span>
            </div>
            <p className="text-neutral-700 mb-4 leading-relaxed" dangerouslySetInnerHTML={{ __html: t.home.testimonial2 }} />
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-lg">
                T
              </div>
              <div>
                <div className="font-bold text-neutral-900">{t.home.testimonial2Author}</div>
                <div className="text-sm text-neutral-600">{t.home.testimonial2Business}</div>
              </div>
            </div>
          </div></StaggerItem>

          {/* Témoignage 3 */}
          <StaggerItem><div className="bg-white rounded-2xl border-2 border-blue-100 p-6 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all">
            <div className="flex items-center gap-1 mb-4 text-blue-400">
              <span>⭐</span>
              <span>⭐</span>
              <span>⭐</span>
              <span>⭐</span>
              <span>⭐</span>
            </div>
            <p className="text-neutral-700 mb-4 leading-relaxed" dangerouslySetInnerHTML={{ __html: t.home.testimonial3 }} />
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-lg">
                S
              </div>
              <div>
                <div className="font-bold text-neutral-900">{t.home.testimonial3Author}</div>
                <div className="text-sm text-neutral-600">{t.home.testimonial3Business}</div>
              </div>
            </div>
          </div></StaggerItem>
        </StaggerContainer>

        {/* CTA après témoignages */}
        <div className="mt-10 text-center">
          <a href="/generate" className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold text-lg hover:shadow-xl transition-all hover:scale-105">
            {t.home.testimonialCta}
          </a>
          <p className="mt-3 text-sm text-neutral-600">
            {t.home.testimonialCtaSub}
          </p>
        </div>
        <p className="text-xs text-center text-neutral-400 mt-2 italic">Retours basés sur des tests utilisateurs</p>
      </section>

      {/* POURQUOI PUBLIER SUR L'ACTU */}
      <section className="border-y bg-neutral-50/60">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <h2 className="text-2xl font-semibold">{t.home.whyTitle}</h2>
          <div className="mt-6 grid md:grid-cols-3 gap-6 text-neutral-700">
            <Card>{t.home.why1}</Card>
            <Card>{t.home.why2}</Card>
            <Card>{t.home.why3}</Card>
          </div>
        </div>
      </section>

      {/* LE VRAI COÛT DE NE RIEN FAIRE */}
      <FadeUp>
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-bold mb-3">
            Vous n&apos;avez pas de graphiste ni de CM ?{' '}
            <span className="gradient-text">Le vrai coût, c&apos;est l&apos;invisibilité.</span>
          </h2>
          <p className="text-lg text-neutral-600">
            Chaque jour sans Instagram, des clients potentiels choisissent votre concurrent.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-10">
          {/* Card 1 — Ne rien faire */}
          <div className="bg-neutral-100 rounded-2xl border border-neutral-200 p-6">
            <h3 className="text-lg font-bold text-neutral-700 mb-3">&quot;Ne rien faire&quot;</h3>
            <ul className="space-y-2 text-sm text-neutral-600">
              <li><span className="font-semibold text-neutral-800">Coût :</span> 0€/mois</li>
              <li><span className="font-semibold text-neutral-800">Résultat :</span> Invisible en ligne</li>
              <li><span className="font-semibold text-neutral-800">Nouveaux clients via Instagram :</span> 0</li>
            </ul>
            <p className="mt-3 text-xs text-neutral-500 italic">
              &quot;Les 72% de 18-35 ans qui choisissent un commerce sur Instagram ne vous trouveront jamais.&quot;
            </p>
          </div>

          {/* Card 2 — Le neveu / le stagiaire */}
          <div className="bg-neutral-100 rounded-2xl border border-neutral-200 p-6">
            <h3 className="text-lg font-bold text-neutral-700 mb-3">&quot;Le neveu / le stagiaire&quot;</h3>
            <ul className="space-y-2 text-sm text-neutral-600">
              <li><span className="font-semibold text-neutral-800">Coût :</span> &quot;Gratuit&quot; (mais votre temps + résultats amateurs)</li>
              <li><span className="font-semibold text-neutral-800">Résultat :</span> 1 post par mois, photo floue, pas de stratégie</li>
              <li><span className="font-semibold text-neutral-800">Nouveaux clients :</span> Quasi 0</li>
            </ul>
            <p className="mt-3 text-xs text-neutral-500 italic">
              &quot;Un post tous les 2 mois avec une photo au smartphone ne trompe personne.&quot;
            </p>
          </div>

          {/* Card 3 — Canva tout seul */}
          <div className="bg-neutral-100 rounded-2xl border border-neutral-200 p-6">
            <h3 className="text-lg font-bold text-neutral-700 mb-3">&quot;Canva tout seul&quot;</h3>
            <ul className="space-y-2 text-sm text-neutral-600">
              <li><span className="font-semibold text-neutral-800">Coût :</span> 12€/mois + 3h de VOTRE temps par semaine</li>
              <li><span className="font-semibold text-neutral-800">Résultat :</span> Visuels corrects mais vous faites tout vous-même</li>
              <li><span className="font-semibold text-neutral-800">Clients :</span> Possible mais combien vaut votre temps ?</li>
            </ul>
            <p className="mt-3 text-xs text-neutral-500 italic">
              &quot;Votre temps vaut plus que 12€/mois. Vous êtes commerçant, pas graphiste.&quot;
            </p>
          </div>

          {/* Card 4 — KeiroAI */}
          <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-2xl border-2 border-blue-400 p-6 shadow-lg relative">
            <div className="absolute -top-2 -right-2 text-xl">⭐</div>
            <h3 className="text-lg font-bold text-blue-900 mb-3">&quot;KeiroAI&quot;</h3>
            <ul className="space-y-2 text-sm text-neutral-700">
              <li><span className="font-semibold text-blue-900">Coût :</span> à partir de 49€ le 1er mois</li>
              <li><span className="font-semibold text-blue-900">Résultat :</span> 3 à 6 posts pro par semaine, brandés, liés à l&apos;actu</li>
              <li><span className="font-semibold text-blue-900">Clients :</span> Le calcul est simple ↓</li>
            </ul>
            <p className="mt-3 text-xs text-blue-600 italic">
              &quot;Instagram crée pour vous + texte + hashtags + stats. Vous publiez en 30 secondes.&quot;
            </p>
          </div>
        </div>

        {/* ROI Table */}
        <div className="bg-white rounded-2xl border-2 border-blue-200 overflow-hidden shadow-lg">
          <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-4">
            <h3 className="text-white font-bold text-lg text-center">Combien de ventes pour rentabiliser KeiroAI ?</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-blue-50 border-b border-blue-200">
                  <th className="text-left p-3 font-semibold text-blue-900">Votre commerce</th>
                  <th className="text-center p-3 font-semibold text-blue-900">Ticket moyen</th>
                  <th className="text-center p-3 font-semibold text-blue-900">Pro (89€)</th>
                  <th className="text-center p-3 font-semibold text-blue-900">Fondateurs (149€)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-neutral-100">
                  <td className="p-3 font-medium">Boutique mode/déco</td>
                  <td className="p-3 text-center text-neutral-600">80-200€</td>
                  <td className="p-3 text-center font-semibold text-blue-600">1 vente</td>
                  <td className="p-3 text-center font-semibold text-blue-600">2 ventes</td>
                </tr>
                <tr className="border-b border-neutral-100 bg-neutral-50">
                  <td className="p-3 font-medium">Coach sportif</td>
                  <td className="p-3 text-center text-neutral-600">40-80€</td>
                  <td className="p-3 text-center font-semibold text-blue-600">1-2 séances</td>
                  <td className="p-3 text-center font-semibold text-blue-600">2-3 séances</td>
                </tr>
                <tr className="border-b border-neutral-100">
                  <td className="p-3 font-medium">Coiffeur / Barbier</td>
                  <td className="p-3 text-center text-neutral-600">25-50€</td>
                  <td className="p-3 text-center font-semibold text-blue-600">2-4 coupes</td>
                  <td className="p-3 text-center font-semibold text-blue-600">4-6 coupes</td>
                </tr>
                <tr className="border-b border-neutral-100 bg-neutral-50">
                  <td className="p-3 font-medium">Restaurant (soir)</td>
                  <td className="p-3 text-center text-neutral-600">25-45€</td>
                  <td className="p-3 text-center font-semibold text-blue-600">5 couverts</td>
                  <td className="p-3 text-center font-semibold text-blue-600">7 couverts</td>
                </tr>
                <tr className="border-b border-neutral-100">
                  <td className="p-3 font-medium">Caviste / Fromagerie</td>
                  <td className="p-3 text-center text-neutral-600">30-100€</td>
                  <td className="p-3 text-center font-semibold text-blue-600">2-3 paniers</td>
                  <td className="p-3 text-center font-semibold text-blue-600">4-5 paniers</td>
                </tr>
                <tr className="border-b border-neutral-100 bg-neutral-50">
                  <td className="p-3 font-medium">Fleuriste</td>
                  <td className="p-3 text-center text-neutral-600">30-80€</td>
                  <td className="p-3 text-center font-semibold text-blue-600">2-3 bouquets</td>
                  <td className="p-3 text-center font-semibold text-blue-600">4-5 bouquets</td>
                </tr>
                <tr className="bg-blue-50">
                  <td className="p-3 font-medium">Traiteur</td>
                  <td className="p-3 text-center text-neutral-600">500-5000€</td>
                  <td className="p-3 text-center font-semibold text-blue-600">1 devis = payé 6 mois</td>
                  <td className="p-3 text-center font-semibold text-blue-600">1 devis = payé 3 mois</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
      </FadeUp>

      {/* COMPARATIF AU MOIS — IMPACTANT */}
      <FadeUp>
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-bold mb-3">
            {t.home.comparatorTitle}
          </h2>
          <p className="text-lg text-neutral-600">{t.home.comparatorSubtitle}</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-10">
          {/* Colonne Graphiste */}
          <div className="bg-red-50 rounded-2xl border-2 border-red-200 p-6 relative">
            <div className="absolute -top-3 left-4">
              <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-xs font-bold">Graphiste freelance — 800 à 2 000€/mois</span>
            </div>
            <div className="pt-4">
              <p className="text-2xl font-bold text-red-500 mb-1">800–2 000€<span className="text-base font-normal text-red-400">/mois</span></p>
              <ul className="mt-4 space-y-2 text-sm text-neutral-600">
                <li className="flex gap-2"><span className="text-red-400">✗</span> Délai : 2 à 5 jours par visuel</li>
                <li className="flex gap-2"><span className="text-red-400">✗</span> Modifications payantes (chaque retouche = facture)</li>
                <li className="flex gap-2"><span className="text-red-400">✗</span> Pas de réactivité sur l&apos;actualité</li>
                <li className="flex gap-2"><span className="text-red-400">✗</span> Aucune vidéo incluse (surcoût)</li>
                <li className="flex gap-2"><span className="text-red-400">✗</span> Pas de texte ni légendes</li>
                <li className="flex gap-2"><span className="text-red-400">✗</span> Pas de hashtags ni stratégie</li>
                <li className="flex gap-2"><span className="text-red-400">✗</span> Aucune statistique ni analyse</li>
                <li className="flex gap-2"><span className="text-red-400">✗</span> Pas de publication : il livre le fichier</li>
                <li className="flex gap-2"><span className="text-red-400">✗</span> Briefings longs à rédiger</li>
                <li className="flex gap-2"><span className="text-red-400">✗</span> Congés, vacances, indisponibilités</li>
              </ul>
            </div>
          </div>

          {/* Colonne CM */}
          <div className="bg-red-50 rounded-2xl border-2 border-red-200 p-6 relative">
            <div className="absolute -top-3 left-4">
              <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-xs font-bold">Community Manager — 1 500 à 3 000€/mois</span>
            </div>
            <div className="pt-4">
              <p className="text-2xl font-bold text-red-500 mb-1">1 500–3 000€<span className="text-base font-normal text-red-400">/mois</span></p>
              <ul className="mt-4 space-y-2 text-sm text-neutral-600">
                <li className="flex gap-2"><span className="text-red-400">✗</span> Rédaction de légendes manuelle</li>
                <li className="flex gap-2"><span className="text-red-400">✗</span> Planification basique</li>
                <li className="flex gap-2"><span className="text-red-400">✗</span> 1 seul réseau en général</li>
                <li className="flex gap-2"><span className="text-red-400">✗</span> Pas de génération IA de visuels</li>
                <li className="flex gap-2"><span className="text-red-400">✗</span> Pas de branding automatique</li>
                <li className="flex gap-2"><span className="text-red-400">✗</span> Pas de multi-format automatique</li>
                <li className="flex gap-2"><span className="text-red-400">✗</span> Congés, absences, rotation du personnel</li>
                <li className="flex gap-2"><span className="text-red-400">✗</span> Qualité variable selon la personne</li>
                <li className="flex gap-2"><span className="text-red-400">✗</span> Pas de vidéo IA ni audio narration</li>
                <li className="flex gap-2"><span className="text-red-400">✗</span> Reporting basique, souvent mensuel</li>
              </ul>
            </div>
          </div>

          {/* Colonne KeiroAI */}
          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl border-2 border-blue-400 p-6 relative shadow-lg shadow-blue-100">
            <div className="absolute -top-3 left-4">
              <span className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white px-3 py-1 rounded-full text-xs font-bold">KeiroAI — à partir de 49€/mois</span>
            </div>
            <div className="pt-4">
              <p className="text-2xl font-bold text-blue-600 mb-1">49€<span className="text-base font-normal text-blue-400">/mois</span></p>
              <ul className="mt-4 space-y-2 text-sm text-neutral-700">
                <li className="flex gap-2"><span className="text-blue-500 font-bold">✓</span> <span><strong>3 minutes</strong> par visuel, instantané</span></li>
                <li className="flex gap-2"><span className="text-blue-500 font-bold">✓</span> <span>Modifications <strong>illimitées</strong>, en temps réel</span></li>
                <li className="flex gap-2"><span className="text-blue-500 font-bold">✓</span> <span>Visuels <strong>liés à l&apos;actualité du jour</strong></span></li>
                <li className="flex gap-2"><span className="text-blue-500 font-bold">✓</span> <span><strong>Vidéo IA + audio narration</strong> inclus</span></li>
                <li className="flex gap-2"><span className="text-blue-500 font-bold">✓</span> <span><strong>Texte, légendes, hashtags</strong> générés automatiquement</span></li>
                <li className="flex gap-2"><span className="text-blue-500 font-bold">✓</span> <span><strong>Instagram + TikTok + LinkedIn</strong> (multi-plateforme)</span></li>
                <li className="flex gap-2"><span className="text-blue-500 font-bold">✓</span> <span><strong>Branding personnalisé</strong> (Fondateurs)</span></li>
                <li className="flex gap-2"><span className="text-blue-500 font-bold">✓</span> <span><strong>Multi-format automatique</strong> (Fondateurs)</span></li>
                <li className="flex gap-2"><span className="text-blue-500 font-bold">✓</span> <span><strong>Statistiques et analyse</strong> intégrées</span></li>
                <li className="flex gap-2"><span className="text-blue-500 font-bold">✓</span> <span><strong>Assistant IA marketing</strong> personnalisé</span></li>
                <li className="flex gap-2"><span className="text-blue-500 font-bold">✓</span> <span>Disponible <strong>24/7</strong>, jamais en congé</span></li>
                <li className="flex gap-2"><span className="text-blue-500 font-bold">✓</span> <span><strong>Calendrier de planification</strong> intégré</span></li>
              </ul>
            </div>
          </div>
        </div>

        {/* Barre économie */}
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl border border-green-200 p-6 text-center mb-8">
          <p className="text-neutral-700 text-base font-medium">
            Économie moyenne constatée : <strong className="text-green-600 text-2xl">-95%</strong> soit <strong className="text-green-600">2 350€ à 4 850€ économisés</strong> chaque mois
          </p>
        </div>

        {/* CTA après Comparatif */}
        <div className="text-center">
          <a href="/generate" className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold text-lg hover:shadow-xl transition-all hover:scale-105 cta-shimmer">
            {t.home.comparatorCta}
          </a>
          <p className="mt-3 text-sm text-neutral-500">
            {t.home.comparatorCtaSub}
          </p>
        </div>
      </section>
      </FadeUp>

      {/* PRICING */}
      <section className="border-y bg-neutral-50/60">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <FadeUp><div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-bold mb-6 shadow-lg animate-glow">
              <span className="h-2 w-2 rounded-full bg-white animate-pulse"></span>
              {t.home.pricingBadge}
            </div>
            <h2 className="text-4xl font-bold mb-4">{t.home.pricingTitle}</h2>
            <p className="text-lg text-neutral-600">
              {t.home.pricingSubtitle}
            </p>

            {/* Toggle mensuel/annuel */}
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                onClick={() => setBillingPeriod('monthly')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  billingPeriod === 'monthly'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                {t.common.monthly}
              </button>
              <button
                onClick={() => setBillingPeriod('annual')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  billingPeriod === 'annual'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                {t.common.annual} <span className="ml-1 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold">{t.common.annualDiscount}</span>
              </button>
            </div>
            {billingPeriod === 'annual' && (
              <p className="text-sm text-green-600 font-medium mt-2">{t.common.freeMonthsAnnual}</p>
            )}
          </div></FadeUp>

          {/* Sprint — Essai 3 jours */}
          <div className="max-w-2xl mx-auto mb-10">
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl border border-blue-200 p-5 flex flex-col sm:flex-row items-center gap-4">
              <div className="flex-1 text-center sm:text-left">
                <p className="text-sm font-bold text-neutral-900">⚡ {t.home.sprintTrialTitle}</p>
                <p className="text-xs text-neutral-600 mt-0.5">{t.home.sprintTrialDesc}</p>
                <p className="text-[11px] text-blue-600 mt-0.5">{t.home.sprintTrialNote}</p>
              </div>
              <button
                onClick={() => startCheckout('sprint')}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-bold hover:shadow-lg transition-all hover:scale-105 whitespace-nowrap flex-shrink-0"
              >
                {t.home.sprintTrialCta}
              </button>
            </div>
          </div>

          {/* Plans Grid — 3 plans principaux */}
          <div className="grid md:grid-cols-3 gap-6 mb-6">
            <Plan
              title={`💎 ${t.home.planProTitle}`}
              price={billingPeriod === 'annual' ? `890€ ${t.common.perYear}` : `89€ ${t.common.perMonth}`}
              priceNote={billingPeriod === 'annual' ? t.home.priceNotePro : undefined}
              promoPrice={billingPeriod !== 'annual' ? '49€' : undefined}
              promoNote={billingPeriod !== 'annual' ? 'puis 89€/mois' : undefined}
              subtitle={t.home.planProSubtitle}
              bullets={t.home.planProBullets}
              ctaLabel={billingPeriod === 'annual' ? t.home.ctaProAnnual : 'Commencer — 49€ le 1er mois'}
              ctaOnClick={() => startCheckout(billingPeriod === 'annual' ? 'pro_annual' : 'pro')}
            />

            <Plan
              title={`⭐ ${t.home.planFondateursTitle}`}
              price={billingPeriod === 'annual' ? `1 490€ ${t.common.perYear}` : `149€ ${t.common.perMonth}`}
              priceNote={billingPeriod === 'annual' ? t.home.priceNoteFondateurs : undefined}
              subtitle={t.home.planFondateursSubtitle}
              special
              highlight
              bullets={t.home.planFondateursBullets}
              ctaLabel={billingPeriod === 'annual' ? t.home.ctaFondateursAnnual : t.home.ctaBecomeFondateur}
              ctaOnClick={() => startCheckout(billingPeriod === 'annual' ? 'fondateurs_annual' : 'fondateurs')}
            />

            <Plan
              title={`🏢 ${t.home.planBusinessTitle}`}
              price={billingPeriod === 'annual' ? `3 490€ ${t.common.perYear}` : `349€ ${t.common.perMonth}`}
              priceNote={billingPeriod === 'annual' ? t.home.priceNoteBusiness : undefined}
              subtitle={t.home.planBusinessSubtitle}
              bullets={t.home.planBusinessBullets}
              ctaLabel={billingPeriod === 'annual' ? t.home.ctaBusinessAnnual : t.home.ctaChooseBusiness}
              ctaOnClick={() => startCheckout(billingPeriod === 'annual' ? 'business_annual' : 'business')}
            />
          </div>

          {/* Ligne 2 : Elite */}
          <div className="max-w-3xl mx-auto mb-8">
            <div className="rounded-2xl border-2 border-purple-500 bg-gradient-to-br from-purple-50 to-pink-50 p-6 shadow-xl flex flex-col">
              <div className="flex items-center gap-3 mb-3">
                <h3 className="text-xl font-bold">🏆 {t.home.planEliteTitle}</h3>
                <span className="px-3 py-0.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs font-bold rounded-full">PREMIUM</span>
              </div>
              <div className="text-3xl font-black mb-1">{billingPeriod === 'annual' ? `9 990€ ${t.common.perYear}` : `999€ ${t.common.perMonth}`}</div>
              {billingPeriod === 'annual' && <p className="text-sm text-green-600 font-semibold">{t.home.priceNoteElite}</p>}
              <p className="text-sm text-neutral-600 mb-4">{t.home.planEliteSubtitle}</p>
              <ul className="grid grid-cols-2 gap-2 mb-6 flex-1">
                {t.home.planEliteBullets.map((b, i) => (
                  <li key={i} className="text-sm flex gap-2">
                    <span className="text-purple-600 font-bold">✓</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => startCheckout(billingPeriod === 'annual' ? 'elite_annual' : 'elite')}
                className="w-full py-3 rounded-xl font-semibold text-center transition-all bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:shadow-xl"
              >
                {billingPeriod === 'annual' ? t.home.ctaEliteAnnual : t.home.ctaChooseElite}
              </button>
            </div>
          </div>

          <p className="text-center text-xs text-neutral-500 mb-6">
            {t.home.pricingFoundersNote}
          </p>

        </div>
      </section>

      {/* CONCRÈTEMENT LA DIFFÉRENCE */}
      <FadeUp>
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-bold mb-3">Concrètement, c&apos;est quoi la différence ?</h2>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-10">
          {/* Pro card */}
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl border border-purple-200 p-6">
            <h3 className="text-xl font-bold text-purple-900 mb-4">💎 Pro — Votre vitrine Instagram, professionnelle et autonome</h3>
            <ul className="space-y-3 text-sm text-neutral-700">
              <li className="flex items-start gap-2">
                <span className="text-purple-500 font-bold mt-0.5">▸</span>
                <span><strong>C&apos;est comme...</strong> Un flyer distribué à 5 000 personnes — pro, ciblé et mesurable</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-500 font-bold mt-0.5">▸</span>
                <span><strong>Ça remplace...</strong> Le neveu qui poste 1x/mois + Canva</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-500 font-bold mt-0.5">▸</span>
                <span><strong>En concret...</strong> ~3 posts pro/semaine sur Instagram, avec texte et hashtags</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-500 font-bold mt-0.5">▸</span>
                <span><strong>Ça coûte...</strong> Le prix de 2 dîners au restaurant</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-500 font-bold mt-0.5">▸</span>
                <span><strong>C&apos;est rentabilisé si...</strong> 1 vente en plus (boutique) / 5 couverts (resto)</span>
              </li>
            </ul>
          </div>

          {/* Fondateurs card */}
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border-2 border-amber-400 p-6 shadow-lg">
            <h3 className="text-xl font-bold text-amber-900 mb-4">⭐ Fondateurs — Votre marque partout, sur Instagram ET TikTok, en 3 formats</h3>
            <ul className="space-y-3 text-sm text-neutral-700">
              <li className="flex items-start gap-2">
                <span className="text-amber-500 font-bold mt-0.5">▸</span>
                <span><strong>C&apos;est comme...</strong> Avoir un directeur marketing à temps partiel</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500 font-bold mt-0.5">▸</span>
                <span><strong>Ça remplace...</strong> Un graphiste (800€) + un CM (1 500€) + stats (100€) + Canva Pro (12€)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500 font-bold mt-0.5">▸</span>
                <span><strong>En concret...</strong> ~5-6 posts/semaine, VOTRE logo, post + Story + Reel, Instagram ET TikTok</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500 font-bold mt-0.5">▸</span>
                <span><strong>Ça coûte...</strong> Le prix de 5 dîners au restaurant</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500 font-bold mt-0.5">▸</span>
                <span><strong>C&apos;est rentabilisé si...</strong> 2 ventes (boutique) / 7 couverts (resto) / 2 séances (coach)</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl border border-blue-200 p-6 text-center">
          <p className="text-base text-neutral-700 font-medium">
            Pour <strong className="text-blue-600">60€ de plus</strong> par mois : votre logo sur chaque visuel, 3 formats automatiques, et TikTok — là où les <strong className="text-blue-600">NOUVEAUX clients</strong> vous découvrent.
          </p>
        </div>
      </section>
      </FadeUp>

      {/* SOCIAL PROOF & FAQ COURTE */}
      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid lg:grid-cols-2 gap-8">
          <div>
            <h2 className="text-2xl font-semibold">{t.home.socialProofTitle}</h2>
            <div className="mt-4 grid gap-4">
              <Quote
                text={t.home.socialQuote1}
                author={t.home.socialQuote1Author}
              />
              <Quote
                text={t.home.socialQuote2}
                author={t.home.socialQuote2Author}
              />
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-semibold">{t.home.faqTitle}</h2>
            <div className="mt-4 space-y-4 text-sm text-neutral-700">
              <Faq q={t.home.faq1Q}
                   a={t.home.faq1A} />
              <Faq q={t.home.faq2Q}
                   a={t.home.faq2A} />
              <Faq q={t.home.faq3Q}
                   a={t.home.faq3A} />
            </div>
          </div>
        </div>
        <div className="mt-10 text-center">
          <a href="/generate" className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-medium hover:shadow-lg hover:scale-105 transition-all">
            {t.home.tryNow}
          </a>
        </div>
      </section>

      {/* Footer légal - Terms of Service & Privacy Policy */}
      {/* Gradient divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-blue-500 to-transparent" />

      <footer className="bg-neutral-900 text-white">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="grid md:grid-cols-3 gap-8">
            {/* Marque */}
            <div>
              <h3 className="text-lg font-bold mb-2">KeiroAI</h3>
              <p className="text-sm text-neutral-400">
                {t.home.footerDesc}
              </p>
            </div>

            {/* Liens légaux */}
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wider text-neutral-400 mb-3">{t.home.footerLegal}</h4>
              <ul className="space-y-2">
                <li>
                  <a href="/legal/terms" className="text-base text-white hover:text-cyan-400 transition-colors font-medium">
                    Terms of Service
                  </a>
                </li>
                <li>
                  <a href="/legal/privacy" className="text-base text-white hover:text-cyan-400 transition-colors font-medium">
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a href="/legal/data-deletion" className="text-base text-white hover:text-cyan-400 transition-colors font-medium">
                    {t.home.footerDataDeletion}
                  </a>
                </li>
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wider text-neutral-400 mb-3">{t.home.footerContact}</h4>
              <ul className="space-y-2">
                <li>
                  <a href="mailto:contact@keiroai.com" className="text-base text-white hover:text-cyan-400 transition-colors font-medium">
                    contact@keiroai.com
                  </a>
                </li>
                <li>
                  <a href="mailto:privacy@keiroai.com" className="text-sm text-neutral-400 hover:text-cyan-400 transition-colors">
                    privacy@keiroai.com
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-neutral-700 mt-8 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-neutral-500">
              &copy; {new Date().getFullYear()} KeiroAI. {t.home.footerRights}
            </p>
            <div className="flex items-center gap-6">
              <button
                onClick={() => setLocale(locale === 'fr' ? 'en' : 'fr')}
                className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
                {locale === 'fr' ? 'English' : 'Français'}
              </button>
              <a href="/legal/terms" className="text-sm text-neutral-400 hover:text-white transition-colors underline">
                Terms of Service
              </a>
              <a href="/legal/privacy" className="text-sm text-neutral-400 hover:text-white transition-colors underline">
                Privacy Policy
              </a>
              <a href="/legal/data-deletion" className="text-sm text-neutral-400 hover:text-white transition-colors underline">
                {t.home.footerDataDeletion}
              </a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}

/* --- Quiz & Calculator Component --- */
function QuizAndCalculator() {
  const { t } = useLanguage();
  const [activeSection, setActiveSection] = useState<'quiz' | 'calculator'>('quiz');
  const [quizStep, setQuizStep] = useState(1);
  const [quizAnswers, setQuizAnswers] = useState({
    businessType: '',
    objective: '',
    budget: ''
  });
  const [showQuizResult, setShowQuizResult] = useState(false);

  // ROI Calculator state
  const [visualsPerMonth, setVisualsPerMonth] = useState(8);

  const businessTypes = [
    { id: 'restaurant', label: `🍽️ ${t.home.quizBusiness1}`, value: 'restaurant' },
    { id: 'coach', label: `💪 ${t.home.quizBusiness2}`, value: 'coach' },
    { id: 'ecommerce', label: `🛍️ ${t.home.quizBusiness3}`, value: 'ecommerce' },
    { id: 'service', label: `🔧 ${t.home.quizBusiness4}`, value: 'service' },
    { id: 'other', label: `💼 ${t.home.quizBusiness5}`, value: 'other' }
  ];

  const objectives = [
    { id: 'awareness', label: `📢 ${t.home.quizObjective1}`, value: 'awareness' },
    { id: 'leads', label: `🎯 ${t.home.quizObjective2}`, value: 'leads' },
    { id: 'sales', label: `💰 ${t.home.quizObjective3}`, value: 'sales' },
    { id: 'retention', label: `❤️ ${t.home.quizObjective4}`, value: 'retention' }
  ];

  const budgets = [
    { id: 'none', label: t.home.quizBudget1, value: 'none' },
    { id: 'small', label: t.home.quizBudget2, value: 'small' },
    { id: 'medium', label: t.home.quizBudget3, value: 'medium' },
    { id: 'large', label: t.home.quizBudget4, value: 'large' }
  ];

  const handleQuizAnswer = (step: number, value: string) => {
    if (step === 1) setQuizAnswers({ ...quizAnswers, businessType: value });
    if (step === 2) setQuizAnswers({ ...quizAnswers, objective: value });
    if (step === 3) {
      setQuizAnswers({ ...quizAnswers, budget: value });
      setShowQuizResult(true);
    }
  };

  const getRecommendedPlan = () => {
    if (quizAnswers.budget === 'large' || quizAnswers.businessType === 'ecommerce') return 'Business';
    if (quizAnswers.budget === 'medium') return 'Fondateurs Pro';
    if (quizAnswers.budget === 'small') return 'Pro';
    return 'Pro';
  };

  const resetQuiz = () => {
    setQuizStep(1);
    setQuizAnswers({ businessType: '', objective: '', budget: '' });
    setShowQuizResult(false);
  };

  // ROI Calculator logic
  const costGraphiste = visualsPerMonth * 500;
  const costKeiro = 199;
  const savings = costGraphiste - costKeiro;
  const savingsPercent = Math.round((savings / costGraphiste) * 100);

  return (
    <section className="mx-auto max-w-6xl px-6 py-12">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold mb-2">{t.home.quizTitle}</h2>
        <p className="text-neutral-600">{t.home.quizSubtitle}</p>
      </div>

      {/* Tabs */}
      <div className="flex justify-center gap-4 mb-8">
        <button
          onClick={() => setActiveSection('quiz')}
          className={`px-6 py-3 rounded-xl font-semibold transition-all ${
            activeSection === 'quiz'
              ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
              : 'bg-white border border-neutral-200 text-neutral-700 hover:border-purple-300'
          }`}
        >
          {t.home.quizTab}
        </button>
        <button
          onClick={() => setActiveSection('calculator')}
          className={`px-6 py-3 rounded-xl font-semibold transition-all ${
            activeSection === 'calculator'
              ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg'
              : 'bg-white border border-neutral-200 text-neutral-700 hover:border-blue-300'
          }`}
        >
          {t.home.calculatorTab}
        </button>
      </div>

      {/* Quiz Section */}
      {activeSection === 'quiz' && !showQuizResult && (
        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl border-2 border-purple-200 p-8 max-w-3xl mx-auto">
          {/* Progress bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-purple-900">Question {quizStep}/3</span>
              <span className="text-xs text-purple-600">{Math.round((quizStep / 3) * 100)}%</span>
            </div>
            <div className="h-2 bg-purple-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-600 to-pink-600 transition-all duration-500"
                style={{ width: `${(quizStep / 3) * 100}%` }}
              ></div>
            </div>
          </div>

          {/* Question 1 */}
          {quizStep === 1 && (
            <div className="space-y-4">
              <h3 className="text-2xl font-bold text-purple-900 mb-6">{t.home.quizQ1}</h3>
              <div className="grid md:grid-cols-2 gap-3">
                {businessTypes.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => {
                      handleQuizAnswer(1, type.value);
                      setQuizStep(2);
                    }}
                    className="p-4 bg-white rounded-xl border-2 border-purple-200 hover:border-purple-500 hover:shadow-lg transition-all text-left font-medium"
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Question 2 */}
          {quizStep === 2 && (
            <div className="space-y-4">
              <h3 className="text-2xl font-bold text-purple-900 mb-6">{t.home.quizQ2}</h3>
              <div className="grid md:grid-cols-2 gap-3">
                {objectives.map((obj) => (
                  <button
                    key={obj.id}
                    onClick={() => {
                      handleQuizAnswer(2, obj.value);
                      setQuizStep(3);
                    }}
                    className="p-4 bg-white rounded-xl border-2 border-purple-200 hover:border-purple-500 hover:shadow-lg transition-all text-left font-medium"
                  >
                    {obj.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setQuizStep(1)}
                className="mt-4 text-sm text-purple-600 hover:text-purple-700 underline"
              >
                {t.common.back}
              </button>
            </div>
          )}

          {/* Question 3 */}
          {quizStep === 3 && (
            <div className="space-y-4">
              <h3 className="text-2xl font-bold text-purple-900 mb-6">{t.home.quizQ3}</h3>
              <div className="grid md:grid-cols-2 gap-3">
                {budgets.map((budget) => (
                  <button
                    key={budget.id}
                    onClick={() => handleQuizAnswer(3, budget.value)}
                    className="p-4 bg-white rounded-xl border-2 border-purple-200 hover:border-purple-500 hover:shadow-lg transition-all text-left font-medium"
                  >
                    {budget.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setQuizStep(2)}
                className="mt-4 text-sm text-purple-600 hover:text-purple-700 underline"
              >
                {t.common.back}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Quiz Result */}
      {activeSection === 'quiz' && showQuizResult && (
        <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-2xl border-2 border-blue-300 p-8 max-w-3xl mx-auto">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 text-white text-3xl mb-4">
              ✓
            </div>
            <h3 className="text-2xl font-bold text-blue-900 mb-2">{t.home.quizResultTitle} {getRecommendedPlan()}</h3>
            <p className="text-blue-700">{t.home.quizResultSubtitle}</p>
          </div>

          <div className="bg-white rounded-xl p-6 mb-6">
            <h4 className="font-bold text-neutral-900 mb-4">{t.home.quizResultIncluded}</h4>
            <ul className="space-y-3">
              {getRecommendedPlan() === 'Pro' && t.home.quizProBullets.map((b, i) => (
                <li key={`pro-${i}`} className="flex items-start gap-2 text-sm">
                  <span className="text-blue-500 text-lg">✓</span>
                  <span dangerouslySetInnerHTML={{ __html: b }} />
                </li>
              ))}
              <li className="flex items-start gap-2 text-sm">
                <span className="text-blue-500 text-lg">✓</span>
                <span dangerouslySetInnerHTML={{ __html: t.home.quizCommonBullet }} />
              </li>
            </ul>
          </div>

          <div className="flex gap-3">
            <a
              href="/generate"
              className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all text-center"
            >
              {t.home.quizStartWith} {getRecommendedPlan()} →
            </a>
            <button
              onClick={resetQuiz}
              className="px-6 py-3 bg-white border border-blue-300 text-blue-700 font-semibold rounded-xl hover:bg-blue-50 transition-all"
            >
              {t.common.restart}
            </button>
          </div>
        </div>
      )}

      {/* ROI Calculator */}
      {activeSection === 'calculator' && (
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl border-2 border-blue-200 p-8 max-w-3xl mx-auto">
          <h3 className="text-2xl font-bold text-blue-900 mb-6 text-center">
            {t.home.calcTitle}
          </h3>

          <div className="bg-white rounded-xl p-6 mb-6">
            <label className="block mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-neutral-900">{t.home.calcLabel}</span>
                <span className="text-2xl font-bold text-blue-600">{visualsPerMonth}</span>
              </div>
              <input
                type="range"
                min="1"
                max="20"
                value={visualsPerMonth}
                onChange={(e) => setVisualsPerMonth(Number(e.target.value))}
                className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-xs text-neutral-500 mt-1">
                <span>1</span>
                <span>10</span>
                <span>20</span>
              </div>
            </label>
          </div>

          {/* Calculs */}
          <div className="space-y-4 mb-6">
            <div className="bg-neutral-100 rounded-xl p-5 flex items-center justify-between">
              <div>
                <div className="text-sm text-neutral-600 mb-1">{t.home.calcGraphiste}</div>
                <div className="text-xs text-neutral-500">{visualsPerMonth} {t.home.calcGraphisteSub}</div>
              </div>
              <div className="text-2xl font-bold text-neutral-900">{costGraphiste.toLocaleString()}€</div>
            </div>

            <div className="bg-blue-100 rounded-xl p-5 flex items-center justify-between">
              <div>
                <div className="text-sm text-blue-900 font-semibold mb-1">{t.home.calcKeiro}</div>
                <div className="text-xs text-blue-700">{t.home.calcKeiroSub}</div>
              </div>
              <div className="text-2xl font-bold text-blue-900">{costKeiro}€</div>
            </div>

            <div className="bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm opacity-90 mb-1">{t.home.calcSavings}</div>
                  <div className="text-xs opacity-75">{t.home.calcAnnualPrefix} {savings * 12}€{t.home.calcSavingsYear}</div>
                </div>
                <div>
                  <div className="text-4xl font-bold">{savings.toLocaleString()}€</div>
                  <div className="text-sm text-right">{savingsPercent}% {t.home.calcSavingsPercentLabel}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
            <p className="text-sm text-blue-900" dangerouslySetInnerHTML={{ __html: t.home.calcTip }} />
          </div>

          <a
            href="/generate"
            className="block w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all text-center"
          >
            {t.home.calcCta} {savings.toLocaleString()}€{t.common.perMonth} →
          </a>
        </div>
      )}
    </section>
  );
}

/* --- mini composants UI --- */
function Step({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-blue-100 p-5 bg-white hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 text-white grid place-items-center text-sm font-semibold">{num}</div>
        <h3 className="font-medium">{title}</h3>
      </div>
      <p className="mt-3 text-sm text-neutral-700">{children}</p>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border p-5 bg-white">{children}</div>;
}

function Plan({
  title, price, priceNote, promoPrice, promoNote, subtitle, bullets, ctaLabel, ctaHref, ctaOnClick, highlight, special
}: {
  title: string;
  price: string;
  priceNote?: string;
  promoPrice?: string;
  promoNote?: string;
  subtitle?: string;
  bullets: string[];
  ctaLabel: string;
  ctaHref?: string;
  ctaOnClick?: () => void;
  highlight?: boolean;
  special?: boolean;
}) {
  const ctaClassName = `mt-5 inline-flex w-full items-center justify-center rounded-xl font-medium px-4 py-3 hover:shadow-lg transition-all text-sm ${
    special ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white' :
    'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
  }`;

  return (
    <div className={`rounded-2xl border p-5 bg-white shadow-sm transition-all hover:shadow-lg flex flex-col ${
      special ? 'ring-2 ring-amber-400 bg-gradient-to-br from-amber-50 to-orange-50' :
      highlight ? 'ring-2 ring-blue-500 shadow-lg' : ''
    }`}>
      <h3 className="text-base font-semibold">{title}</h3>
      {promoPrice ? (
        <div className="mt-2 mb-1">
          <div className="flex items-end gap-2">
            <span className="text-3xl font-black">{promoPrice}</span>
            <span className="text-base text-neutral-400 line-through mb-0.5">{price}</span>
          </div>
          <p className="text-xs text-neutral-500 mt-0.5">{promoNote}</p>
        </div>
      ) : (
        <div className="text-xl font-bold mt-1">{price}</div>
      )}
      {priceNote && <p className="text-xs text-green-600 font-semibold">{priceNote}</p>}
      {subtitle && <p className="text-xs text-neutral-500 mt-1">{subtitle}</p>}
      <ul className="mt-4 space-y-2 text-sm text-neutral-700 flex-1">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2">
            <span className={special ? "text-amber-500" : "text-blue-500"}>✓</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
      {ctaOnClick ? (
        <button onClick={ctaOnClick} className={ctaClassName}>
          {ctaLabel}
        </button>
      ) : (
        <a href={ctaHref || "/generate"} className={ctaClassName}>
          {ctaLabel}
        </a>
      )}
    </div>
  );
}

function Quote({ text, author }: { text: string; author: string }) {
  return (
    <figure className="rounded-2xl border p-5 bg-white">
      <blockquote className="text-neutral-800">“{text}”</blockquote>
      <figcaption className="mt-2 text-sm text-neutral-500">— {author}</figcaption>
    </figure>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="rounded-xl border p-4 bg-white">
      <summary className="cursor-pointer font-medium">{q}</summary>
      <p className="mt-2 text-neutral-700">{a}</p>
    </details>
  );
}

export default function HomeKeiro() {
  return <HomeKeiroInner />;
}
