'use client';

import { useState } from 'react';
import Link from 'next/link';
import BookDemoButton from '@/components/BookDemoButton';
import { startCheckout } from '@/lib/stripe/checkout';
import { ScaleIn, HeroTextReveal, TextRotator, MagneticButton } from '@/components/ui/motion';
import { AnimatedGradientBG } from '@/components/ui/animated-gradient-bg';

import { PageReveal } from '@/components/ui/page-reveal';
import { KeiroLockup } from '@/components/ui/keiro-logo';
import { useLanguage } from '@/lib/i18n/context';
import { useTheme } from '@/lib/theme/context';

function HomeKeiroInner() {
  const { t, locale, setLocale } = useLanguage();
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [showUpsellPro, setShowUpsellPro] = useState(false);

  return (
    <main className="relative min-h-dvh">
      {/* Luxury page opening animation */}
      <PageReveal />

      {/* All content sits above the background */}
      <div className="relative" style={{ zIndex: 2 }}>

      {/* HERO — always dark, even in light mode */}
      <section className="relative bg-[#0c1a3a] px-4 sm:px-6 pt-10 sm:pt-16 pb-8 sm:pb-12">
        <div className="relative mx-auto max-w-6xl grid lg:grid-cols-12 gap-4 sm:gap-8 items-center">
          <div className="lg:col-span-7">
            <ScaleIn>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#1e3a5f]/30 bg-[#0c1a3a]/10 px-3 py-1 text-xs text-[#93b4d4]">
              <span className="h-2 w-2 rounded-full bg-[#1e3a5f] animate-pulse"></span>
              {t.home.heroBadge}
            </div>
            </ScaleIn>
            <HeroTextReveal
              text={t.home.heroTitle}
              className="mt-3 text-2xl/tight sm:text-4xl/tight md:text-5xl/tight font-semibold text-white"
              highlightWords={locale === 'fr' ? ['contenu pro', '3 minutes'] : ['pro content', '3 minutes']}
              highlightClassName="gradient-text"
            />
            <p className="mt-4 text-lg text-[#a4bdd4]/70">
              {t.home.heroSubtitle}
            </p>
            <p className="mt-2 text-lg font-semibold">
              <span className="text-[#7fa0c4]/50">{locale === 'fr' ? 'Pour ' : 'For '}</span>
              <TextRotator
                words={locale === 'fr'
                  ? ['restaurants', 'coachs sportifs', 'boutiques', 'cavistes', 'coiffeurs', 'artisans']
                  : ['restaurants', 'fitness coaches', 'shops', 'wine bars', 'hair salons', 'artisans']
                }
                className="gradient-text font-bold"
                interval={2500}
              />
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <MagneticButton>
              <a href="/checkout/upsell?plan=createur" className="cta-keep-white inline-block px-5 py-3 rounded-xl bg-white font-semibold shadow-lg shadow-white/20 hover:shadow-xl hover:shadow-white/30 hover:-translate-y-0.5 transition-all" style={{ color: '#0c1a3a' }}>
                {t.common.tryFree}
              </a>
              </MagneticButton>
              <a href="#exemple" className="px-5 py-3 rounded-xl border-2 border-white/40 text-white font-medium hover:bg-white/10 hover:border-white/60 transition-all">
                {t.common.seeExample}
              </a>
              <BookDemoButton variant="outline" size="md" className="!border-white/40 !bg-transparent !text-white hover:!bg-white/10" />
            </div>
            <ul className="mt-6 grid sm:grid-cols-3 gap-4 text-sm">
              <li className="rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 p-3 text-[#c8d8e8]">
                <span className="text-[#6b9fd4] mr-1">✓</span> {t.home.heroCheck1}
              </li>
              <li className="rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 p-3 text-[#c8d8e8]">
                <span className="text-[#6b9fd4] mr-1">✓</span> {t.home.heroCheck2}
              </li>
              <li className="rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 p-3 text-[#c8d8e8]">
                <span className="text-[#6b9fd4] mr-1">✓</span> {t.home.heroCheck3}
              </li>
            </ul>
          </div>
          <div className="lg:col-span-5">
            {/* Agents IA Team Preview — Visual grid */}
            <div className="rounded-2xl overflow-hidden bg-white/5 backdrop-blur-sm border border-white/10">
              <div className="p-4 pb-2">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-white text-sm">{locale === 'fr' ? '17 Agents IA' : '17 AI Agents'}</h3>
                    <p className="text-[10px] text-white/40">{locale === 'fr' ? 'Votre equipe travaille 24/7' : 'Your team works 24/7'}</p>
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-green-500/20 rounded-full">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-green-400 text-[9px] font-bold">{locale === 'fr' ? 'Actifs' : 'Active'}</span>
                  </div>
                </div>

                {/* Agent avatar grid — 4 columns, real avatars */}
                {(() => {
                  const SB = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
                  const avatarBase = `${SB}/storage/v1/object/public/public-assets/agent-avatars`;
                  const agents = [
                    { id: 'ceo', name: 'Noah', color: 'from-indigo-500 to-blue-600', role: 'CEO', icon: '\uD83E\uDDE0' },
                    { id: 'marketing', name: 'Ami', color: 'from-pink-500 to-rose-500', role: 'Marketing', icon: '\uD83C\uDFAF' },
                    { id: 'content', name: 'Lena', color: 'from-purple-500 to-violet-600', role: 'Contenu', icon: '\u2728' },
                    { id: 'commercial', name: 'Leo', color: 'from-blue-500 to-cyan-500', role: 'Commercial', icon: '\uD83E\uDD1D' },
                    { id: 'email', name: 'Hugo', color: 'from-cyan-500 to-blue-500', role: 'Email', icon: '\uD83D\uDCE7' },
                    { id: 'dm_instagram', name: 'Jade', color: 'from-rose-500 to-pink-600', role: 'DM', icon: '\uD83D\uDCAC' },
                    { id: 'seo', name: 'Oscar', color: 'from-amber-500 to-orange-500', role: 'SEO', icon: '\uD83D\uDD0D' },
                    { id: 'ads', name: 'Felix', color: 'from-red-500 to-orange-500', role: 'Pub', icon: '\uD83D\uDCE2' },
                    { id: 'whatsapp', name: 'Stella', color: 'from-green-500 to-emerald-600', role: 'WhatsApp', icon: '\uD83D\uDCF2' },
                    { id: 'chatbot', name: 'Max', color: 'from-violet-500 to-purple-600', role: 'Chatbot', icon: '\uD83E\uDD16' },
                    { id: 'tiktok_comments', name: 'Axel', color: 'from-gray-600 to-gray-800', role: 'TikTok', icon: '\uD83C\uDFB5' },
                    { id: 'gmaps', name: 'Theo', color: 'from-green-500 to-teal-500', role: 'Maps', icon: '\uD83D\uDCCD' },
                  ];
                  return (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-3 mb-3">
                      {agents.map(a => (
                        <div key={a.name} className="text-center group cursor-default">
                          <div className={`w-14 h-14 mx-auto rounded-full bg-gradient-to-br ${a.color} p-[2px] shadow-lg group-hover:scale-110 transition-transform`}>
                            <div className="w-full h-full rounded-full overflow-hidden bg-gray-900 flex items-center justify-center">
                              <img
                                src={`${avatarBase}/${a.id}-3d.png`}
                                alt={a.name}
                                className="w-full h-full object-cover scale-[1.15]"
                                style={{ objectPosition: 'center 15%' }}
                                loading="lazy"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
                              />
                              <span className="hidden text-xl">{a.icon}</span>
                            </div>
                          </div>
                          <div className="text-white text-[9px] font-bold mt-1.5">{a.name}</div>
                          <div className="text-white/30 text-[9px]">{a.role}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* +5 more agents */}
                <div className="flex items-center justify-center gap-1.5 mb-2">
                  {[
                    { id: 'comptable', icon: '\uD83D\uDCB0' },
                    { id: 'rh', icon: '\u2696\uFE0F' },
                    { id: 'onboarding', icon: '\uD83D\uDE80' },
                    { id: 'retention', icon: '\uD83D\uDD04' },
                    { id: 'ops', icon: '\u2699\uFE0F' },
                  ].map(a => {
                    const SB = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
                    return (
                      <div key={a.id} className="w-7 h-7 rounded-full bg-white/10 overflow-hidden flex items-center justify-center">
                        <img src={`${SB}/storage/v1/object/public/public-assets/agent-avatars/${a.id}-3d.png`} alt="" className="w-full h-full object-cover" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        <span className="text-[9px]">{a.icon}</span>
                      </div>
                    );
                  })}
                  <span className="text-white/30 text-[9px] ml-1">+5</span>
                </div>

                {/* Stats bar */}
                <div className="flex items-center justify-center gap-4 py-2 border-t border-white/5">
                  <div className="text-center"><div className="text-white font-bold text-xs">17</div><div className="text-white/30 text-[9px]">Agents</div></div>
                  <div className="text-center"><div className="text-white font-bold text-xs">24/7</div><div className="text-white/30 text-[9px]">Actifs</div></div>
                  <div className="text-center"><div className="text-white font-bold text-xs">{'\u{1F52E}'}</div><div className="text-white/30 text-[9px]">Super entraines</div></div>
                </div>
              </div>

              <a href="/assistant" className="block p-3 bg-gradient-to-r from-purple-600/20 to-blue-600/20 border-t border-white/10 text-center hover:from-purple-600/30 hover:to-blue-600/30 transition-all">
                <span className="text-xs text-purple-300 font-semibold">{locale === 'fr' ? 'Decouvrir votre equipe IA \u2192' : 'Discover your AI team \u2192'}</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Gradient transition: dark hero → content sections */}
      <div className="h-20 bg-gradient-to-b from-[#0c1a3a] to-transparent" />

      {/* === CONTENT SECTIONS BELOW === */}
      <div className={`homepage-sections ${isLight ? 'text-neutral-900' : 'text-slate-200'}`}>

      {/* ESSAI GRATUIT 30 JOURS - MIS EN AVANT */}
      <section className="py-3 sm:py-6">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="bg-gradient-to-r from-[#0c1a3a] via-purple-900 to-indigo-900 rounded-xl sm:rounded-2xl px-4 sm:px-6 py-3 sm:py-4 border border-purple-500/20">
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 sm:gap-4 text-white">
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="text-lg sm:text-xl">🎁</span>
              <div>
                <p className="font-semibold text-sm sm:text-base">{t.home.freeTrialTitle || 'Essai gratuit 14 jours'}</p>
                <p className="text-[10px] sm:text-xs text-purple-200">{t.home.freeTrialSubtitle || 'Carte requise, aucun debit. Annulation en 1 clic a tout moment.'}</p>
              </div>
            </div>
            <Link href="/checkout/upsell?plan=createur" className="px-7 py-3 rounded-xl bg-white text-[#0c1a3a] font-extrabold hover:bg-purple-50 transition-all text-sm whitespace-nowrap shadow-lg hover:shadow-2xl hover:scale-105">
              {t.home.freeTrialCta || 'Essai gratuit 14 jours'} →
            </Link>
          </div>
          </div>
        </div>
      </section>

      {/* QUIZ INTERACTIF — hidden for cleaner UX */}
      {false && <QuizAndCalculator />}

      {/* VIDÉO WORKFLOW - Compact version */}
      <section className="section-light section-divider">
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

              {/* Video placeholder — presentation a venir */}
              <div className="bg-gradient-to-br from-[#0c1a3a] to-[#1e3a5f] rounded-lg shadow-md overflow-hidden">
                <div className="relative w-full flex items-center justify-center" style={{ paddingBottom: '56.25%' }}>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
                    <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mb-3">
                      <svg className="w-8 h-8 text-purple-400" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                    <p className="text-white font-bold text-sm mb-1">{locale === 'fr' ? 'Presentation video' : 'Video Presentation'}</p>
                    <p className="text-white/40 text-xs">{locale === 'fr' ? 'Bientot disponible' : 'Coming soon'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Points clés à droite */}
            <div className="md:w-3/5 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white rounded-lg p-3 premium-card hover:shadow-soft-lg hover:-translate-y-0.5 transition-all">
                <div className="text-xl mb-1">⚡</div>
                <div className="font-semibold text-xs mb-0.5">{t.home.videoCard1Title}</div>
                <div className="text-[10px] text-neutral-600">{t.home.videoCard1Desc}</div>
              </div>
              <div className="bg-white rounded-lg p-3 premium-card hover:shadow-soft-lg hover:-translate-y-0.5 transition-all">
                <div className="text-xl mb-1">🎯</div>
                <div className="font-semibold text-xs mb-0.5">{t.home.videoCard2Title}</div>
                <div className="text-[10px] text-neutral-600">{t.home.videoCard2Desc}</div>
              </div>
              <div className="bg-white rounded-lg p-3 premium-card hover:shadow-soft-lg hover:-translate-y-0.5 transition-all">
                <div className="text-xl mb-1">📈</div>
                <div className="font-semibold text-xs mb-0.5">{t.home.videoCard3Title}</div>
                <div className="text-[10px] text-neutral-600">{t.home.videoCard3Desc}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* COMMENT ÇA MARCHE */}
      <section className="section-divider section-light">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <h2 className="text-2xl font-semibold">{t.home.howTitle}</h2>
          <div className="mt-6 grid md:grid-cols-3 gap-6">
            <Step num="1" title={t.home.step1Title}>
              {t.home.step1Desc}
            </Step>
            <Step num="2" title={t.home.step2Title}>
              {t.home.step2Desc}
            </Step>
            <Step num="3" title={t.home.step3Title}>
              {t.home.step3Desc}
            </Step>
          </div>
        </div>
      </section>

      {/* ═══ HIDDEN SECTIONS — too long for landing, keeping code for future ═══ */}
      <div className="hidden">
      {/* ASSISTANT MARKETING INTELLIGENCE (AMI) */}
      <div className="relative h-40 overflow-hidden" aria-hidden="true">
        <div className={`absolute inset-0 bg-gradient-to-b ${isLight ? 'from-[#FAFBFC] via-[#FAFBFC]/80' : 'from-transparent via-transparent/80'} to-[#0B1120]`} />
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-[#0B1120]" style={{ clipPath: 'ellipse(70% 100% at 50% 100%)' }} />
      </div>
      <section className="relative bg-[#0B1120] overflow-hidden">
        <AnimatedGradientBG variant="dark" />
        <div className="relative mx-auto max-w-6xl px-6 py-12">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-[#7fa0c4] text-xs font-medium mb-4">
              <span className="h-2 w-2 rounded-full bg-[#1e3a5f] animate-pulse"></span>
              {t.home.aiBadge}
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white">{t.home.aiTitle}</h2>
            <p className="mt-2 text-[#a4bdd4]">{t.home.aiSubtitle}</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-4 md:gap-8">
            {/* AI Insights Preview */}
            <div className="rounded-2xl border border-white/10 overflow-hidden bg-white/5 backdrop-blur-sm shadow-xl">
              <div className="bg-white/10 p-5">
                <h3 className="text-white font-bold text-lg flex items-center gap-2">
                  <span>🎯</span> {t.home.aiStrategicTitle}
                </h3>
                <p className="text-[#7fa0c4] text-sm mt-1">{t.home.aiStrategicSub}</p>
              </div>

              <div className="p-5 space-y-3">
                {/* Insight 1 */}
                <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-2xl">🎯</span>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-white mb-1">{t.home.aiInsight1Title}</p>
                      <p className="text-xs text-[#a4bdd4] leading-relaxed mb-2" dangerouslySetInnerHTML={{ __html: t.home.aiInsight1Text }} />
                      <div className="bg-white/10 rounded p-2">
                        <p className="text-[10px] text-[#7fa0c4]" dangerouslySetInnerHTML={{ __html: t.home.aiInsight1Tip }} />
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
                      <p className="text-xs text-[#a4bdd4] leading-relaxed mb-2" dangerouslySetInnerHTML={{ __html: t.home.aiInsight2Text }} />
                      <div className="bg-white/10 rounded p-2">
                        <p className="text-[10px] text-[#7fa0c4]" dangerouslySetInnerHTML={{ __html: t.home.aiInsight2Tip }} />
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
                      <p className="text-xs text-[#a4bdd4] leading-relaxed mb-2" dangerouslySetInnerHTML={{ __html: t.home.aiInsight3Text }} />
                      <div className="bg-white/10 rounded p-2">
                        <p className="text-[10px] text-[#7fa0c4]" dangerouslySetInnerHTML={{ __html: t.home.aiInsight3Tip }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Features list + key stats */}
            <div className="space-y-4">
              {/* Quick stats — simplified, no graphs */}
              <div className="rounded-2xl border border-white/10 overflow-hidden bg-white/5 backdrop-blur-sm shadow-xl">
                <div className="bg-white/10 p-5">
                  <h3 className="text-white font-bold text-lg flex items-center gap-2">
                    <span>📊</span> {t.home.aiDashboardTitle}
                  </h3>
                  <p className="text-[#7fa0c4] text-sm mt-1">{t.home.aiDashboardSub}</p>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                      <div className="text-xs text-[#7fa0c4] font-semibold mb-1">{t.home.aiThisWeek}</div>
                      <div className="text-2xl font-bold text-white">12</div>
                      <div className="text-xs text-[#6b9fd4]">{t.home.aiVisualsGenerated}</div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                      <div className="text-xs text-[#7fa0c4] font-semibold mb-1">{t.home.aiEngagement}</div>
                      <div className="text-2xl font-bold text-white">+347%</div>
                      <div className="text-xs text-[#6b9fd4] font-semibold">↗ +40%</div>
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
                    <span className="text-[#6b9fd4] text-lg">✓</span>
                    <span className="text-[#a4bdd4]" dangerouslySetInnerHTML={{ __html: t.home.aiFeature1 }} />
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#6b9fd4] text-lg">✓</span>
                    <span className="text-[#a4bdd4]" dangerouslySetInnerHTML={{ __html: t.home.aiFeature2 }} />
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#6b9fd4] text-lg">✓</span>
                    <span className="text-[#a4bdd4]" dangerouslySetInnerHTML={{ __html: t.home.aiFeature3 }} />
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#6b9fd4] text-lg">✓</span>
                    <span className="text-[#a4bdd4]" dangerouslySetInnerHTML={{ __html: t.home.aiFeature4 }} />
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#6b9fd4] text-lg">✓</span>
                    <span className="text-[#a4bdd4]" dangerouslySetInnerHTML={{ __html: t.home.aiFeature5 }} />
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-10 text-center">
            <a href="/assistant" className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-[#0c1a3a] to-[#1e3a5f] text-white font-semibold text-lg hover:shadow-xl transition-all hover:-translate-y-0.5 cta-shimmer">
              {t.home.aiCta}
            </a>
            <p className="mt-3 text-sm text-[#7fa0c4]">
              {t.home.aiCtaSub}
            </p>
          </div>
        </div>
      </section>
      <div className="relative h-40 overflow-hidden" aria-hidden="true">
        <div className={`absolute inset-0 bg-gradient-to-b from-[#0B1120] via-[#0B1120]/80 ${isLight ? 'to-[#FAFBFC]' : 'to-transparent'}`} />
        <div className="absolute top-0 left-0 right-0 h-24 bg-[#0B1120]" style={{ clipPath: 'ellipse(70% 100% at 50% 0%)' }} />
      </div>

      {/* AGENTS IA — PAR OBJECTIF BUSINESS */}
      <section className="relative bg-[#0c1a3a] overflow-hidden">
        {/* Subtle grid background */}
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '40px 40px' }} />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-16">
          <div className="text-center mb-6 sm:mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 sm:px-4 sm:py-1.5 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300 text-[10px] sm:text-xs font-semibold mb-3 sm:mb-4">
              <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-purple-400 animate-pulse" />
              {locale === 'fr' ? '17 agents IA ultra-elite' : '17 ultra-elite AI agents'}
            </div>
            <h2 className="text-xl sm:text-3xl md:text-4xl font-bold text-white mb-2 sm:mb-3">
              {locale === 'fr' ? 'Une equipe complete qui travaille pour vous' : 'A complete team working for you'}
            </h2>
            <p className="text-white/50 max-w-2xl mx-auto">
              {locale === 'fr'
                ? 'Chaque equipe a un objectif clair. Vos agents executent, apprennent et s\'ameliorent automatiquement — 24/7.'
                : 'Each team has a clear objective. Your agents execute, learn, and improve automatically — 24/7.'}
            </p>
          </div>

          {/* Teams grid — by business objective */}
          <div className="grid md:grid-cols-2 gap-5 mb-10">
            {/* TEAM 1: Vendre plus */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm overflow-hidden hover:border-blue-500/30 transition-all group">
              <div className="bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-bold text-lg">{locale === 'fr' ? 'Vendre plus' : 'Sell more'}</h3>
                    <p className="text-white/70 text-xs">{locale === 'fr' ? 'Prospection, emails, DMs, chatbot, WhatsApp' : 'Prospecting, emails, DMs, chatbot, WhatsApp'}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-bold text-2xl">5</div>
                    <div className="text-white/60 text-[10px]">agents</div>
                  </div>
                </div>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                  {[
                    { icon: '\uD83E\uDD1D', name: 'Leo', role: locale === 'fr' ? 'Prospection CRM' : 'CRM Prospecting' },
                    { icon: '\uD83D\uDCE7', name: 'Hugo', role: locale === 'fr' ? 'Emails auto' : 'Auto emails' },
                    { icon: '\uD83D\uDCAC', name: 'Jade', role: 'DMs Instagram' },
                    { icon: '\uD83D\uDCF2', name: 'Stella', role: 'WhatsApp' },
                    { icon: '\uD83E\uDD16', name: 'Max', role: 'Chatbot 24/7' },
                  ].map(a => (
                    <div key={a.name} className="flex items-center gap-2 bg-white/5 rounded-lg px-2.5 py-2">
                      <span className="text-base">{a.icon}</span>
                      <div className="min-w-0"><div className="text-white text-xs font-semibold">{a.name}</div><div className="text-white/30 text-[9px] truncate">{a.role}</div></div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="text-blue-400 font-semibold">{locale === 'fr' ? 'Resultat' : 'Result'}</span>
                  <span className="text-white/40">{locale === 'fr' ? 'Prospects qualifies \u2192 Emails auto \u2192 Relances \u2192 Conversion client' : 'Qualified leads \u2192 Auto emails \u2192 Follow-ups \u2192 Client conversion'}</span>
                </div>
              </div>
            </div>

            {/* TEAM 2: Etre visible */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm overflow-hidden hover:border-purple-500/30 transition-all group">
              <div className="bg-gradient-to-r from-purple-600 to-violet-500 px-5 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-bold text-lg">{locale === 'fr' ? 'Etre visible partout' : 'Be visible everywhere'}</h3>
                    <p className="text-white/70 text-xs">{locale === 'fr' ? 'Contenu, SEO, TikTok, Google Maps, Pub' : 'Content, SEO, TikTok, Google Maps, Ads'}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-bold text-2xl">5</div>
                    <div className="text-white/60 text-[10px]">agents</div>
                  </div>
                </div>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                  {[
                    { icon: '\u2728', name: 'Lena', role: locale === 'fr' ? 'Publication auto' : 'Auto-publish' },
                    { icon: '\uD83D\uDD0D', name: 'Oscar', role: locale === 'fr' ? 'SEO & articles' : 'SEO & articles' },
                    { icon: '\uD83C\uDFB5', name: 'Axel', role: 'TikTok' },
                    { icon: '\uD83D\uDCCD', name: 'Theo', role: 'Google Maps' },
                    { icon: '\uD83D\uDCE2', name: 'Felix', role: locale === 'fr' ? 'Pub & acquisition' : 'Ads & acquisition' },
                  ].map(a => (
                    <div key={a.name} className="flex items-center gap-2 bg-white/5 rounded-lg px-2.5 py-2">
                      <span className="text-base">{a.icon}</span>
                      <div className="min-w-0"><div className="text-white text-xs font-semibold">{a.name}</div><div className="text-white/30 text-[9px] truncate">{a.role}</div></div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="text-purple-400 font-semibold">{locale === 'fr' ? 'Resultat' : 'Result'}</span>
                  <span className="text-white/40">{locale === 'fr' ? 'Publications regulieres + SEO + avis Google + pub = visibilite maximale' : 'Regular posts + SEO + Google reviews + ads = max visibility'}</span>
                </div>
              </div>
            </div>

            {/* TEAM 3: Gerer l'admin */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm overflow-hidden hover:border-amber-500/30 transition-all group">
              <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-bold text-lg">{locale === 'fr' ? 'Zero paperasse' : 'Zero paperwork'}</h3>
                    <p className="text-white/70 text-xs">{locale === 'fr' ? 'Comptabilite, RH, juridique, onboarding' : 'Accounting, HR, legal, onboarding'}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-bold text-2xl">3</div>
                    <div className="text-white/60 text-[10px]">agents</div>
                  </div>
                </div>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                  {[
                    { icon: '\uD83D\uDCB0', name: 'Louis', role: locale === 'fr' ? 'Finance & compta' : 'Finance' },
                    { icon: '\u2696\uFE0F', name: 'Sara', role: locale === 'fr' ? 'RH & juridique' : 'HR & legal' },
                    { icon: '\uD83D\uDE80', name: 'Clara', role: locale === 'fr' ? 'Onboarding' : 'Onboarding' },
                  ].map(a => (
                    <div key={a.name} className="flex items-center gap-2 bg-white/5 rounded-lg px-2.5 py-2">
                      <span className="text-base">{a.icon}</span>
                      <div className="min-w-0"><div className="text-white text-xs font-semibold">{a.name}</div><div className="text-white/30 text-[9px] truncate">{a.role}</div></div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="text-amber-400 font-semibold">{locale === 'fr' ? 'Resultat' : 'Result'}</span>
                  <span className="text-white/40">{locale === 'fr' ? 'Tresorerie suivie, contrats generes, espace configure' : 'Cash flow tracked, contracts generated, space configured'}</span>
                </div>
              </div>
            </div>

            {/* TEAM 4: Piloter — Noah + Ami en vedette */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm overflow-hidden hover:border-pink-500/30 transition-all group">
              <div className="bg-gradient-to-r from-pink-500 to-rose-500 px-5 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-bold text-lg">{locale === 'fr' ? 'Pilotage & strategie' : 'Strategy & management'}</h3>
                    <p className="text-white/70 text-xs">{locale === 'fr' ? 'Direction globale, marketing, retention, amelioration continue' : 'Global direction, marketing, retention, improvement'}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-bold text-2xl">4</div>
                    <div className="text-white/60 text-[10px]">agents</div>
                  </div>
                </div>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {[
                    { icon: '\uD83E\uDDE0', name: 'Noah', role: locale === 'fr' ? 'CEO IA \u2014 pilote la strategie globale de l\'entreprise' : 'AI CEO \u2014 drives global business strategy' },
                    { icon: '\uD83C\uDFAF', name: 'Ami', role: locale === 'fr' ? 'Directrice marketing \u2014 coordonne tous les agents' : 'Marketing director \u2014 coordinates all agents' },
                    { icon: '\uD83D\uDD04', name: 'Theo R.', role: locale === 'fr' ? 'Retention \u2014 garde vos clients actifs' : 'Retention \u2014 keeps clients active' },
                    { icon: '\u2699\uFE0F', name: 'Ops', role: locale === 'fr' ? 'Diagnostic \u2014 sante du systeme 24/7' : 'Diagnostic \u2014 system health 24/7' },
                  ].map(a => (
                    <div key={a.name} className="flex items-center gap-2 bg-white/5 rounded-lg px-2.5 py-2">
                      <span className="text-base">{a.icon}</span>
                      <div className="min-w-0"><div className="text-white text-xs font-semibold">{a.name}</div><div className="text-white/30 text-[9px] truncate">{a.role}</div></div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="text-pink-400 font-semibold">{locale === 'fr' ? 'Resultat' : 'Result'}</span>
                  <span className="text-white/40">{locale === 'fr' ? 'Intelligence collective : les agents apprennent et s\'ameliorent a chaque action' : 'Collective intelligence: agents learn and improve with every action'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Differentiator bar */}
          <div className="rounded-2xl border border-purple-500/20 bg-gradient-to-r from-purple-600/10 to-blue-600/10 backdrop-blur-sm p-6">
            <div className="flex flex-col md:flex-row items-center gap-6 md:gap-10">
              <div className="flex items-center gap-8 flex-wrap justify-center">
                <div className="text-center">
                  <div className="text-white font-bold text-3xl">17</div>
                  <div className="text-white/40 text-[10px] uppercase tracking-wider">{locale === 'fr' ? 'Agents IA' : 'AI Agents'}</div>
                </div>
                <div className="text-center">
                  <div className="text-white font-bold text-3xl">24/7</div>
                  <div className="text-white/40 text-[10px] uppercase tracking-wider">{locale === 'fr' ? 'Actifs' : 'Active'}</div>
                </div>
                <div className="text-center">
                  <div className="text-white font-bold text-3xl">{'\u{1F52E}'}</div>
                  <div className="text-white/40 text-[10px] uppercase tracking-wider">{locale === 'fr' ? 'Super entraines' : 'Super trained'}</div>
                </div>
                <div className="text-center">
                  <div className="text-white font-bold text-3xl">10h</div>
                  <div className="text-white/40 text-[10px] uppercase tracking-wider">{locale === 'fr' ? 'Gagnees/sem' : 'Saved/week'}</div>
                </div>
              </div>
              <div className="flex-1 text-center md:text-left">
                <p className="text-white font-semibold text-sm mb-1">
                  {locale === 'fr' ? 'Pas un chatbot. Une equipe qui execute.' : 'Not a chatbot. A team that executes.'}
                </p>
                <p className="text-white/40 text-xs mb-3">
                  {locale === 'fr'
                    ? 'Vos agents publient, prospectent, relancent, optimisent — pendant que vous gerez votre business.'
                    : 'Your agents publish, prospect, follow-up, optimize — while you run your business.'}
                </p>
                <a href="/assistant" className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-purple-500/30 transition-all text-sm">
                  {locale === 'fr' ? 'Decouvrir vos agents IA' : 'Discover your AI agents'} →
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* GALERIE & POSTS MULTI-PLATEFORME */}
      <section className="hidden sm:block mx-auto max-w-6xl px-6 py-12">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900">{t.home.galleryTitle}</h2>
          <p className="mt-2 text-neutral-600">{t.home.gallerySubtitle}</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 items-center">
          {/* Galerie preview */}
          <div className="rounded-2xl premium-card overflow-hidden bg-white hover:shadow-soft-lg hover:-translate-y-0.5 transition-all">
            <div className="bg-gradient-to-r from-[#0c1a3a] to-[#1e3a5f] p-4">
              <h3 className="text-white font-bold flex items-center gap-2">
                <span>📁</span> {t.home.galleryOrganized}
              </h3>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                <div className="aspect-square rounded-lg overflow-hidden border border-[#0c1a3a]/10 shadow-sm">
                  <img
                    src="https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?q=80&w=400&auto=format&fit=crop"
                    alt="Exemple visuel"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="aspect-square rounded-lg overflow-hidden border border-[#0c1a3a]/10 shadow-sm">
                  <img
                    src="https://images.unsplash.com/photo-1557804506-669a67965ba0?q=80&w=400&auto=format&fit=crop"
                    alt="Exemple visuel"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="aspect-square rounded-lg overflow-hidden border border-[#0c1a3a]/10 shadow-sm">
                  <img
                    src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=400&auto=format&fit=crop"
                    alt="Exemple visuel"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="aspect-square rounded-lg overflow-hidden border border-[#0c1a3a]/10 shadow-sm">
                  <img
                    src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=400&auto=format&fit=crop"
                    alt="Exemple visuel"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="aspect-square rounded-lg overflow-hidden border border-[#0c1a3a]/10 shadow-sm">
                  <img
                    src="https://images.unsplash.com/photo-1533750516457-a7f992034fec?q=80&w=400&auto=format&fit=crop"
                    alt="Exemple visuel"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="aspect-square rounded-lg overflow-hidden border border-[#0c1a3a]/10 shadow-sm">
                  <img
                    src="https://images.unsplash.com/photo-1552664730-d307ca884978?q=80&w=400&auto=format&fit=crop"
                    alt="Exemple visuel"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-[#0c1a3a]">
                  <span>✓</span>
                  <span>{t.home.galleryFolder}</span>
                </div>
                <div className="flex items-center gap-2 text-[#0c1a3a]">
                  <span>✓</span>
                  <span>{t.home.galleryDragDrop}</span>
                </div>
                <div className="flex items-center gap-2 text-[#0c1a3a]">
                  <span>✓</span>
                  <span>{t.home.galleryEditTitle}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Multi-platform automation preview */}
          <div className="rounded-2xl premium-card overflow-hidden bg-white hover:shadow-soft-lg hover:-translate-y-0.5 transition-all">
            <div className="bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-500 p-4">
              <h3 className="text-white font-bold flex items-center gap-2">
                <span>📱</span> {t.home.galleryPostsTitle}
              </h3>
            </div>
            <div className="p-5 space-y-3">
              <div className="bg-white rounded-lg p-3 border border-[#0c1a3a]/10">
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-lg">✨</span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-[#0c1a3a]">{t.home.galleryCaptionTitle}</p>
                    <p className="text-[11px] text-neutral-600 mt-1">
                      "🔥 Cette semaine, on parle de [ton sujet]...<br/>
                      ✅ 3 actions concrètes<br/>
                      💡 Conseil d'expert"
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-[#0c1a3a]/10">
                <div className="flex items-start gap-2">
                  <span className="text-lg">#️⃣</span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-[#0c1a3a]">{t.home.galleryHashtagTitle}</p>
                    <p className="text-[11px] text-[#0c1a3a] mt-1">
                      {t.home.galleryHashtagOptimized}
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2 text-[#0c1a3a]">
                  <span>✓</span>
                  <span>{t.home.galleryPublishInstagram}</span>
                </div>
                <div className="flex items-center gap-2 text-[#0c1a3a]">
                  <span>✓</span>
                  <span>{t.home.galleryPublishTikTok}</span>
                </div>
                <div className="flex items-center gap-2 text-[#0c1a3a]">
                  <span>✓</span>
                  <span>{t.home.galleryDrafts}</span>
                </div>
              </div>
            </div>
            <div className="p-3 bg-white border-t border-[#0c1a3a]/10 text-center">
              <a href="/library" className="text-xs text-[#0c1a3a] hover:text-[#0c1a3a] font-medium">
                {t.home.galleryViewCta}
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 bg-gradient-to-r from-purple-50 via-pink-50 to-cyan-50 rounded-2xl premium-card p-6 text-center">
          <p className="text-sm text-[#0c1a3a]" dangerouslySetInnerHTML={{ __html: t.home.galleryMultiPlatform }} />
        </div>

        {/* CTA après Galerie */}
        <div className="mt-10 text-center">
          <a href="/checkout/upsell?plan=createur" className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-[#0c1a3a] to-[#1e3a5f] text-white font-semibold text-lg hover:shadow-xl transition-all hover:-translate-y-0.5">
            {t.home.galleryCta}
          </a>
          <p className="mt-3 text-sm text-neutral-600">
            {t.home.galleryCtaSub}
          </p>
        </div>
      </section>

      {/* EXEMPLE CONCRET AVANT/APRÈS */}
      <section id="exemple" className="hp-light-island mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-12">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold">{t.home.beforeAfterTitle}</h2>
          <p className="mt-2 text-neutral-600">{t.home.beforeAfterSubtitle}</p>
        </div>

        {/* Visual before/after comparisons — multiple businesses */}
        <div className="space-y-8">
          {[
            {
              business: 'Restaurant',
              account: '@bistro_parisien',
              before: { img: 'https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?q=30&w=400&fit=crop', caption: 'Venez manger chez nous ! Menu du jour a 14,90. #restaurant #food', likes: 12, comments: 1 },
              after: { img: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=90&w=400&fit=crop', caption: 'Ce plat a fait craquer 847 personnes cette semaine. Notre chef revisite le classique boeuf bourguignon avec une touche japonaise...', hashtags: '#RestaurantParis #GastroTendance #FoodParis #ChefLife', likes: 847, comments: 43, saves: 89 },
            },
            {
              business: 'Coiffeur',
              account: '@salon_emma_lyon',
              before: { img: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?q=30&w=400&fit=crop', caption: 'Nouvelle coupe pour ma cliente ! #coiffure #lyon', likes: 8, comments: 0 },
              after: { img: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=90&w=400&fit=crop', caption: 'Cette coupe fait fureur sur TikTok — et on comprend pourquoi. Le butterfly cut version 2026, adapte a chaque visage...', hashtags: '#CoiffeurLyon #ButterflyCut #TendanceCoiffure #Balayage', likes: 1247, comments: 67, saves: 156 },
            },
          ].map((ex, idx) => (
            <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {/* AVANT */}
              <div className="relative">
                <div className="absolute -top-2 left-4 z-10 bg-red-500 text-white px-3 py-0.5 rounded-full text-xs font-bold shadow-lg">
                  {'\u274C'} ChatGPT + Canva
                </div>
                <div className="rounded-xl border-2 border-red-200 dark:border-red-800/30 overflow-hidden bg-white dark:bg-white/5">
                  <img src={ex.before.img} alt="" className="w-full aspect-[4/3] object-cover opacity-80 brightness-105 saturate-75" />
                  <div className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-full bg-neutral-300 dark:bg-white/10" />
                      <span className="text-xs font-medium text-neutral-700 dark:text-white/60">{ex.account}</span>
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-white/40">{ex.before.caption}</p>
                    <div className="flex gap-3 mt-2 pt-2 border-t border-neutral-100 dark:border-white/5 text-[10px] text-neutral-400 dark:text-white/20">
                      <span>{'\u2764\uFE0F'} {ex.before.likes}</span>
                      <span>{'\u{1F4AC}'} {ex.before.comments}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* APRES */}
              <div className="relative">
                <div className="absolute -top-2 left-4 z-10 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white px-3 py-0.5 rounded-full text-xs font-bold shadow-lg">
                  {'\u2728'} KeiroAI
                </div>
                <div className="rounded-xl border-2 border-emerald-300 dark:border-emerald-700/30 overflow-hidden bg-white dark:bg-white/5 shadow-xl shadow-emerald-500/10">
                  <img src={ex.after.img} alt="" className="w-full aspect-[4/3] object-cover" />
                  <div className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#0c1a3a] to-purple-600 ring-1 ring-purple-500/30" />
                      <span className="text-xs font-semibold text-neutral-800 dark:text-white">{ex.account}</span>
                      <span className="text-[9px] bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-full font-medium">KeiroAI</span>
                    </div>
                    <p className="text-xs text-neutral-700 dark:text-white/70 leading-relaxed">{ex.after.caption}</p>
                    <p className="text-[10px] text-blue-500 mt-1">{ex.after.hashtags}</p>
                    <div className="flex gap-3 mt-2 pt-2 border-t border-emerald-100 dark:border-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                      <span>{'\u2764\uFE0F'} {ex.after.likes.toLocaleString()}</span>
                      <span>{'\u{1F4AC}'} {ex.after.comments}</span>
                      <span>{'\u{1F4E9}'} {ex.after.saves} saves</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Exemples concrets par type de commerce */}
        <div className="mt-8 sm:mt-12">
          <h3 className="text-lg sm:text-xl font-bold text-center mb-4 sm:mb-6">
            Des publications qui <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#0c1a3a] to-purple-600">convertissent vraiment</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {/* Exemple 1: Restaurant */}
            <div className="rounded-xl border border-neutral-200 dark:border-white/10 overflow-hidden bg-white dark:bg-white/5">
              <div className="relative aspect-square bg-gradient-to-br from-orange-100 to-red-50 dark:from-orange-900/30 dark:to-red-900/30 flex items-center justify-center">
                <div className="text-center px-4">
                  <div className="text-4xl mb-2">{'\u{1F35D}'}</div>
                  <div className="bg-black/70 backdrop-blur-sm text-white px-4 py-2 rounded-lg text-sm font-bold">Les 5 plats que tout Paris s&apos;arrache cet hiver</div>
                </div>
                <div className="absolute top-2 right-2 bg-emerald-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">KeiroAI</div>
              </div>
              <div className="p-3">
                <p className="text-[11px] text-neutral-700 dark:text-white/70 leading-relaxed">
                  <span className="font-bold">{'\u{1F525}'} Tendance food alert !</span> La truffe est de retour et on a cree un menu special...{'\n'}
                  <span className="text-[10px] text-blue-500">#RestaurantParis #TruffeHiver #FoodParis #GastronomieIA</span>
                </p>
                <div className="flex items-center gap-3 mt-2 pt-2 border-t border-neutral-100 dark:border-white/5">
                  <span className="text-[10px] text-neutral-400">{'\u2764\uFE0F'} 847</span>
                  <span className="text-[10px] text-neutral-400">{'\u{1F4AC}'} 43</span>
                  <span className="text-[10px] text-neutral-400">{'\u{1F4E9}'} 12 saves</span>
                </div>
              </div>
            </div>

            {/* Exemple 2: Coiffeur */}
            <div className="rounded-xl border border-neutral-200 dark:border-white/10 overflow-hidden bg-white dark:bg-white/5">
              <div className="relative aspect-square bg-gradient-to-br from-pink-100 to-purple-50 dark:from-pink-900/30 dark:to-purple-900/30 flex items-center justify-center">
                <div className="text-center px-4">
                  <div className="text-4xl mb-2">{'\u2702\uFE0F'}</div>
                  <div className="bg-black/70 backdrop-blur-sm text-white px-4 py-2 rounded-lg text-sm font-bold">Cette coupe fait fureur sur TikTok — voici pourquoi</div>
                </div>
                <div className="absolute top-2 right-2 bg-emerald-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">KeiroAI</div>
              </div>
              <div className="p-3">
                <p className="text-[11px] text-neutral-700 dark:text-white/70 leading-relaxed">
                  <span className="font-bold">{'\u{1F4C8}'} +340% de vues sur ce type de Reel !</span> Le butterfly cut explose en ce moment...{'\n'}
                  <span className="text-[10px] text-blue-500">#CoiffeurLyon #ButterflyCut #TendanceCoiffure #ReelCoiffure</span>
                </p>
                <div className="flex items-center gap-3 mt-2 pt-2 border-t border-neutral-100 dark:border-white/5">
                  <span className="text-[10px] text-neutral-400">{'\u2764\uFE0F'} 1.2K</span>
                  <span className="text-[10px] text-neutral-400">{'\u{1F4AC}'} 67</span>
                  <span className="text-[10px] text-neutral-400">{'\u{1F4E9}'} 89 saves</span>
                </div>
              </div>
            </div>

            {/* Exemple 3: Coach */}
            <div className="rounded-xl border border-neutral-200 dark:border-white/10 overflow-hidden bg-white dark:bg-white/5 sm:col-span-2 lg:col-span-1">
              <div className="relative aspect-square bg-gradient-to-br from-cyan-100 to-blue-50 dark:from-cyan-900/30 dark:to-blue-900/30 flex items-center justify-center">
                <div className="text-center px-4">
                  <div className="text-4xl mb-2">{'\u{1F4AA}'}</div>
                  <div className="bg-black/70 backdrop-blur-sm text-white px-4 py-2 rounded-lg text-sm font-bold">L&apos;erreur n{'\u00B0'}1 qui vous empeche de progresser</div>
                </div>
                <div className="absolute top-2 right-2 bg-emerald-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">KeiroAI</div>
              </div>
              <div className="p-3">
                <p className="text-[11px] text-neutral-700 dark:text-white/70 leading-relaxed">
                  <span className="font-bold">{'\u{1F9E0}'} Etude du jour :</span> 73% des debutants font cette erreur au squat. Voici comment la corriger...{'\n'}
                  <span className="text-[10px] text-blue-500">#CoachSportif #Musculation #FitnessMotivation #ConseilSport</span>
                </p>
                <div className="flex items-center gap-3 mt-2 pt-2 border-t border-neutral-100 dark:border-white/5">
                  <span className="text-[10px] text-neutral-400">{'\u2764\uFE0F'} 2.1K</span>
                  <span className="text-[10px] text-neutral-400">{'\u{1F4AC}'} 156</span>
                  <span className="text-[10px] text-neutral-400">{'\u{1F4E9}'} 234 saves</span>
                </div>
              </div>
            </div>
          </div>

          {/* Ce qui change */}
          <div className="mt-4 sm:mt-6 bg-gradient-to-r from-[#0c1a3a]/5 to-purple-50 dark:from-[#0c1a3a]/20 dark:to-purple-900/20 rounded-xl border border-[#0c1a3a]/10 dark:border-purple-500/20 p-4 sm:p-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-center">
              <div>
                <div className="text-2xl font-black text-[#0c1a3a] dark:text-purple-300">{'\u{1F4C8}'} x12</div>
                <div className="text-xs text-neutral-600 dark:text-white/50">plus d&apos;engagement moyen</div>
              </div>
              <div>
                <div className="text-2xl font-black text-[#0c1a3a] dark:text-purple-300">{'\u{1F525}'} Tendance</div>
                <div className="text-xs text-neutral-600 dark:text-white/50">contenu lie a l&apos;actualite du jour</div>
              </div>
              <div>
                <div className="text-2xl font-black text-[#0c1a3a] dark:text-purple-300">{'\u{1F3AF}'} #Hashtags</div>
                <div className="text-xs text-neutral-600 dark:text-white/50">optimises IA pour votre niche</div>
              </div>
            </div>
          </div>
        </div>

        {/* Explication sous les images */}
        <div className="mt-6 sm:mt-8 bg-neutral-50 dark:bg-white/5 rounded-2xl border border-neutral-200 dark:border-white/10 p-4 sm:p-6">
          <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-3">{t.home.changeTitle}</h3>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="flex items-start gap-2">
              <span className="text-emerald-500 text-xl">✓</span>
              <div>
                <p className="text-sm font-semibold text-neutral-900 dark:text-white">{t.home.change1Title}</p>
                <p className="text-xs text-neutral-600 dark:text-neutral-400">{t.home.change1Desc}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-emerald-500 text-xl">✓</span>
              <div>
                <p className="text-sm font-semibold text-neutral-900 dark:text-white">{t.home.change2Title}</p>
                <p className="text-xs text-neutral-600 dark:text-neutral-400">{t.home.change2Desc}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-emerald-500 text-xl">✓</span>
              <div>
                <p className="text-sm font-semibold text-neutral-900 dark:text-white">{t.home.change3Title}</p>
                <p className="text-xs text-neutral-600 dark:text-neutral-400">{t.home.change3Desc}</p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-10 text-center">
          <a href="/checkout/upsell?plan=createur" className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-[#0c1a3a] to-[#1e3a5f] text-white font-semibold text-lg hover:shadow-xl transition-all hover:-translate-y-0.5">
            {t.home.generateFirstCta}
          </a>
        </div>
      </section>

      </div>
      {/* ═══ END HIDDEN SECTIONS ═══ */}

      {/* TÉMOIGNAGES CLIENTS */}
      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold mb-2">{t.home.testimonialsTitle}</h2>
          <p className="text-neutral-600">{t.home.testimonialsSub}</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Témoignage 1 */}
          <div className="bg-white rounded-2xl premium-card p-6 hover:shadow-soft-lg hover:-translate-y-0.5 transition-all">
            <div className="flex items-center gap-1 mb-4 text-purple-400">
              <span>⭐</span>
              <span>⭐</span>
              <span>⭐</span>
              <span>⭐</span>
              <span>⭐</span>
            </div>
            <p className="text-neutral-700 mb-4 leading-relaxed">{t.home.testimonial1Text}</p>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#0c1a3a] flex items-center justify-center text-white font-bold text-lg">
                K
              </div>
              <div>
                <div className="font-bold text-neutral-900">{t.home.testimonial1Name}</div>
                <div className="text-sm text-neutral-600">{t.home.testimonial1Role}</div>
              </div>
            </div>
          </div>

          {/* Témoignage 2 */}
          <div className="bg-white rounded-2xl premium-card p-6 hover:shadow-soft-lg hover:-translate-y-0.5 transition-all">
            <div className="flex items-center gap-1 mb-4 text-[#6b9fd4]">
              <span>⭐</span>
              <span>⭐</span>
              <span>⭐</span>
              <span>⭐</span>
              <span>⭐</span>
            </div>
            <p className="text-neutral-700 mb-4 leading-relaxed">{t.home.testimonial2Text}</p>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#0c1a3a] flex items-center justify-center text-white font-bold text-lg">
                J
              </div>
              <div>
                <div className="font-bold text-neutral-900">{t.home.testimonial2Name}</div>
                <div className="text-sm text-neutral-600">{t.home.testimonial2Role}</div>
              </div>
            </div>
          </div>

          {/* Témoignage 3 */}
          <div className="bg-white rounded-2xl premium-card p-6 hover:shadow-soft-lg hover:-translate-y-0.5 transition-all">
            <div className="flex items-center gap-1 mb-4 text-[#6b9fd4]">
              <span>⭐</span>
              <span>⭐</span>
              <span>⭐</span>
              <span>⭐</span>
              <span>⭐</span>
            </div>
            <p className="text-neutral-700 mb-4 leading-relaxed">{t.home.testimonial3Text}</p>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#0c1a3a] flex items-center justify-center text-white font-bold text-lg">
                M
              </div>
              <div>
                <div className="font-bold text-neutral-900">{t.home.testimonial3Name}</div>
                <div className="text-sm text-neutral-600">{t.home.testimonial3Role}</div>
              </div>
            </div>
          </div>
        </div>

        {/* CTA après témoignages */}
        <div className="mt-10 text-center">
          <a href="/checkout/upsell?plan=createur" className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-[#0c1a3a] to-[#1e3a5f] text-white font-semibold text-lg hover:shadow-xl transition-all hover:-translate-y-0.5">
            {t.home.testimonialCta}
          </a>
          <p className="mt-3 text-sm text-neutral-600">
            {t.home.testimonialCtaSub}
          </p>
        </div>
        <p className="text-xs text-center text-neutral-400 mt-2 italic">Retours basés sur des tests utilisateurs</p>
      </section>

      {/* ═══ MORE HIDDEN SECTIONS ═══ */}
      <div className="hidden">
      {/* POURQUOI PUBLIER SUR L'ACTU */}
      <section className="hidden sm:block section-divider section-light">
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
      <section className="hidden sm:block mx-auto max-w-6xl px-6 py-16">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-bold mb-3">
            Vous n&apos;avez pas de graphiste ni de CM ?{' '}
            <span className="text-3xl md:text-4xl font-bold">Le vrai coût, c&apos;est l&apos;invisibilité.</span>
          </h2>
          <p className="text-lg text-neutral-600">
            Chaque jour sans Instagram, des clients potentiels choisissent votre concurrent.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-10">
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

          {/* Card 3 — KeiroAI */}
          <div className="bg-gradient-to-br from-[#0c1a3a]/5 to-purple-50 rounded-2xl border-2 border-[#0c1a3a]/30 p-6 shadow-lg relative">
            <div className="absolute -top-2 -right-2 text-xl">⭐</div>
            <h3 className="text-lg font-bold text-[#0c1a3a] mb-3">&quot;KeiroAI&quot;</h3>
            <ul className="space-y-2 text-sm text-neutral-700">
              <li><span className="font-semibold text-[#0c1a3a]">Coût :</span> 14 jours gratuits, puis à partir de 49€/mois</li>
              <li><span className="font-semibold text-[#0c1a3a]">Résultat :</span> 3 à 6 posts pro par semaine, brandés, liés à l&apos;actu</li>
              <li><span className="font-semibold text-[#0c1a3a]">Clients :</span> Le calcul est simple ↓</li>
            </ul>
            <p className="mt-3 text-xs text-[#0c1a3a] italic">
              &quot;Instagram crée pour vous + texte + hashtags + stats. Vous publiez en 30 secondes.&quot;
            </p>
          </div>
        </div>

      </section>

      {/* COMPARATIF AU MOIS — IMPACTANT */}
      <section className="hidden sm:block hp-light-island mx-auto max-w-6xl px-6 py-16">
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
          <div className="bg-gradient-to-br from-[#0c1a3a]/5 to-cyan-50 rounded-2xl border-2 border-[#0c1a3a]/30 p-6 relative shadow-lg shadow-[#0c1a3a]/10">
            <div className="absolute -top-3 left-4">
              <span className="bg-gradient-to-r from-[#0c1a3a] to-[#1e3a5f] text-white px-3 py-1 rounded-full text-xs font-bold">KeiroAI — 14 jours gratuits</span>
            </div>
            <div className="pt-4">
              <p className="text-2xl font-bold text-[#0c1a3a] mb-1">14 jours gratuits<span className="text-base font-normal text-[#6b9fd4]"> puis 49€/mois</span></p>
              <ul className="mt-4 space-y-2 text-sm text-neutral-700">
                <li className="flex gap-2"><span className="text-[#0c1a3a] font-bold">✓</span> <span><strong>3 minutes</strong> par visuel, instantané</span></li>
                <li className="flex gap-2"><span className="text-[#0c1a3a] font-bold">✓</span> <span>Modifications <strong>illimitées</strong>, en temps réel</span></li>
                <li className="flex gap-2"><span className="text-[#0c1a3a] font-bold">✓</span> <span>Visuels <strong>liés à l&apos;actualité du jour</strong></span></li>
                <li className="flex gap-2"><span className="text-[#0c1a3a] font-bold">✓</span> <span><strong>Vidéo IA + audio narration</strong> inclus</span></li>
                <li className="flex gap-2"><span className="text-[#0c1a3a] font-bold">✓</span> <span><strong>Texte, légendes, hashtags</strong> générés automatiquement</span></li>
                <li className="flex gap-2"><span className="text-[#0c1a3a] font-bold">✓</span> <span><strong>Instagram + TikTok + LinkedIn</strong> (multi-plateforme)</span></li>
                <li className="flex gap-2"><span className="text-[#0c1a3a] font-bold">✓</span> <span><strong>Branding personnalisé</strong> (Fondateurs)</span></li>
                <li className="flex gap-2"><span className="text-[#0c1a3a] font-bold">✓</span> <span><strong>Multi-format automatique</strong> (Fondateurs)</span></li>
                <li className="flex gap-2"><span className="text-[#0c1a3a] font-bold">✓</span> <span><strong>Statistiques et analyse</strong> intégrées</span></li>
                <li className="flex gap-2"><span className="text-[#0c1a3a] font-bold">✓</span> <span><strong>Assistant Marketing Intelligence</strong> personnalisé</span></li>
                <li className="flex gap-2"><span className="text-[#0c1a3a] font-bold">✓</span> <span>Disponible <strong>24/7</strong>, jamais en congé</span></li>
                <li className="flex gap-2"><span className="text-[#0c1a3a] font-bold">✓</span> <span><strong>Calendrier de planification</strong> intégré</span></li>
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
          <a href="/checkout/upsell?plan=createur" className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-[#0c1a3a] to-[#1e3a5f] text-white font-semibold text-lg hover:shadow-xl transition-all hover:-translate-y-0.5 cta-shimmer">
            {t.home.comparatorCta}
          </a>
          <p className="mt-3 text-sm text-neutral-500">
            {t.home.comparatorCtaSub}
          </p>
        </div>
      </section>

      {/* CHATGPT vs KEIROAI COMPARISON */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        {/* Section Title */}
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-bold mb-3">
            Les outils IA gratuits suffisent&nbsp;?
          </h2>
          <p className="text-lg text-neutral-600">
            Parce que créer UN visuel et gérer votre présence en ligne, c&apos;est pas la même chose.
          </p>
        </div>

        {/* Video killer feature banner */}
        <div className="bg-gradient-to-r from-[#0c1a3a] to-[#1e3a5f] text-white rounded-xl p-4 mb-6">
          <p className="font-bold text-lg mb-1">La vidéo change tout. ChatGPT ne fait pas de vidéo.</p>
          <p className="text-sm text-white/90">
            Sur TikTok, une vidéo peut toucher 100&nbsp;000 personnes gratuitement. ChatGPT génère des images, pas des vidéos. KeiroAI génère des vidéos avec narration audio, prêtes à publier. En 3 minutes.
          </p>
        </div>

        {/* 3-column comparison */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">

          {/* Column 1: ChatGPT / Claude Gratuit */}
          <div className="bg-neutral-100 rounded-2xl border border-neutral-200 p-6">
            <p className="text-xl font-bold text-neutral-800 mb-1">ChatGPT / Claude Gratuit</p>
            <p className="text-neutral-500 text-sm mb-4">0€</p>
            <ul className="space-y-2 text-sm">
              <li className="flex gap-2"><span className="text-green-500 font-bold flex-shrink-0">✓</span><span className="text-neutral-800">Génère des images (1 par 1, prompt manuel)</span></li>
              <li className="flex gap-2"><span className="text-green-500 font-bold flex-shrink-0">✓</span><span className="text-neutral-800">Écrit des légendes (si vous le demandez)</span></li>
              <li className="flex gap-2"><span className="text-green-500 font-bold flex-shrink-0">✓</span><span className="text-neutral-800">Propose des hashtags (si vous le demandez)</span></li>
              <li className="flex gap-2"><span className="text-red-500 flex-shrink-0">✗</span><span className="text-neutral-600">PAS de génération de VIDÉOS</span></li>
              <li className="flex gap-2"><span className="text-red-500 flex-shrink-0">✗</span><span className="text-neutral-600">PAS de vidéo avec narration audio</span></li>
              <li className="flex gap-2"><span className="text-red-500 flex-shrink-0">✗</span><span className="text-neutral-600">PAS de lien avec l&apos;actualité du jour</span></li>
              <li className="flex gap-2"><span className="text-red-500 flex-shrink-0">✗</span><span className="text-neutral-600">PAS de branding mémorisé</span></li>
              <li className="flex gap-2"><span className="text-red-500 flex-shrink-0">✗</span><span className="text-neutral-600">PAS de multi-format</span></li>
              <li className="flex gap-2"><span className="text-red-500 flex-shrink-0">✗</span><span className="text-neutral-600">PAS de calendrier, stats, galerie</span></li>
              <li className="flex gap-2"><span className="text-red-500 flex-shrink-0">✗</span><span className="text-neutral-600">PAS de publication directe</span></li>
            </ul>
            <div className="mt-4 pt-4 border-t border-neutral-200">
              <p className="text-sm font-semibold text-neutral-700">Temps par post : 25-35 min</p>
              <p className="text-xs text-neutral-500 italic mt-2">
                &quot;Le commerçant essaye 2-3 fois, se décourage, et arrête après 2 semaines.&quot;
              </p>
            </div>
          </div>

          {/* Column 2: ChatGPT / Claude Pro */}
          <div className="bg-neutral-100 rounded-2xl border border-neutral-200 p-6">
            <p className="text-xl font-bold text-neutral-800 mb-1">ChatGPT / Claude Pro</p>
            <p className="text-neutral-500 text-sm mb-4">20€/mois</p>
            <ul className="space-y-2 text-sm">
              <li className="flex gap-2"><span className="text-green-500 font-bold flex-shrink-0">✓</span><span className="text-neutral-800">Tout le gratuit, en mieux</span></li>
              <li className="flex gap-2"><span className="text-green-500 font-bold flex-shrink-0">✓</span><span className="text-neutral-800">Images de meilleure qualité</span></li>
              <li className="flex gap-2"><span className="text-green-500 font-bold flex-shrink-0">✓</span><span className="text-neutral-800">Audio MP3 téléchargeable</span></li>
              <li className="flex gap-2"><span className="text-red-500 flex-shrink-0">✗</span><span className="text-neutral-600">Toujours PAS de vidéos</span></li>
              <li className="flex gap-2"><span className="text-red-500 flex-shrink-0">✗</span><span className="text-neutral-600">PAS de vidéo + narration audio intégrée</span></li>
              <li className="flex gap-2"><span className="text-red-500 flex-shrink-0">✗</span><span className="text-neutral-600">PAS de lien auto avec l&apos;actualité</span></li>
              <li className="flex gap-2"><span className="text-red-500 flex-shrink-0">✗</span><span className="text-neutral-600">PAS de branding mémorisé</span></li>
              <li className="flex gap-2"><span className="text-red-500 flex-shrink-0">✗</span><span className="text-neutral-600">PAS de multi-format</span></li>
              <li className="flex gap-2"><span className="text-red-500 flex-shrink-0">✗</span><span className="text-neutral-600">PAS de calendrier, stats, galerie</span></li>
            </ul>
            <div className="mt-4 pt-4 border-t border-neutral-200">
              <p className="text-sm font-semibold text-neutral-700">Temps par post : 20-30 min</p>
              <p className="text-xs text-neutral-500 italic mt-2">
                &quot;Le commerçant tient 1 mois. Puis réalise qu&apos;il passe 3-4h par semaine à créer au lieu de gérer son commerce.&quot;
              </p>
            </div>
          </div>

          {/* Column 3: KeiroAI (highlighted) */}
          <div className="bg-gradient-to-br from-[#0c1a3a]/5 to-purple-50 rounded-2xl border-2 border-[#0c1a3a]/30 p-6 shadow-lg">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xl font-bold text-[#0c1a3a]">KeiroAI</p>
              <span className="text-yellow-500">⭐</span>
            </div>
            <p className="text-[#0c1a3a] text-sm mb-4">14 jours gratuits, puis à partir de 49€/mois</p>
            <ul className="space-y-2 text-sm">
              <li className="flex gap-2"><span className="text-green-500 font-bold flex-shrink-0">✓</span><span className="text-neutral-800">Images IA optimisées pour les commerces</span></li>
              <li className="flex gap-2 bg-green-100/50 rounded px-2 py-1"><span className="text-green-500 font-bold flex-shrink-0">✓</span><span className="text-neutral-800"><strong>VIDÉOS IA</strong> (5s à 90s) — impossible avec ChatGPT</span></li>
              <li className="flex gap-2"><span className="text-green-500 font-bold flex-shrink-0">✓</span><span className="text-neutral-800"><strong>Audio narration INTÉGRÉE</strong> dans la vidéo</span></li>
              <li className="flex gap-2"><span className="text-green-500 font-bold flex-shrink-0">✓</span><span className="text-neutral-800">Lié à l&apos;<strong>actualité du jour</strong> automatiquement</span></li>
              <li className="flex gap-2"><span className="text-green-500 font-bold flex-shrink-0">✓</span><span className="text-neutral-800"><strong>Branding mémorisé</strong> — logo + couleurs auto (Fondateurs)</span></li>
              <li className="flex gap-2"><span className="text-green-500 font-bold flex-shrink-0">✓</span><span className="text-neutral-800"><strong>Multi-format</strong> — 1 clic = post + Story + Reel (Fondateurs)</span></li>
              <li className="flex gap-2"><span className="text-green-500 font-bold flex-shrink-0">✓</span><span className="text-neutral-800">Légendes + hashtags générés automatiquement</span></li>
              <li className="flex gap-2"><span className="text-green-500 font-bold flex-shrink-0">✓</span><span className="text-neutral-800">Calendrier de planification</span></li>
              <li className="flex gap-2"><span className="text-green-500 font-bold flex-shrink-0">✓</span><span className="text-neutral-800">Statistiques Instagram + TikTok</span></li>
              <li className="flex gap-2"><span className="text-green-500 font-bold flex-shrink-0">✓</span><span className="text-neutral-800">Assistant Marketing Intelligence</span></li>
              <li className="flex gap-2"><span className="text-green-500 font-bold flex-shrink-0">✓</span><span className="text-neutral-800">Publication multi-plateforme</span></li>
              <li className="flex gap-2"><span className="text-green-500 font-bold flex-shrink-0">✓</span><span className="text-neutral-800">Galerie organisée + export optimisé</span></li>
            </ul>
            <div className="mt-4 pt-4 border-t border-[#0c1a3a]/10">
              <p className="text-sm font-semibold text-[#0c1a3a]">Temps par post : <strong>3 minutes</strong></p>
              <p className="text-xs text-[#0c1a3a] italic mt-2">
                &quot;Le commerçant publie 3-5 fois par semaine pendant des mois. Parce que c&apos;est facile.&quot;
              </p>
            </div>
          </div>

        </div>

        {/* "La vraie question" callout box */}
        <div className="bg-gradient-to-r from-[#0c1a3a] to-[#1e3a5f] text-white rounded-2xl p-8 mb-10">
          <p className="text-lg md:text-xl font-medium leading-relaxed">
            La vraie question n&apos;est pas «&nbsp;est-ce que c&apos;est possible avec ChatGPT&nbsp;?&nbsp;» — c&apos;est «&nbsp;est-ce que vous allez <strong>VRAIMENT</strong> le faire 3 fois par semaine pendant 6 mois&nbsp;?&nbsp;»
          </p>
          <p className="mt-4 text-lg md:text-xl font-medium leading-relaxed">
            ChatGPT c&apos;est un couteau suisse. KeiroAI c&apos;est un chef privé.<br />
            Le couteau suisse peut tout faire — si vous savez vous en servir.<br />
            Le chef privé fait tout POUR vous — vous n&apos;avez qu&apos;à goûter.
          </p>
          <p className="mt-4 text-lg md:text-xl font-bold">
            Votre temps vaut plus que 20€/mois. Passez-le avec vos clients, pas devant ChatGPT.
          </p>
        </div>

        {/* "Le test de la réalité" — 3 humorous cards */}
        <div className="mb-10">
          <h3 className="text-2xl font-bold text-center mb-6">Le test de la réalité</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Card 1: Semaine 1 avec ChatGPT */}
            <div className="bg-red-50 border border-red-200 rounded-xl p-5">
              <p className="font-bold text-neutral-800 mb-3">Semaine 1 avec ChatGPT</p>
              <p className="text-sm text-neutral-600 mb-2">Lundi : «&nbsp;C&apos;est génial, j&apos;ai créé un visuel&nbsp;!&nbsp;» (45 min)</p>
              <p className="text-sm text-neutral-600 mb-2">Mercredi : «&nbsp;Le prompt marchait plus, j&apos;ai dû tout refaire&nbsp;» (30 min)</p>
              <p className="text-sm text-neutral-600 mb-2">Vendredi : «&nbsp;J&apos;ai pas eu le temps, je ferai ce weekend&nbsp;»</p>
              <p className="text-sm text-neutral-600">Weekend : Netflix.</p>
            </div>

            {/* Card 2: Semaine 2 avec ChatGPT */}
            <div className="bg-red-50 border border-red-200 rounded-xl p-5">
              <p className="font-bold text-neutral-800 mb-3">Semaine 2 avec ChatGPT</p>
              <p className="text-sm text-neutral-600 mb-2">Lundi : «&nbsp;Faut que je m&apos;y remette...&nbsp;»</p>
              <p className="text-sm text-neutral-600 mb-2">Mardi : «&nbsp;...&nbsp;»</p>
              <p className="text-sm text-neutral-600">Dimanche : «&nbsp;Le mois prochain.&nbsp;»</p>
            </div>

            {/* Card 3: Semaine 1 avec KeiroAI */}
            <div className="bg-green-50 border border-green-200 rounded-xl p-5 shadow-sm">
              <p className="font-bold text-neutral-800 mb-3">Semaine 1 avec KeiroAI</p>
              <p className="text-sm text-neutral-700 mb-2">Lundi : 3 min → posté ✓</p>
              <p className="text-sm text-neutral-700 mb-2">Mercredi : 3 min → posté ✓</p>
              <p className="text-sm text-neutral-700 mb-2">Vendredi : 3 min → posté ✓</p>
              <p className="text-sm text-neutral-700 mb-2">Samedi : «&nbsp;Tiens, 12 likes et 3 nouveaux abonnés.&nbsp;»</p>
              <p className="text-sm text-neutral-700">Dimanche : «&nbsp;Je continue.&nbsp;»</p>
            </div>

          </div>
        </div>

      </section>

      </div>
      {/* ═══ END MORE HIDDEN SECTIONS ═══ */}

      {/* ═══ SECTION COMPARATIF + AVANT/APRES ═══ */}
      <section className="hp-light-island section-divider">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-20">
          {/* Title */}
          <div className="text-center mb-8 sm:mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-red-500 to-orange-500 text-white text-xs font-bold mb-4 shadow-lg">
              {'\u{1F525}'} La verite que personne ne vous dit
            </div>
            <h2 className="text-2xl sm:text-4xl md:text-5xl font-black mb-3 sm:mb-4">
              Pourquoi 95% des commerces<br className="hidden sm:block" /> <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500">abandonnent Instagram</span>
            </h2>
            <p className="text-sm sm:text-lg text-neutral-600 max-w-2xl mx-auto">
              Vous avez deja essaye ChatGPT, Canva, ou meme un CM freelance. Voici ce qui se passe vraiment.
            </p>
          </div>

          {/* Avant / Apres visual */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-10 sm:mb-16">
            {/* AVANT */}
            <div className="bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 rounded-2xl border-2 border-red-200 dark:border-red-800/30 p-5 sm:p-8">
              <div className="flex items-center gap-2 mb-4 sm:mb-6">
                <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-800/30 flex items-center justify-center text-red-500 text-lg">{'\u274C'}</div>
                <h3 className="text-lg sm:text-xl font-bold text-red-600 dark:text-red-400">AVANT KeiroAI</h3>
              </div>
              <ul className="space-y-3 sm:space-y-4">
                {[
                  { label: 'Temps par post', before: '45 min a 2h', icon: '\u23F0' },
                  { label: 'Frequence reelle', before: '1 post/semaine (au mieux)', icon: '\u{1F4C5}' },
                  { label: 'Qualite visuelle', before: 'Templates Canva vus 1000x', icon: '\u{1F3A8}' },
                  { label: 'Video', before: 'Impossible sans monteur', icon: '\u{1F3AC}' },
                  { label: 'Legende', before: 'Copiee de ChatGPT (generique)', icon: '\u{270D}\uFE0F' },
                  { label: 'DMs prospects', before: '0 (pas le temps)', icon: '\u{1F4E9}' },
                  { label: 'Suivi clients', before: 'Un fichier Excel oublie', icon: '\u{1F4CA}' },
                  { label: 'Cout total', before: '0€ + votre temps (= 2000€/mois)', icon: '\u{1F4B8}' },
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="text-base sm:text-lg mt-0.5">{item.icon}</span>
                    <div>
                      <div className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">{item.label}</div>
                      <div className="text-sm sm:text-base font-medium text-red-700 dark:text-red-300">{item.before}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* APRES */}
            <div className="bg-gradient-to-br from-emerald-50 to-cyan-50 dark:from-emerald-900/20 dark:to-cyan-900/20 rounded-2xl border-2 border-emerald-300 dark:border-emerald-700/30 p-5 sm:p-8 relative">
              <div className="absolute -top-3 right-4">
                <span className="bg-gradient-to-r from-emerald-500 to-cyan-500 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg">{'\u2728'} KeiroAI</span>
              </div>
              <div className="flex items-center gap-2 mb-4 sm:mb-6">
                <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-800/30 flex items-center justify-center text-emerald-500 text-lg">{'\u2705'}</div>
                <h3 className="text-lg sm:text-xl font-bold text-emerald-600 dark:text-emerald-400">AVEC KeiroAI</h3>
              </div>
              <ul className="space-y-3 sm:space-y-4">
                {[
                  { label: 'Temps par post', after: '3 minutes, cle en main', icon: '\u26A1' },
                  { label: 'Frequence reelle', after: 'Publications regulieres, automatiques, selon ton plan', icon: '\u{1F680}' },
                  { label: 'Qualite visuelle', after: 'Visuels IA uniques, brandes a ton image', icon: '\u{1F3A8}' },
                  { label: 'Video', after: 'Reels + TikTok generes en 1 clic', icon: '\u{1F3AC}' },
                  { label: 'Legende', after: 'Personnalisee, optimisee, avec hashtags', icon: '\u{270D}\uFE0F' },
                  { label: 'DMs prospects', after: '50 DMs/jour automatiques + suivi', icon: '\u{1F4E9}' },
                  { label: 'Suivi clients', after: 'CRM IA avec scoring + relance auto', icon: '\u{1F4CA}' },
                  { label: 'Cout total', after: '14 jours gratuits, puis 49€/mois', icon: '\u{1F4B0}' },
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="text-base sm:text-lg mt-0.5">{item.icon}</span>
                    <div>
                      <div className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">{item.label}</div>
                      <div className="text-sm sm:text-base font-bold text-emerald-700 dark:text-emerald-300">{item.after}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Comparatif ChatGPT vs CM vs KeiroAI — tableau */}
          <div className="mb-10 sm:mb-16">
            <h3 className="text-xl sm:text-2xl font-bold text-center mb-6 sm:mb-8">
              Le vrai comparatif <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#0c1a3a] to-purple-600">sans bullshit</span>
            </h3>
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-sm border-collapse min-w-[400px] sm:min-w-[600px]">
                <thead>
                  <tr>
                    <th className="text-left py-3 px-3 sm:px-4 text-neutral-500 font-medium text-xs uppercase tracking-wider"></th>
                    <th className="py-3 px-2 sm:px-4 text-center text-neutral-400 font-medium text-xs">ChatGPT / Canva</th>
                    <th className="py-3 px-2 sm:px-4 text-center text-neutral-400 font-medium text-xs">Community Manager</th>
                    <th className="py-3 px-2 sm:px-4 text-center rounded-t-xl bg-gradient-to-b from-[#0c1a3a] to-[#1e3a5f] text-white font-bold text-xs">KeiroAI {'\u2B50'}</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Prix', '0-20€/mois', '1 500-3 000€/mois', '49€/mois'],
                    ['Visuels/semaine', '2-3 (manuels)', '5-10', '21+ (auto)'],
                    ['Videos', '\u274C Non', '\u274C Non inclus', '\u2705 Reels + TikTok'],
                    ['DMs automatiques', '\u274C Non', '\u274C Non', '\u2705 50/jour'],
                    ['CRM integre', '\u274C Non', '\u274C Non', '\u2705 Scoring IA'],
                    ['Emailing auto', '\u274C Non', '\u274C Non', '\u2705 Sequences 5 etapes'],
                    ['Avis Google', '\u274C Non', '\u274C Rarement', '\u2705 Reponse auto IA'],
                    ['SEO site web', '\u274C Non', '\u274C Non', '\u2705 Audit + reco'],
                    ['Temps requis', '5-10h/sem', '2h/sem briefing', '0h (100% auto)'],
                    ['18 agents IA', '\u274C', '\u274C', '\u2705'],
                  ].map(([feature, chatgpt, cm, keiro], i) => (
                    <tr key={i} className={`${i % 2 === 0 ? 'bg-neutral-50 dark:bg-white/5' : ''} border-b border-neutral-100 dark:border-white/5`}>
                      <td className="py-2.5 px-3 sm:px-4 font-medium text-neutral-700 dark:text-white/80 text-xs sm:text-sm">{feature}</td>
                      <td className="py-2.5 px-2 sm:px-4 text-center text-neutral-500 dark:text-white/40 text-xs sm:text-sm">{chatgpt}</td>
                      <td className="py-2.5 px-2 sm:px-4 text-center text-neutral-500 dark:text-white/40 text-xs sm:text-sm">{cm}</td>
                      <td className="py-2.5 px-2 sm:px-4 text-center font-bold text-[#0c1a3a] dark:text-purple-300 bg-[#0c1a3a]/5 dark:bg-purple-900/10 text-xs sm:text-sm">{keiro}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Punchline finale */}
          <div className="bg-gradient-to-r from-[#0c1a3a] to-purple-900 text-white rounded-2xl p-6 sm:p-10 text-center">
            <p className="text-lg sm:text-2xl font-bold mb-2">
              ChatGPT c&apos;est un couteau suisse. KeiroAI c&apos;est <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-orange-300">votre equipe marketing complete</span>.
            </p>
            <p className="text-sm sm:text-base text-white/70 mb-4 sm:mb-6 max-w-2xl mx-auto">
              18 agents IA specialises qui travaillent 24/7 : creation, publication, DMs, emails, SEO, avis Google, CRM, analytics. Tout est automatise.
            </p>
            <Link href="/checkout/upsell?plan=createur" className="inline-block px-6 sm:px-10 py-3 sm:py-4 bg-white text-[#0c1a3a] font-extrabold text-sm sm:text-base rounded-xl hover:shadow-2xl hover:scale-105 transition-all">
              Essai gratuit 14 jours — 0€ {'\u2192'}
            </Link>
            <p className="text-xs text-white/40 mt-2">Carte requise, aucun debit. Annulation en 1 clic.</p>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="hp-light-island section-divider section-light">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 sm:py-16">
          <div className="text-center mb-6 sm:mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs sm:text-sm font-bold mb-4 sm:mb-6 shadow-lg">
              <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-white animate-pulse"></span>
              {t.home.pricingBadge}
            </div>
            <h2 className="text-xl sm:text-3xl md:text-4xl font-bold mb-2 sm:mb-4">{t.home.pricingTitle}</h2>
            <p className="text-sm sm:text-lg text-neutral-600">
              {t.home.pricingSubtitle}
            </p>

            {/* Toggle mensuel/annuel — hidden for now */}
            <div className="flex items-center justify-center gap-3 mt-6" style={{ display: 'none' }}>
              <button
                onClick={() => setBillingPeriod('monthly')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  billingPeriod === 'monthly'
                    ? 'bg-[#0c1a3a] text-white shadow-md'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                {t.common.monthly}
              </button>
              <button
                onClick={() => setBillingPeriod('annual')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  billingPeriod === 'annual'
                    ? 'bg-[#0c1a3a] text-white shadow-md'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                {t.common.annual} <span className="ml-1 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold">{t.common.annualDiscount}</span>
              </button>
            </div>
            {billingPeriod === 'annual' && (
              <p className="text-sm text-green-600 font-medium mt-2">{t.common.freeMonthsAnnual}</p>
            )}
          </div>

          {/* Essai gratuit */}
          <div className="max-w-2xl mx-auto mb-10">
            <div className="bg-gradient-to-r from-[#0c1a3a]/5 to-purple-50 dark:from-[#0c1a3a] dark:to-purple-900/30 rounded-2xl border border-purple-200 dark:border-purple-500/20 p-5 flex flex-col sm:flex-row items-center gap-4">
              <div className="flex-1 text-center sm:text-left">
                <p className="text-sm font-bold text-neutral-900 dark:text-white">🎁 {t.home.freeTrialTitle || 'Essai gratuit 14 jours'}</p>
                <p className="text-xs text-neutral-600 dark:text-neutral-300 mt-0.5">{t.home.freeTrialPricingDesc || 'Tous les agents IA débloqués — carte requise, 0€ débité'}</p>
                <p className="text-[11px] text-purple-700 dark:text-purple-300 mt-0.5">{t.home.freeTrialPricingNote || '0€ pendant 14 jours • Carte requise • Annulation à tout moment'}</p>
              </div>
              <Link
                href="/checkout/upsell?plan=createur"
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#0c1a3a] to-purple-700 text-white text-sm font-bold hover:shadow-lg transition-all hover:-translate-y-0.5 whitespace-nowrap flex-shrink-0"
              >
                {t.home.freeTrialCta || 'Essai gratuit 14 jours'}
              </Link>
            </div>
          </div>

          {/* Plans Grid — 4 plans principaux */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6">
            <Plan
              title={`\uD83D\uDC8E ${locale === 'fr' ? 'Createur' : 'Creator'}`}
              price={billingPeriod === 'annual' ? `490\u20AC ${t.common.perYear}` : `49\u20AC ${t.common.perMonth}`}
              subtitle={locale === 'fr' ? 'Freelance & createur solo' : 'Freelance & solo creator'}
              bullets={[locale === 'fr' ? '400 credits/mois' : '400 credits/month', locale === 'fr' ? 'Publication auto Instagram' : 'Auto-publish Instagram', locale === 'fr' ? 'Agent contenu + DM' : 'Content + DM agent']}
              ctaLabel={locale === 'fr' ? 'Essai gratuit 14 jours' : 'Free trial 14 days'}
              ctaOnClick={() => {
                if (billingPeriod === 'monthly') {
                  setShowUpsellPro(true);
                } else {
                  startCheckout('createur_annual');
                }
              }}
            />

            <Plan
              title={`\uD83D\uDE80 ${t.home.planProTitle}`}
              price={billingPeriod === 'annual' ? `990\u20AC ${t.common.perYear}` : `99\u20AC ${t.common.perMonth}`}
              priceNote={billingPeriod === 'annual' ? t.home.priceNotePro : undefined}
              subtitle={t.home.planProSubtitle}
              bullets={t.home.planProBullets}
              ctaLabel={billingPeriod === 'annual' ? t.home.ctaProAnnual : locale === 'fr' ? 'Essai gratuit 14 jours' : 'Free trial 14 days'}
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
              <div className="text-2xl sm:text-3xl font-black mb-1">{billingPeriod === 'annual' ? `9 990€ ${t.common.perYear}` : `999€ ${t.common.perMonth}`}</div>
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
      <section className="hp-light-island mx-auto max-w-6xl px-6 py-16 mt-12">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3">Concrètement, c&apos;est quoi la différence ?</h2>
        </div>

        <div className="grid md:grid-cols-2 gap-4 md:gap-8 mb-10">
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

      </section>

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
          <a href="/checkout/upsell?plan=createur" className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#0c1a3a] to-[#1e3a5f] text-white font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all">
            {t.home.tryNow}
          </a>
        </div>
      </section>

      {/* Footer légal - Terms of Service & Privacy Policy */}
      {/* Gradient divider */}
      <div className={`h-px bg-gradient-to-r from-transparent ${isLight ? 'via-[#0c1a3a]' : 'via-white/20'} to-transparent`} />

      </div>{/* End light sections bg */}

      </div>{/* End content wrapper above vortex */}

      <footer className="relative bg-neutral-900 text-white" style={{ zIndex: 2 }}>
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 md:gap-8">
            {/* Marque */}
            <div>
              <KeiroLockup size={28} color="#ffffff" className="mb-2" />
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
      {/* ═══ POPUP UPSELL CRÉATEUR → PRO ═══ */}
      {showUpsellPro && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowUpsellPro(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-4 sm:p-6 max-h-[90vh] overflow-y-auto relative" onClick={e => e.stopPropagation()}>
            {/* Badge offre exclusive */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="px-4 py-1 bg-gradient-to-r from-orange-500 to-red-500 text-white text-xs font-bold rounded-full uppercase tracking-wide shadow-lg">
                Offre unique
              </span>
            </div>

            <div className="text-center mt-4">
              <div className="text-3xl mb-2">🚀</div>
              <h3 className="text-xl font-bold text-neutral-900 mb-2">
                Passez au Plan Pro pour seulement 10€ de plus !
              </h3>
              <p className="text-sm text-neutral-600 mb-4">
                Pour <span className="font-bold text-green-600">59€/mois au lieu de 99€</span> le 1er mois
                <br />(-40% de reduction exclusive)
              </p>

              {/* Comparaison rapide */}
              <div className="bg-neutral-50 rounded-xl p-4 mb-4 text-left text-sm">
                <p className="font-semibold text-neutral-800 mb-2">Le Plan Pro inclut en plus :</p>
                <ul className="space-y-1.5 text-neutral-700">
                  <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">✓</span> 1 200 credits/mois (3x plus)</li>
                  <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">✓</span> Publication auto Instagram + TikTok + LinkedIn</li>
                  <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">✓</span> Agent commercial + Email + WhatsApp</li>
                  <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">✓</span> CRM integre + pipeline de vente</li>
                </ul>
              </div>

              {/* Urgence */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5 text-xs text-amber-800">
                <strong>Cette offre est unique et ne sera plus proposee.</strong>
                <br />C&apos;est votre seule chance d&apos;en profiter.
              </div>

              {/* CTA principal — upsell Pro */}
              <button
                className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold text-base shadow-lg hover:opacity-90 transition"
                onClick={() => {
                  setShowUpsellPro(false);
                  startCheckout('pro', 'createur');
                }}
              >
                Oui, je prends le Pro a -40%
              </button>
              {/* CTA secondaire — continuer Créateur */}
              <button
                className="w-full py-2.5 rounded-xl border border-neutral-200 text-neutral-600 text-sm hover:bg-neutral-50 transition mt-3"
                onClick={() => {
                  setShowUpsellPro(false);
                  startCheckout('createur');
                }}
              >
                Non merci, je reste sur Createur
              </button>
              <p className="text-center text-[10px] text-neutral-400 mt-2">0{'\u20AC'} pendant 14 jours {'\u00B7'} Annulation en 1 clic a tout moment</p>
            </div>
          </div>
        </div>
      )}
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
        <h2 className="text-2xl sm:text-3xl font-bold mb-2">{t.home.quizTitle}</h2>
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
              ? 'bg-gradient-to-r from-[#0c1a3a] to-[#1e3a5f] text-white shadow-lg'
              : 'bg-white border border-neutral-200 text-neutral-700 hover:border-[#0c1a3a]/20'
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
        <div className="bg-gradient-to-br from-[#0c1a3a]/5 to-purple-50 rounded-2xl border-2 border-[#0c1a3a]/20 p-8 max-w-3xl mx-auto">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-r from-[#0c1a3a] to-[#1e3a5f] text-white text-3xl mb-4">
              ✓
            </div>
            <h3 className="text-2xl font-bold text-[#0c1a3a] mb-2">{t.home.quizResultTitle} {getRecommendedPlan()}</h3>
            <p className="text-[#0c1a3a]">{t.home.quizResultSubtitle}</p>
          </div>

          <div className="bg-white rounded-xl p-6 mb-6">
            <h4 className="font-bold text-neutral-900 mb-4">{t.home.quizResultIncluded}</h4>
            <ul className="space-y-3">
              {getRecommendedPlan() === 'Pro' && t.home.quizProBullets.map((b, i) => (
                <li key={`pro-${i}`} className="flex items-start gap-2 text-sm">
                  <span className="text-[#0c1a3a] text-lg">✓</span>
                  <span dangerouslySetInnerHTML={{ __html: b }} />
                </li>
              ))}
              <li className="flex items-start gap-2 text-sm">
                <span className="text-[#0c1a3a] text-lg">✓</span>
                <span dangerouslySetInnerHTML={{ __html: t.home.quizCommonBullet }} />
              </li>
            </ul>
          </div>

          <div className="flex gap-3">
            <a
              href="/checkout/upsell?plan=createur"
              className="flex-1 px-6 py-3 bg-gradient-to-r from-[#0c1a3a] to-[#1e3a5f] text-white font-semibold rounded-xl hover:shadow-lg transition-all text-center"
            >
              {t.home.quizStartWith} {getRecommendedPlan()} →
            </a>
            <button
              onClick={resetQuiz}
              className="px-6 py-3 bg-white border border-[#0c1a3a]/20 text-[#0c1a3a] font-semibold rounded-xl hover:bg-[#0c1a3a]/5 transition-all"
            >
              {t.common.restart}
            </button>
          </div>
        </div>
      )}

      {/* ROI Calculator */}
      {activeSection === 'calculator' && (
        <div className="bg-gradient-to-br from-[#0c1a3a]/5 to-cyan-50 rounded-2xl border-2 border-[#0c1a3a]/10 p-8 max-w-3xl mx-auto">
          <h3 className="text-2xl font-bold text-[#0c1a3a] mb-6 text-center">
            {t.home.calcTitle}
          </h3>

          <div className="bg-white rounded-xl p-6 mb-6">
            <label className="block mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-neutral-900">{t.home.calcLabel}</span>
                <span className="text-2xl font-bold text-[#0c1a3a]">{visualsPerMonth}</span>
              </div>
              <input
                type="range"
                min="1"
                max="20"
                value={visualsPerMonth}
                onChange={(e) => setVisualsPerMonth(Number(e.target.value))}
                className="w-full h-2 bg-[#0c1a3a]/10 rounded-lg appearance-none cursor-pointer accent-[#0c1a3a]"
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

            <div className="bg-emerald-50 rounded-xl p-5 flex items-center justify-between border border-emerald-200">
              <div>
                <div className="text-sm text-emerald-800 font-semibold mb-1">{t.home.calcKeiro}</div>
                <div className="text-xs text-emerald-700">{t.home.calcKeiroSub}</div>
              </div>
              <div className="text-2xl font-bold text-emerald-700">{costKeiro}€</div>
            </div>

            <div className="bg-gradient-to-r from-[#0c1a3a] to-[#1e3a5f] rounded-xl p-6 text-white">
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

          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 mb-6">
            <p className="text-sm text-neutral-700" dangerouslySetInnerHTML={{ __html: t.home.calcTip }} />
          </div>

          <a
            href="/checkout/upsell?plan=createur"
            className="block w-full px-6 py-3 bg-gradient-to-r from-[#0c1a3a] to-[#1e3a5f] text-white font-semibold rounded-xl hover:shadow-lg transition-all text-center"
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
    <div className="rounded-2xl border border-[#0c1a3a]/8 p-5 bg-white hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#0c1a3a] to-[#1e3a5f] text-white grid place-items-center text-sm font-semibold">{num}</div>
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
    'bg-gradient-to-r from-[#0c1a3a] to-[#1e3a5f] text-white'
  }`;

  return (
    <div className={`rounded-2xl border p-5 bg-white shadow-sm transition-all hover:shadow-lg flex flex-col ${
      special ? 'ring-2 ring-amber-400 bg-gradient-to-br from-amber-50 to-orange-50' :
      highlight ? 'ring-2 ring-[#0c1a3a] shadow-lg' : ''
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
            <span className={special ? "text-amber-500" : "text-[#0c1a3a]"}>✓</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
      {ctaOnClick ? (
        <button onClick={ctaOnClick} className={ctaClassName}>
          {ctaLabel}
        </button>
      ) : (
        <a href={ctaHref || "/checkout/upsell?plan=createur"} className={ctaClassName}>
          {ctaLabel}
        </a>
      )}
      <p className="text-center text-[10px] text-neutral-400 mt-1.5">0{'\u20AC'} pendant 14j {'\u00B7'} Annulation en 1 clic</p>
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
