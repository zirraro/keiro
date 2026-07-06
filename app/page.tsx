'use client';

import { useState } from 'react';
import Link from 'next/link';
import BookDemoButton from '@/components/BookDemoButton';
import { startCheckout } from '@/lib/stripe/checkout';
import { ScaleIn, HeroTextReveal, TextRotator, MagneticButton } from '@/components/ui/motion';
import { AnimatedGradientBG } from '@/components/ui/animated-gradient-bg';

import { PageReveal } from '@/components/ui/page-reveal';
import { KeiroLockup } from '@/components/ui/keiro-logo';
import { KeiroIcon } from '@/components/ui/KeiroIcon';
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
              highlightWords={locale === 'fr' ? ['équipe marketing', 'publie, démarche, répond'] : ['marketing team', 'posting, prospecting, replying']}
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
              {/* Primary CTA — anonymous visitors land DIRECTLY in /generate
                  to test (1 free gen no account, then ultra-simple signup
                  for 2 more, then card-collection trial). Logged users with
                  no plan get redirected to checkout from /generate's
                  FreeTrialGate when their quota fills. Reduces friction
                  from "click → choose plan → enter card → pay → test"
                  down to "click → test". */}
              <MagneticButton>
              <a href="/generate" className="cta-keep-white inline-block px-5 py-3 min-h-[48px] rounded-xl bg-white font-semibold shadow-lg shadow-white/20 hover:shadow-xl hover:shadow-white/30 hover:-translate-y-0.5 transition-all flex items-center gap-1.5" style={{ color: '#0c1a3a' }}>
                ⚡ {locale === 'fr' ? 'Tester gratuitement' : 'Try it free'}
              </a>
              </MagneticButton>
              <a href="#exemple" className="px-5 py-3 min-h-[48px] rounded-xl border-2 border-white/40 text-white font-medium hover:bg-white/10 hover:border-white/60 transition-all flex items-center">
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
{/* Outcomes-first hero panel — replaces the previous 17-avatar
                cartoon grid that diluted the value proposition. Leads with
                concrete business outcomes (prospects, posts, time saved,
                response time) and demotes the avatars to a small footer.
                Three function rows underneath explain WHAT each agent group
                does for the business (acquisition / content / operations). */}
            <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-[#0c1a3a]/80 via-[#0f1f4a]/60 to-[#0c1a3a]/80 backdrop-blur-sm border border-white/10">
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-white text-base">
                      {locale === 'fr' ? 'Ce que ton équipe IA produit chaque mois' : 'What your AI team delivers each month'}
                    </h3>
                    <p className="text-[11px] text-white/50 mt-0.5">
                      {locale === 'fr' ? 'Objectifs de production par plan (exemple illustratif)' : 'Production targets per plan (illustrative example)'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-green-500/20 rounded-full flex-shrink-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-green-400 text-[10px] font-bold">24/7</span>
                  </div>
                </div>

                {/* Ranges show progression Créateur → Business. The
                    high number anchors aspiration ('I could get 800
                    prospects'); the low number reassures entry tier
                    ('even on Créateur I get 60'). Each card has a
                    'Pro · Business' sub-line so the founder doesn't
                    promise more than what the plan delivers. */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <div className="text-2xl font-black text-emerald-300">60 → 300+</div>
                    <div className="text-[11px] font-semibold text-white/90 mt-0.5">
                      {locale === 'fr' ? 'prospects qualifiés /mois' : 'qualified prospects/month'}
                    </div>
                    <div className="text-[10px] text-white/40 mt-0.5">
                      {locale === 'fr' ? 'Léo · Créateur 60 → Pro 180 → Business 300' : 'Leo · Creator 60 → Pro 180 → Business 300'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3">
                    <div className="text-2xl font-black text-purple-300">60 → 150+</div>
                    <div className="text-[11px] font-semibold text-white/90 mt-0.5">
                      {locale === 'fr' ? 'posts & reels publiés /mois' : 'posts & reels published/month'}
                    </div>
                    <div className="text-[10px] text-white/40 mt-0.5">
                      {locale === 'fr' ? 'Léna · Créateur 60 → Pro 120 → Business 150' : 'Léna · Creator 60 → Pro 120 → Business 150'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
                    <div className="text-2xl font-black text-cyan-300">{'< 2 min'}</div>
                    <div className="text-[11px] font-semibold text-white/90 mt-0.5">
                      {locale === 'fr' ? 'temps de réponse DM' : 'DM response time'}
                    </div>
                    <div className="text-[10px] text-white/40 mt-0.5">
                      {locale === 'fr' ? 'Jade · sur tous les plans' : 'Jade · on every plan'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                    <div className="text-2xl font-black text-amber-300">~40h</div>
                    <div className="text-[11px] font-semibold text-white/90 mt-0.5">
                      {locale === 'fr' ? 'récupérées /mois' : 'reclaimed/month'}
                    </div>
                    <div className="text-[10px] text-white/40 mt-0.5">
                      {locale === 'fr' ? 'Tu fais ton métier, on fait le marketing' : 'You run your business, we run the marketing'}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-start gap-2 text-[11px]">
                    <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20 font-semibold flex-shrink-0">
                      {locale === 'fr' ? 'Acquisition' : 'Acquisition'}
                    </span>
                    <span className="text-white/70 leading-snug">
                      {locale === 'fr' ? 'Léo prospecte · Hugo envoie les emails · Jade gère les DM · Théo capte les avis Google' : 'Leo prospects · Hugo emails · Jade DMs · Theo Google reviews'}
                    </span>
                  </div>
                  <div className="flex items-start gap-2 text-[11px]">
                    <span className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 font-semibold flex-shrink-0">
                      {locale === 'fr' ? 'Contenu' : 'Content'}
                    </span>
                    <span className="text-white/70 leading-snug">
                      {locale === 'fr' ? 'Léna publie sur Instagram, TikTok et LinkedIn' : 'Léna publishes on Instagram, TikTok and LinkedIn'}
                    </span>
                  </div>
                  <div className="flex items-start gap-2 text-[11px]">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-semibold flex-shrink-0">
                      {locale === 'fr' ? 'Pilotage' : 'Operations'}
                    </span>
                    <span className="text-white/70 leading-snug">
                      {locale === 'fr' ? "Ami pilote la stratégie · Clara t'accompagne au quotidien" : 'Ami leads strategy · Clara guides you day-to-day'}
                    </span>
                  </div>
                </div>

                {(() => {
                  const SB = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
                  const ids = ['marketing', 'content', 'commercial', 'email', 'dm_instagram', 'gmaps', 'onboarding'];
                  return (
                    <div className="flex items-center gap-1 pt-3 border-t border-white/5">
                      <div className="flex -space-x-2">
                        {ids.map(id => (
                          <div key={id} className="w-7 h-7 rounded-full ring-2 ring-[#0c1a3a] bg-white/10 overflow-hidden">
                            <img
                              src={SB + '/storage/v1/object/public/public-assets/agent-avatars/' + id + '-3d.png'}
                              alt=""
                              className="w-full h-full object-cover scale-[1.15]"
                              style={{ objectPosition: 'center 15%' }}
                              loading="lazy"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          </div>
                        ))}
                      </div>
                      <span className="text-[10px] text-white/40 ml-2">
                        {locale === 'fr' ? 'Ton équipe IA complète' : 'Your full AI team'}
                      </span>
                    </div>
                  );
                })()}
              </div>

              <a href="/assistant" className="block p-3 bg-gradient-to-r from-purple-600/20 to-blue-600/20 border-t border-white/10 text-center hover:from-purple-600/30 hover:to-blue-600/30 transition-all">
                <span className="text-xs text-purple-300 font-semibold">
                  {locale === 'fr' ? 'Voir ton équipe en action →' : 'See your team in action →'}
                </span>
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
              <KeiroIcon name="sparkle" className="w-5 h-5 sm:w-6 sm:h-6 text-purple-300" />
              <div>
                <p className="font-semibold text-sm sm:text-base">{t.home.freeTrialTitle || (locale === 'fr' ? 'Essai gratuit 7 jours' : '7-day free trial')}</p>
                <p className="text-[10px] sm:text-xs text-purple-200">{t.home.freeTrialSubtitle || (locale === 'fr' ? 'Carte requise, aucun débit. Annulation en 1 clic à tout moment.' : 'Card required, no charge. Cancel in 1 click anytime.')}</p>
              </div>
            </div>
            <Link href="/essai?plan=createur" className="px-7 py-3 rounded-xl bg-white text-[#0c1a3a] font-extrabold hover:bg-purple-50 transition-all text-sm whitespace-nowrap shadow-lg hover:shadow-2xl hover:scale-105">
              {t.home.freeTrialCta || (locale === 'fr' ? 'Essai gratuit 7 jours' : 'Start free trial')} →
            </Link>
          </div>
          </div>
        </div>
      </section>

      {/* QUIZ INTERACTIF — hidden for cleaner UX */}
      {false && <QuizAndCalculator />}

      {/* ═══ AGENTS PREVIEW — second thing visible after hero on mobile.
          Tells the visitor in 5 seconds what they GET. Detailed
          breakdown stays further down right above the pricing grid. ═══ */}
      <section className="py-4 sm:py-6">
        <div className="max-w-5xl mx-auto px-3 sm:px-6">
          <div className="text-center mb-3 sm:mb-4">
            {/* Automation-first headline — KeiroAI's real value isn't
                a 1-click image generator (that's AI-table-stakes); it's
                that 7 agents AUTOMATE social media + prospecting end-to-end. */}
            <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-700 text-[10px] sm:text-[11px] font-bold rounded-full mb-2 uppercase tracking-wide">
              {locale === 'fr' ? '🚀 Automatisation 24/7' : '🚀 24/7 automation'}
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-neutral-900 leading-tight mb-1">
              {locale === 'fr' ? '7 agents IA qui font le travail à ta place' : '7 AI agents that do the work for you'}
            </h2>
            <p className="text-xs sm:text-sm text-neutral-600 max-w-xl mx-auto">
              {locale === 'fr'
                ? 'Génèrent + publient sur tes réseaux, prospectent, répondent aux DMs et avis. Tu valides ou tu laisses tourner en pilote auto.'
                : 'Generate + auto-publish on your socials, prospect, reply to DMs and reviews. Approve or let it fly on autopilot.'}
            </p>
          </div>
          {/* 4-col grid (compact on mobile, larger on desktop) */}
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 sm:gap-2 mb-3 sm:mb-4">
            {[
              { emoji: '🎨', label: 'Léna', role: locale === 'fr' ? 'Posts auto' : 'Auto posts', accent: 'from-purple-500 to-pink-500', avatar: '/avatars-3d/content.png' },
              { emoji: '📧', label: 'Hugo', role: locale === 'fr' ? 'Emails' : 'Emails', accent: 'from-cyan-500 to-blue-500', avatar: '/avatars-3d/email.png' },
              { emoji: '💬', label: 'Jade', role: locale === 'fr' ? 'DM, commentaires & comptes à suivre' : 'DMs, comments & follows', accent: 'from-pink-500 to-rose-500', avatar: '/avatars-3d/dm_instagram.png' },
              { emoji: '🎯', label: 'Léo', role: locale === 'fr' ? 'Prospects' : 'Prospects', accent: 'from-emerald-500 to-teal-500', avatar: '/avatars-3d/commercial.png' },
              { emoji: '⭐', label: 'Théo', role: locale === 'fr' ? 'Avis Google' : 'Reviews', accent: 'from-amber-500 to-orange-500', avatar: '/avatars-3d/gmaps.png' },
              { emoji: '👋', label: 'Clara', role: locale === 'fr' ? 'Onboarding' : 'Onboarding', accent: 'from-violet-500 to-purple-600', avatar: '/avatars-3d/onboarding.png' },
              { emoji: '📊', label: 'Ami', role: locale === 'fr' ? 'Analyse' : 'Analytics', accent: 'from-indigo-500 to-blue-600', avatar: '/avatars-3d/marketing.png' },
              { emoji: '💚', label: 'Stella', role: locale === 'fr' ? 'WhatsApp' : 'WhatsApp', accent: 'from-green-500 to-emerald-600', avatar: '/avatars-3d/whatsapp.png' },
              { emoji: '⚖️', label: 'Sara', role: locale === 'fr' ? 'RH & juridique' : 'HR & legal', accent: 'from-slate-500 to-slate-700', avatar: '/avatars-3d/rh.png' },
            ].map(a => (
              <div key={a.label} className="rounded-xl bg-white border border-neutral-200 p-2 sm:p-3 text-center shadow-sm hover:shadow-md transition">
                {/* Avatar with the activity emoji as a tiny corner badge —
                    humanises the agent into a 'real employee' card. */}
                <div className={`relative w-11 h-11 sm:w-14 sm:h-14 rounded-full mx-auto mb-1 bg-gradient-to-br ${a.accent} p-0.5`}>
                  <img src={a.avatar} alt={a.label} className="w-full h-full rounded-full object-cover" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                  <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-white shadow flex items-center justify-center text-[11px] border border-neutral-100">{a.emoji}</span>
                </div>
                <div className="text-[10px] sm:text-xs font-bold text-neutral-900 leading-tight mt-1">{a.label}</div>
                <div className="text-[10px] sm:text-[10px] text-neutral-500 leading-tight">{a.role}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <a href="#tarifs" className="text-xs sm:text-sm text-purple-700 font-semibold hover:text-purple-900 underline-offset-4 hover:underline">
              {locale === 'fr' ? 'Voir tout en détail ↓' : 'See everything ↓'}
            </a>
            <Link href="/essai?plan=createur" className="px-4 py-2 min-h-[40px] rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white text-xs sm:text-sm font-bold shadow hover:shadow-lg transition">
              {locale === 'fr' ? '⚡ Essai gratuit 7j' : '⚡ Start free trial'}
            </Link>
          </div>
        </div>
      </section>

      {/* VIDÉO WORKFLOW - Compact version */}
      <section className="section-light section-divider">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="flex flex-col md:flex-row items-center gap-6">
            {/* Texte + Video à gauche */}
            <div className="md:w-2/5">
              <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
                <KeiroIcon name="video" className="w-5 h-5 text-purple-600" />
                <span>{t.home.videoTitle}</span>
              </h3>
              <p className="text-sm text-neutral-600 mb-4">
                {t.home.videoSubtitle}
              </p>
              {/* Video placeholder retiré du DOM tant que la vidéo n'existe pas
                  (brief v3 §C.5 — pas de "Bientôt disponible" vaporware). */}
            </div>

            {/* Points clés à droite */}
            <div className="md:w-3/5 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white rounded-lg p-3 premium-card hover:shadow-soft-lg hover:-translate-y-0.5 transition-all">
                <KeiroIcon name="bolt" className="w-5 h-5 mb-1 text-purple-600" />
                <div className="font-semibold text-xs mb-0.5">{t.home.videoCard1Title}</div>
                <div className="text-[10px] text-neutral-600">{t.home.videoCard1Desc}</div>
              </div>
              <div className="bg-white rounded-lg p-3 premium-card hover:shadow-soft-lg hover:-translate-y-0.5 transition-all">
                <KeiroIcon name="target" className="w-5 h-5 mb-1 text-purple-600" />
                <div className="font-semibold text-xs mb-0.5">{t.home.videoCard2Title}</div>
                <div className="text-[10px] text-neutral-600">{t.home.videoCard2Desc}</div>
              </div>
              <div className="bg-white rounded-lg p-3 premium-card hover:shadow-soft-lg hover:-translate-y-0.5 transition-all">
                <KeiroIcon name="chart" className="w-5 h-5 mb-1 text-purple-600" />
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


      {/* PROGRAMME PILOTE — honnête early-stage (remplace les anciens témoignages
          fictifs : pas de faux clients, pas de métriques non sourcées). Les vrais
          cas clients viendront ici dès les premiers retours mesurés. */}
      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="text-center mb-10">
          <span className="inline-block mb-3 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold">
            {locale === 'fr' ? 'PROGRAMME PILOTE' : 'PILOT PROGRAM'}
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold mb-2">
            {locale === 'fr' ? 'Rejoins nos premiers clients' : 'Join our first clients'}
          </h2>
          <p className="text-neutral-600 max-w-2xl mx-auto">
            {locale === 'fr'
              ? "KeiroAI est en lancement. Plutôt que d'inventer des témoignages, on est transparents : voici ce que ton équipe d'agents fait pour toi dès le premier jour. Les vrais retours clients apparaîtront ici."
              : "KeiroAI is launching. Instead of faking testimonials, we keep it honest: here is what your agent team does for you from day one. Real client feedback will appear here."}
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: '🎬',
              title_fr: 'Publie pour toi', title_en: 'Publishes for you',
              desc_fr: 'Léna crée et publie tes posts Instagram, TikTok et LinkedIn — visuels, textes, hashtags.',
              desc_en: 'Léna creates and publishes your Instagram, TikTok and LinkedIn posts — visuals, copy, hashtags.',
            },
            {
              icon: '🎯',
              title_fr: 'Trouve des clients', title_en: 'Finds clients',
              desc_fr: 'Léo identifie des prospects locaux, Jade prépare des messages personnalisés à envoyer en 1 clic.',
              desc_en: 'Léo finds local prospects, Jade prepares personalised messages ready to send in one click.',
            },
            {
              icon: '💬',
              title_fr: 'Répond 24/7', title_en: 'Replies 24/7',
              desc_fr: 'Jade répond aux DMs et commentaires, Théo répond aux avis Google — dans ton ton de marque.',
              desc_en: 'Jade answers DMs and comments, Théo replies to Google reviews — in your brand voice.',
            },
          ].map((c, i) => (
            <div key={i} className="bg-white rounded-2xl premium-card p-6 hover:shadow-soft-lg hover:-translate-y-0.5 transition-all">
              <div className="text-3xl mb-3">{c.icon}</div>
              <h3 className="font-bold text-neutral-900 mb-2">{locale === 'en' ? c.title_en : c.title_fr}</h3>
              <p className="text-neutral-600 text-sm leading-relaxed">{locale === 'en' ? c.desc_en : c.desc_fr}</p>
            </div>
          ))}
        </div>

        {/* CTA après pilote */}
        <div className="mt-10 text-center">
          <a href="/essai?plan=createur" className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-[#0c1a3a] to-[#1e3a5f] text-white font-semibold text-lg hover:shadow-xl transition-all hover:-translate-y-0.5">
            {t.home.testimonialCta}
          </a>
          <p className="mt-3 text-sm text-neutral-600">
            {t.home.testimonialCtaSub}
          </p>
        </div>
      </section>


      {/* ═══ SECTION COMPARATIF + AVANT/APRES ═══ */}
      <section className="hp-light-island section-divider">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-20">
          {/* Title */}
          <div className="text-center mb-8 sm:mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-red-500 to-orange-500 text-white text-xs font-bold mb-4 shadow-lg">
              {'\u{1F525}'} {locale === 'fr' ? 'La vérité que personne ne te dit' : 'The truth no one tells you'}
            </div>
            <h2 className="text-2xl sm:text-4xl md:text-5xl font-black mb-3 sm:mb-4">
              {locale === 'fr' ? 'Pourquoi 95% des commerces' : 'Why 95% of businesses'}<br className="hidden sm:block" /> <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500">{locale === 'fr' ? 'abandonnent Instagram' : 'abandon Instagram'}</span>
            </h2>
            <p className="text-sm sm:text-lg text-neutral-600 max-w-2xl mx-auto">
              {locale === 'fr' ? 'Tu as déjà essayé ChatGPT, Canva, ou même un CM freelance. Voici ce qui se passe vraiment.' : 'You\u2019ve tried ChatGPT, Canva, or even a freelance CM. Here\u2019s what actually happens.'}
            </p>
          </div>

          {/* Avant/Après visual — retiré (redondant avec la case study
              concrète à #exemple qui prouve déjà le passage amateur →
              pro avec de vrais chiffres Instagram). La comparaison
              structurelle reste via le tableau ChatGPT/CM/KeiroAI
              ci-dessous qui apporte une information différente. */}

          {/* Comparatif ChatGPT vs CM vs KeiroAI — tableau */}
          <div className="mb-10 sm:mb-16">
            <h3 className="text-xl sm:text-2xl font-bold text-center mb-6 sm:mb-8">
              {locale === 'fr' ? 'Le vrai comparatif' : 'The real comparison'} <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#0c1a3a] to-purple-600">{locale === 'fr' ? 'sans bullshit' : 'no bullshit'}</span>
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
                  {(locale === 'fr' ? [
                    ['Prix', '0-20\u20AC/mois', '1 500-3 000\u20AC/mois', '49\u20AC/mois'],
                    ['Visuels/semaine', '2-3 (manuels)', '5-10', '21+ (auto)'],
                    ['Vidéos', '\u274C Non', '\u274C Non inclus', '\u2705 Reels + TikTok'],
                    ['DMs automatiques', '\u274C Non', '\u274C Non', '\u2705 50/jour'],
                    ['CRM intégré', '\u274C Non', '\u274C Non', '\u2705 Scoring auto'],
                    ['Emailing auto', '\u274C Non', '\u274C Non', '\u2705 Séquences 5 étapes'],
                    ['Avis Google', '\u274C Non', '\u274C Rarement', '\u2705 Réponse auto Théo'],
                    ['SEO site web', '\u274C Non', '\u274C Non', '\u2705 Audit + reco'],
                    ['Temps requis', '5-10h/sem', '2h/sem briefing', '0h (100% auto)'],
                    ['Équipe IA complète', '\u274C', '\u274C', '\u2705'],
                  ] : [
                    ['Price', '\u20AC0-20/month', '\u20AC1,500-3,000/month', '\u20AC49/month'],
                    ['Visuals/week', '2-3 (manual)', '5-10', '21+ (auto)'],
                    ['Videos', '\u274C No', '\u274C Not included', '\u2705 Reels + TikTok'],
                    ['Automatic DMs', '\u274C No', '\u274C No', '\u2705 50/day'],
                    ['Integrated CRM', '\u274C No', '\u274C No', '\u2705 Auto scoring'],
                    ['Auto emailing', '\u274C No', '\u274C No', '\u2705 5-step sequences'],
                    ['Google reviews', '\u274C No', '\u274C Rarely', '\u2705 Auto reply by Theo'],
                    ['Website SEO', '\u274C No', '\u274C No', '\u2705 Audit + recs'],
                    ['Time required', '5-10h/week', '2h/week briefing', '0h (100% auto)'],
                    ['Équipe IA complète', '\u274C', '\u274C', '\u2705'],
                  ]).map(([feature, chatgpt, cm, keiro], i) => (
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
              {locale === 'fr' ? 'ChatGPT c\u2019est un couteau suisse. KeiroAI c\u2019est ' : 'ChatGPT is a Swiss army knife. KeiroAI is '}<span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-orange-300">{locale === 'fr' ? 'ton équipe marketing complète' : 'your complete marketing team'}</span>.
            </p>
            <p className="text-sm sm:text-base text-white/70 mb-4 sm:mb-6 max-w-2xl mx-auto">
              {locale === 'fr' ? 'Une équipe d’agents IA spécialisés qui travaillent 24/7 : création, publication, DMs, emails, SEO, avis Google, CRM, analytics. Tout est automatisé.' : 'A team of specialised AI agents working 24/7: creation, publishing, DMs, emails, SEO, Google reviews, CRM, analytics. All automated.'}
            </p>
            <Link href="/essai?plan=createur" className="inline-block px-6 sm:px-10 py-3 sm:py-4 bg-white text-[#0c1a3a] font-extrabold text-sm sm:text-base rounded-xl hover:shadow-2xl hover:scale-105 transition-all">
              {locale === 'fr' ? 'Essai gratuit 7 jours \u2014 0\u20AC ' : 'Free trial 7 days \u2014 \u20AC0 '}{'\u2192'}
            </Link>
            <p className="text-xs text-white/40 mt-2">{locale === 'fr' ? 'Carte requise, aucun débit. Annulation en 1 clic.' : 'Card required, no charge. Cancel in 1 click.'}</p>
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
                <p className="text-sm font-bold text-neutral-900 dark:text-white">🎁 {t.home.freeTrialTitle || (locale === 'fr' ? 'Essai gratuit 7 jours' : '7-day free trial')}</p>
                <p className="text-xs text-neutral-600 dark:text-neutral-300 mt-0.5">{t.home.freeTrialPricingDesc || (locale === 'fr' ? 'Tous les agents débloqués — carte requise, 0€ débité' : 'All agents unlocked — card required, €0 charged')}</p>
                <p className="text-[11px] text-purple-700 dark:text-purple-300 mt-0.5">{t.home.freeTrialPricingNote || (locale === 'fr' ? '0€ pendant 7 jours • Carte requise • Annulation à tout moment' : '€0 for 7 days • Card required • Cancel anytime')}</p>
              </div>
              <Link
                href="/essai?plan=createur"
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#0c1a3a] to-purple-700 text-white text-sm font-bold hover:shadow-lg transition-all hover:-translate-y-0.5 whitespace-nowrap flex-shrink-0"
              >
                {t.home.freeTrialCta || (locale === 'fr' ? 'Essai gratuit 7 jours' : 'Start free trial')}
              </Link>
            </div>
          </div>

          {/* CRÉATEUR AGENTS — detailed roster shown above the pricing grid
              so visitors understand what they actually GET (not just "7 agents")
              before clicking the trial CTA. Especially the auto-generation +
              auto-publication of social posts which is the headline value. */}
          <div id="tarifs" className="max-w-6xl mx-auto mb-8 sm:mb-10 px-1 sm:px-0">
            <div className="text-center mb-4 sm:mb-5">
              <span className="inline-block px-3 py-1 bg-purple-100 text-purple-700 text-[10px] sm:text-[11px] font-bold rounded-full mb-2 uppercase tracking-wide">{locale === 'fr' ? 'Inclus dès le plan Créateur' : 'Included with Creator plan'}</span>
              <h3 className="text-lg sm:text-2xl font-black text-neutral-900 mb-1 leading-tight">
                {locale === 'fr' ? '7 agents IA qui bossent pour toi 24/7' : '7 AI agents working for you 24/7'}
              </h3>
              <p className="text-xs sm:text-sm text-neutral-600 max-w-2xl mx-auto px-2">
                {locale === 'fr'
                  ? 'Tu ne touches à rien. Ils génèrent, publient, prospectent et répondent — pendant que tu fais ton métier.'
                  : "You don't touch anything. They generate, publish, prospect and reply — while you focus on your craft."}
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
              {/* Léna — the headline value */}
              <div className="rounded-2xl border-2 border-purple-300 bg-gradient-to-br from-purple-50 to-pink-50 p-4 shadow-md hover:shadow-lg transition relative overflow-hidden">
                <span className="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 bg-purple-600 text-white rounded uppercase tracking-wide">{locale === 'fr' ? '⭐ Star' : '⭐ Top'}</span>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-lg">🎨</div>
                  <div>
                    <div className="font-bold text-sm text-neutral-900">Léna</div>
                    <div className="text-[10px] text-purple-700 font-semibold">{locale === 'fr' ? 'Contenu social' : 'Social content'}</div>
                  </div>
                </div>
                <p className="text-[11px] text-neutral-700 leading-relaxed mb-1.5">
                  {locale === 'fr'
                    ? 'Génère + publie automatiquement tes posts Instagram, TikTok, LinkedIn.'
                    : 'Generates + auto-publishes your Instagram, TikTok, LinkedIn posts.'}
                </p>
                <ul className="text-[10px] text-neutral-600 space-y-0.5">
                  <li>✓ {locale === 'fr' ? '~10 publications/semaine' : '~10 posts/week'}</li>
                  <li>✓ {locale === 'fr' ? 'Visuels pro depuis tes photos' : 'Pro visuals from your photos'}</li>
                  <li>✓ {locale === 'fr' ? 'Captions + hashtags optimisés' : 'Captions + hashtags optimized'}</li>
                </ul>
              </div>

              {/* Hugo */}
              <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm hover:shadow-md transition">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-lg">📧</div>
                  <div>
                    <div className="font-bold text-sm text-neutral-900">Hugo</div>
                    <div className="text-[10px] text-cyan-700 font-semibold">{locale === 'fr' ? 'Emails prospection' : 'Email prospecting'}</div>
                  </div>
                </div>
                <p className="text-[11px] text-neutral-700 leading-relaxed mb-1.5">
                  {locale === 'fr'
                    ? "Envoie tes emails de prospection + relances depuis ton domaine."
                    : 'Sends your prospection + follow-up emails from your domain.'}
                </p>
                <ul className="text-[10px] text-neutral-600 space-y-0.5">
                  <li>✓ {locale === 'fr' ? 'Séquences automatiques' : 'Automated sequences'}</li>
                  <li>✓ {locale === 'fr' ? 'Détecte désabonnements' : 'Detects unsubscribes'}</li>
                  <li>✓ {locale === 'fr' ? 'Lit ta boîte (IMAP/Gmail)' : 'Reads your inbox (IMAP/Gmail)'}</li>
                </ul>
              </div>

              {/* Jade */}
              <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm hover:shadow-md transition">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-lg">💬</div>
                  <div>
                    <div className="font-bold text-sm text-neutral-900">Jade</div>
                    <div className="text-[10px] text-pink-700 font-semibold">{locale === 'fr' ? 'DM, commentaires & comptes à suivre' : 'DMs, comments & follows'}</div>
                  </div>
                </div>
                <p className="text-[11px] text-neutral-700 leading-relaxed mb-1.5">
                  {locale === 'fr'
                    ? 'Répond à tes DMs et commentaires 24/7 avec ton ton de voix, et repère les comptes pertinents à suivre. Tu reprends quand tu veux.'
                    : 'Replies to your DMs and comments 24/7 in your voice, and spots relevant accounts to follow. Take over anytime.'}
                </p>
                <ul className="text-[10px] text-neutral-600 space-y-0.5">
                  <li>✓ {locale === 'fr' ? 'DM & commentaires auto' : 'Auto DMs & comments'}</li>
                  <li>✓ {locale === 'fr' ? 'Comptes pertinents à suivre' : 'Relevant accounts to follow'}</li>
                  <li>✓ {locale === 'fr' ? 'Mode humain en 1 clic' : 'Human mode in 1 click'}</li>
                </ul>
              </div>

              {/* Léo */}
              <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm hover:shadow-md transition">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-lg">🎯</div>
                  <div>
                    <div className="font-bold text-sm text-neutral-900">Léo</div>
                    <div className="text-[10px] text-emerald-700 font-semibold">{locale === 'fr' ? 'Prospection CRM' : 'CRM prospecting'}</div>
                  </div>
                </div>
                <p className="text-[11px] text-neutral-700 leading-relaxed mb-1.5">
                  {locale === 'fr'
                    ? 'Trouve + qualifie ~60 nouveaux prospects par mois sur Google Maps.'
                    : 'Finds + qualifies ~60 new prospects per month on Google Maps.'}
                </p>
                <ul className="text-[10px] text-neutral-600 space-y-0.5">
                  <li>✓ {locale === 'fr' ? 'Score automatique (hot/warm)' : 'Auto-scoring (hot/warm)'}</li>
                  <li>✓ {locale === 'fr' ? 'CRM intégré + pipeline' : 'Built-in CRM + pipeline'}</li>
                  <li>✓ {locale === 'fr' ? 'Anti-doublon par zone' : 'Anti-duplicate by zone'}</li>
                </ul>
              </div>

              {/* Théo */}
              <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm hover:shadow-md transition">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-lg">⭐</div>
                  <div>
                    <div className="font-bold text-sm text-neutral-900">Théo</div>
                    <div className="text-[10px] text-amber-700 font-semibold">{locale === 'fr' ? 'Avis Google' : 'Google reviews'}</div>
                  </div>
                </div>
                <p className="text-[11px] text-neutral-700 leading-relaxed mb-1.5">
                  {locale === 'fr'
                    ? 'Répond à tes avis Google automatiquement, ton de marque préservé.'
                    : 'Auto-replies to your Google reviews while keeping your brand voice.'}
                </p>
                <ul className="text-[10px] text-neutral-600 space-y-0.5">
                  <li>✓ {locale === 'fr' ? 'Réponses personnalisées' : 'Personalised replies'}</li>
                  <li>✓ {locale === 'fr' ? 'Escalade des avis -3★' : 'Escalates ≤3★ reviews'}</li>
                  <li>✓ {locale === 'fr' ? 'Boost SEO local' : 'Local SEO boost'}</li>
                </ul>
              </div>

              {/* Clara */}
              <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm hover:shadow-md transition">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-lg">👋</div>
                  <div>
                    <div className="font-bold text-sm text-neutral-900">Clara</div>
                    <div className="text-[10px] text-violet-700 font-semibold">{locale === 'fr' ? 'Onboarding' : 'Onboarding'}</div>
                  </div>
                </div>
                <p className="text-[11px] text-neutral-700 leading-relaxed mb-1.5">
                  {locale === 'fr'
                    ? "Configure tes agents en 10 min, te guide quand tu bloques, suit ta progression."
                    : 'Sets up your agents in 10 min, helps when stuck, tracks progress.'}
                </p>
                <ul className="text-[10px] text-neutral-600 space-y-0.5">
                  <li>✓ {locale === 'fr' ? 'Setup guidé pas à pas' : 'Step-by-step guided setup'}</li>
                  <li>✓ {locale === 'fr' ? 'Analyse de tes uploads' : 'Analyses your uploads'}</li>
                  <li>✓ {locale === 'fr' ? 'Anti-blocage proactif' : 'Proactive anti-blocking'}</li>
                </ul>
              </div>

              {/* Ami */}
              <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm hover:shadow-md transition">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-lg">📊</div>
                  <div>
                    <div className="font-bold text-sm text-neutral-900">Ami</div>
                    <div className="text-[10px] text-indigo-700 font-semibold">{locale === 'fr' ? 'Marketing IA' : 'Marketing AI'}</div>
                  </div>
                </div>
                <p className="text-[11px] text-neutral-700 leading-relaxed mb-1.5">
                  {locale === 'fr'
                    ? "Analyse tes performances, conseille les agents, calibre tes prochaines campagnes."
                    : 'Analyses your performance, advises agents, calibrates next campaigns.'}
                </p>
                <ul className="text-[10px] text-neutral-600 space-y-0.5">
                  <li>✓ {locale === 'fr' ? 'Reporting hebdo' : 'Weekly reporting'}</li>
                  <li>✓ {locale === 'fr' ? 'Best-day analysis' : 'Best-day analysis'}</li>
                  <li>✓ {locale === 'fr' ? 'Coordonne tous les agents' : 'Coordinates all agents'}</li>
                </ul>
              </div>

              {/* Stella */}
              <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm hover:shadow-md transition">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-lg">💚</div>
                  <div>
                    <div className="font-bold text-sm text-neutral-900">Stella</div>
                    <div className="text-[10px] text-emerald-700 font-semibold">{locale === 'fr' ? 'WhatsApp Business' : 'WhatsApp Business'}</div>
                  </div>
                  <span className="ml-auto text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">{locale === 'fr' ? 'Business · +19€' : 'Business · +€19'}</span>
                </div>
                <p className="text-[11px] text-neutral-700 leading-relaxed mb-1.5">
                  {locale === 'fr'
                    ? 'Confirmations de réservation, rappels anti no-show, réponses auto aux questions clients.'
                    : 'Booking confirmations, no-show reminders, instant answers to customer questions.'}
                </p>
                <ul className="text-[10px] text-neutral-600 space-y-0.5">
                  <li>✓ {locale === 'fr' ? 'Confirmations & rappels RDV' : 'Booking confirmations & reminders'}</li>
                  <li>✓ {locale === 'fr' ? 'Réponses 24/7 (fenêtre gratuite)' : '24/7 answers (free service window)'}</li>
                  <li>✓ {locale === 'fr' ? 'Relance avis Google (avec Théo)' : 'Google review follow-up (with Théo)'}</li>
                </ul>
              </div>

              {/* Sara */}
              <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm hover:shadow-md transition">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center text-lg">⚖️</div>
                  <div>
                    <div className="font-bold text-sm text-neutral-900">Sara</div>
                    <div className="text-[10px] text-slate-600 font-semibold">{locale === 'fr' ? 'RH & Juridique' : 'HR & Legal'}</div>
                  </div>
                  <span className="ml-auto text-[9px] font-bold text-slate-600 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded-full">Business</span>
                </div>
                <p className="text-[11px] text-neutral-700 leading-relaxed mb-1.5">
                  {locale === 'fr'
                    ? 'Génère tes contrats, CGV, mentions légales, RGPD — et répond à tes questions RH & juridiques.'
                    : 'Drafts your contracts, T&Cs, legal notices, GDPR — and answers your HR & legal questions.'}
                </p>
                <ul className="text-[10px] text-neutral-600 space-y-0.5">
                  <li>✓ {locale === 'fr' ? 'Contrats, avenants, attestations' : 'Contracts, amendments, certificates'}</li>
                  <li>✓ {locale === 'fr' ? 'CGV, RGPD, mentions légales' : 'T&Cs, GDPR, legal notices'}</li>
                  <li>✓ {locale === 'fr' ? 'Conseils RH & juridiques' : 'HR & legal guidance'}</li>
                </ul>
              </div>

              {/* Bonus highlight card — auto-publication callout */}
              <div className="rounded-2xl border-2 border-emerald-400 bg-gradient-to-br from-emerald-50 to-teal-50 p-4 shadow-md flex flex-col justify-center">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-lg">🚀</div>
                  <div className="font-bold text-sm text-emerald-900">{locale === 'fr' ? 'Génération + publication AUTO' : 'AUTO generation + publication'}</div>
                </div>
                <p className="text-[11px] text-emerald-900 leading-relaxed">
                  {locale === 'fr'
                    ? 'Tu connectes tes comptes une fois. Léna génère 10 posts/semaine, les programme, les publie aux meilleures heures. Tu valides quand tu veux ou tu laisses tourner en auto.'
                    : 'Connect your accounts once. Léna generates 10 posts/week, schedules them, publishes at peak hours. Approve whenever you want, or let it run on auto.'}
                </p>
              </div>
            </div>
          </div>

          {/* Plans Grid — 3 plans principaux */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-6">
            <Plan
              title={`\uD83D\uDC8E ${locale === 'fr' ? 'Créateur' : 'Creator'}`}
              price={billingPeriod === 'annual' ? `490\u20AC ${t.common.perYear}` : `49\u20AC ${t.common.perMonth}`}
              subtitle={locale === 'fr' ? 'Boutiques, restos, freelances' : 'Shops, restaurants, freelancers'}
              bullets={[
                locale === 'fr' ? '5 agents inclus' : '5 agents included',
                locale === 'fr' ? '400 crédits/mois' : '400 credits/month',
                locale === 'fr' ? 'Contenu, DM, Prospection, CRM' : 'Content, DM, Prospecting, CRM',
                locale === 'fr' ? 'Stratégie + onboarding inclus' : 'Strategy + onboarding included',
              ]}
              ctaLabel={locale === 'fr' ? 'Essai gratuit 7 jours' : 'Start free trial'}
              trialNote={locale === 'fr' ? '0\u20AC pendant 7j \u00B7 Annulation en 1 clic' : '\u20AC0 for 7 days \u00B7 Cancel in 1 click'}
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
              subtitle={locale === 'fr' ? 'Restos, hotels, commerces qui veulent grandir' : 'Restaurants, hotels, growing businesses'}
              bullets={[
                locale === 'fr' ? '7 agents inclus' : '7 agents included',
                locale === 'fr' ? '800 crédits/mois' : '800 credits/month',
                locale === 'fr' ? 'Tout Créateur + Emails (Hugo)' : 'All Creator + Email (Hugo)',
                locale === 'fr' ? 'Avis Google (Théo) + chatbot 24/7' : 'Google reviews (Théo) + chatbot 24/7',
              ]}
              ctaLabel={billingPeriod === 'annual' ? t.home.ctaProAnnual : locale === 'fr' ? 'Essai gratuit 7 jours' : 'Start free trial'}
              trialNote={locale === 'fr' ? '0\u20AC pendant 7j \u00B7 Annulation en 1 clic' : '\u20AC0 for 7 days \u00B7 Cancel in 1 click'}
              ctaOnClick={() => startCheckout(billingPeriod === 'annual' ? 'pro_annual' : 'pro')}
            />

            <Plan
              title={`🏢 ${t.home.planBusinessTitle}`}
              price={billingPeriod === 'annual' ? `1 990€ ${t.common.perYear}` : `199€ ${t.common.perMonth}`}
              priceNote={billingPeriod === 'annual' ? t.home.priceNoteBusiness : undefined}
              subtitle={locale === 'fr' ? 'PME, hotels, multi-sites' : 'SMEs, hotels, multi-site'}
              special
              highlight
              bullets={[
                locale === 'fr' ? 'Équipe complète (7 agents) · volume ×2' : 'Full team (7 agents) · 2× volume',
                locale === 'fr' ? '2 000 crédits/mois' : '2,000 credits/month',
                locale === 'fr' ? 'Tout Pro + Finance' : 'All Pro + Finance',
                locale === 'fr' ? 'LinkedIn, Ads, WhatsApp (bientôt)' : 'LinkedIn, Ads, WhatsApp (soon)',
              ]}
              ctaLabel={billingPeriod === 'annual' ? t.home.ctaBusinessAnnual : t.home.ctaChooseBusiness}
              trialNote={locale === 'fr' ? '0\u20AC pendant 7j \u00B7 Annulation en 1 clic' : '\u20AC0 for 7 days \u00B7 Cancel in 1 click'}
              ctaOnClick={() => startCheckout(billingPeriod === 'annual' ? 'business_annual' : 'business')}
            />
          </div>

          {/* Elite tier hidden on the home page — kept in code for direct
              /pricing access and existing Elite subscribers. Founder
              asked to remove it from the marketing page on 2026-05-22. */}

          <p className="text-center text-xs text-neutral-500 mb-6">
            {t.home.pricingFoundersNote}
          </p>

        </div>
      </section>

      {/* CONCRÈTEMENT LA DIFFÉRENCE */}
      <section className="hp-light-island mx-auto max-w-6xl px-6 py-16 mt-12">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3">{locale === 'fr' ? 'Concrètement, c\u2019est quoi la différence ?' : 'In plain terms — what\u2019s the difference?'}</h2>
        </div>

        <div className="grid md:grid-cols-2 gap-4 md:gap-8 mb-10">
          {/* Pro card */}
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl border border-purple-200 p-6">
            <h3 className="text-xl font-bold text-purple-900 mb-4">💎 {locale === 'fr' ? 'Pro — Ta vitrine Instagram, pro et autonome' : 'Pro — Your Instagram storefront, professional and autonomous'}</h3>
            <ul className="space-y-3 text-sm text-neutral-700">
              <li className="flex items-start gap-2">
                <span className="text-purple-500 font-bold mt-0.5">▸</span>
                <span><strong>{locale === 'fr' ? 'C\u2019est comme...' : 'It\u2019s like...'}</strong> {locale === 'fr' ? 'Un flyer distribué à 5 000 personnes \u2014 pro, ciblé et mesurable' : 'A flyer handed to 5,000 people \u2014 pro, targeted, measurable'}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-500 font-bold mt-0.5">▸</span>
                <span><strong>{locale === 'fr' ? 'Ça remplace...' : 'It replaces...'}</strong> {locale === 'fr' ? 'Le neveu qui poste 1x/mois + Canva' : 'The nephew posting 1×/month + Canva'}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-500 font-bold mt-0.5">▸</span>
                <span><strong>{locale === 'fr' ? 'En concret...' : 'Concretely...'}</strong> {locale === 'fr' ? 'Des posts pros publiés chaque jour sur tes réseaux, avec texte et hashtags' : 'Pro posts published every day on your networks, with copy and hashtags'}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-500 font-bold mt-0.5">▸</span>
                <span><strong>{locale === 'fr' ? 'Ça coûte...' : 'It costs...'}</strong> {locale === 'fr' ? 'Le prix de 2 dîners au restaurant' : 'The price of 2 dinners out'}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-500 font-bold mt-0.5">▸</span>
                <span><strong>{locale === 'fr' ? 'C\u2019est rentabilisé si...' : 'It pays for itself with...'}</strong> {locale === 'fr' ? '1 vente en plus (boutique) / 5 couverts (resto)' : '1 extra sale (shop) / 5 covers (resto)'}</span>
              </li>
            </ul>
          </div>

          {/* Business card */}
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border-2 border-amber-400 p-6 shadow-lg">
            <h3 className="text-xl font-bold text-amber-900 mb-4">{'\u{1F3E2}'} {locale === 'fr' ? 'Business \u2014 Ta marque partout, sur Instagram ET TikTok, en 3 formats' : 'Business \u2014 Your brand everywhere, Instagram AND TikTok, 3 formats'}</h3>
            <ul className="space-y-3 text-sm text-neutral-700">
              <li className="flex items-start gap-2">
                <span className="text-amber-500 font-bold mt-0.5">▸</span>
                <span><strong>{locale === 'fr' ? 'C\u2019est comme...' : 'It\u2019s like...'}</strong> {locale === 'fr' ? 'Avoir un directeur marketing à temps partiel' : 'Having a part-time marketing director'}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500 font-bold mt-0.5">▸</span>
                <span><strong>{locale === 'fr' ? 'Ça remplace...' : 'It replaces...'}</strong> {locale === 'fr' ? 'Un graphiste (800\u20AC) + un CM (1 500\u20AC) + stats (100\u20AC) + Canva Pro (12\u20AC)' : 'A designer (\u20AC800) + a CM (\u20AC1,500) + analytics (\u20AC100) + Canva Pro (\u20AC12)'}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500 font-bold mt-0.5">▸</span>
                <span><strong>{locale === 'fr' ? 'En concret...' : 'Concretely...'}</strong> {locale === 'fr' ? '~5-6 posts/semaine, TON logo, post + Story + Reel, Instagram ET TikTok' : '~5-6 posts/week, YOUR logo, post + Story + Reel, Instagram AND TikTok'}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500 font-bold mt-0.5">▸</span>
                <span><strong>{locale === 'fr' ? 'Ça coûte...' : 'It costs...'}</strong> {locale === 'fr' ? 'Le prix de 5 dîners au restaurant' : 'The price of 5 dinners out'}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500 font-bold mt-0.5">▸</span>
                <span><strong>{locale === 'fr' ? 'C\u2019est rentabilisé si...' : 'It pays for itself with...'}</strong> {locale === 'fr' ? '2 ventes (boutique) / 7 couverts (resto) / 2 séances (coach)' : '2 sales (shop) / 7 covers (resto) / 2 sessions (coach)'}</span>
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
          <a href="/essai?plan=createur" className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#0c1a3a] to-[#1e3a5f] text-white font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all">
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
                <li>
                  <a href="/status" className="text-sm text-neutral-400 hover:text-cyan-400 transition-colors flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {locale === 'fr' ? 'Statut de la plateforme' : 'Platform status'}
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
                {locale === 'fr' ? 'Offre unique' : 'One-time offer'}
              </span>
            </div>

            <div className="text-center mt-4">
              <div className="text-3xl mb-2">🚀</div>
              <h3 className="text-xl font-bold text-neutral-900 mb-2">
                {locale === 'fr' ? 'Passe au Plan Pro pour seulement 10\u20AC de plus !' : 'Upgrade to Pro for just \u20AC10 more!'}
              </h3>
              <p className="text-sm text-neutral-600 mb-4">
                {locale === 'fr' ? 'Pour ' : 'At '}<span className="font-bold text-green-600">{locale === 'fr' ? '59\u20AC/mois au lieu de 99\u20AC' : '\u20AC59/month instead of \u20AC99'}</span>{locale === 'fr' ? ' le 1er mois' : ' the first month'}
                <br />{locale === 'fr' ? '(-40% de réduction exclusive)' : '(40% exclusive discount)'}
              </p>

              {/* Comparaison rapide */}
              <div className="bg-neutral-50 rounded-xl p-4 mb-4 text-left text-sm">
                <p className="font-semibold text-neutral-800 mb-2">{locale === 'fr' ? 'Le Plan Pro inclut en plus :' : 'Pro also includes:'}</p>
                <ul className="space-y-1.5 text-neutral-700">
                  <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">✓</span> {locale === 'fr' ? '1 200 crédits/mois (3x plus)' : '1,200 credits/month (3× more)'}</li>
                  <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">✓</span> {locale === 'fr' ? 'Publication auto Instagram + TikTok + LinkedIn' : 'Auto-publishing Instagram + TikTok + LinkedIn'}</li>
                  <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">✓</span> {locale === 'fr' ? 'Agent commercial + Email + WhatsApp' : 'Sales agent + Email + WhatsApp'}</li>
                  <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">✓</span> {locale === 'fr' ? 'CRM intégré + pipeline de vente' : 'Integrated CRM + sales pipeline'}</li>
                </ul>
              </div>

              {/* Urgence */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5 text-xs text-amber-800">
                <strong>{locale === 'fr' ? 'Cette offre est unique et ne sera plus proposée.' : 'This offer is one-time only and won\u2019t be shown again.'}</strong>
                <br />{locale === 'fr' ? 'C\u2019est ta seule chance d\u2019en profiter.' : 'Your only chance to grab it.'}
              </div>

              {/* CTA principal — upsell Pro */}
              <button
                className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold text-base shadow-lg hover:opacity-90 transition"
                onClick={() => {
                  setShowUpsellPro(false);
                  startCheckout('pro', 'createur');
                }}
              >
                {locale === 'fr' ? 'Oui, je prends le Pro à -40%' : 'Yes, I\u2019ll take Pro at -40%'}
              </button>
              {/* CTA secondaire — continuer Créateur */}
              <button
                className="w-full py-2.5 rounded-xl border border-neutral-200 text-neutral-600 text-sm hover:bg-neutral-50 transition mt-3"
                onClick={() => {
                  setShowUpsellPro(false);
                  startCheckout('createur');
                }}
              >
                {locale === 'fr' ? 'Non merci, je reste sur Créateur' : 'No thanks, I\u2019ll stay on Creator'}
              </button>
              <p className="text-center text-[10px] text-neutral-400 mt-2">{locale === 'fr' ? '0\u20AC pendant 7 jours \u00B7 Annulation en 1 clic à tout moment' : '\u20AC0 for 7 days \u00B7 Cancel in 1 click anytime'}</p>
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
    if (quizAnswers.budget === 'medium') return 'Pro';
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
              href="/essai?plan=createur"
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
            href="/essai?plan=createur"
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
  title, price, priceNote, promoPrice, promoNote, subtitle, bullets, ctaLabel, ctaHref, ctaOnClick, highlight, special, trialNote
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
  trialNote?: string;
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
        <a href={ctaHref || "/essai?plan=createur"} className={ctaClassName}>
          {ctaLabel}
        </a>
      )}
      <p className="text-center text-[10px] text-neutral-400 mt-1.5">{trialNote || '0\u20AC pendant 7j \u00B7 Annulation en 1 clic'}</p>
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
