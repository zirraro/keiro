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
        <div className="grid grid-cols-2 gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-[#0c1a3a] focus:border-transparent"
            placeholder="Nom"
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
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-[#0c1a3a] focus:border-transparent cursor-pointer"
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
  const { t } = useLanguage();
  const feedback = useFeedbackPopup();
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-[#0c1a3a]/5 via-white to-cyan-50 overflow-hidden">
      <AnimatedGradientBG variant="pricing" />

      <main className="relative max-w-7xl mx-auto px-4 py-16">
        {/* Hero Section */}
        <FadeUp>
        <div className="text-center mb-16">
          <ScaleIn><div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-[#0c1a3a]/10 to-cyan-100 text-[#0c1a3a] text-sm font-medium mb-6">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0c1a3a]/60 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#0c1a3a]"></span>
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
        </FadeUp>

        {/* Top Plan - Sprint Essai */}
        <div className="max-w-lg mx-auto mb-10">
          <FadeUp>
          <div className="bg-white rounded-2xl border-2 border-[#0c1a3a]/20 p-6 relative hover:shadow-xl hover:-translate-y-2 transition-all duration-300">
            <div className="absolute -top-3 left-4">
              <span className="bg-gradient-to-r from-[#0c1a3a]/50 to-purple-500 text-white px-3 py-1 rounded-full text-xs font-bold">
                ⚡ {t.pricing.planSprintTitle}
              </span>
            </div>
            <div className="mb-6 pt-2">
              <h3 className="text-2xl font-bold mb-2 flex items-center gap-2">
                <span>⚡</span> {t.pricing.planSprintTitle}
              </h3>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-5xl font-bold bg-gradient-to-r from-[#0c1a3a] to-purple-600 bg-clip-text text-transparent">4.99€</span>
                <span className="text-neutral-500">/3 jours</span>
              </div>
              <p className="text-neutral-600 text-sm font-medium">{t.pricing.planSprintSubtitle}</p>
            </div>

            <ul className="space-y-4 mb-8">
              {t.pricing.planSprintBullets.map((bullet, i) => (
                <li key={i} className="flex items-start gap-3">
                  <svg className={`w-5 h-5 ${i === 1 ? 'text-cyan-500' : i === 4 ? 'text-purple-500' : 'text-[#0c1a3a]'} flex-shrink-0 mt-0.5`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm text-neutral-700" dangerouslySetInnerHTML={{ __html: bullet }} />
                </li>
              ))}
            </ul>

            <button
              onClick={() => startCheckout('sprint')}
              className="block w-full py-3 px-6 text-center rounded-xl bg-gradient-to-r from-[#0c1a3a]/50 to-purple-600 text-white font-bold hover:shadow-lg transition-all hover:scale-105"
            >
              {t.pricing.planSprintCta}
            </button>
            <p className="text-xs text-center text-neutral-500 mt-2">{t.pricing.planSprintNote}</p>
          </div>
          </FadeUp>
        </div>

        {/* TikTok Unlock Highlight */}
        <FadeUp>
        <div className="bg-gradient-to-br from-cyan-500 via-[#0c1a3a] to-purple-600 rounded-2xl p-8 mb-10 text-white relative overflow-hidden">
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

        <StaggerContainer className="grid md:grid-cols-3 gap-6 mb-16">
          {/* Pro 89€ */}
          <StaggerItem><div id="pro" className="bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl p-6 text-white relative hover:shadow-2xl transition-all transform hover:scale-105 flex flex-col">
            <div className="mb-4 pt-2">
              <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                <span>💎</span> {t.pricing.planProTitle}
              </h3>
              <div className="flex items-baseline gap-2 mb-2">
                {billingPeriod === 'annual' ? (
                  <>
                    <span className="text-4xl font-bold">890€</span>
                    <span className="text-purple-200">{t.common.perYear}</span>
                    <span className="text-xs text-purple-200 font-semibold">soit 74€/mois</span>
                  </>
                ) : (
                  <>
                    <span className="line-through text-purple-300 text-2xl">89€</span>
                    <span className="text-4xl font-bold">49€</span>
                    <span className="text-purple-200">{t.common.perMonth}</span>
                  </>
                )}
              </div>
              {billingPeriod !== 'annual' && (
                <p className="text-purple-200 text-xs font-medium">puis 89€/mois</p>
              )}
              <p className="text-purple-200 text-sm font-medium mt-1" dangerouslySetInnerHTML={{ __html: t.pricing.planProSubtitle }} />
            </div>

            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-3 mb-4 border border-white/30">
              <p className="text-xs font-semibold">{t.pricing.planProBullets[1]}</p>
            </div>

            <ul className="space-y-3 mb-4 text-sm flex-1">
              {t.pricing.planProBullets.map((bullet, i) => (
                <li key={i} className={`flex gap-2 ${i >= 2 ? 'items-start' : ''}`}>
                  <span className={`${i >= 2 ? 'text-cyan-300 flex-shrink-0' : 'text-purple-300'}`}>{i >= 2 ? '★' : '✓'}</span>
                  <span dangerouslySetInnerHTML={{ __html: bullet }} />
                </li>
              ))}
            </ul>

            {/* NON INCLUS */}
            <div className="border-t border-white/20 pt-3 mb-4">
              <p className="text-xs font-bold text-purple-300 mb-2 uppercase">Non inclus</p>
              <ul className="space-y-1.5 text-xs">
                {t.pricing.planProNotIncluded.map((item, i) => (
                  <li key={i} className="flex gap-2 text-purple-300/70">
                    <span className="text-red-400 flex-shrink-0">✗</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button onClick={() => startCheckout(billingPeriod === 'annual' ? 'pro_annual' : 'pro')} className="block w-full py-3 text-center rounded-xl bg-white text-purple-600 font-bold hover:bg-purple-50 transition-all shadow-lg mt-auto">
              {billingPeriod === 'annual' ? `${t.pricing.planProTitle} ${t.common.annual.toLowerCase()} (${t.common.annualDiscount})` : t.pricing.planProCta}
            </button>
            <p className="text-xs text-center text-purple-200 mt-2">{t.pricing.planProNote}</p>
          </div></StaggerItem>

          {/* Fondateurs Pro 149€ - POPULAIRE */}
          <StaggerItem><div id="fondateurs" className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl p-6 text-white relative hover:shadow-2xl transition-all transform hover:scale-105 flex flex-col animate-glow">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <span className="bg-amber-900 text-amber-100 px-4 py-1 rounded-full text-xs font-bold shadow-lg">
                ⭐ Populaire
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
            <p className="text-xs text-center text-amber-200 mt-2">{t.pricing.planFondateursNote}</p>
          </div></StaggerItem>

          {/* Business 349€ */}
          <StaggerItem><div className="bg-gradient-to-br from-[#0c1a3a] to-[#1e3a5f] rounded-2xl p-6 text-white relative hover:shadow-2xl transition-all transform hover:scale-105 flex flex-col">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <span className="bg-[#0c1a3a] text-[#0c1a3a]/60 px-4 py-1 rounded-full text-xs font-bold shadow-lg">
                Agences & Teams
              </span>
            </div>
            <div className="mb-4 pt-2">
              <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                <span>🏢</span> {t.pricing.planBusinessTitle}
              </h3>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-4xl font-bold">{billingPeriod === 'annual' ? '3 490€' : '349€'}</span>
                <span className="text-[#0c1a3a]/60">{billingPeriod === 'annual' ? t.common.perYear : t.common.perMonth}</span>
                {billingPeriod === 'annual' && <span className="text-xs text-cyan-200 font-semibold">soit 290€/mois</span>}
              </div>
              <p className="text-[#0c1a3a]/60 text-sm" dangerouslySetInnerHTML={{ __html: t.pricing.planBusinessSubtitle }} />
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
            <p className="text-center text-[#0c1a3a]/60 text-xs mt-2">{t.pricing.supportCallDesc}</p>
          </div></StaggerItem>
        </StaggerContainer>


        {/* Elite - Plan complet */}
        <FadeUp>
        <div className="max-w-lg mx-auto mb-16">
          <div className="bg-gradient-to-br from-amber-600 to-yellow-700 rounded-2xl p-6 text-white relative hover:shadow-2xl transition-all transform hover:scale-105 flex flex-col">
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
                <span className="text-4xl font-bold">999€</span>
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
                Contactez-nous
              </a>
              <button onClick={() => startCheckout('elite')} className="flex-1 py-3 text-center rounded-xl border-2 border-white/50 text-white font-bold hover:bg-white/10 transition-all">
                {t.pricing.planEliteCta}
              </button>
            </div>
          </div>
        </div>
        </FadeUp>

        {/* Concrètement, c'est quoi la différence ? */}
        <FadeUp>
        <div className="mb-16">
          <h3 className="text-2xl font-bold text-center mb-8">{"Concrètement, c'est quoi la différence ?"}</h3>
          <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {/* Pro card */}
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl border-2 border-purple-200 p-6">
              <h4 className="text-lg font-bold text-purple-900 mb-1">{"Votre vitrine Instagram, professionnelle et autonome"}</h4>
              <p className="text-sm text-purple-600 font-semibold mb-4">Pro 89€/mois</p>
              <ul className="space-y-3 text-sm text-neutral-700">
                <li><span className="font-semibold text-purple-700">{"C'est comme..."}</span> Un flyer distribué à 5 000 personnes — pro, ciblé et mesurable</li>
                <li><span className="font-semibold text-purple-700">{"Ça remplace..."}</span> Le neveu qui poste 1x/mois + Canva</li>
                <li><span className="font-semibold text-purple-700">{"En concret..."}</span> ~3 posts pro/semaine sur Instagram, avec texte et hashtags</li>
                <li><span className="font-semibold text-purple-700">{"Ça coûte..."}</span> Le prix de 2 dîners au restaurant</li>
                <li><span className="font-semibold text-purple-700">{"C'est rentabilisé si..."}</span> 1 vente en plus (boutique) / 5 couverts (resto)</li>
              </ul>
            </div>
            {/* Fondateurs card */}
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border-2 border-amber-300 p-6 shadow-lg">
              <h4 className="text-lg font-bold text-amber-900 mb-1">{"Votre marque partout, sur Instagram ET TikTok, en 3 formats"}</h4>
              <p className="text-sm text-amber-600 font-semibold mb-4">Fondateurs Pro 149€/mois ⭐</p>
              <ul className="space-y-3 text-sm text-neutral-700">
                <li><span className="font-semibold text-amber-700">{"C'est comme..."}</span> Avoir un directeur marketing à temps partiel</li>
                <li><span className="font-semibold text-amber-700">{"Ça remplace..."}</span> Un graphiste (800€) + un CM (1 500€) + stats (100€) + Canva Pro (12€)</li>
                <li><span className="font-semibold text-amber-700">{"En concret..."}</span> ~5-6 posts/semaine, VOTRE logo, post + Story + Reel, Instagram ET TikTok</li>
                <li><span className="font-semibold text-amber-700">{"Ça coûte..."}</span> Le prix de 5 dîners au restaurant</li>
                <li><span className="font-semibold text-amber-700">{"C'est rentabilisé si..."}</span> 2 ventes en plus (boutique) / 7 couverts (resto)</li>
              </ul>
            </div>
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
            <div className="p-3 bg-[#0c1a3a]/5 rounded-lg"><p className="font-bold text-[#0c1a3a]">5 cr</p><p className="text-xs text-neutral-600">{t.pricing.creditImage}</p></div>
            <div className="p-3 bg-[#0c1a3a]/5 rounded-lg"><p className="font-bold text-[#0c1a3a]">3 cr</p><p className="text-xs text-neutral-600">{t.pricing.creditImageEdit}</p></div>
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
                  <th className="text-left py-3 px-2">Fonctionnalité</th>
                  <th className="text-center py-3 px-2">Sprint 4.99€</th>
                  <th className="text-center py-3 px-2">Pro 89€</th>
                  <th className="text-center py-3 px-2 bg-amber-50 font-bold">Fondateurs 149€ ⭐</th>
                  <th className="text-center py-3 px-2">Business 349€</th>
                  <th className="text-center py-3 px-2 bg-yellow-50 font-bold">Elite 999€</th>
                </tr>
              </thead>
              <tbody>
                {/* Crédits */}
                <tr className="border-b bg-[#0c1a3a]/5/30">
                  <td className="py-3 px-2 font-medium">Crédits</td>
                  <td className="text-center py-3 px-2">110/3j</td>
                  <td className="text-center py-3 px-2"><strong>400/mois</strong></td>
                  <td className="text-center py-3 px-2 bg-amber-50"><strong>700/mois</strong></td>
                  <td className="text-center py-3 px-2"><strong>1750/mois</strong></td>
                  <td className="text-center py-3 px-2 bg-yellow-50"><strong>5 500/mois</strong></td>
                </tr>
                {/* En concret */}
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">En concret</td>
                  <td className="text-center py-3 px-2">~7/jour (3j)</td>
                  <td className="text-center py-3 px-2">~3/sem</td>
                  <td className="text-center py-3 px-2 bg-amber-50"><strong>~5-6/sem</strong></td>
                  <td className="text-center py-3 px-2"><strong>Quotidien</strong></td>
                  <td className="text-center py-3 px-2 bg-yellow-50"><strong>Illimité</strong></td>
                </tr>
                {/* Images IA */}
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">Images IA</td>
                  <td className="text-center py-3 px-2"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2 bg-amber-50"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2 bg-yellow-50"><span className="text-green-600">✓</span></td>
                </tr>
                {/* Vidéos IA */}
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">Vidéos IA</td>
                  <td className="text-center py-3 px-2"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2 bg-amber-50"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2 bg-yellow-50"><span className="text-green-600">✓</span></td>
                </tr>
                {/* Audio narration */}
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">Audio narration</td>
                  <td className="text-center py-3 px-2"><span className="text-neutral-400">—</span></td>
                  <td className="text-center py-3 px-2"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2 bg-amber-50"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2 bg-yellow-50"><span className="text-green-600">✓</span></td>
                </tr>
                {/* Assistant IA */}
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">Assistant IA</td>
                  <td className="text-center py-3 px-2"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2 bg-amber-50"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2 bg-yellow-50"><span className="text-green-600">✓</span></td>
                </tr>
                {/* Instagram Posts */}
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">Instagram Posts</td>
                  <td className="text-center py-3 px-2"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2 bg-amber-50"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2 bg-yellow-50"><span className="text-green-600">✓</span></td>
                </tr>
                {/* Instagram Stories */}
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">Instagram Stories</td>
                  <td className="text-center py-3 px-2"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2 bg-amber-50"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2 bg-yellow-50"><span className="text-green-600">✓</span></td>
                </tr>
                {/* LinkedIn */}
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">LinkedIn</td>
                  <td className="text-center py-3 px-2"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2 bg-amber-50"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2 bg-yellow-50"><span className="text-green-600">✓</span></td>
                </tr>
                {/* TikTok */}
                <tr className="border-b bg-cyan-50/30">
                  <td className="py-3 px-2 font-medium">🎵 TikTok</td>
                  <td className="text-center py-3 px-2"><span className="text-neutral-400">—</span></td>
                  <td className="text-center py-3 px-2"><span className="text-neutral-400">—</span></td>
                  <td className="text-center py-3 px-2 bg-amber-50"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2 bg-yellow-50"><span className="text-green-600">✓</span></td>
                </tr>
                {/* Branding */}
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">Branding (logo+couleurs)</td>
                  <td className="text-center py-3 px-2"><span className="text-neutral-400">—</span></td>
                  <td className="text-center py-3 px-2"><span className="text-neutral-400">—</span></td>
                  <td className="text-center py-3 px-2 bg-amber-50"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2 bg-yellow-50"><span className="text-green-600">✓</span></td>
                </tr>
                {/* Multi-format */}
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">Multi-format (3 en 1)</td>
                  <td className="text-center py-3 px-2"><span className="text-neutral-400">—</span></td>
                  <td className="text-center py-3 px-2"><span className="text-neutral-400">—</span></td>
                  <td className="text-center py-3 px-2 bg-amber-50"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2 bg-yellow-50"><span className="text-green-600">✓</span></td>
                </tr>
                {/* Calendrier */}
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">Calendrier</td>
                  <td className="text-center py-3 px-2"><span className="text-neutral-400">—</span></td>
                  <td className="text-center py-3 px-2">Manuel</td>
                  <td className="text-center py-3 px-2 bg-amber-50">Manuel</td>
                  <td className="text-center py-3 px-2"><strong>Collaboratif</strong></td>
                  <td className="text-center py-3 px-2 bg-yellow-50"><strong>Collaboratif</strong></td>
                </tr>
                {/* Stats Instagram */}
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">Stats Instagram</td>
                  <td className="text-center py-3 px-2"><span className="text-neutral-400">—</span></td>
                  <td className="text-center py-3 px-2"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2 bg-amber-50"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2 bg-yellow-50"><span className="text-green-600">✓</span></td>
                </tr>
                {/* Stats multi-plateforme */}
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">Stats multi-plateforme</td>
                  <td className="text-center py-3 px-2"><span className="text-neutral-400">—</span></td>
                  <td className="text-center py-3 px-2"><span className="text-neutral-400">—</span></td>
                  <td className="text-center py-3 px-2 bg-amber-50"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2"><span className="text-green-600">✓</span></td>
                  <td className="text-center py-3 px-2 bg-yellow-50"><span className="text-green-600">✓</span></td>
                </tr>
                {/* Multi-comptes */}
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">Multi-comptes</td>
                  <td className="text-center py-3 px-2"><span className="text-neutral-400">—</span></td>
                  <td className="text-center py-3 px-2"><span className="text-neutral-400">—</span></td>
                  <td className="text-center py-3 px-2 bg-amber-50"><span className="text-neutral-400">—</span></td>
                  <td className="text-center py-3 px-2"><strong>1+5</strong></td>
                  <td className="text-center py-3 px-2 bg-yellow-50"><strong>Illimité</strong></td>
                </tr>
                {/* Support */}
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">Support</td>
                  <td className="text-center py-3 px-2"><span className="text-neutral-400">—</span></td>
                  <td className="text-center py-3 px-2">Email 48h</td>
                  <td className="text-center py-3 px-2 bg-amber-50"><strong>Prioritaire 12h</strong></td>
                  <td className="text-center py-3 px-2"><strong>Premium 4h</strong></td>
                  <td className="text-center py-3 px-2 bg-yellow-50"><strong>Dédié</strong></td>
                </tr>
                {/* Appel onboarding */}
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">Appel onboarding</td>
                  <td className="text-center py-3 px-2"><span className="text-neutral-400">—</span></td>
                  <td className="text-center py-3 px-2"><span className="text-neutral-400">—</span></td>
                  <td className="text-center py-3 px-2 bg-amber-50"><strong className="text-green-600">✓ Offert</strong></td>
                  <td className="text-center py-3 px-2"><strong className="text-green-600">✓ Offert</strong></td>
                  <td className="text-center py-3 px-2 bg-yellow-50"><strong className="text-green-600">✓ Réguliers</strong></td>
                </tr>
                {/* Prix verrouillé */}
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">Prix verrouillé à vie</td>
                  <td className="text-center py-3 px-2"><span className="text-neutral-400">—</span></td>
                  <td className="text-center py-3 px-2"><span className="text-neutral-400">—</span></td>
                  <td className="text-center py-3 px-2 bg-amber-50"><strong className="text-green-600">✓ (50 places)</strong></td>
                  <td className="text-center py-3 px-2"><span className="text-neutral-400">—</span></td>
                  <td className="text-center py-3 px-2 bg-yellow-50"><span className="text-neutral-400">—</span></td>
                </tr>
                {/* Prix */}
                <tr>
                  <td className="py-3 px-2 font-medium">{t.pricing.compPrice}</td>
                  <td className="text-center py-3 px-2 font-bold">4.99€/3j</td>
                  <td className="text-center py-3 px-2 font-bold">89€</td>
                  <td className="text-center py-3 px-2 bg-amber-50 font-bold text-amber-600">149€*</td>
                  <td className="text-center py-3 px-2 font-bold text-[#0c1a3a]">349€</td>
                  <td className="text-center py-3 px-2 bg-yellow-50 font-bold text-amber-700">999€</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-neutral-500 text-center mt-4">{t.pricing.foundersNote}</p>
        </div>

        {/* Le vrai coût de ne rien faire */}
        <FadeUp>
        <div className="mb-16">
          <div className="text-center mb-10">
            <h3 className="text-2xl md:text-3xl font-bold text-neutral-900 mb-3">{"Vous n'avez pas de graphiste ni de CM ? Le vrai coût, c'est l'invisibilité."}</h3>
            <p className="text-neutral-600 max-w-2xl mx-auto">{"Chaque jour sans Instagram, des clients potentiels choisissent votre concurrent."}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
            {/* Card 1 - Ne rien faire */}
            <div className="bg-neutral-100 rounded-2xl border border-neutral-200 p-5">
              <h4 className="font-bold text-neutral-600 mb-3">{"Ne rien faire"}</h4>
              <div className="space-y-2 text-sm">
                <p><span className="font-semibold text-neutral-500">{"Coût :"}</span> 0€/mois</p>
                <p><span className="font-semibold text-neutral-500">{"Résultat :"}</span> Invisible en ligne</p>
                <p><span className="font-semibold text-neutral-500">{"Clients via Instagram :"}</span> 0</p>
              </div>
              <p className="text-xs text-neutral-400 mt-3 italic">{"\"Les 72% de 18-35 ans qui choisissent un commerce sur Instagram ne vous trouveront jamais.\""}</p>
            </div>

            {/* Card 2 - Le neveu / le stagiaire */}
            <div className="bg-neutral-100 rounded-2xl border border-neutral-200 p-5">
              <h4 className="font-bold text-neutral-600 mb-3">{"Le neveu / le stagiaire"}</h4>
              <div className="space-y-2 text-sm">
                <p><span className="font-semibold text-neutral-500">{"Coût :"}</span> {"\"Gratuit\" (mais votre temps + résultats amateurs)"}</p>
                <p><span className="font-semibold text-neutral-500">{"Résultat :"}</span> 1 post par mois, photo floue</p>
                <p><span className="font-semibold text-neutral-500">{"Clients via Instagram :"}</span> Quasi 0</p>
              </div>
              <p className="text-xs text-neutral-400 mt-3 italic">{"\"Un post tous les 2 mois avec une photo au smartphone ne trompe personne.\""}</p>
            </div>

            {/* Card 3 - KeiroAI */}
            <div className="bg-gradient-to-br from-[#0c1a3a]/5 to-purple-50 rounded-2xl border-2 border-[#0c1a3a]/20 p-5 shadow-lg">
              <h4 className="font-bold text-[#0c1a3a] mb-3 flex items-center gap-1">⭐ KeiroAI</h4>
              <div className="space-y-2 text-sm">
                <p><span className="font-semibold text-[#0c1a3a]">{"Coût :"}</span> à partir de 49€ le 1er mois</p>
                <p><span className="font-semibold text-[#0c1a3a]">{"Résultat :"}</span> 3 à 6 posts pro par semaine, brandés, liés à l{"'"}actu</p>
                <p><span className="font-semibold text-[#0c1a3a]">{"Clients :"}</span> {"Le calcul est simple ↓"}</p>
              </div>
              <p className="text-xs text-[#0c1a3a] mt-3 italic">{"\"Instagram crée pour vous + texte + hashtags + stats. Vous publiez en 30 secondes.\""}</p>
            </div>
          </div>

        </div>
        </FadeUp>

        {/* Comparateur Keiro vs. Prestataires - 3 colonnes */}
        <FadeUp>
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-8 md:p-12 mb-16 text-white relative overflow-hidden">
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
                    <h4 className="font-bold text-sm">Graphiste freelance</h4>
                    <p className="text-lg font-bold text-red-400">800 à 2 000€<span className="text-xs font-normal text-slate-400">/mois</span></p>
                  </div>
                </div>
                <ul className="space-y-2 text-sm text-slate-300">
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> Délai : 2 à 5 jours par visuel</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> Modifications payantes</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> {"Pas de réactivité sur l'actualité"}</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> Aucune vidéo incluse</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> Pas de texte ni légendes</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> Pas de hashtags ni stratégie</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> Aucune statistique</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> Pas de publication</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> Briefings longs</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> Congés, vacances, indisponibilités</li>
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
                    <p className="text-lg font-bold text-red-400">1 500 à 3 000€<span className="text-xs font-normal text-slate-400">/mois</span></p>
                  </div>
                </div>
                <ul className="space-y-2 text-sm text-slate-300">
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> Rédaction manuelle</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> Planification basique</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> 1 seul réseau en général</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> Pas de génération IA</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> Pas de branding automatique</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> Pas de multi-format</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> Congés, absences, rotation</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> Qualité variable</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> Pas de vidéo IA</li>
                  <li className="flex gap-2"><span className="text-red-400 flex-shrink-0">✗</span> Reporting basique mensuel</li>
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
                    <p className="text-lg font-bold text-cyan-400">à partir de 49€<span className="text-xs font-normal text-slate-400">/mois</span></p>
                  </div>
                </div>
                <ul className="space-y-2 text-sm text-slate-200">
                  <li className="flex gap-2"><span className="text-cyan-400 font-bold flex-shrink-0">✓</span> 3 minutes par visuel</li>
                  <li className="flex gap-2"><span className="text-cyan-400 font-bold flex-shrink-0">✓</span> Modifications illimitées</li>
                  <li className="flex gap-2"><span className="text-cyan-400 font-bold flex-shrink-0">✓</span> {"Visuels liés à l'actu du jour"}</li>
                  <li className="flex gap-2"><span className="text-cyan-400 font-bold flex-shrink-0">✓</span> Vidéo IA + audio narration inclus</li>
                  <li className="flex gap-2"><span className="text-cyan-400 font-bold flex-shrink-0">✓</span> Texte, légendes, hashtags auto</li>
                  <li className="flex gap-2"><span className="text-cyan-400 font-bold flex-shrink-0">✓</span> Instagram + TikTok + LinkedIn</li>
                  <li className="flex gap-2"><span className="text-cyan-400 font-bold flex-shrink-0">✓</span> Branding personnalisé (Fondateurs)</li>
                  <li className="flex gap-2"><span className="text-cyan-400 font-bold flex-shrink-0">✓</span> Multi-format automatique (Fondateurs)</li>
                  <li className="flex gap-2"><span className="text-cyan-400 font-bold flex-shrink-0">✓</span> Statistiques et analyse intégrées</li>
                  <li className="flex gap-2"><span className="text-cyan-400 font-bold flex-shrink-0">✓</span> Assistant IA marketing</li>
                  <li className="flex gap-2"><span className="text-cyan-400 font-bold flex-shrink-0">✓</span> Disponible 24/7</li>
                  <li className="flex gap-2"><span className="text-cyan-400 font-bold flex-shrink-0">✓</span> Calendrier de planification</li>
                </ul>
              </div>
            </div>

            {/* Barre économie */}
            <div className="bg-green-500/15 backdrop-blur-sm rounded-xl border border-green-400/20 p-4 text-center">
              <p className="text-green-400 font-bold text-lg">{"Économie moyenne constatée : "}<strong>-95%</strong>{" soit "}<strong>{"2 350€ à 4 850€ économisés"}</strong>{" chaque mois"}</p>
            </div>
          </div>
        </div>
        </FadeUp>

        {/* KeiroAI vs ChatGPT — Comparaison détaillée */}
        <FadeUp>
        <div className="mb-16">
          <h3 className="text-2xl md:text-3xl font-bold text-center mb-8">
            {"KeiroAI vs outils IA gratuits — comparaison détaillée"}
          </h3>

          {/* Banner highlight */}
          <div className="bg-gradient-to-r from-cyan-500 to-[#0c1a3a] text-white rounded-2xl p-6 mb-8">
            <p className="text-xl md:text-2xl font-bold mb-2">
              {"La vidéo change tout. ChatGPT ne fait pas de vidéo."}
            </p>
            <p className="text-cyan-100 text-sm md:text-base">
              {"Sur TikTok, une vidéo de 15-30 secondes peut toucher 100 000 personnes gratuitement. ChatGPT génère des images. Pas des vidéos. KeiroAI génère des vidéos avec narration audio, prêtes à publier. En 3 minutes."}
            </p>
          </div>

          {/* Tableau comparatif détaillé */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-4 md:p-8">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b-2 border-neutral-200">
                    <th className="text-left py-3 px-3 font-semibold text-neutral-700">Fonctionnalité</th>
                    <th className="text-center py-3 px-3 text-neutral-500 font-medium">ChatGPT/Claude Gratuit</th>
                    <th className="text-center py-3 px-3 text-neutral-500 font-medium">ChatGPT/Claude Pro (20€)</th>
                    <th className="text-center py-3 px-3 font-bold text-purple-700 bg-purple-50 rounded-t-lg">KeiroAI Pro (89€)</th>
                    <th className="text-center py-3 px-3 font-bold text-amber-700 bg-amber-50 rounded-t-lg">KeiroAI Fondateurs (149€)</th>
                  </tr>
                </thead>
                <tbody>
                  {/* GÉNÉRATION DE VIDÉOS - highlighted */}
                  <tr className="border-b bg-cyan-50 font-bold">
                    <td className="py-4 px-3 text-base">{"GÉNÉRATION DE VIDÉOS"}</td>
                    <td className="text-center py-4 px-3"><span className="text-red-500">{"❌"}</span> Impossible</td>
                    <td className="text-center py-4 px-3"><span className="text-red-500">{"❌"}</span> Impossible</td>
                    <td className="text-center py-4 px-3 bg-purple-50/50"><span className="text-green-600">{"✅"}</span> Vidéos 5s-90s</td>
                    <td className="text-center py-4 px-3 bg-amber-50/50"><span className="text-green-600">{"✅"}</span> Vidéos 5s-90s</td>
                  </tr>
                  {/* TikTok */}
                  <tr className="border-b">
                    <td className="py-3 px-3 font-medium">{"TikTok (format + publication)"}</td>
                    <td className="text-center py-3 px-3"><span className="text-red-500">{"❌"}</span></td>
                    <td className="text-center py-3 px-3"><span className="text-red-500">{"❌"}</span></td>
                    <td className="text-center py-3 px-3"><span className="text-red-500">{"❌"}</span></td>
                    <td className="text-center py-3 px-3 bg-amber-50/30"><span className="text-green-600">{"✅"}</span> Format optimisé</td>
                  </tr>
                  {/* Vidéo + audio narration */}
                  <tr className="border-b">
                    <td className="py-3 px-3 font-medium">{"Vidéo + audio narration"}</td>
                    <td className="text-center py-3 px-3"><span className="text-red-500">{"❌"}</span></td>
                    <td className="text-center py-3 px-3"><span className="text-red-500">{"❌"}</span> (audio séparé)</td>
                    <td className="text-center py-3 px-3"><span className="text-green-600">{"✅"}</span> Intégré</td>
                    <td className="text-center py-3 px-3 bg-amber-50/30"><span className="text-green-600">{"✅"}</span> Intégré</td>
                  </tr>
                  {/* Images IA */}
                  <tr className="border-b">
                    <td className="py-3 px-3 font-medium">{"Images IA"}</td>
                    <td className="text-center py-3 px-3"><span className="text-green-600">{"✅"}</span> Prompt manuel</td>
                    <td className="text-center py-3 px-3"><span className="text-green-600">{"✅"}</span> Meilleure qualité</td>
                    <td className="text-center py-3 px-3"><span className="text-green-600">{"✅"}</span> Optimisé commerce</td>
                    <td className="text-center py-3 px-3 bg-amber-50/30"><span className="text-green-600">{"✅"}</span> Optimisé commerce</td>
                  </tr>
                  {/* Temps par post - green bold for KeiroAI */}
                  <tr className="border-b">
                    <td className="py-3 px-3 font-medium">{"Temps par post"}</td>
                    <td className="text-center py-3 px-3">25-35 min</td>
                    <td className="text-center py-3 px-3">20-30 min</td>
                    <td className="text-center py-3 px-3"><strong className="text-green-600">3 min</strong></td>
                    <td className="text-center py-3 px-3 bg-amber-50/30"><strong className="text-green-600">3 min</strong></td>
                  </tr>
                  {/* Compétence requise - green bold for KeiroAI */}
                  <tr className="border-b">
                    <td className="py-3 px-3 font-medium">{"Compétence requise"}</td>
                    <td className="text-center py-3 px-3">Savoir écrire des prompts</td>
                    <td className="text-center py-3 px-3">Savoir écrire des prompts</td>
                    <td className="text-center py-3 px-3"><strong className="text-green-600">Aucune</strong></td>
                    <td className="text-center py-3 px-3 bg-amber-50/30"><strong className="text-green-600">Aucune</strong></td>
                  </tr>
                  {/* Lié à l'actu du jour */}
                  <tr className="border-b">
                    <td className="py-3 px-3 font-medium">{"Lié à l'actu du jour"}</td>
                    <td className="text-center py-3 px-3"><span className="text-red-500">{"❌"}</span> Vous cherchez</td>
                    <td className="text-center py-3 px-3"><span className="text-red-500">{"❌"}</span> Vous cherchez</td>
                    <td className="text-center py-3 px-3"><span className="text-green-600">{"✅"}</span> Automatique</td>
                    <td className="text-center py-3 px-3 bg-amber-50/30"><span className="text-green-600">{"✅"}</span> Automatique</td>
                  </tr>
                  {/* Branding */}
                  <tr className="border-b">
                    <td className="py-3 px-3 font-medium">{"Branding (logo + couleurs)"}</td>
                    <td className="text-center py-3 px-3"><span className="text-red-500">{"❌"}</span> Re-décrire à chaque fois</td>
                    <td className="text-center py-3 px-3"><span className="text-red-500">{"❌"}</span> Re-décrire</td>
                    <td className="text-center py-3 px-3"><span className="text-red-500">{"❌"}</span></td>
                    <td className="text-center py-3 px-3 bg-amber-50/30"><span className="text-green-600">{"✅"}</span> Mémorisé, auto</td>
                  </tr>
                  {/* Multi-format */}
                  <tr className="border-b">
                    <td className="py-3 px-3 font-medium">{"Multi-format (post+Story+Reel)"}</td>
                    <td className="text-center py-3 px-3"><span className="text-red-500">{"❌"}</span> 1 par 1</td>
                    <td className="text-center py-3 px-3"><span className="text-red-500">{"❌"}</span> 1 par 1</td>
                    <td className="text-center py-3 px-3"><span className="text-red-500">{"❌"}</span></td>
                    <td className="text-center py-3 px-3 bg-amber-50/30"><span className="text-green-600">{"✅"}</span> 1 clic = 3 formats</td>
                  </tr>
                  {/* Légendes Instagram */}
                  <tr className="border-b">
                    <td className="py-3 px-3 font-medium">{"Légendes Instagram"}</td>
                    <td className="text-center py-3 px-3"><span className="text-amber-500">{"⚠️"}</span> Si demandé</td>
                    <td className="text-center py-3 px-3"><span className="text-amber-500">{"⚠️"}</span> Si demandé</td>
                    <td className="text-center py-3 px-3"><span className="text-green-600">{"✅"}</span> Auto</td>
                    <td className="text-center py-3 px-3 bg-amber-50/30"><span className="text-green-600">{"✅"}</span> Auto</td>
                  </tr>
                  {/* Hashtags */}
                  <tr className="border-b">
                    <td className="py-3 px-3 font-medium">{"Hashtags"}</td>
                    <td className="text-center py-3 px-3"><span className="text-amber-500">{"⚠️"}</span> Si demandé</td>
                    <td className="text-center py-3 px-3"><span className="text-amber-500">{"⚠️"}</span> Si demandé</td>
                    <td className="text-center py-3 px-3"><span className="text-green-600">{"✅"}</span> Auto</td>
                    <td className="text-center py-3 px-3 bg-amber-50/30"><span className="text-green-600">{"✅"}</span> Auto</td>
                  </tr>
                  {/* Text-to-speech */}
                  <tr className="border-b">
                    <td className="py-3 px-3 font-medium">{"Text-to-speech"}</td>
                    <td className="text-center py-3 px-3"><span className="text-green-600">{"✅"}</span> Basique</td>
                    <td className="text-center py-3 px-3"><span className="text-green-600">{"✅"}</span> + MP3</td>
                    <td className="text-center py-3 px-3"><span className="text-green-600">{"✅"}</span> Intégré vidéo</td>
                    <td className="text-center py-3 px-3 bg-amber-50/30"><span className="text-green-600">{"✅"}</span> Intégré vidéo</td>
                  </tr>
                  {/* Calendrier publication */}
                  <tr className="border-b">
                    <td className="py-3 px-3 font-medium">{"Calendrier publication"}</td>
                    <td className="text-center py-3 px-3"><span className="text-red-500">{"❌"}</span></td>
                    <td className="text-center py-3 px-3"><span className="text-red-500">{"❌"}</span></td>
                    <td className="text-center py-3 px-3"><span className="text-green-600">{"✅"}</span></td>
                    <td className="text-center py-3 px-3 bg-amber-50/30"><span className="text-green-600">{"✅"}</span></td>
                  </tr>
                  {/* Stats Instagram */}
                  <tr className="border-b">
                    <td className="py-3 px-3 font-medium">{"Stats Instagram"}</td>
                    <td className="text-center py-3 px-3"><span className="text-red-500">{"❌"}</span></td>
                    <td className="text-center py-3 px-3"><span className="text-red-500">{"❌"}</span></td>
                    <td className="text-center py-3 px-3"><span className="text-green-600">{"✅"}</span></td>
                    <td className="text-center py-3 px-3 bg-amber-50/30"><span className="text-green-600">{"✅"}</span></td>
                  </tr>
                  {/* Stats multi-plateforme */}
                  <tr className="border-b">
                    <td className="py-3 px-3 font-medium">{"Stats multi-plateforme"}</td>
                    <td className="text-center py-3 px-3"><span className="text-red-500">{"❌"}</span></td>
                    <td className="text-center py-3 px-3"><span className="text-red-500">{"❌"}</span></td>
                    <td className="text-center py-3 px-3"><span className="text-red-500">{"❌"}</span></td>
                    <td className="text-center py-3 px-3 bg-amber-50/30"><span className="text-green-600">{"✅"}</span></td>
                  </tr>
                  {/* Recommandations IA */}
                  <tr className="border-b">
                    <td className="py-3 px-3 font-medium">{"Recommandations IA"}</td>
                    <td className="text-center py-3 px-3"><span className="text-red-500">{"❌"}</span></td>
                    <td className="text-center py-3 px-3"><span className="text-red-500">{"❌"}</span></td>
                    <td className="text-center py-3 px-3"><span className="text-green-600">{"✅"}</span></td>
                    <td className="text-center py-3 px-3 bg-amber-50/30"><span className="text-green-600">{"✅"}</span></td>
                  </tr>
                  {/* Publication multi-plateforme */}
                  <tr className="border-b">
                    <td className="py-3 px-3 font-medium">{"Publication multi-plateforme"}</td>
                    <td className="text-center py-3 px-3"><span className="text-red-500">{"❌"}</span></td>
                    <td className="text-center py-3 px-3"><span className="text-red-500">{"❌"}</span></td>
                    <td className="text-center py-3 px-3"><span className="text-green-600">{"✅"}</span> IG + LinkedIn</td>
                    <td className="text-center py-3 px-3 bg-amber-50/30"><span className="text-green-600">{"✅"}</span> IG + TikTok + LinkedIn</td>
                  </tr>
                  {/* Galerie organisée */}
                  <tr className="border-b">
                    <td className="py-3 px-3 font-medium">{"Galerie organisée"}</td>
                    <td className="text-center py-3 px-3"><span className="text-red-500">{"❌"}</span> Historique chat</td>
                    <td className="text-center py-3 px-3"><span className="text-red-500">{"❌"}</span> Historique chat</td>
                    <td className="text-center py-3 px-3"><span className="text-green-600">{"✅"}</span></td>
                    <td className="text-center py-3 px-3 bg-amber-50/30"><span className="text-green-600">{"✅"}</span></td>
                  </tr>
                  {/* Retouche visuelle */}
                  <tr className="border-b">
                    <td className="py-3 px-3 font-medium">{"Retouche visuelle"}</td>
                    <td className="text-center py-3 px-3"><span className="text-red-500">{"❌"}</span> Regénérer</td>
                    <td className="text-center py-3 px-3"><span className="text-red-500">{"❌"}</span> Regénérer</td>
                    <td className="text-center py-3 px-3"><span className="text-green-600">{"✅"}</span> Lumière, ambiance</td>
                    <td className="text-center py-3 px-3 bg-amber-50/30"><span className="text-green-600">{"✅"}</span> Lumière, ambiance</td>
                  </tr>
                  {/* Support */}
                  <tr>
                    <td className="py-3 px-3 font-medium">{"Support"}</td>
                    <td className="text-center py-3 px-3"><span className="text-red-500">{"❌"}</span></td>
                    <td className="text-center py-3 px-3"><span className="text-red-500">{"❌"}</span></td>
                    <td className="text-center py-3 px-3">Email 48h</td>
                    <td className="text-center py-3 px-3 bg-amber-50/30"><strong>Prioritaire 12h</strong></td>
                  </tr>
                </tbody>
              </table>
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
        <div className="mt-16 bg-gradient-to-br from-purple-50 via-[#0c1a3a]/5 to-cyan-50 rounded-3xl border-2 border-purple-200 p-8 md:p-12">
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
          <div className="mt-8 grid grid-cols-3 gap-4 max-w-2xl mx-auto text-center">
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
        </FadeUp>

        {/* CTA Final */}
        <FadeUp>
        <div className="mt-20 text-center bg-gradient-to-r from-[#0c1a3a] to-[#1e3a5f] rounded-3xl p-12">
          <h2 className="text-4xl font-bold text-white mb-4">
            {t.pricing.ctaTitle}
          </h2>
          <p className="text-xl text-[#0c1a3a]/60 mb-8 max-w-2xl mx-auto">
            {t.pricing.ctaSubtitle}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/generate"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-[#0c1a3a] font-bold rounded-xl hover:bg-[#0c1a3a]/5 transition-all text-lg shadow-xl hover:shadow-2xl hover:scale-105"
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
          <p className="text-[#0c1a3a]/60 text-sm mt-4">{t.pricing.foundersNote}</p>
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
