'use client';

import Link from 'next/link';
import { useState } from 'react';
import FeedbackPopup from '@/components/FeedbackPopup';
import FeedbackModal from '@/components/FeedbackModal';
import { useFeedbackPopup } from '@/hooks/useFeedbackPopup';
import { startCheckout } from '@/lib/stripe/checkout';
import { FadeUp, ScaleIn, StaggerContainer, StaggerItem } from '@/components/ui/motion';
import { AnimatedGradientBG } from '@/components/ui/animated-gradient-bg';
import { useLanguage } from '@/lib/i18n/context';

function ContactFormPricing() {
  const { t } = useLanguage();
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
          className="mt-3 text-sm text-blue-600 hover:underline"
        >
          {t.pricing.supportFormCta}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border-2 border-blue-200 p-6 hover:shadow-xl transition-all">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <h3 className="font-bold text-neutral-900">{t.pricing.supportFormTitle}</h3>
          <p className="text-xs text-neutral-500">{t.pricing.supportFormDesc}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Nom"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Email"
          />
        </div>

        <select
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
        >
          <option value="">{t.pricing.formSubjectPlaceholder}</option>
          <option value="Question tarifs">{t.pricing.formSubjectPricing}</option>
          <option value="Démonstration">{t.pricing.formSubjectDemo}</option>
          <option value="Partenariat">{t.pricing.formSubjectPartnership}</option>
          <option value="Autre">{t.pricing.formSubjectOther}</option>
        </select>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          rows={3}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          placeholder={t.pricing.formMessagePlaceholder}
        />

        <button
          type="submit"
          disabled={sending}
          className="w-full px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
  const { t } = useLanguage();
  const feedback = useFeedbackPopup();
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 overflow-hidden">
      <AnimatedGradientBG variant="pricing" />

      <main className="relative max-w-7xl mx-auto px-4 py-16">
        {/* Hero Section */}
        <FadeUp>
        <div className="text-center mb-16">
          <ScaleIn><div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700 text-sm font-medium mb-6">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            {t.pricing.badge}
          </div></ScaleIn>
          <h1 className="text-5xl font-bold mb-6">
            <span dangerouslySetInnerHTML={{ __html: t.pricing.title }} />
          </h1>
          <p className="text-xl text-neutral-600 max-w-3xl mx-auto">
            {t.pricing.subtitle}
          </p>

          {/* Toggle Mensuel / Annuel */}
          <div className="mt-8 inline-flex items-center gap-3 bg-white rounded-full p-1.5 border border-neutral-200 shadow-sm">
            <button
              onClick={() => setBillingPeriod('monthly')}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                billingPeriod === 'monthly'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              {t.common.monthly}
            </button>
            <button
              onClick={() => setBillingPeriod('annual')}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all relative ${
                billingPeriod === 'annual'
                  ? 'bg-blue-600 text-white shadow'
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
        </FadeUp>

        {/* Top Plans - Gratuit & Essai */}
        <StaggerContainer className="grid md:grid-cols-2 gap-6 mb-10 max-w-4xl mx-auto">
          {/* Plan Gratuit */}
          <StaggerItem><div className="bg-white rounded-2xl border-2 border-neutral-200 p-6 relative hover:shadow-xl hover:-translate-y-2 transition-all duration-300">
            <div className="absolute -top-3 left-4">
              <span className="bg-neutral-100 text-neutral-600 px-3 py-1 rounded-full text-xs font-medium">
                {t.pricing.planFreeSubtitle}
              </span>
            </div>
            <div className="mb-6 pt-2">
              <h3 className="text-2xl font-bold mb-2 flex items-center gap-2">
                <span>🎁</span> {t.pricing.planFreeTitle}
              </h3>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-5xl font-bold">0€</span>
                <span className="text-neutral-500">/toujours</span>
              </div>
              <p className="text-neutral-600 text-sm">{t.pricing.planFreeSubtitle}</p>
            </div>

            <ul className="space-y-4 mb-8">
              {t.pricing.planFreeBullets.map((bullet, i) => (
                <li key={i} className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm text-neutral-700" dangerouslySetInnerHTML={{ __html: bullet }} />
                </li>
              ))}
            </ul>

            <Link
              href="/generate"
              className="block w-full py-3 px-6 text-center rounded-xl border-2 border-neutral-300 text-neutral-700 font-medium hover:border-neutral-400 hover:bg-neutral-50 transition-all"
            >
              {t.pricing.planFreeCta}
            </Link>
          </div></StaggerItem>

          {/* Sprint Fondateur 3 jours */}
          <StaggerItem><div className="bg-white rounded-2xl border-2 border-blue-300 p-6 relative hover:shadow-xl hover:-translate-y-2 transition-all duration-300">
            <div className="absolute -top-3 left-4">
              <span className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-3 py-1 rounded-full text-xs font-bold">
                ⚡ {t.pricing.planSprintTitle}
              </span>
            </div>
            <div className="mb-6 pt-2">
              <h3 className="text-2xl font-bold mb-2 flex items-center gap-2">
                <span>⚡</span> {t.pricing.planSprintTitle}
              </h3>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">4.99€</span>
                <span className="text-neutral-500">/3 jours</span>
              </div>
              <p className="text-neutral-600 text-sm font-medium">{t.pricing.planSprintSubtitle}</p>
            </div>

            <ul className="space-y-4 mb-8">
              {t.pricing.planSprintBullets.map((bullet, i) => (
                <li key={i} className="flex items-start gap-3">
                  <svg className={`w-5 h-5 ${i === 1 ? 'text-cyan-500' : i === 4 ? 'text-purple-500' : 'text-blue-500'} flex-shrink-0 mt-0.5`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm text-neutral-700" dangerouslySetInnerHTML={{ __html: bullet }} />
                </li>
              ))}
            </ul>

            <button
              onClick={() => startCheckout('sprint')}
              className="block w-full py-3 px-6 text-center rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 text-white font-bold hover:shadow-lg transition-all hover:scale-105"
            >
              {t.pricing.planSprintCta}
            </button>
          </div></StaggerItem>
        </StaggerContainer>

        {/* TikTok Unlock Highlight */}
        <FadeUp>
        <div className="bg-gradient-to-br from-cyan-500 via-blue-500 to-purple-600 rounded-2xl p-8 mb-10 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 animate-float-slow"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full -ml-24 -mb-24 animate-float-medium"></div>

          <div className="relative z-10 max-w-4xl mx-auto">
            <div className="text-center mb-6">
              <h3 className="text-3xl font-bold mb-3 flex items-center justify-center gap-3">
                <span className="text-4xl">🎵</span> {t.pricing.tiktokTitle}
              </h3>
              <p className="text-xl text-cyan-100 font-medium">
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
        </FadeUp>

        {/* Premium Plans */}
        <FadeUp><h3 className="text-2xl font-bold text-center mb-2">{t.pricing.comparisonTitle}</h3>
        <p className="text-center text-neutral-600 mb-8">{t.pricing.subtitle}</p></FadeUp>

        <StaggerContainer className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {/* Solo 49€ */}
          <StaggerItem><div className="bg-white rounded-2xl border-2 border-neutral-200 p-6 hover:shadow-xl hover:-translate-y-2 transition-all duration-300 flex flex-col">
            <div className="mb-4">
              <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                <span>🚀</span> {t.pricing.planSoloTitle}
              </h3>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-4xl font-bold">{billingPeriod === 'annual' ? '890€' : '89€'}</span>
                <span className="text-neutral-500">{billingPeriod === 'annual' ? t.common.perYear : t.common.perMonth}</span>
                {billingPeriod === 'annual' && <span className="text-xs text-green-600 font-semibold">soit 74€/mois</span>}
              </div>
              {billingPeriod !== 'annual' && (
                <div className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold mt-1">
                  🎉 1er mois à 49€
                </div>
              )}
              <p className="text-neutral-600 text-sm" dangerouslySetInnerHTML={{ __html: t.pricing.planSoloSubtitle }} />
            </div>
            <ul className="space-y-3 mb-6 text-sm flex-1">
              {t.pricing.planSoloBullets.map((bullet, i) => (
                <li key={i} className="flex gap-2"><span className="text-blue-500">✓</span> <span dangerouslySetInnerHTML={{ __html: bullet }} /></li>
              ))}
            </ul>
            <div className="mt-auto space-y-2">
              <button onClick={() => startCheckout(billingPeriod === 'annual' ? 'solo_annual' : 'solo')} className="block w-full py-3 text-center rounded-xl border-2 border-neutral-300 text-neutral-700 font-medium hover:bg-neutral-50 transition-all">
                {t.pricing.planSoloCta} {billingPeriod === 'annual' ? `(${t.common.annual.toLowerCase()})` : ''}
              </button>
              <p className="text-xs text-center text-neutral-500" dangerouslySetInnerHTML={{ __html: t.pricing.planSoloUpgrade }} />
            </div>
          </div></StaggerItem>

          {/* Pro 89€ */}
          <StaggerItem><div id="pro" className="bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl p-6 text-white relative hover:shadow-2xl transition-all transform hover:scale-105 flex flex-col">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <span className="bg-purple-900 text-purple-100 px-4 py-1 rounded-full text-xs font-bold shadow-lg">
                {t.common.popular}
              </span>
            </div>
            <div className="mb-4 pt-2">
              <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                <span>💎</span> {t.pricing.planProTitle}
              </h3>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-4xl font-bold">{billingPeriod === 'annual' ? '890€' : '89€'}</span>
                <span className="text-purple-200">{billingPeriod === 'annual' ? t.common.perYear : t.common.perMonth}</span>
                {billingPeriod === 'annual' && <span className="text-xs text-purple-200 font-semibold">soit 74€/mois</span>}
              </div>
              <p className="text-purple-200 text-sm font-medium" dangerouslySetInnerHTML={{ __html: t.pricing.planProSubtitle }} />
            </div>

            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-3 mb-4 border border-white/30">
              <p className="text-xs font-semibold">{t.pricing.planProBullets[1]}</p>
            </div>

            <ul className="space-y-3 mb-6 text-sm flex-1">
              {t.pricing.planProBullets.map((bullet, i) => (
                <li key={i} className={`flex gap-2 ${i >= 2 ? 'items-start' : ''}`}>
                  <span className={`${i >= 2 ? 'text-cyan-300 flex-shrink-0' : 'text-purple-300'}`}>{i >= 2 ? '★' : '✓'}</span>
                  <span dangerouslySetInnerHTML={{ __html: bullet }} />
                </li>
              ))}
            </ul>
            <button onClick={() => startCheckout(billingPeriod === 'annual' ? 'pro_annual' : 'pro')} className="block w-full py-3 text-center rounded-xl bg-white text-purple-600 font-bold hover:bg-purple-50 transition-all shadow-lg mt-auto">
              {billingPeriod === 'annual' ? `${t.pricing.planProTitle} ${t.common.annual.toLowerCase()} (${t.common.annualDiscount})` : t.pricing.planProCta}
            </button>
            <p className="text-xs text-center text-purple-200 mt-2" dangerouslySetInnerHTML={{ __html: t.pricing.planProUpgrade }} />
          </div></StaggerItem>

          {/* Fondateurs Pro 149€ - HIGHLIGHT */}
          <StaggerItem><div id="fondateurs" className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl p-6 text-white relative hover:shadow-2xl transition-all transform hover:scale-105 flex flex-col animate-glow">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <span className="bg-amber-900 text-amber-100 px-4 py-1 rounded-full text-xs font-bold shadow-lg">
                ⭐ {t.pricing.planFondateursBadge}
              </span>
            </div>
            <div className="mb-4 pt-2">
              <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                <span>⭐</span> {t.pricing.planFondateursTitle}
              </h3>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-4xl font-bold">{billingPeriod === 'annual' ? '1 490€' : '149€'}</span>
                <span className="text-amber-100">{billingPeriod === 'annual' ? t.common.perYear : t.common.perMonth}</span>
                {billingPeriod === 'annual' && <span className="text-xs text-yellow-200 font-semibold">soit 124€/mois</span>}
              </div>
              <p className="text-amber-100 text-sm font-medium" dangerouslySetInnerHTML={{ __html: t.pricing.planFondateursSubtitle }} />
            </div>

            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-3 mb-4 border border-white/30">
              <p className="text-xs font-semibold">{t.pricing.planFondateursBullets[1]}</p>
            </div>

            <ul className="space-y-3 mb-6 text-sm flex-1">
              {t.pricing.planFondateursBullets.map((bullet, i) => (
                <li key={i} className="flex gap-2">
                  <span className={i >= 2 ? 'text-yellow-200' : 'text-yellow-300'}>{i >= 2 ? '★' : '✓'}</span>
                  <span dangerouslySetInnerHTML={{ __html: bullet }} />
                </li>
              ))}
            </ul>
            <button onClick={() => startCheckout(billingPeriod === 'annual' ? 'fondateurs_annual' : 'fondateurs')} className="block w-full py-3 text-center rounded-xl bg-white text-amber-600 font-bold hover:bg-amber-50 transition-all shadow-lg mt-auto">
              {billingPeriod === 'annual' ? `${t.pricing.planFondateursTitle} ${t.common.annual.toLowerCase()} (${t.common.annualDiscount})` : t.pricing.planFondateursCta}
            </button>
            <p className="text-center text-amber-100 text-xs mt-2">{t.pricing.foundersNote}</p>
          </div></StaggerItem>

          {/* Business 349€ */}
          <StaggerItem><div className="bg-gradient-to-br from-blue-600 to-cyan-600 rounded-2xl p-6 text-white relative hover:shadow-2xl transition-all transform hover:scale-105 flex flex-col">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <span className="bg-blue-900 text-blue-100 px-4 py-1 rounded-full text-xs font-bold shadow-lg">
                Agences & Teams
              </span>
            </div>
            <div className="mb-4 pt-2">
              <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                <span>🏢</span> {t.pricing.planBusinessTitle}
              </h3>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-4xl font-bold">{billingPeriod === 'annual' ? '3 490€' : '349€'}</span>
                <span className="text-blue-100">{billingPeriod === 'annual' ? t.common.perYear : t.common.perMonth}</span>
                {billingPeriod === 'annual' && <span className="text-xs text-cyan-200 font-semibold">soit 290€/mois</span>}
              </div>
              <p className="text-blue-100 text-sm" dangerouslySetInnerHTML={{ __html: t.pricing.planBusinessSubtitle }} />
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
            <button onClick={() => startCheckout(billingPeriod === 'annual' ? 'business_annual' : 'business')} className="block w-full py-3 text-center rounded-xl bg-white text-blue-600 font-bold hover:bg-blue-50 transition-all mt-auto">
              {t.pricing.planBusinessCta} {billingPeriod === 'annual' ? `(${t.common.annual.toLowerCase()})` : ''}
            </button>
            <p className="text-center text-blue-100 text-xs mt-2">{t.pricing.supportCallDesc}</p>
          </div></StaggerItem>
        </StaggerContainer>

        {/* Elite - Bandeau séparé */}
        <FadeUp>
        <div className="bg-white rounded-2xl border-2 border-amber-200 p-6 mb-16 max-w-3xl mx-auto hover:shadow-xl transition-all">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="flex-1">
              <h3 className="text-xl font-bold mb-1 flex items-center gap-2"><span>🏆</span> {t.pricing.planEliteTitle} — 999€{t.common.perMonth}</h3>
              <p className="text-neutral-600 text-sm mb-3" dangerouslySetInnerHTML={{ __html: t.pricing.planEliteSubtitle }} />
            </div>
            <button onClick={() => startCheckout(billingPeriod === 'annual' ? 'elite_annual' : 'elite')} className="px-6 py-3 border-2 border-amber-300 text-amber-700 font-semibold rounded-xl hover:bg-amber-50 transition-all whitespace-nowrap">
              {t.pricing.planEliteCta}
            </button>
          </div>
        </div>
        </FadeUp>

        {/* Inclus gratuitement */}
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl border border-green-200 p-6 mb-10">
          <h3 className="text-lg font-bold text-green-900 mb-3 flex items-center gap-2">
            <span>🎁</span> {t.pricing.freeTitle}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {t.pricing.freeFeatures.map((item) => (
              <div key={item} className="flex items-center gap-2 bg-white/70 rounded-lg px-3 py-2">
                <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                <span className="text-xs font-medium text-green-800">{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Grille crédits */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-6 mb-10">
          <h3 className="text-lg font-bold text-neutral-900 mb-4 text-center">{t.pricing.creditTitle}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-sm">
            <div className="p-3 bg-blue-50 rounded-lg"><p className="font-bold text-blue-700">5 cr</p><p className="text-xs text-neutral-600">{t.pricing.creditImage}</p></div>
            <div className="p-3 bg-blue-50 rounded-lg"><p className="font-bold text-blue-700">3 cr</p><p className="text-xs text-neutral-600">{t.pricing.creditImageEdit}</p></div>
            <div className="p-3 bg-purple-50 rounded-lg"><p className="font-bold text-purple-700">25 cr</p><p className="text-xs text-neutral-600">{t.pricing.creditVideo5s}</p></div>
            <div className="p-3 bg-purple-50 rounded-lg"><p className="font-bold text-purple-700">40 cr</p><p className="text-xs text-neutral-600">{t.pricing.creditVideo10s}</p></div>
            <div className="p-3 bg-green-50 rounded-lg"><p className="font-bold text-green-700">1 cr</p><p className="text-xs text-neutral-600">{t.pricing.creditAiSuggestion}</p></div>
            <div className="p-3 bg-green-50 rounded-lg"><p className="font-bold text-green-700">1 cr</p><p className="text-xs text-neutral-600">{t.pricing.creditAudioNarration}</p></div>
            <div className="p-3 bg-green-50 rounded-lg"><p className="font-bold text-green-700">1 cr</p><p className="text-xs text-neutral-600">{t.pricing.creditMarketingAssistant}</p></div>
          </div>
        </div>

        {/* Comparatif rapide */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-8 mb-16">
          <h3 className="text-2xl font-bold text-center mb-2">{t.pricing.comparisonTitle}</h3>
          <p className="text-center text-neutral-500 text-sm mb-8">{t.pricing.subtitle}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2">{t.pricing.comparisonHeaders[0]}</th>
                  <th className="text-center py-3 px-2">{t.pricing.comparisonHeaders[1]}</th>
                  <th className="text-center py-3 px-2">{t.pricing.comparisonHeaders[2]}</th>
                  <th className="text-center py-3 px-2 bg-purple-50">{t.pricing.comparisonHeaders[3]}</th>
                  <th className="text-center py-3 px-2 bg-amber-50">{t.pricing.comparisonHeaders[4]}</th>
                  <th className="text-center py-3 px-2">{t.pricing.comparisonHeaders[5]}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b bg-blue-50/30">
                  <td className="py-3 px-2 font-medium">{t.pricing.comparisonRows[0]}</td>
                  <td className="text-center py-3 px-2">15</td>
                  <td className="text-center py-3 px-2"><strong>220</strong></td>
                  <td className="text-center py-3 px-2 bg-purple-50"><strong>400</strong></td>
                  <td className="text-center py-3 px-2 bg-amber-50"><strong>660</strong></td>
                  <td className="text-center py-3 px-2"><strong>1 750</strong></td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">{t.pricing.comparisonRows[1]}</td>
                  <td className="text-center py-3 px-2 text-neutral-400">test</td>
                  <td className="text-center py-3 px-2">~2/semaine</td>
                  <td className="text-center py-3 px-2 bg-purple-50"><strong>~3/semaine</strong></td>
                  <td className="text-center py-3 px-2 bg-amber-50"><strong>~4/semaine</strong></td>
                  <td className="text-center py-3 px-2"><strong>quotidien</strong></td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">{t.pricing.comparisonRows[2]}</td>
                  <td className="text-center py-3 px-2">3 (watermark)</td>
                  <td className="text-center py-3 px-2 text-blue-600">✓ sans watermark</td>
                  <td className="text-center py-3 px-2 bg-purple-50 text-purple-600">✓</td>
                  <td className="text-center py-3 px-2 bg-amber-50 text-amber-600">✓</td>
                  <td className="text-center py-3 px-2 text-blue-600">✓</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">{t.pricing.comparisonRows[4]}</td>
                  <td className="text-center py-3 px-2 text-neutral-400">—</td>
                  <td className="text-center py-3 px-2 text-blue-600">✓</td>
                  <td className="text-center py-3 px-2 bg-purple-50 text-purple-600">✓</td>
                  <td className="text-center py-3 px-2 bg-amber-50 text-amber-600">✓</td>
                  <td className="text-center py-3 px-2 text-blue-600">✓</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">{t.pricing.comparisonRows[5]}</td>
                  <td className="text-center py-3 px-2 text-neutral-400">—</td>
                  <td className="text-center py-3 px-2">Post</td>
                  <td className="text-center py-3 px-2 bg-purple-50"><strong className="text-purple-600">Post + Story</strong></td>
                  <td className="text-center py-3 px-2 bg-amber-50">Post + Story</td>
                  <td className="text-center py-3 px-2">Post + Story</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">{t.pricing.comparisonRows[7]}</td>
                  <td className="text-center py-3 px-2 text-neutral-400">—</td>
                  <td className="text-center py-3 px-2 text-blue-600">✓</td>
                  <td className="text-center py-3 px-2 bg-purple-50 text-purple-600">✓</td>
                  <td className="text-center py-3 px-2 bg-amber-50 text-amber-600">✓</td>
                  <td className="text-center py-3 px-2 text-blue-600">✓</td>
                </tr>
                <tr className="border-b bg-cyan-50/30">
                  <td className="py-3 px-2 font-medium">🎵 {t.pricing.comparisonRows[6]}</td>
                  <td className="text-center py-3 px-2 text-neutral-400">—</td>
                  <td className="text-center py-3 px-2 text-neutral-400">—</td>
                  <td className="text-center py-3 px-2 bg-purple-50"><strong className="text-cyan-600">✓ {t.pricing.compUnlocked}</strong></td>
                  <td className="text-center py-3 px-2 bg-amber-50 text-cyan-600">✓</td>
                  <td className="text-center py-3 px-2 text-cyan-600">✓</td>
                </tr>
                <tr className="border-b bg-cyan-50/30">
                  <td className="py-3 px-2 font-medium">🎙️ {t.pricing.comparisonRows[3]}</td>
                  <td className="text-center py-3 px-2 text-neutral-400">—</td>
                  <td className="text-center py-3 px-2 text-neutral-400">—</td>
                  <td className="text-center py-3 px-2 bg-purple-50"><strong className="text-purple-600">✓ {t.pricing.compUnlocked}</strong></td>
                  <td className="text-center py-3 px-2 bg-amber-50 text-amber-600">✓</td>
                  <td className="text-center py-3 px-2 text-blue-600">✓</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">{t.pricing.comparisonRows[8]}</td>
                  <td className="text-center py-3 px-2 text-neutral-400">—</td>
                  <td className="text-center py-3 px-2 text-neutral-400">—</td>
                  <td className="text-center py-3 px-2 bg-purple-50">Instagram</td>
                  <td className="text-center py-3 px-2 bg-amber-50"><strong className="text-amber-600">{t.pricing.compMultiPlatform}</strong></td>
                  <td className="text-center py-3 px-2">{t.pricing.compMultiPlatform}</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">{t.pricing.comparisonRows[9]}</td>
                  <td className="text-center py-3 px-2 text-neutral-400">—</td>
                  <td className="text-center py-3 px-2">{t.pricing.compBasic}</td>
                  <td className="text-center py-3 px-2 bg-purple-50">{t.pricing.compPlanning}</td>
                  <td className="text-center py-3 px-2 bg-amber-50"><strong className="text-amber-600">{t.pricing.compAutoSchedule}</strong></td>
                  <td className="text-center py-3 px-2">{t.pricing.compCollaborative}</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">{t.pricing.compMultiAccounts}</td>
                  <td className="text-center py-3 px-2 text-neutral-400">—</td>
                  <td className="text-center py-3 px-2 text-neutral-400">—</td>
                  <td className="text-center py-3 px-2 bg-purple-50 text-neutral-400">—</td>
                  <td className="text-center py-3 px-2 bg-amber-50 text-neutral-400">—</td>
                  <td className="text-center py-3 px-2"><strong>1+5 clients</strong></td>
                </tr>
                <tr>
                  <td className="py-3 px-2 font-medium">{t.pricing.compPrice}</td>
                  <td className="text-center py-3 px-2 font-bold">0€</td>
                  <td className="text-center py-3 px-2 font-bold">89€<br/><span className="text-xs text-green-600 font-normal">1er mois 49€</span></td>
                  <td className="text-center py-3 px-2 bg-purple-50 font-bold text-purple-600">89€</td>
                  <td className="text-center py-3 px-2 bg-amber-50 font-bold text-amber-600">149€*</td>
                  <td className="text-center py-3 px-2 font-bold text-blue-600">349€</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-neutral-500 text-center mt-4">{t.pricing.foundersNote}</p>
        </div>

        {/* Comparateur Keiro vs. Prestataires */}
        <FadeUp>
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-8 md:p-12 mb-16 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-72 h-72 bg-blue-500/10 rounded-full -mr-36 -mt-36 blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-56 h-56 bg-cyan-500/10 rounded-full -ml-28 -mb-28 blur-3xl"></div>

          <div className="relative z-10">
            <div className="text-center mb-8">
              <h3 className="text-2xl md:text-3xl font-bold mb-2">
                {t.pricing.comparatorTitle} <span className="text-red-400">3 300€/mois</span> {t.pricing.comparatorSubtitle} <span className="text-cyan-400">149€</span> ?
              </h3>
              <p className="text-slate-300">{t.pricing.comparatorGraphiste} + {t.pricing.comparatorCM} vs. KeiroAI {t.pricing.planFondateursTitle}</p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-8">
              {/* Colonne prestataires */}
              <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                    <span className="text-red-400 text-lg">✗</span>
                  </div>
                  <div>
                    <h4 className="font-bold">{t.pricing.comparatorGraphiste} + CM</h4>
                    <p className="text-2xl font-bold text-red-400">~3 300€<span className="text-sm font-normal text-slate-400">{t.common.perMonth}</span></p>
                  </div>
                </div>
                <ul className="space-y-2.5 text-sm text-slate-300">
                  {t.pricing.compDarkNeg.map((item, i) => (
                    <li key={i} className="flex gap-2"><span className="text-red-400">✗</span> {item}</li>
                  ))}
                </ul>
              </div>

              {/* Colonne KeiroAI */}
              <div className="bg-gradient-to-br from-blue-500/20 to-cyan-500/20 backdrop-blur-sm rounded-2xl border border-cyan-400/30 p-6 shadow-lg shadow-cyan-500/10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-cyan-500/20 rounded-lg flex items-center justify-center">
                    <span className="text-cyan-400 text-lg">✓</span>
                  </div>
                  <div>
                    <h4 className="font-bold">KeiroAI {t.pricing.planFondateursTitle}</h4>
                    <p className="text-2xl font-bold text-cyan-400">{t.pricing.comparatorKeiroPrice}<span className="text-sm font-normal text-slate-400"></span></p>
                  </div>
                </div>
                <ul className="space-y-2.5 text-sm text-slate-200">
                  {t.pricing.compDarkPos.map((item, i) => (
                    <li key={i} className="flex gap-2"><span className="text-cyan-400 font-bold">✓</span> <span dangerouslySetInnerHTML={{ __html: item }} /></li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Barre économie */}
            <div className="bg-green-500/15 backdrop-blur-sm rounded-xl border border-green-400/20 p-4 text-center">
              <p className="text-green-400 font-bold text-lg" dangerouslySetInnerHTML={{ __html: t.pricing.comparatorSavings }} />
              <p className="text-slate-400 text-xs mt-1">{t.pricing.comparatorGraphiste} {t.pricing.comparatorGraphistePrice} + {t.pricing.comparatorCM} {t.pricing.comparatorCMPrice} vs. KeiroAI {t.pricing.comparatorKeiroPrice}</p>
            </div>
          </div>
        </div>
        </FadeUp>

        {/* FAQ Section */}
        <FadeUp>
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

        </FadeUp>

        {/* Section Support */}
        <FadeUp>
        <div className="mt-16 bg-gradient-to-br from-purple-50 via-blue-50 to-cyan-50 rounded-3xl border-2 border-purple-200 p-8 md:p-12">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full mb-4">
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
                    href="https://calendly.com/contact-keiroai/30min"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all text-sm"
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
          <div className="mt-8 grid grid-cols-3 gap-4 max-w-2xl mx-auto text-center">
            <div>
              <p className="text-2xl font-bold text-purple-600">&lt; 2h</p>
              <p className="text-xs text-neutral-600">{t.pricing.statResponseTime}</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">98%</p>
              <p className="text-xs text-neutral-600">{t.pricing.statSatisfaction}</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-cyan-600">7j/7</p>
              <p className="text-xs text-neutral-600">{t.pricing.statAvailability}</p>
            </div>
          </div>
        </div>
        </FadeUp>

        {/* CTA Final */}
        <FadeUp>
        <div className="mt-20 text-center bg-gradient-to-r from-blue-600 to-cyan-600 rounded-3xl p-12">
          <h2 className="text-4xl font-bold text-white mb-4">
            {t.pricing.ctaTitle}
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            {t.pricing.ctaSubtitle}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/generate"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-blue-600 font-bold rounded-xl hover:bg-blue-50 transition-all text-lg shadow-xl hover:shadow-2xl hover:scale-105"
            >
              {t.pricing.ctaCta}
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link
              href="/generate"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600 transition-all text-lg shadow-xl hover:shadow-2xl hover:scale-105"
            >
              {t.pricing.planFondateursCta} ⭐
            </Link>
          </div>
          <p className="text-blue-100 text-sm mt-4">{t.pricing.foundersNote}</p>
        </div>
        </FadeUp>
      </main>

      <FeedbackPopup show={feedback.showPopup} onAccept={feedback.handleAccept} onDismiss={feedback.handleDismiss} />
      <FeedbackModal isOpen={feedback.showModal} onClose={feedback.handleModalClose} />
    </div>
  );
}

export default function PricingPage() {
  return <PricingPageInner />;
}
