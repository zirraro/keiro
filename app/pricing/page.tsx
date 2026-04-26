'use client';

import Link from 'next/link';
import { useState } from 'react';
import FeedbackPopup from '@/components/FeedbackPopup';
import FeedbackModal from '@/components/FeedbackModal';
import { useFeedbackPopup } from '@/hooks/useFeedbackPopup';
import { startCheckout } from '@/lib/stripe/checkout';

import { AnimatedGradientBG } from '@/components/ui/animated-gradient-bg';
import { useLanguage } from '@/lib/i18n/context';

function ContactFormPricing() {
  const { t, locale } = useLanguage();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);

    try {
      const response = await fetch('/api/support/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, subject, message })
      });

      const data = await response.json();

      if (data.ok) {
        setSent(true);
        setName('');
        setEmail('');
        setSubject('');
        setMessage('');
      } else {
        throw new Error(data.error || 'Erreur lors de l\'envoi');
      }
    } catch (error: any) {
      alert(`Erreur lors de l'envoi: ${error.message}`);
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="bg-white rounded-xl border-2 border-green-200 p-6 text-center">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="font-bold text-neutral-900 mb-1">{t.pricing.supportFormTitle}</h3>
        <p className="text-sm text-neutral-600">{t.pricing.supportFormDesc}</p>
        <button
          onClick={() => setSent(false)}
          className="mt-3 text-sm text-[#0c1a3a] hover:underline"
        >
          {t.pricing.supportFormCta}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border-2 border-[#0c1a3a]/10 p-6 hover:shadow-xl transition-all">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 bg-[#0c1a3a]/10 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg className="w-6 h-6 text-[#0c1a3a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <h3 className="font-bold text-neutral-900">{t.pricing.supportFormTitle}</h3>
          <p className="text-xs text-neutral-500">{t.pricing.supportFormDesc}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-[#0c1a3a] focus:border-transparent"
            placeholder={locale === 'fr' ? 'Nom' : 'Name'}
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-[#0c1a3a] focus:border-transparent"
            placeholder="Email"
          />
        </div>

        <select
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
          className="w-full px-3 py-2 bg-white text-neutral-900 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-[#0c1a3a] focus:border-transparent cursor-pointer"
        >
          <option value="" className="text-neutral-900 bg-white">{t.pricing.formSubjectPlaceholder}</option>
          <option value="Question tarifs" className="text-neutral-900 bg-white">{t.pricing.formSubjectPricing}</option>
          <option value="Démonstration" className="text-neutral-900 bg-white">{t.pricing.formSubjectDemo}</option>
          <option value="Partenariat" className="text-neutral-900 bg-white">{t.pricing.formSubjectPartnership}</option>
          <option value="Autre" className="text-neutral-900 bg-white">{t.pricing.formSubjectOther}</option>
        </select>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          rows={3}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-[#0c1a3a] focus:border-transparent resize-none"
          placeholder={t.pricing.formMessagePlaceholder}
        />

        <button
          type="submit"
          disabled={sending}
          className="w-full px-4 py-2 bg-gradient-to-r from-[#0c1a3a] to-[#1e3a5f] text-white rounded-lg font-semibold hover:shadow-lg transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {sending ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              {t.pricing.formSending}
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              {t.pricing.supportFormCta}
            </>
          )}
        </button>
      </form>
    </div>
  );
}

function PricingPageInner() {
  const { t, locale } = useLanguage();
  const feedback = useFeedbackPopup();
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');

  return (
    <div className="relative min-h-screen page-studio-bg overflow-hidden">
      <AnimatedGradientBG variant="pricing" />

      <main className="relative max-w-7xl mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 border border-neutral-200 text-neutral-800 text-sm font-medium mb-6 shadow-sm backdrop-blur-sm">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500/60 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            {t.pricing.badge}
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6">
            <span dangerouslySetInnerHTML={{ __html: t.pricing.title }} />
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-neutral-600 max-w-3xl mx-auto">
            {t.pricing.subtitle}
          </p>

          {/* Toggle Mensuel / Annuel */}
          {/* Toggle Mensuel / Annuel - hidden for now */}
          <div style={{ display: 'none' }} className="mt-8 inline-flex items-center gap-3 bg-white rounded-full p-1.5 border border-neutral-200 shadow-sm">
            <button
              onClick={() => setBillingPeriod('monthly')}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                billingPeriod === 'monthly'
                  ? 'bg-[#0c1a3a] text-white shadow'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              {t.common.monthly}
            </button>
            <button
              onClick={() => setBillingPeriod('annual')}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all relative ${
                billingPeriod === 'annual'
                  ? 'bg-[#0c1a3a] text-white shadow'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              {t.common.annual}
              <span className="absolute -top-2.5 -right-2 bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {t.common.annualDiscount}
              </span>
            </button>
          </div>
          {billingPeriod === 'annual' && (
            <p className="mt-3 text-sm text-green-600 font-medium">{t.common.freeMonthsAnnual}</p>
          )}
        </div>

        {/* Essai gratuit highlight */}
        <div className="max-w-lg mx-auto mb-10">
          <div className="bg-white dark:bg-[#0c1a3a] rounded-2xl border-2 border-purple-200 dark:border-purple-500/30 p-6 relative hover:shadow-xl hover:-translate-y-2 transition-all duration-300">
            <div className="absolute -top-3 left-4">
              <span className="bg-gradient-to-r from-[#0c1a3a] to-purple-700 text-white px-3 py-1 rounded-full text-xs font-bold">
                {t.pricing.freeTrialBadge || (locale === 'fr' ? '🎁 Essai gratuit' : '🎁 Free trial')}
              </span>
            </div>
            <div className="mb-6 pt-2">
              <h3 className="text-xl sm:text-2xl font-bold mb-2 flex items-center gap-2">
                <span>🎁</span> {t.pricing.freeTrialTitle || (locale === 'fr' ? 'Essai gratuit 7 jours' : '7-day free trial')}
              </h3>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-[#0c1a3a] to-purple-600 bg-clip-text text-transparent">{locale === 'fr' ? '0\u20AC' : '\u20AC0'}</span>
                <span className="text-neutral-500">{locale === 'fr' ? '/ 7 jours' : '/ 7 days'}</span>
              </div>
              <p className="text-neutral-600 dark:text-neutral-300 text-sm font-medium">{t.pricing.freeTrialSubtitle || (locale === 'fr' ? 'Tous les agents débloqués — carte requise, aucun débit' : 'All agents unlocked — card required, no charge')}</p>
            </div>

            <ul className="space-y-4 mb-8">
              {(locale === 'fr' ? [
                '<strong>Tous les agents</strong> débloqués pendant 7 jours',
                '<strong>Vidéos</strong> + images + audio narration',
                'Publication Instagram, LinkedIn, TikTok',
                'Assistant marketing Ami inclus',
                'Carte bancaire requise — <strong>0\u20AC débité</strong>',
              ] : [
                '<strong>All agents</strong> unlocked for 7 days',
                '<strong>Videos</strong> + images + audio narration',
                'Publish to Instagram, LinkedIn, TikTok',
                'Marketing assistant Ami included',
                'Card required — <strong>\u20AC0 charged</strong>',
              ]).map((bullet, i) => (
                <li key={i} className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm text-neutral-700 dark:text-neutral-300" dangerouslySetInnerHTML={{ __html: bullet }} />
                </li>
              ))}
            </ul>

            <Link
              href="/checkout/upsell?plan=createur"
              className="block w-full py-3 px-6 text-center rounded-xl bg-gradient-to-r from-[#0c1a3a] to-purple-700 text-white font-bold hover:shadow-lg transition-all hover:scale-100 sm:hover:scale-105"
            >
              {t.pricing.freeTrialCta || (locale === 'fr' ? '\u2192 Essai gratuit 7 jours' : '\u2192 Start free trial')}
            </Link>
            <p className="text-xs text-center text-neutral-500 mt-2">{t.pricing.freeTrialNote || (locale === 'fr' ? '0\u20AC pendant 7 jours \u2022 Carte requise \u2022 Annulation à tout moment' : '\u20AC0 for 7 days \u2022 Card required \u2022 Cancel anytime')}</p>
          </div>
        </div>

        {/* TikTok Unlock Highlight */}
        <div className="bg-gradient-to-br from-cyan-500 via-[#0c1a3a] to-purple-600 rounded-2xl p-4 sm:p-8 mb-6 sm:mb-10 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 animate-float-slow"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full -ml-24 -mb-24 animate-float-medium"></div>

          <div className="relative z-10 max-w-4xl mx-auto">
            <div className="text-center mb-6">
              <h3 className="text-xl sm:text-2xl md:text-3xl font-bold mb-3 flex items-center justify-center gap-3">
                <span className="text-3xl sm:text-4xl">🎵</span> {t.pricing.tiktokTitle}
              </h3>
              <p className="text-base sm:text-lg md:text-xl text-cyan-100 font-medium">
                {t.pricing.tiktokSubtitle}
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-4 mb-6">
              <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 border border-white/30">
                <div className="text-3xl font-bold mb-1">10x</div>
                <div className="text-sm text-cyan-100">{t.pricing.tiktokStat1Desc}</div>
              </div>
              <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 border border-white/30">
                <div className="text-3xl font-bold mb-1">100k+</div>
                <div className="text-sm text-cyan-100">{t.pricing.tiktokStat2Desc}</div>
              </div>
              <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 border border-white/30">
                <div className="text-3xl font-bold mb-1">2x</div>
                <div className="text-sm text-cyan-100">{t.pricing.tiktokStat3Desc}</div>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/30">
              <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
                <span>💎</span> {t.pricing.tiktokTitle}
              </h4>
              <ul className="space-y-2 text-sm">
                {t.pricing.tiktokFeatures.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-cyan-300">✓</span>
                    <span dangerouslySetInnerHTML={{ __html: feature }} />
                  </li>
                ))}
              </ul>
            </div>

            <div className="text-center mt-6">
              <p className="text-sm text-cyan-100">
                {t.pricing.tiktokNote}
              </p>
            </div>
          </div>
        </div>

        {/* Premium Plans */}
        <h3 className="text-2xl font-bold text-center mb-2">{t.pricing.comparisonTitle}</h3>
        <p className="text-center text-neutral-600 mb-8">{t.pricing.subtitle}</p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 mb-10 sm:mb-16 px-1 sm:px-0">
          {/* Créateur 49€ */}
          <div id="createur" className="bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl p-5 sm:p-6 text-white relative hover:shadow-2xl transition-all transform hover:scale-100 sm:hover:scale-105 flex flex-col">
            <div className="mb-4 pt-2">
              <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                <span>💎</span> {t.pricing.planCreateurTitle}
              </h3>
              <div className="flex items-baseline gap-2 mb-2">
                {billingPeriod === 'annual' ? (
                  <>
                    <span className="text-3xl sm:text-4xl font-bold">490€</span>
                    <span className="text-purple-200">{t.common.perYear}</span>
                    <span className="text-xs text-purple-200 font-semibold">{t.home.priceNoteCreateur}</span>
                  </>
                ) : (
                  <>
                    <span className="text-3xl sm:text-4xl font-bold">49€</span>
                    <span className="text-purple-200">{t.common.perMonth}</span>
                  </>
                )}
              </div>
              <p className="text-purple-200 text-sm font-medium mt-1" dangerouslySetInnerHTML={{ __html: t.pricing.planCreateurSubtitle }} />
            </div>

            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-3 mb-4 border border-white/30">
              <p className="text-xs font-semibold">{t.pricing.planCreateurBullets[1]}</p>
            </div>

            <ul className="space-y-3 mb-4 text-sm flex-1">
              {t.pricing.planCreateurBullets.map((bullet, i) => (
                <li key={i} className={`flex gap-2 ${i >= 2 ? 'items-start' : ''}`}>
                  <span className={`${i >= 2 ? 'text-cyan-300 flex-shrink-0' : 'text-purple-300'}`}>{i >= 2 ? '★' : '✓'}</span>
                  <span dangerouslySetInnerHTML={{ __html: bullet }} />
                </li>
              ))}
            </ul>

            {/* NON INCLUS */}
            <div className="border-t border-white/20 pt-3 mb-4">
              <p className="text-xs font-bold text-purple-300 mb-2 uppercase">{locale === 'fr' ? 'Non inclus' : 'Not included'}</p>
              <ul className="space-y-1.5 text-xs">
                {t.pricing.planCreateurNotIncluded.map((item, i) => (
                  <li key={i} className="flex gap-2 text-purple-300/70">
                    <span className="text-red-400 flex-shrink-0">✗</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button onClick={() => startCheckout(billingPeriod === 'annual' ? 'createur_annual' : 'createur')} className="block w-full py-3 text-center rounded-xl bg-white text-purple-600 font-bold hover:bg-purple-50 transition-all shadow-lg mt-auto">
              {billingPeriod === 'annual' ? `${t.pricing.planCreateurTitle} ${t.common.annual.toLowerCase()} (${t.common.annualDiscount})` : t.pricing.planCreateurCta}
            </button>
            <p className="text-xs text-center text-purple-200 mt-2">{t.pricing.planCreateurNote}</p>
          </div>

          {/* Pro 99€ */}
          <div id="pro" className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-5 sm:p-6 text-white relative hover:shadow-2xl transition-all transform hover:scale-100 sm:hover:scale-105 flex flex-col">
            <div className="mb-4 pt-2">
              <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                <span>🚀</span> {t.pricing.planProTitle}
              </h3>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-3xl sm:text-4xl font-bold">{billingPeriod === 'annual' ? '990€' : '99€'}</span>
                <span className="text-blue-200">{billingPeriod === 'annual' ? t.common.perYear : t.common.perMonth}</span>
                {billingPeriod === 'annual' && <span className="text-xs text-blue-200 font-semibold">{t.home.priceNotePro}</span>}
              </div>
              <p className="text-blue-200 text-sm font-medium" dangerouslySetInnerHTML={{ __html: t.pricing.planProSubtitle }} />
            </div>

            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-3 mb-4 border border-white/30">
              <p className="text-xs font-semibold">{t.pricing.planProBullets[1]}</p>
            </div>

            <ul className="space-y-3 mb-4 text-sm flex-1">
              {t.pricing.planProBullets.map((bullet: string, i: number) => (
                <li key={i} className={`flex gap-2 ${i >= 2 ? 'items-start' : ''}`}>
                  <span className={`${i >= 2 ? 'text-cyan-300 flex-shrink-0' : 'text-blue-300'}`}>{i >= 2 ? '★' : '✓'}</span>
                  <span dangerouslySetInnerHTML={{ __html: bullet }} />
                </li>
              ))}
            </ul>

            {/* NON INCLUS */}
            <div className="border-t border-white/20 pt-3 mb-4">
              <p className="text-xs font-bold text-blue-300 mb-2 uppercase">{locale === 'fr' ? 'Non inclus' : 'Not included'}</p>
              <ul className="space-y-1.5 text-xs">
                {t.pricing.planProNotIncluded.map((item: string, i: number) => (
                  <li key={i} className="flex gap-2 text-blue-300/70">
                    <span className="text-red-400 flex-shrink-0">✗</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button onClick={() => startCheckout(billingPeriod === 'annual' ? 'pro_annual' : 'pro')} className="block w-full py-3 text-center rounded-xl bg-white text-blue-600 font-bold hover:bg-blue-50 transition-all shadow-lg mt-auto">
              {billingPeriod === 'annual' ? `${t.pricing.planProTitle} ${t.common.annual.toLowerCase()} (${t.common.annualDiscount})` : t.pricing.planProCta}
            </button>
            <p className="text-xs text-center text-blue-200 mt-2">{t.pricing.planProNote}</p>
          </div>

          {/* Business 199€ — POPULAIRE */}
          <div className="bg-gradient-to-br from-[#0c1a3a] to-[#1e3a5f] rounded-2xl p-5 sm:p-6 text-white relative hover:shadow-2xl transition-all transform hover:scale-100 sm:hover:scale-105 flex flex-col">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <span className="bg-[#0c1a3a] text-cyan-200 px-4 py-1 rounded-full text-xs font-bold shadow-lg">
                {locale === 'fr' ? 'PME & Multi-activité' : 'SME & Multi-business'}
              </span>
            </div>
            <div className="mb-4 pt-2">
              <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                <span>🏢</span> {t.pricing.planBusinessTitle}
              </h3>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-3xl sm:text-4xl font-bold">{billingPeriod === 'annual' ? '1 990€' : '199€'}</span>
                <span className="text-cyan-200">{billingPeriod === 'annual' ? t.common.perYear : t.common.perMonth}</span>
                {billingPeriod === 'annual' && <span className="text-xs text-cyan-200 font-semibold">{t.home.priceNoteBusiness}</span>}
              </div>
              <p className="text-cyan-200 text-sm" dangerouslySetInnerHTML={{ __html: t.pricing.planBusinessSubtitle }} />
            </div>

            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-3 mb-4 border border-white/30">
              <p className="text-xs font-semibold">{t.pricing.planBusinessBullets[1]}</p>
            </div>

            <ul className="space-y-3 mb-6 text-sm flex-1">
              {t.pricing.planBusinessBullets.map((bullet, i) => (
                <li key={i} className="flex gap-2">
                  <span className={i >= 2 ? 'text-cyan-200' : 'text-cyan-300'}>{i >= 2 ? '★' : '✓'}</span>
                  <span dangerouslySetInnerHTML={{ __html: bullet }} />
                </li>
              ))}
            </ul>
            <button onClick={() => startCheckout(billingPeriod === 'annual' ? 'business_annual' : 'business')} className="block w-full py-3 text-center rounded-xl bg-white text-[#0c1a3a] font-bold hover:bg-[#0c1a3a]/5 transition-all mt-auto">
              {billingPeriod === 'annual' ? `${t.pricing.planBusinessTitle} ${t.common.annual.toLowerCase()} (${t.common.annualDiscount})` : t.pricing.planBusinessCta}
            </button>
            <p className="text-center text-cyan-200 text-xs mt-2">{t.pricing.supportCallDesc}</p>
          </div>
        </div>

        {/* Agence — Sur devis */}

        <div className="max-w-2xl mx-auto mb-10">
          <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-2xl p-6 text-white text-center hover:shadow-xl transition-all">
            <h3 className="text-xl font-bold mb-2 flex items-center justify-center gap-2">
              <span>🏗️</span> {locale === 'fr' ? 'Agence \u2014 Sur devis' : 'Agency \u2014 Custom quote'}
            </h3>
            <p className="text-slate-300 text-sm mb-4">
              {locale === 'fr' ? 'Réseau & distributeur \u2014 Crédits illimités, multi-comptes illimités, marque blanche' : 'Network & reseller \u2014 Unlimited credits, unlimited multi-account, white label'}
            </p>
            <a href="https://calendly.com/contact-keiroai/demo-keiroai-15-minutes" target="_blank" rel="noopener noreferrer" className="inline-block py-3 px-8 rounded-xl bg-white text-slate-800 font-bold hover:bg-slate-100 transition-all shadow-lg">
              {locale === 'fr' ? 'Nous contacter' : 'Get in touch'}
            </a>
          </div>
        </div>


        {/* Elite - Plan complet */}

        <div className="max-w-lg mx-auto mb-16">
          <div className="bg-gradient-to-br from-amber-600 to-yellow-700 rounded-2xl p-5 sm:p-6 text-white relative hover:shadow-2xl transition-all transform hover:scale-100 sm:hover:scale-105 flex flex-col">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <span className="bg-gradient-to-r from-yellow-400 to-amber-400 text-amber-900 px-4 py-1 rounded-full text-xs font-bold shadow-lg">
                {t.pricing.planEliteBadge}
              </span>
            </div>
            <div className="mb-4 pt-2">
              <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                <span>🏆</span> {t.pricing.planEliteTitle}
              </h3>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-3xl sm:text-4xl font-bold">999€</span>
                <span className="text-amber-100">{t.common.perMonth}</span>
              </div>
              <p className="text-amber-100 text-sm font-medium" dangerouslySetInnerHTML={{ __html: t.pricing.planEliteSubtitle }} />
            </div>

            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-3 mb-4 border border-white/30">
              <p className="text-xs font-semibold">{t.pricing.planEliteBullets[1]}</p>
            </div>

            <ul className="space-y-3 mb-6 text-sm flex-1">
              {t.pricing.planEliteBullets.map((bullet, i) => (
                <li key={i} className="flex gap-2">
                  <span className={i >= 2 ? 'text-yellow-200' : 'text-yellow-300'}>{i >= 2 ? '★' : '✓'}</span>
                  <span dangerouslySetInnerHTML={{ __html: bullet }} />
                </li>
              ))}
            </ul>

            <div className="flex flex-col sm:flex-row gap-3 mt-auto">
              <a href="https://calendly.com/contact-keiroai/demo-keiroai-15-minutes" target="_blank" rel="noopener noreferrer" className="flex-1 py-3 text-center rounded-xl bg-white text-amber-700 font-bold hover:bg-amber-50 transition-all shadow-lg">
                {locale === 'fr' ? 'Contactez-nous' : 'Get in touch'}
              </a>
              <button onClick={() => startCheckout('elite')} className="flex-1 py-3 text-center rounded-xl border-2 border-white/50 text-white font-bold hover:bg-white/10 transition-all">
                {t.pricing.planEliteCta}
              </button>
            </div>
          </div>
        </div>

        {/* Concrètement, c'est quoi la différence ? */}

        <div className="mb-16">
          <h3 className="text-2xl font-bold text-center mb-8">{locale === 'fr' ? 'Concrètement, c\u2019est quoi la différence ?' : 'In plain terms \u2014 what\u2019s the difference?'}</h3>
          <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {/* Créateur card */}
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl border-2 border-purple-200 p-6">
              <h4 className="text-lg font-bold text-purple-900 mb-1">{locale === 'fr' ? 'Ta vitrine Instagram, pro et autonome' : 'Your Instagram storefront, professional and autonomous'}</h4>
              <p className="text-sm text-purple-600 font-semibold mb-4">{locale === 'fr' ? 'Créateur \u2014 49\u20AC/mois après essai' : 'Creator \u2014 \u20AC49/month after trial'}</p>
              <ul className="space-y-3 text-sm text-neutral-700">
                <li><span className="font-semibold text-purple-700">{locale === 'fr' ? 'C\u2019est comme...' : 'It\u2019s like...'}</span> {locale === 'fr' ? 'Un flyer distribué à 5 000 personnes \u2014 pro, ciblé et mesurable' : 'A flyer handed to 5,000 people \u2014 pro, targeted, measurable'}</li>
                <li><span className="font-semibold text-purple-700">{locale === 'fr' ? 'Ça remplace...' : 'It replaces...'}</span> {locale === 'fr' ? 'Le neveu qui poste 1x/mois + Canva' : 'The nephew posting 1×/month + Canva'}</li>
                <li><span className="font-semibold text-purple-700">{locale === 'fr' ? 'En concret...' : 'Concretely...'}</span> {locale === 'fr' ? 'LÉNA + JADE + AMI basique + vidéos + trend surfing' : 'LÉNA + JADE + basic AMI + videos + trend surfing'}</li>
                <li><span className="font-semibold text-purple-700">{locale === 'fr' ? 'Ça coûte...' : 'It costs...'}</span> {locale === 'fr' ? 'Le prix de 2 dîners au restaurant' : 'The price of 2 dinners out'}</li>
                <li><span className="font-semibold text-purple-700">{locale === 'fr' ? 'C\u2019est rentabilisé si...' : 'It pays for itself with...'}</span> {locale === 'fr' ? '1 vente en plus (boutique) / 5 couverts (resto)' : '1 extra sale (shop) / 5 covers (resto)'}</li>
              </ul>
            </div>
            {/* Business value card */}
            <div className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-2xl border-2 border-cyan-300 p-6 shadow-lg">
              <h4 className="text-lg font-bold text-cyan-900 mb-1">{locale === 'fr' ? 'Automatisation complète pour PME et multi-sites' : 'Complete automation for SMEs and multi-site'}</h4>
              <p className="text-sm text-cyan-600 font-semibold mb-4">{locale === 'fr' ? 'Business \u2014 199\u20AC/mois \u2014 15+ agents' : 'Business \u2014 \u20AC199/month \u2014 15+ agents'}</p>
              <ul className="space-y-3 text-sm text-neutral-700">
                <li><span className="font-semibold text-cyan-700">{locale === 'fr' ? 'C\u2019est comme...' : 'It\u2019s like...'}</span> {locale === 'fr' ? 'Avoir une équipe marketing complète à temps plein' : 'Having a full-time complete marketing team'}</li>
                <li><span className="font-semibold text-cyan-700">{locale === 'fr' ? 'Ça remplace...' : 'It replaces...'}</span> {locale === 'fr' ? 'Un graphiste (800\u20AC) + un CM (1 500\u20AC) + un comptable (200\u20AC) + 3 outils SaaS' : 'A designer (\u20AC800) + a CM (\u20AC1,500) + an accountant (\u20AC200) + 3 SaaS tools'}</li>
                <li><span className="font-semibold text-cyan-700">{locale === 'fr' ? 'En concret...' : 'Concretely...'}</span> {locale === 'fr' ? '15+ agents, CRM, finance, juridique, chatbot, 2 000 crédits/mois' : '15+ agents, CRM, finance, legal, chatbot, 2,000 credits/month'}</li>
                <li><span className="font-semibold text-cyan-700">{locale === 'fr' ? 'C\u2019est rentabilisé si...' : 'It pays for itself with...'}</span> {locale === 'fr' ? '3 clients en plus par mois (restaurant) / 2 ventes (boutique)' : '3 extra clients/month (restaurant) / 2 sales (shop)'}</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Agents IA — Automatisation */}

        <div className="bg-gradient-to-br from-[#0c1a3a] to-purple-900 rounded-2xl border border-purple-500/20 p-6 mb-10 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -mr-24 -mt-24"></div>
          <h3 className="text-lg font-bold mb-2 flex items-center gap-2 relative z-10">
            <span>🤖</span> {locale === 'fr' ? 'Agents \u2014 Automatisation incluse' : 'Agents \u2014 Automation included'}
          </h3>
          <p className="text-purple-200 text-sm mb-4 relative z-10">
            {locale === 'fr' ? 'Pas un chatbot. Des agents qui ' : 'Not a chatbot. Agents that '}<strong>{locale === 'fr' ? 'exécutent' : 'execute'}</strong>{locale === 'fr' ? ' les tâches à ta place, 24/7.' : ' tasks for you, 24/7.'}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 relative z-10">
            <div className="bg-white/10 rounded-lg p-3 border border-white/10">
              <p className="text-xs font-bold text-green-300 mb-1">{locale === 'fr' ? 'Gratuit' : 'Free'}</p>
              <p className="text-[11px] text-purple-200">AMI ({locale === 'fr' ? 'basique' : 'basic'}) + CLARA</p>
            </div>
            <div className="bg-white/10 rounded-lg p-3 border border-white/10">
              <p className="text-xs font-bold text-purple-300 mb-1">{locale === 'fr' ? 'Créateur \u2014 49\u20AC/mois après essai' : 'Creator \u2014 \u20AC49/month after trial'}</p>
              <p className="text-[11px] text-purple-200">+ LÉNA, JADE</p>
            </div>
            <div className="bg-white/10 rounded-lg p-3 border border-white/10">
              <p className="text-xs font-bold text-blue-300 mb-1">{locale === 'fr' ? 'Pro \u2014 99\u20AC/mois après essai' : 'Pro \u2014 \u20AC99/month after trial'}</p>
              <p className="text-[11px] text-purple-200">+ HUGO, FÉLIX, Branding</p>
            </div>
            <div className="bg-white/10 rounded-lg p-3 border border-white/10">
              <p className="text-xs font-bold text-amber-300 mb-1">{locale === 'fr' ? 'Business \u2014 199\u20AC/mois après essai' : 'Business \u2014 \u20AC199/month after trial'}</p>
              <p className="text-[11px] text-purple-200">+ OSCAR, SARA, CRM, {locale === 'fr' ? 'Multi-comptes' : 'Multi-account'}</p>
            </div>
          </div>
          <p className="text-[10px] text-purple-300 mt-3 relative z-10">
            {locale === 'fr' ? 'Tous les agents optimisent ton KeiroAI en arrière-plan, quel que soit ton plan.' : 'All agents optimise your KeiroAI in the background, whatever your plan.'}
          </p>
        </div>

        {/* Inclus gratuitement */}
        <div className="bg-gradient-to-r from-[#0c1a3a]/5 to-purple-50 dark:from-[#0c1a3a] dark:to-purple-900/20 rounded-2xl border border-purple-200 dark:border-purple-500/20 p-6 mb-10">
          <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-3 flex items-center gap-2">
            <span>🎁</span> {t.pricing.freeTitle}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {t.pricing.freeFeatures.map((item) => (
              <div key={item} className="flex items-center gap-2 bg-white/70 dark:bg-white/10 rounded-lg px-3 py-2">
                <svg className="w-4 h-4 text-purple-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                <span className="text-xs font-medium text-green-800">{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Grille crédits */}
        <div className="bg-white dark:bg-white/5 rounded-2xl border border-neutral-200 dark:border-white/10 p-6 mb-10">
          <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-4 text-center">{t.pricing.creditTitle}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-sm">
            <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-lg border border-blue-100 dark:border-blue-500/20"><p className="font-bold text-blue-800 dark:text-blue-300">4 cr</p><p className="text-xs text-neutral-600 dark:text-neutral-400">{t.pricing.creditImage}</p></div>
            <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-lg border border-blue-100 dark:border-blue-500/20"><p className="font-bold text-blue-800 dark:text-blue-300">3 cr</p><p className="text-xs text-neutral-600 dark:text-neutral-400">{t.pricing.creditImageEdit}</p></div>
            <div className="p-3 bg-purple-50 dark:bg-purple-500/10 rounded-lg border border-purple-100 dark:border-purple-500/20"><p className="font-bold text-purple-700 dark:text-purple-300">15 cr</p><p className="text-xs text-neutral-600 dark:text-neutral-400">{t.pricing.creditVideo5s}</p></div>
            <div className="p-3 bg-purple-50 dark:bg-purple-500/10 rounded-lg border border-purple-100 dark:border-purple-500/20"><p className="font-bold text-purple-700 dark:text-purple-300">25 cr</p><p className="text-xs text-neutral-600 dark:text-neutral-400">{t.pricing.creditVideo10s}</p></div>
            <div className="p-3 bg-purple-50 dark:bg-purple-500/10 rounded-lg border border-purple-100 dark:border-purple-500/20"><p className="font-bold text-purple-700 dark:text-purple-300">35 cr</p><p className="text-xs text-neutral-600 dark:text-neutral-400">{locale === 'fr' ? 'Vidéo 15s' : 'Video 15s'}</p></div>
            <div className="p-3 bg-purple-50 dark:bg-purple-500/10 rounded-lg border border-purple-100 dark:border-purple-500/20"><p className="font-bold text-purple-700 dark:text-purple-300">50 cr</p><p className="text-xs text-neutral-600 dark:text-neutral-400">{locale === 'fr' ? 'Vidéo 30s' : 'Video 30s'}</p></div>
            <div className="p-3 bg-purple-50 dark:bg-purple-500/10 rounded-lg border border-purple-100 dark:border-purple-500/20"><p className="font-bold text-purple-700 dark:text-purple-300">65-110 cr</p><p className="text-xs text-neutral-600 dark:text-neutral-400">{locale === 'fr' ? 'Vidéo 45-90s' : 'Video 45-90s'}</p></div>
            <div className="p-3 bg-green-50 dark:bg-green-500/10 rounded-lg border border-green-100 dark:border-green-500/20"><p className="font-bold text-green-700 dark:text-green-300">2 cr</p><p className="text-xs text-neutral-600 dark:text-neutral-400">{t.pricing.creditAudioNarration}</p></div>
            <div className="p-3 bg-green-50 dark:bg-green-500/10 rounded-lg border border-green-100 dark:border-green-500/20"><p className="font-bold text-green-700 dark:text-green-300">1 cr</p><p className="text-xs text-neutral-600 dark:text-neutral-400">{t.pricing.creditAiSuggestion}</p></div>
            <div className="p-3 bg-green-50 dark:bg-green-500/10 rounded-lg border border-green-100 dark:border-green-500/20"><p className="font-bold text-green-700 dark:text-green-300">1 cr</p><p className="text-xs text-neutral-600 dark:text-neutral-400">{t.pricing.creditMarketingAssistant}</p></div>
          </div>
        </div>

        {/* Comparatif rapide */}
        <div className="bg-white dark:bg-white/5 rounded-2xl border border-neutral-200 dark:border-white/10 p-4 sm:p-8 mb-16">
          <h3 className="text-xl sm:text-2xl font-bold text-center mb-2">{t.pricing.comparisonTitle}</h3>
          <p className="text-center text-neutral-500 text-sm mb-8">{t.pricing.subtitle}</p>
          <div className="overflow-x-auto -mx-2 sm:mx-0">
            <table className="w-full text-[10px] sm:text-sm min-w-[480px]">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2">{locale === 'fr' ? 'Fonctionnalité' : 'Feature'}</th>
                  <th className="text-center py-3 px-2 text-purple-600">{locale === 'fr' ? 'Créateur' : 'Creator'} 49{'\u20AC'}</th>
                  <th className="text-center py-3 px-2 text-blue-600">Pro 99{'\u20AC'}</th>
                  <th className="text-center py-3 px-2 bg-amber-50 font-bold text-amber-600">Business 199{'\u20AC'}</th>
                  <th className="text-center py-3 px-2 bg-yellow-50 font-bold">Elite 999{'\u20AC'}</th>
                </tr>
              </thead>
              <tbody>
                {/* Crédits */}
                {(locale === 'fr' ? [
                  { name: 'Crédits', c: '400/mois', p: '800/mois', b: '2 000/mois', e: '6 000/mois', bold: true },
                  { name: 'Agents', c: '7', p: '10', b: '15+', e: '15+', bold: true },
                  { name: 'LÉNA Contenu & Publication', c: '\u2713', p: '\u2713', b: '\u2713', e: '\u2713' },
                  { name: 'HUGO Email Marketing', c: '\u2713', p: '\u2713', b: '\u2713', e: '\u2713' },
                  { name: 'JADE DM Instagram', c: '\u2713', p: '\u2713', b: '\u2713', e: '\u2713' },
                  { name: 'LÉO CRM & Prospection', c: '\u2713', p: '\u2713', b: '\u2713', e: '\u2713' },
                  { name: 'THÉO Avis Google', c: '\u2713', p: '\u2713', b: '\u2713', e: '\u2713' },
                  { name: 'AMI Analytics', c: '\u2713', p: '\u2713', b: '\u2713', e: '\u2713' },
                  { name: 'CLARA Onboarding', c: '\u2713', p: '\u2713', b: '\u2713', e: '\u2713' },
                  { name: 'OSCAR SEO & Blog', c: '\u2014', p: '\u2713', b: '\u2713', e: '\u2713', pro: true },
                  { name: 'MAX Chatbot Site Web', c: '\u2014', p: '\u2713', b: '\u2713', e: '\u2713', pro: true },
                  { name: 'SARA Juridique & RH', c: '\u2014', p: '\u2713', b: '\u2713', e: '\u2713', pro: true },
                  { name: 'LOUIS Finance & Trésorerie', c: '\u2014', p: '\u2014', b: '\u2713', e: '\u2713', biz: true },
                  { name: 'FÉLIX Publicité (Meta/Google)', c: '\u2014', p: '\u2014', b: 'Bientôt', e: 'Bientôt', biz: true },
                  { name: 'EMMA LinkedIn', c: '\u2014', p: '\u2014', b: 'Bientôt', e: 'Bientôt', biz: true },
                  { name: 'STELLA WhatsApp', c: '\u2014', p: '\u2014', b: 'Bientôt', e: 'Bientôt', biz: true },
                  { name: 'Vidéos', c: '\u2713', p: '\u2713', b: '\u2713', e: '\u2713' },
                  { name: 'Images', c: '\u2713', p: '\u2713', b: '\u2713', e: '\u2713' },
                  { name: 'Tendances en temps réel', c: '\u2713', p: '\u2713', b: '\u2713', e: '\u2713' },
                  { name: 'Calendrier éditorial', c: '\u2713', p: '\u2713', b: '\u2713', e: '\u2713' },
                  { name: 'Export documents', c: '\u2713', p: '\u2713', b: '\u2713', e: '\u2713' },
                  { name: 'Multi-comptes', c: '\u2014', p: '\u2014', b: '1+5', e: 'Illimité' },
                ] : [
                  { name: 'Credits', c: '400/month', p: '800/month', b: '2,000/month', e: '6,000/month', bold: true },
                  { name: 'Agents', c: '7', p: '10', b: '15+', e: '15+', bold: true },
                  { name: 'LENA Content & Publishing', c: '\u2713', p: '\u2713', b: '\u2713', e: '\u2713' },
                  { name: 'HUGO Email Marketing', c: '\u2713', p: '\u2713', b: '\u2713', e: '\u2713' },
                  { name: 'JADE DM Instagram', c: '\u2713', p: '\u2713', b: '\u2713', e: '\u2713' },
                  { name: 'LEO CRM & Prospecting', c: '\u2713', p: '\u2713', b: '\u2713', e: '\u2713' },
                  { name: 'THEO Google Reviews', c: '\u2713', p: '\u2713', b: '\u2713', e: '\u2713' },
                  { name: 'AMI Analytics', c: '\u2713', p: '\u2713', b: '\u2713', e: '\u2713' },
                  { name: 'CLARA Onboarding', c: '\u2713', p: '\u2713', b: '\u2713', e: '\u2713' },
                  { name: 'OSCAR SEO & Blog', c: '\u2014', p: '\u2713', b: '\u2713', e: '\u2713', pro: true },
                  { name: 'MAX Website Chatbot', c: '\u2014', p: '\u2713', b: '\u2713', e: '\u2713', pro: true },
                  { name: 'SARA Legal & HR', c: '\u2014', p: '\u2713', b: '\u2713', e: '\u2713', pro: true },
                  { name: 'LOUIS Finance & Cash', c: '\u2014', p: '\u2014', b: '\u2713', e: '\u2713', biz: true },
                  { name: 'FELIX Ads (Meta/Google)', c: '\u2014', p: '\u2014', b: 'Soon', e: 'Soon', biz: true },
                  { name: 'EMMA LinkedIn', c: '\u2014', p: '\u2014', b: 'Soon', e: 'Soon', biz: true },
                  { name: 'STELLA WhatsApp', c: '\u2014', p: '\u2014', b: 'Soon', e: 'Soon', biz: true },
                  { name: 'Videos', c: '\u2713', p: '\u2713', b: '\u2713', e: '\u2713' },
                  { name: 'Images', c: '\u2713', p: '\u2713', b: '\u2713', e: '\u2713' },
                  { name: 'Real-time trends', c: '\u2713', p: '\u2713', b: '\u2713', e: '\u2713' },
                  { name: 'Editorial calendar', c: '\u2713', p: '\u2713', b: '\u2713', e: '\u2713' },
                  { name: 'Document export', c: '\u2713', p: '\u2713', b: '\u2713', e: '\u2713' },
                  { name: 'Multi-account', c: '\u2014', p: '\u2014', b: '1+5', e: 'Unlimited' },
                ]).map((row, i) => (
                  <tr key={i} className={`border-b ${row.pro ? 'bg-blue-50/30' : row.biz ? 'bg-amber-50/30' : ''}`}>
                    <td className="py-3 px-2 font-medium">{row.name}</td>
                    <td className="text-center py-3 px-2">{row.bold ? <strong>{row.c}</strong> : row.c === '\u2713' ? <span className="text-green-600">{row.c}</span> : row.c === '\u2014' ? <span className="text-neutral-400">{row.c}</span> : row.c}</td>
                    <td className="text-center py-3 px-2">{row.bold ? <strong>{row.p}</strong> : row.p === '\u2713' ? <span className="text-green-600">{row.p}</span> : row.p === '\u2014' ? <span className="text-neutral-400">{row.p}</span> : row.p}</td>
                    <td className="text-center py-3 px-2 bg-amber-50">{row.bold ? <strong>{row.b}</strong> : row.b === '\u2713' ? <span className="text-green-600">{row.b}</span> : row.b === '\u2014' ? <span className="text-neutral-400">{row.b}</span> : (row.b === 'Bientôt' || row.b === 'Soon') ? <span className="text-amber-500 text-xs">{row.b}</span> : row.b}</td>
                    <td className="text-center py-3 px-2 bg-yellow-50">{row.bold ? <strong>{row.e}</strong> : row.e === '\u2713' ? <span className="text-green-600">{row.e}</span> : row.e === '\u2014' ? <span className="text-neutral-400">{row.e}</span> : (row.e === 'Bientôt' || row.e === 'Soon') ? <span className="text-amber-500 text-xs">{row.e}</span> : row.e}</td>
                  </tr>
                ))}
                {/* Prix */}
                <tr>
                  <td className="py-3 px-2 font-medium">{t.pricing.compPrice}</td>
                  <td className="text-center py-3 px-2 font-bold text-purple-600">{locale === 'fr' ? '49\u20AC/mois' : '\u20AC49/mo'}</td>
                  <td className="text-center py-3 px-2 font-bold text-blue-600">{locale === 'fr' ? '99\u20AC/mois' : '\u20AC99/mo'}</td>
                  <td className="text-center py-3 px-2 bg-amber-50 font-bold text-amber-600">{locale === 'fr' ? '199\u20AC/mois' : '\u20AC199/mo'}</td>
                  <td className="text-center py-3 px-2 bg-yellow-50 font-bold text-amber-700">{locale === 'fr' ? '999\u20AC/mois' : '\u20AC999/mo'}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-neutral-500 text-center mt-4">{t.pricing.foundersNote}</p>
        </div>

        {/* Le vrai coût de ne rien faire */}

        <div className="mb-16">
          <div className="text-center mb-10">
            <h3 className="text-2xl md:text-3xl font-bold text-neutral-900 mb-3">{locale === 'fr' ? 'Pas de graphiste ni de CM ? Le vrai coût, c\u2019est l\u2019invisibilité.' : 'No designer or CM? The real cost is invisibility.'}</h3>
            <p className="text-neutral-600 max-w-2xl mx-auto">{locale === 'fr' ? 'Chaque jour sans Instagram, des clients potentiels choisissent ton concurrent.' : 'Every day without Instagram, potential customers pick your competitor.'}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
            {/* Card 1 - Ne rien faire */}
            <div className="bg-neutral-100 rounded-2xl border border-neutral-200 p-5">
              <h4 className="font-bold text-neutral-600 mb-3">{locale === 'fr' ? 'Ne rien faire' : 'Doing nothing'}</h4>
              <div className="space-y-2 text-sm">
                <p><span className="font-semibold text-neutral-500">{locale === 'fr' ? 'Coût :' : 'Cost:'}</span> {locale === 'fr' ? '0\u20AC/mois' : '\u20AC0/month'}</p>
                <p><span className="font-semibold text-neutral-500">{locale === 'fr' ? 'Résultat :' : 'Result:'}</span> {locale === 'fr' ? 'Invisible en ligne' : 'Invisible online'}</p>
                <p><span className="font-semibold text-neutral-500">{locale === 'fr' ? 'Clients via Instagram :' : 'Customers via Instagram:'}</span> 0</p>
              </div>
              <p className="text-xs text-neutral-400 mt-3 italic">{locale === 'fr' ? '« Les 72% de 18-35 ans qui choisissent un commerce sur Instagram ne te trouveront jamais. »' : '"72% of 18-35 year-olds pick a business on Instagram \u2014 they\u2019ll never find you."'}</p>
            </div>

            {/* Card 2 - Le neveu / le stagiaire */}
            <div className="bg-neutral-100 rounded-2xl border border-neutral-200 p-5">
              <h4 className="font-bold text-neutral-600 mb-3">{locale === 'fr' ? 'Le neveu / le stagiaire' : 'The nephew / the intern'}</h4>
              <div className="space-y-2 text-sm">
                <p><span className="font-semibold text-neutral-500">{locale === 'fr' ? 'Coût :' : 'Cost:'}</span> {locale === 'fr' ? '« Gratuit » (mais ton temps + résultats amateurs)' : '"Free" (but your time + amateur results)'}</p>
                <p><span className="font-semibold text-neutral-500">{locale === 'fr' ? 'Résultat :' : 'Result:'}</span> {locale === 'fr' ? '1 post par mois, photo floue' : '1 post per month, blurry photo'}</p>
                <p><span className="font-semibold text-neutral-500">{locale === 'fr' ? 'Clients via Instagram :' : 'Customers via Instagram:'}</span> {locale === 'fr' ? 'Quasi 0' : 'Near zero'}</p>
              </div>
              <p className="text-xs text-neutral-400 mt-3 italic">{locale === 'fr' ? '« Un post tous les 2 mois avec une photo au smartphone ne trompe personne. »' : '"A post every 2 months with a phone photo fools nobody."'}</p>
            </div>

            {/* Card 3 - KeiroAI */}
            <div className="bg-gradient-to-br from-[#0c1a3a]/5 to-purple-50 rounded-2xl border-2 border-[#0c1a3a]/20 p-5 shadow-lg">
              <h4 className="font-bold text-[#0c1a3a] mb-3 flex items-center gap-1">⭐ KeiroAI</h4>
              <div className="space-y-2 text-sm">
                <p><span className="font-semibold text-[#0c1a3a]">{locale === 'fr' ? 'Coût :' : 'Cost:'}</span> {locale === 'fr' ? '7 jours gratuits, puis à partir de 49\u20AC/mois' : '7 days free, then from \u20AC49/month'}</p>
                <p><span className="font-semibold text-[#0c1a3a]">{locale === 'fr' ? 'Résultat :' : 'Result:'}</span> {locale === 'fr' ? '3 à 6 posts pro par semaine, brandés, liés à l\u2019actu' : '3-6 pro posts per week, branded, tied to today\u2019s news'}</p>
                <p><span className="font-semibold text-[#0c1a3a]">{locale === 'fr' ? 'Clients :' : 'Customers:'}</span> {locale === 'fr' ? 'Le calcul est simple \u2193' : 'The math is simple \u2193'}</p>
              </div>
              <p className="text-xs text-[#0c1a3a] mt-3 italic">{locale === 'fr' ? '« Instagram créé pour toi + texte + hashtags + stats. Tu publies en 30 secondes. »' : '"Instagram built for you + copy + hashtags + stats. Publish in 30 seconds."'}</p>
            </div>
          </div>

        </div>

        {/* Comparateur Keiro vs. Prestataires - 3 colonnes */}

        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-4 sm:p-8 md:p-12 mb-16 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-72 h-72 bg-[#0c1a3a]/10 rounded-full -mr-36 -mt-36 blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-56 h-56 bg-cyan-500/10 rounded-full -ml-28 -mb-28 blur-3xl"></div>

          <div className="relative z-10">
            <div className="text-center mb-8">
              <h3 className="text-2xl md:text-3xl font-bold mb-3">
                {t.home.comparatorTitle}
              </h3>
              <p className="text-slate-300 text-lg">{t.home.comparatorSubtitle}</p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 mb-8">
              {/* Col 1 - Graphiste freelance */}
              <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                    <span className="text-red-400 text-lg">✗</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-sm">{locale === 'fr' ? 'Graphiste freelance' : 'Freelance designer'}</h4>
                    <p className="text-lg font-bold text-red-400">{locale === 'fr' ? '800 à 2 000\u20AC' : '\u20AC800\u20132,000'}<span className="text-xs font-normal text-slate-400">{locale === 'fr' ? '/mois' : '/month'}</span></p>
                  </div>
                </div>
                <ul className="space-y-2 text-sm text-slate-300">
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> {locale === 'fr' ? 'Délai : 2 à 5 jours par visuel' : 'Delay: 2\u20135 days per visual'}</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> {locale === 'fr' ? 'Modifications payantes' : 'Paid revisions'}</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> {locale === 'fr' ? 'Pas de réactivité sur l\u2019actualité' : 'No responsiveness to current events'}</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> {locale === 'fr' ? 'Aucune vidéo incluse' : 'No video included'}</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> {locale === 'fr' ? 'Pas de texte ni légendes' : 'No copy or captions'}</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> {locale === 'fr' ? 'Pas de hashtags ni stratégie' : 'No hashtags or strategy'}</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> {locale === 'fr' ? 'Aucune statistique' : 'No analytics'}</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> {locale === 'fr' ? 'Pas de publication' : 'No publishing'}</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> {locale === 'fr' ? 'Briefings longs' : 'Long briefings'}</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> {locale === 'fr' ? 'Congés, vacances, indisponibilités' : 'Vacation, off-days, downtime'}</li>
                </ul>
              </div>

              {/* Col 2 - Community Manager */}
              <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                    <span className="text-red-400 text-lg">✗</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-sm">Community Manager</h4>
                    <p className="text-lg font-bold text-red-400">{locale === 'fr' ? '1 500 à 3 000\u20AC' : '\u20AC1,500\u20133,000'}<span className="text-xs font-normal text-slate-400">{locale === 'fr' ? '/mois' : '/month'}</span></p>
                  </div>
                </div>
                <ul className="space-y-2 text-sm text-slate-300">
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> {locale === 'fr' ? 'Rédaction manuelle' : 'Manual copywriting'}</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> {locale === 'fr' ? 'Planification basique' : 'Basic scheduling'}</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> {locale === 'fr' ? '1 seul réseau en général' : 'Usually 1 network only'}</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> {locale === 'fr' ? 'Pas de génération' : 'No auto-generation'}</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> {locale === 'fr' ? 'Pas de branding automatique' : 'No automatic branding'}</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> {locale === 'fr' ? 'Pas de multi-format' : 'No multi-format'}</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> {locale === 'fr' ? 'Congés, absences, rotation' : 'Leave, absences, rotation'}</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> {locale === 'fr' ? 'Qualité variable' : 'Variable quality'}</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> {locale === 'fr' ? 'Pas de vidéo' : 'No video'}</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> {locale === 'fr' ? 'Reporting basique mensuel' : 'Basic monthly reporting'}</li>
                </ul>
              </div>

              {/* Col 3 - KeiroAI */}
              <div className="bg-gradient-to-br from-[#0c1a3a]/50/20 to-cyan-500/20 backdrop-blur-sm rounded-2xl border border-cyan-400/30 p-6 shadow-lg shadow-cyan-500/10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-cyan-500/20 rounded-lg flex items-center justify-center">
                    <span className="text-cyan-400 text-lg">✓</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-sm">KeiroAI</h4>
                    <p className="text-lg font-bold text-cyan-400">{locale === 'fr' ? '7 jours gratuits' : '7 days free'}<span className="text-xs font-normal text-slate-400">{locale === 'fr' ? ' puis 49\u20AC/mois' : ' then \u20AC49/month'}</span></p>
                  </div>
                </div>
                <ul className="space-y-2 text-sm text-slate-200">
                  <li className="flex gap-2"><span className="text-cyan-400 font-bold flex-shrink-0">✓</span> {locale === 'fr' ? '3 minutes par visuel' : '3 minutes per visual'}</li>
                  <li className="flex gap-2"><span className="text-cyan-400 font-bold flex-shrink-0">✓</span> {locale === 'fr' ? 'Modifications illimitées' : 'Unlimited revisions'}</li>
                  <li className="flex gap-2"><span className="text-cyan-400 font-bold flex-shrink-0">✓</span> {locale === 'fr' ? 'Visuels liés à l\u2019actu du jour' : 'Visuals tied to today\u2019s news'}</li>
                  <li className="flex gap-2"><span className="text-cyan-400 font-bold flex-shrink-0">✓</span> {locale === 'fr' ? 'Vidéo + audio narration inclus' : 'Video + audio narration included'}</li>
                  <li className="flex gap-2"><span className="text-cyan-400 font-bold flex-shrink-0">✓</span> {locale === 'fr' ? 'Texte, légendes, hashtags auto' : 'Copy, captions, hashtags auto'}</li>
                  <li className="flex gap-2"><span className="text-cyan-400 font-bold flex-shrink-0">✓</span> Instagram + TikTok + LinkedIn</li>
                  <li className="flex gap-2"><span className="text-cyan-400 font-bold flex-shrink-0">✓</span> {locale === 'fr' ? 'Branding personnalisé (Business)' : 'Custom branding (Business)'}</li>
                  <li className="flex gap-2"><span className="text-cyan-400 font-bold flex-shrink-0">✓</span> {locale === 'fr' ? 'Multi-format automatique (Business)' : 'Auto multi-format (Business)'}</li>
                  <li className="flex gap-2"><span className="text-cyan-400 font-bold flex-shrink-0">✓</span> {locale === 'fr' ? 'Statistiques et analyse intégrées' : 'Stats and analytics built in'}</li>
                  <li className="flex gap-2"><span className="text-cyan-400 font-bold flex-shrink-0">✓</span> {locale === 'fr' ? 'Assistant Marketing Intelligence' : 'Marketing Intelligence assistant'}</li>
                  <li className="flex gap-2"><span className="text-cyan-400 font-bold flex-shrink-0">✓</span> {locale === 'fr' ? 'Disponible 24/7' : 'Available 24/7'}</li>
                  <li className="flex gap-2"><span className="text-cyan-400 font-bold flex-shrink-0">✓</span> {locale === 'fr' ? 'Calendrier de planification' : 'Scheduling calendar'}</li>
                </ul>
              </div>
            </div>

            {/* Barre économie */}
            <div className="bg-green-500/15 backdrop-blur-sm rounded-xl border border-green-400/20 p-4 text-center">
              <p className="text-green-400 font-bold text-lg">{locale === 'fr' ? 'Économie moyenne constatée : ' : 'Average observed savings: '}<strong>-95%</strong>{locale === 'fr' ? ' soit ' : ' = '}<strong>{locale === 'fr' ? '2 350\u20AC à 4 850\u20AC économisés' : '\u20AC2,350\u20134,850 saved'}</strong>{locale === 'fr' ? ' chaque mois' : ' every month'}</p>
            </div>
          </div>
        </div>

        {/* KeiroAI vs ChatGPT — Comparaison détaillée */}

        <div className="mb-16">
          <h3 className="text-2xl md:text-3xl font-bold text-center mb-8">
            {locale === 'fr' ? 'KeiroAI vs outils gratuits \u2014 comparaison détaillée' : 'KeiroAI vs free AI tools \u2014 detailed comparison'}
          </h3>

          {/* Banner highlight */}
          <div className="bg-gradient-to-r from-cyan-500 to-[#0c1a3a] text-white rounded-2xl p-6 mb-8">
            <p className="text-xl md:text-2xl font-bold mb-2">
              {locale === 'fr' ? 'La vidéo change tout. ChatGPT ne fait pas de vidéo.' : 'Video changes everything. ChatGPT doesn\u2019t do video.'}
            </p>
            <p className="text-cyan-100 text-sm md:text-base">
              {locale === 'fr' ? 'Sur TikTok, une vidéo de 15-30 secondes peut toucher 100 000 personnes gratuitement. ChatGPT génère des images. Pas des vidéos. KeiroAI génère des vidéos avec narration audio, prêtes à publier. En 3 minutes.' : 'On TikTok, a 15\u201330 second video can reach 100,000 people for free. ChatGPT generates images. Not videos. KeiroAI generates videos with audio narration, ready to publish. In 3 minutes.'}
            </p>
          </div>

          {/* Tableau comparatif détaillé — data-driven for bilingual support */}
          <div className="bg-white dark:bg-white/5 rounded-2xl border border-neutral-200 dark:border-white/10 p-4 md:p-8">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b-2 border-neutral-200">
                    <th className="text-left py-3 px-3 font-semibold text-neutral-700">{locale === 'fr' ? 'Fonctionnalité' : 'Feature'}</th>
                    <th className="text-center py-3 px-3 text-neutral-500 font-medium">{locale === 'fr' ? 'ChatGPT/Claude Gratuit' : 'ChatGPT/Claude Free'}</th>
                    <th className="text-center py-3 px-3 text-neutral-500 font-medium">{locale === 'fr' ? 'ChatGPT/Claude Pro (20\u20AC)' : 'ChatGPT/Claude Pro (\u20AC20)'}</th>
                    <th className="text-center py-3 px-3 font-bold text-purple-700 bg-purple-50 rounded-t-lg">{locale === 'fr' ? 'KeiroAI Créateur' : 'KeiroAI Creator'}</th>
                    <th className="text-center py-3 px-3 font-bold text-amber-700 bg-amber-50 rounded-t-lg">KeiroAI Business</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const ko = <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 dark:bg-red-500/20 text-red-500 text-xs font-bold">✕</span>;
                    const ok = <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100 dark:bg-green-500/20 text-green-600 text-xs font-bold">✓</span>;
                    const warn = <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-500 text-xs font-bold">!</span>;
                    type Cell = { icon?: React.ReactNode; text?: string; strong?: string; note?: string };
                    type Row = { feature: string; free: Cell; pro: Cell; createur: Cell; business: Cell; highlight?: 'cyan' | 'emerald'; bold?: boolean };
                    const fr: Row[] = [
                      { feature: 'GÉNÉRATION DE VIDÉOS', highlight: 'cyan', bold: true, free: { icon: ko, text: 'Impossible' }, pro: { icon: ok, text: 'Vidéos 5s-90s' }, createur: { icon: ok, text: 'Vidéos 5s-90s' }, business: { icon: ok, text: 'Vidéos 5s-90s' } },
                      { feature: 'TikTok (format + publication)', free: { icon: ko }, pro: { icon: ko }, createur: { icon: ko }, business: { icon: ok, text: 'Format optimisé' } },
                      { feature: 'Vidéo + audio narration', free: { icon: ko, text: '(audio séparé)' }, pro: { icon: ok, text: 'Intégré' }, createur: { icon: ok, text: 'Intégré' }, business: { icon: ok, text: 'Intégré' } },
                      { feature: 'Images', free: { icon: ok, text: 'Qualité correcte' }, pro: { icon: ok, text: 'Meilleure qualité' }, createur: { icon: ok, text: 'Optimisé commerce' }, business: { icon: ok, text: 'Optimisé commerce' } },
                      { feature: 'Qualité de génération', highlight: 'emerald', bold: true, free: { text: 'Basique', note: 'DALL-E 3 basique' }, pro: { text: 'Bonne', note: 'DALL-E 3 / GPT-4o' }, createur: { strong: 'Premium', note: 'Seedream 4.5 + Seedance' }, business: { strong: 'Elite Studio', note: 'Niveau graphiste pro' } },
                      { feature: 'Rendus disponibles', free: { text: '1 seul' }, pro: { text: '1 seul' }, createur: { strong: '6 rendus', note: 'Photo, ciné, aquarelle...' }, business: { strong: '6 rendus', note: 'Photo, ciné, aquarelle...' } },
                      { feature: 'Temps par post', free: { text: '20-30 min' }, pro: { text: '20-30 min' }, createur: { strong: '3 min' }, business: { strong: '3 min' } },
                      { feature: 'Compétence requise', free: { text: 'Savoir prompter' }, pro: { text: 'Savoir prompter' }, createur: { strong: 'Aucune' }, business: { strong: 'Aucune' } },
                      { feature: 'Lié à l\u2019actu du jour', free: { icon: ko, text: 'Tu cherches' }, pro: { icon: ko, text: 'Tu cherches' }, createur: { icon: ok, text: 'Automatique' }, business: { icon: ok, text: 'Automatique' } },
                      { feature: 'Branding (logo + couleurs)', free: { icon: ko, text: 'Re-décrire' }, pro: { icon: ko, text: 'Re-décrire' }, createur: { icon: ko }, business: { icon: ok, text: 'Mémorisé, auto' } },
                      { feature: 'Multi-format (post + Story + Reel)', free: { icon: ko, text: '1 par 1' }, pro: { icon: ko, text: '1 par 1' }, createur: { icon: ko }, business: { icon: ok, text: '1 clic = 3 formats' } },
                      { feature: 'Légendes Instagram', free: { icon: warn, text: 'Si demandé' }, pro: { icon: warn, text: 'Si demandé' }, createur: { icon: ok, text: 'Auto' }, business: { icon: ok, text: 'Auto' } },
                      { feature: 'Hashtags', free: { icon: warn, text: 'Si demandé' }, pro: { icon: warn, text: 'Si demandé' }, createur: { icon: ok, text: 'Auto' }, business: { icon: ok, text: 'Auto' } },
                      { feature: 'Text-to-speech', free: { icon: ko }, pro: { icon: ok, text: '+ MP3' }, createur: { icon: ok, text: 'Intégré vidéo' }, business: { icon: ok, text: 'Intégré vidéo' } },
                      { feature: 'Calendrier publication', free: { icon: ko }, pro: { icon: ko }, createur: { icon: ok }, business: { icon: ok } },
                      { feature: 'Stats Instagram', free: { icon: ko }, pro: { icon: ko }, createur: { icon: ok }, business: { icon: ok } },
                      { feature: 'Stats multi-plateforme', free: { icon: ko }, pro: { icon: ko }, createur: { icon: ko }, business: { icon: ok } },
                      { feature: 'Recommandations auto', free: { icon: ko }, pro: { icon: ko }, createur: { icon: ok }, business: { icon: ok } },
                      { feature: 'Publication multi-plateforme', free: { icon: ko }, pro: { icon: ko }, createur: { icon: ok, text: 'IG + LinkedIn' }, business: { icon: ok, text: 'IG + TikTok + LinkedIn' } },
                      { feature: 'Galerie organisée', free: { icon: ko, text: 'Historique chat' }, pro: { icon: ko, text: 'Historique chat' }, createur: { icon: ok }, business: { icon: ok } },
                      { feature: 'Retouche visuelle', free: { icon: ko, text: 'Regénérer' }, pro: { icon: ko, text: 'Regénérer' }, createur: { icon: ok, text: 'Lumière, ambiance' }, business: { icon: ok, text: 'Lumière, ambiance' } },
                      { feature: 'Support', free: { icon: ko }, pro: { text: 'Email 48h' }, createur: { text: 'Email 48h' }, business: { strong: 'Prioritaire 12h' } },
                    ];
                    const en: Row[] = [
                      { feature: 'VIDEO GENERATION', highlight: 'cyan', bold: true, free: { icon: ko, text: 'Impossible' }, pro: { icon: ok, text: '5s-90s videos' }, createur: { icon: ok, text: '5s-90s videos' }, business: { icon: ok, text: '5s-90s videos' } },
                      { feature: 'TikTok (format + publishing)', free: { icon: ko }, pro: { icon: ko }, createur: { icon: ko }, business: { icon: ok, text: 'Optimised format' } },
                      { feature: 'Video + audio narration', free: { icon: ko, text: '(separate audio)' }, pro: { icon: ok, text: 'Built-in' }, createur: { icon: ok, text: 'Built-in' }, business: { icon: ok, text: 'Built-in' } },
                      { feature: 'Images', free: { icon: ok, text: 'Decent quality' }, pro: { icon: ok, text: 'Better quality' }, createur: { icon: ok, text: 'Business-optimised' }, business: { icon: ok, text: 'Business-optimised' } },
                      { feature: 'Generation quality', highlight: 'emerald', bold: true, free: { text: 'Basic', note: 'DALL-E 3 basic' }, pro: { text: 'Good', note: 'DALL-E 3 / GPT-4o' }, createur: { strong: 'Premium', note: 'Seedream 4.5 + Seedance' }, business: { strong: 'Elite Studio', note: 'Pro designer level' } },
                      { feature: 'Available renders', free: { text: '1 only' }, pro: { text: '1 only' }, createur: { strong: '6 renders', note: 'Photo, cine, watercolor...' }, business: { strong: '6 renders', note: 'Photo, cine, watercolor...' } },
                      { feature: 'Time per post', free: { text: '20-30 min' }, pro: { text: '20-30 min' }, createur: { strong: '3 min' }, business: { strong: '3 min' } },
                      { feature: 'Skill required', free: { text: 'Prompting skill' }, pro: { text: 'Prompting skill' }, createur: { strong: 'None' }, business: { strong: 'None' } },
                      { feature: 'Tied to today\u2019s news', free: { icon: ko, text: 'You search' }, pro: { icon: ko, text: 'You search' }, createur: { icon: ok, text: 'Automatic' }, business: { icon: ok, text: 'Automatic' } },
                      { feature: 'Branding (logo + colors)', free: { icon: ko, text: 'Re-describe' }, pro: { icon: ko, text: 'Re-describe' }, createur: { icon: ko }, business: { icon: ok, text: 'Remembered, auto' } },
                      { feature: 'Multi-format (post + Story + Reel)', free: { icon: ko, text: 'One by one' }, pro: { icon: ko, text: 'One by one' }, createur: { icon: ko }, business: { icon: ok, text: '1 click = 3 formats' } },
                      { feature: 'Instagram captions', free: { icon: warn, text: 'If asked' }, pro: { icon: warn, text: 'If asked' }, createur: { icon: ok, text: 'Auto' }, business: { icon: ok, text: 'Auto' } },
                      { feature: 'Hashtags', free: { icon: warn, text: 'If asked' }, pro: { icon: warn, text: 'If asked' }, createur: { icon: ok, text: 'Auto' }, business: { icon: ok, text: 'Auto' } },
                      { feature: 'Text-to-speech', free: { icon: ko }, pro: { icon: ok, text: '+ MP3' }, createur: { icon: ok, text: 'In video' }, business: { icon: ok, text: 'In video' } },
                      { feature: 'Publishing calendar', free: { icon: ko }, pro: { icon: ko }, createur: { icon: ok }, business: { icon: ok } },
                      { feature: 'Instagram stats', free: { icon: ko }, pro: { icon: ko }, createur: { icon: ok }, business: { icon: ok } },
                      { feature: 'Multi-platform stats', free: { icon: ko }, pro: { icon: ko }, createur: { icon: ko }, business: { icon: ok } },
                      { feature: 'Auto recommendations', free: { icon: ko }, pro: { icon: ko }, createur: { icon: ok }, business: { icon: ok } },
                      { feature: 'Multi-platform publishing', free: { icon: ko }, pro: { icon: ko }, createur: { icon: ok, text: 'IG + LinkedIn' }, business: { icon: ok, text: 'IG + TikTok + LinkedIn' } },
                      { feature: 'Organised gallery', free: { icon: ko, text: 'Chat history' }, pro: { icon: ko, text: 'Chat history' }, createur: { icon: ok }, business: { icon: ok } },
                      { feature: 'Visual retouch', free: { icon: ko, text: 'Regenerate' }, pro: { icon: ko, text: 'Regenerate' }, createur: { icon: ok, text: 'Light, mood' }, business: { icon: ok, text: 'Light, mood' } },
                      { feature: 'Support', free: { icon: ko }, pro: { text: 'Email 48h' }, createur: { text: 'Email 48h' }, business: { strong: 'Priority 12h' } },
                    ];
                    const renderCell = (c: Cell) => (
                      <>
                        {c.icon}{c.icon && (c.text || c.strong) ? ' ' : ''}
                        {c.strong ? <strong className="text-green-600">{c.strong}</strong> : c.text}
                        {c.note ? <><br/><span className="text-[10px] text-neutral-400">{c.note}</span></> : null}
                      </>
                    );
                    return (locale === 'fr' ? fr : en).map((row, i) => {
                      const rowBg = row.highlight === 'cyan' ? 'bg-cyan-50' : row.highlight === 'emerald' ? 'bg-emerald-50/40' : '';
                      const boldCls = row.bold ? 'font-bold' : '';
                      const pad = row.bold ? 'py-4' : 'py-3';
                      return (
                        <tr key={i} className={`border-b ${rowBg} ${boldCls}`}>
                          <td className={`${pad} px-3 font-medium ${row.bold ? 'text-base' : ''}`}>{row.feature}</td>
                          <td className={`text-center ${pad} px-3`}>{renderCell(row.free)}</td>
                          <td className={`text-center ${pad} px-3`}>{renderCell(row.pro)}</td>
                          <td className={`text-center ${pad} px-3 bg-purple-50/40`}>{renderCell(row.createur)}</td>
                          <td className={`text-center ${pad} px-3 bg-amber-50/40`}>{renderCell(row.business)}</td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* FAQ Section */}

        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-10">{t.pricing.faqTitle}</h2>
          <div className="space-y-4">
            <details className="bg-white rounded-xl p-6 border border-neutral-200">
              <summary className="font-semibold cursor-pointer text-neutral-900">
                {t.pricing.faq1Q}
              </summary>
              <p className="mt-3 text-neutral-600 text-sm">
                {t.pricing.faq1A}
              </p>
            </details>

            <details className="bg-white rounded-xl p-6 border border-neutral-200">
              <summary className="font-semibold cursor-pointer text-neutral-900">
                {t.pricing.faq2Q}
              </summary>
              <p className="mt-3 text-neutral-600 text-sm">
                {t.pricing.faq2A}
              </p>
            </details>

            <details className="bg-white rounded-xl p-6 border border-neutral-200">
              <summary className="font-semibold cursor-pointer text-neutral-900">
                {t.pricing.faq3Q}
              </summary>
              <p className="mt-3 text-neutral-600 text-sm">
                {t.pricing.faq3A}
              </p>
            </details>

            <details className="bg-white rounded-xl p-6 border border-neutral-200">
              <summary className="font-semibold cursor-pointer text-neutral-900">
                {t.pricing.faq4Q}
              </summary>
              <p className="mt-3 text-neutral-600 text-sm">
                {t.pricing.faq4A}
              </p>
            </details>
          </div>
        </div>


        {/* Section Support */}

        <div className="mt-16 bg-gradient-to-br from-purple-50 via-[#0c1a3a]/5 to-cyan-50 rounded-3xl border-2 border-purple-200 p-4 sm:p-8 md:p-12">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-purple-600 to-[#0c1a3a] rounded-full mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-neutral-900 mb-3">
              {t.pricing.supportTitle}
            </h2>
            <p className="text-neutral-600 max-w-2xl mx-auto">
              {t.pricing.supportCallDesc}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {/* Appel Calendly */}
            <div className="bg-white rounded-xl border-2 border-purple-200 p-6 hover:shadow-xl transition-all">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-neutral-900 mb-2">{t.pricing.supportCallTitle}</h3>
                  <p className="text-sm text-neutral-600 mb-3">
                    {t.pricing.supportCallDesc}
                  </p>
                  <a
                    href="https://calendly.com/contact-keiroai/demo-keiroai-15-minutes"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-[#0c1a3a] text-white rounded-lg font-semibold hover:shadow-lg transition-all text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {t.pricing.supportCallCta}
                  </a>
                </div>
              </div>
            </div>

            {/* Formulaire de contact */}
            <ContactFormPricing />
          </div>

          {/* Stats support */}
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto text-center">
            <div>
              <p className="text-2xl font-bold text-purple-600">&lt; 2h</p>
              <p className="text-xs text-neutral-600">{t.pricing.statResponseTime}</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[#0c1a3a]">98%</p>
              <p className="text-xs text-neutral-600">{t.pricing.statSatisfaction}</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-cyan-600">7j/7</p>
              <p className="text-xs text-neutral-600">{t.pricing.statAvailability}</p>
            </div>
          </div>
        </div>
        <p className="text-xs text-center text-neutral-400 mt-2">Retours basés sur des tests utilisateurs</p>

        {/* CTA Final */}

        <div className="mt-12 sm:mt-20 text-center bg-gradient-to-r from-[#0c1a3a] to-[#1e3a5f] rounded-3xl p-6 sm:p-12">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4">
            {t.pricing.ctaTitle}
          </h2>
          <p className="text-base sm:text-lg md:text-xl text-[#0c1a3a]/60 mb-8 max-w-2xl mx-auto">
            {t.pricing.ctaSubtitle}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/checkout/upsell?plan=createur"
              className="inline-flex items-center justify-center gap-2 px-4 sm:px-8 py-3 sm:py-4 bg-white text-[#0c1a3a] font-bold rounded-xl hover:bg-[#0c1a3a]/5 transition-all text-lg shadow-xl hover:shadow-2xl hover:scale-100 sm:hover:scale-105"
            >
              {t.pricing.ctaCta}
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link
              href="/checkout/upsell?plan=createur"
              className="inline-flex items-center justify-center gap-2 px-4 sm:px-8 py-3 sm:py-4 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600 transition-all text-lg shadow-xl hover:shadow-2xl hover:scale-100 sm:hover:scale-105"
            >
              Essai gratuit 7 jours {'\u{1F680}'}
            </Link>
          </div>
          <p className="text-[#0c1a3a]/60 text-sm mt-4">{t.pricing.foundersNote}</p>
        </div>
      </main>

      <FeedbackPopup show={feedback.showPopup} onAccept={feedback.handleAccept} onDismiss={feedback.handleDismiss} />
      <FeedbackModal isOpen={feedback.showModal} onClose={feedback.handleModalClose} />
    </div>
  );
}

export default function PricingPage() {
  return <PricingPageInner />;
}
