'use client';

import Link from 'next/link';
import { useState } from 'react';
import FeedbackPopup from '@/components/FeedbackPopup';
import FeedbackModal from '@/components/FeedbackModal';
import { useFeedbackPopup } from '@/hooks/useFeedbackPopup';
import { startCheckout } from '@/lib/stripe/checkout';
import { FadeUp, ScaleIn, StaggerContainer, StaggerItem } from '@/components/ui/motion';
import { AnimatedGradientBG } from '@/components/ui/animated-gradient-bg';

function ContactFormPricing() {
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
        <h3 className="font-bold text-neutral-900 mb-1">Message envoyé !</h3>
        <p className="text-sm text-neutral-600">Nous vous répondrons dans les 24h.</p>
        <button
          onClick={() => setSent(false)}
          className="mt-3 text-sm text-blue-600 hover:underline"
        >
          Envoyer un autre message
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
          <h3 className="font-bold text-neutral-900">Écrivez-nous</h3>
          <p className="text-xs text-neutral-500">Réponse sous 24h</p>
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
          <option value="">Sujet de votre message...</option>
          <option value="Question tarifs">Question sur les tarifs</option>
          <option value="Démonstration">Demande de démonstration</option>
          <option value="Partenariat">Partenariat</option>
          <option value="Autre">Autre</option>
        </select>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          rows={3}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          placeholder="Votre message..."
        />

        <button
          type="submit"
          disabled={sending}
          className="w-full px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {sending ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Envoi...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Envoyer le message
            </>
          )}
        </button>
      </form>
    </div>
  );
}

function PricingPageInner() {
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
            Offre de lancement - 50 places Fondateurs
          </div></ScaleIn>
          <h1 className="text-5xl font-bold mb-6">
            Choisissez votre plan et{' '}
            <span className="bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
              décuplez votre visibilité
            </span>
          </h1>
          <p className="text-xl text-neutral-600 max-w-3xl mx-auto">
            Commencez gratuitement avec 3 visuels, testez pendant 3 jours à 4.99€,
            ou rejoignez les Fondateurs pour verrouiller un prix à vie.
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
              Mensuel
            </button>
            <button
              onClick={() => setBillingPeriod('annual')}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all relative ${
                billingPeriod === 'annual'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Annuel
              <span className="absolute -top-2.5 -right-2 bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                -17%
              </span>
            </button>
          </div>
          {billingPeriod === 'annual' && (
            <p className="mt-3 text-sm text-green-600 font-medium">2 mois offerts sur tous les plans !</p>
          )}
        </div>
        </FadeUp>

        {/* Top Plans - Gratuit & Essai */}
        <StaggerContainer className="grid md:grid-cols-2 gap-6 mb-10 max-w-4xl mx-auto">
          {/* Plan Gratuit */}
          <StaggerItem><div className="bg-white rounded-2xl border-2 border-neutral-200 p-6 relative hover:shadow-xl hover:-translate-y-2 transition-all duration-300">
            <div className="absolute -top-3 left-4">
              <span className="bg-neutral-100 text-neutral-600 px-3 py-1 rounded-full text-xs font-medium">
                Pour découvrir
              </span>
            </div>
            <div className="mb-6 pt-2">
              <h3 className="text-2xl font-bold mb-2 flex items-center gap-2">
                <span>🎁</span> Gratuit
              </h3>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-5xl font-bold">0€</span>
                <span className="text-neutral-500">/toujours</span>
              </div>
              <p className="text-neutral-600 text-sm">15 crédits — 3 images/mois avec watermark</p>
            </div>

            <ul className="space-y-4 mb-8">
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-neutral-700"><strong>15 crédits</strong> — 3 images avec watermark</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-neutral-700">Accès aux actualités par catégories</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-neutral-700">Export format réseaux sociaux</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-neutral-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-sm text-neutral-400">Sans watermark</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-neutral-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-sm text-neutral-400">Génération vidéo</span>
              </li>
            </ul>

            <Link
              href="/generate"
              className="block w-full py-3 px-6 text-center rounded-xl border-2 border-neutral-300 text-neutral-700 font-medium hover:border-neutral-400 hover:bg-neutral-50 transition-all"
            >
              Essayer gratuitement
            </Link>
          </div></StaggerItem>

          {/* Sprint Fondateur 3 jours */}
          <StaggerItem><div className="bg-white rounded-2xl border-2 border-blue-300 p-6 relative hover:shadow-xl hover:-translate-y-2 transition-all duration-300">
            <div className="absolute -top-3 left-4">
              <span className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-3 py-1 rounded-full text-xs font-bold">
                ⚡ Sprint intensif
              </span>
            </div>
            <div className="mb-6 pt-2">
              <h3 className="text-2xl font-bold mb-2 flex items-center gap-2">
                <span>⚡</span> Sprint Fondateur
              </h3>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">4.99€</span>
                <span className="text-neutral-500">/3 jours</span>
              </div>
              <p className="text-neutral-600 text-sm font-medium">110 crédits — teste intensément, décide vite</p>
            </div>

            <ul className="space-y-4 mb-8">
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-neutral-700"><strong>Toutes les fonctionnalités</strong> Fondateurs</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-cyan-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-neutral-700"><strong>TikTok débloqué</strong> 🎵 (Instagram + TikTok)</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-neutral-700"><strong>110 crédits</strong> (~22 images ou 4 vidéos)</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-neutral-700">Assistant IA + Analytics 2 plateformes</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-neutral-700"><strong>4.99€ déduits</strong> si tu continues (payes 144.01€ au lieu de 149€)</span>
              </li>
            </ul>

            <button
              onClick={() => startCheckout('sprint')}
              className="block w-full py-3 px-6 text-center rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 text-white font-bold hover:shadow-lg transition-all hover:scale-105"
            >
              Démarrer le Sprint 3 jours ⚡
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
                <span className="text-4xl">🎵</span> Débloquez TikTok : La Croissance Virale
              </h3>
              <p className="text-xl text-cyan-100 font-medium">
                Débloqué à partir du plan Pro (89€/mois)
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-4 mb-6">
              <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 border border-white/30">
                <div className="text-3xl font-bold mb-1">10x</div>
                <div className="text-sm text-cyan-100">Plus de reach organique qu'Instagram</div>
              </div>
              <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 border border-white/30">
                <div className="text-3xl font-bold mb-1">100k+</div>
                <div className="text-sm text-cyan-100">Vues gratuites sur 1 vidéo virale</div>
              </div>
              <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 border border-white/30">
                <div className="text-3xl font-bold mb-1">2x</div>
                <div className="text-sm text-cyan-100">Visibilité totale (Instagram + TikTok)</div>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/30">
              <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
                <span>💎</span> Pourquoi TikTok change tout :
              </h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-cyan-300">✓</span>
                  <span><strong>Algorithme favorise les nouveaux créateurs</strong> - Tu pars sur un pied d'égalité</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-300">✓</span>
                  <span><strong>Public jeune + engagé + acheteur</strong> - Taux de conversion supérieur</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-300">✓</span>
                  <span><strong>1 client via TikTok = abonnement remboursé</strong> - ROI immédiat</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-300">✓</span>
                  <span><strong>Conversion image → vidéo automatique</strong> - Aucune compétence technique requise</span>
                </li>
              </ul>
            </div>

            <div className="text-center mt-6">
              <p className="text-sm text-cyan-100">
                🔥 Prix Fondateurs verrouillé à vie - TikTok inclus maintenant <strong>ET</strong> dans le futur
              </p>
            </div>
          </div>
        </div>
        </FadeUp>

        {/* Premium Plans */}
        <FadeUp><h3 className="text-2xl font-bold text-center mb-2">Plans Premium</h3>
        <p className="text-center text-neutral-600 mb-8">Chaque plan débloque de nouvelles fonctionnalités</p></FadeUp>

        <StaggerContainer className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {/* Solo 49€ */}
          <StaggerItem><div className="bg-white rounded-2xl border-2 border-neutral-200 p-6 hover:shadow-xl hover:-translate-y-2 transition-all duration-300 flex flex-col">
            <div className="mb-4">
              <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                <span>🚀</span> Solo
              </h3>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-4xl font-bold">{billingPeriod === 'annual' ? '490€' : '49€'}</span>
                <span className="text-neutral-500">{billingPeriod === 'annual' ? '/an' : '/mois'}</span>
                {billingPeriod === 'annual' && <span className="text-xs text-green-600 font-semibold">soit 40,83€/mois</span>}
              </div>
              <p className="text-neutral-600 text-sm"><strong>220 crédits</strong> — ~2 campagnes/semaine</p>
            </div>
            <ul className="space-y-3 mb-6 text-sm flex-1">
              <li className="flex gap-2"><span className="text-blue-500">✓</span> <strong>220 crédits/mois</strong></li>
              <li className="flex gap-2"><span className="text-blue-500">✓</span> Images + vidéos <strong>sans watermark</strong></li>
              <li className="flex gap-2"><span className="text-blue-500">✓</span> Suggestions texte IA</li>
              <li className="flex gap-2"><span className="text-blue-500">✓</span> Assistant IA Marketing</li>
              <li className="flex gap-2"><span className="text-blue-500">✓</span> Publication <strong>Instagram + LinkedIn</strong></li>
              <li className="flex gap-2"><span className="text-blue-500">✓</span> Toutes catégories actualités</li>
              <li className="flex gap-2"><span className="text-blue-500">✓</span> Tous styles visuels</li>
              <li className="flex gap-2"><span className="text-blue-500">✓</span> Calendrier publications</li>
              <li className="flex gap-2 text-neutral-400"><span className="text-neutral-300">✗</span> TikTok, Stories, Audio <span className="text-xs">(Pro+)</span></li>
            </ul>
            <div className="mt-auto space-y-2">
              <button onClick={() => startCheckout(billingPeriod === 'annual' ? 'solo_annual' : 'solo')} className="block w-full py-3 text-center rounded-xl border-2 border-neutral-300 text-neutral-700 font-medium hover:bg-neutral-50 transition-all">
                Choisir Solo {billingPeriod === 'annual' ? '(annuel)' : ''}
              </button>
              <p className="text-xs text-center text-neutral-500">
                3 campagnes/sem + TikTok ? <a href="#pro" className="text-purple-600 hover:underline font-semibold">Passez Pro →</a>
              </p>
            </div>
          </div></StaggerItem>

          {/* Pro 89€ */}
          <StaggerItem><div id="pro" className="bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl p-6 text-white relative hover:shadow-2xl transition-all transform hover:scale-105 flex flex-col">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <span className="bg-purple-900 text-purple-100 px-4 py-1 rounded-full text-xs font-bold shadow-lg">
                Populaire
              </span>
            </div>
            <div className="mb-4 pt-2">
              <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                <span>💎</span> Pro
              </h3>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-4xl font-bold">{billingPeriod === 'annual' ? '890€' : '89€'}</span>
                <span className="text-purple-200">{billingPeriod === 'annual' ? '/an' : '/mois'}</span>
                {billingPeriod === 'annual' && <span className="text-xs text-purple-200 font-semibold">soit 74€/mois</span>}
              </div>
              <p className="text-purple-200 text-sm font-medium"><strong>400 crédits</strong> — ~3 campagnes/semaine</p>
            </div>

            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-3 mb-4 border border-white/30">
              <p className="text-xs font-semibold">Tout Solo + TikTok + Stories + Audio</p>
            </div>

            <ul className="space-y-3 mb-6 text-sm flex-1">
              <li className="flex gap-2"><span className="text-purple-300">✓</span> <strong>400 crédits/mois</strong></li>
              <li className="flex gap-2"><span className="text-purple-300">✓</span> Tout ce qui est dans Solo +</li>
              <li className="flex gap-2 items-start"><span className="text-cyan-300 flex-shrink-0">★</span> <span><strong>TikTok débloqué</strong> 🎵</span></li>
              <li className="flex gap-2"><span className="text-cyan-300">★</span> <strong>Stories Instagram</strong></li>
              <li className="flex gap-2"><span className="text-cyan-300">★</span> <strong>Audio narration IA</strong></li>
              <li className="flex gap-2"><span className="text-cyan-300">★</span> <strong>Analytics Instagram</strong></li>
              <li className="flex gap-2 text-purple-300/60"><span className="text-purple-400/40">✗</span> Analytics multi-plateforme <span className="text-xs">(Fondateurs+)</span></li>
            </ul>
            <button onClick={() => startCheckout(billingPeriod === 'annual' ? 'pro_annual' : 'pro')} className="block w-full py-3 text-center rounded-xl bg-white text-purple-600 font-bold hover:bg-purple-50 transition-all shadow-lg mt-auto">
              {billingPeriod === 'annual' ? 'Pro annuel (-17%)' : 'Débloquer TikTok + Audio'}
            </button>
            <p className="text-xs text-center text-purple-200 mt-2">
              Plus de volume + analytics ? <a href="#fondateurs" className="text-cyan-300 hover:underline font-semibold">Fondateurs Pro →</a>
            </p>
          </div></StaggerItem>

          {/* Fondateurs Pro 149€ - HIGHLIGHT */}
          <StaggerItem><div id="fondateurs" className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl p-6 text-white relative hover:shadow-2xl transition-all transform hover:scale-105 flex flex-col animate-glow">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <span className="bg-amber-900 text-amber-100 px-4 py-1 rounded-full text-xs font-bold shadow-lg">
                ⭐ #1 — 50 places
              </span>
            </div>
            <div className="mb-4 pt-2">
              <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                <span>⭐</span> Fondateurs Pro
              </h3>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-4xl font-bold">{billingPeriod === 'annual' ? '1 490€' : '149€'}</span>
                <span className="text-amber-100">{billingPeriod === 'annual' ? '/an' : '/mois'}</span>
                {billingPeriod === 'annual' && <span className="text-xs text-yellow-200 font-semibold">soit 124€/mois</span>}
              </div>
              <p className="text-amber-100 text-sm font-medium"><strong>660 crédits</strong> — ~4 campagnes/semaine</p>
            </div>

            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-3 mb-4 border border-white/30">
              <p className="text-xs font-semibold">Tout Pro + Analytics complet + Planif auto + Prix bloqué</p>
            </div>

            <ul className="space-y-3 mb-6 text-sm flex-1">
              <li className="flex gap-2"><span className="text-yellow-300">✓</span> <strong>660 crédits/mois</strong></li>
              <li className="flex gap-2"><span className="text-yellow-300">✓</span> Tout ce qui est dans Pro +</li>
              <li className="flex gap-2"><span className="text-yellow-200">★</span> <strong>Analytics Instagram + TikTok + LinkedIn</strong></li>
              <li className="flex gap-2"><span className="text-yellow-200">★</span> <strong>Planification automatique</strong></li>
              <li className="flex gap-2"><span className="text-yellow-200">★</span> <strong>Support prioritaire</strong></li>
              <li className="flex gap-2"><span className="text-yellow-200">★</span> <strong>Démo personnalisée offerte</strong></li>
              <li className="flex gap-2"><span className="text-yellow-200">★</span> <strong>Prix verrouillé à vie</strong></li>
            </ul>
            <button onClick={() => startCheckout(billingPeriod === 'annual' ? 'fondateurs_annual' : 'fondateurs')} className="block w-full py-3 text-center rounded-xl bg-white text-amber-600 font-bold hover:bg-amber-50 transition-all shadow-lg mt-auto">
              {billingPeriod === 'annual' ? 'Fondateurs Pro annuel (-17%)' : 'Devenir Fondateur Pro'}
            </button>
            <p className="text-center text-amber-100 text-xs mt-2">🎯 Puis 199€/mois après les 50 premiers</p>
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
                <span>🏢</span> Business
              </h3>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-4xl font-bold">{billingPeriod === 'annual' ? '3 490€' : '349€'}</span>
                <span className="text-blue-100">{billingPeriod === 'annual' ? '/an' : '/mois'}</span>
                {billingPeriod === 'annual' && <span className="text-xs text-cyan-200 font-semibold">soit 290€/mois</span>}
              </div>
              <p className="text-blue-100 text-sm"><strong>1 750 crédits</strong> — contenu quotidien multi-clients</p>
            </div>

            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-3 mb-4 border border-white/30">
              <p className="text-xs font-semibold">Tout Fondateurs Pro + Multi-comptes + Équipe</p>
            </div>

            <ul className="space-y-3 mb-6 text-sm flex-1">
              <li className="flex gap-2"><span className="text-cyan-300">✓</span> <strong>1 750 crédits/mois</strong></li>
              <li className="flex gap-2"><span className="text-cyan-300">✓</span> Tout Fondateurs Pro +</li>
              <li className="flex gap-2"><span className="text-cyan-200">★</span> <strong>Multi-comptes (1+5 clients)</strong></li>
              <li className="flex gap-2"><span className="text-cyan-200">★</span> <strong>Calendrier collaboratif</strong></li>
              <li className="flex gap-2"><span className="text-cyan-200">★</span> <strong>Workflow validation équipe</strong></li>
              <li className="flex gap-2"><span className="text-cyan-200">★</span> <strong>Reporting PDF brandé</strong></li>
            </ul>
            <button onClick={() => startCheckout(billingPeriod === 'annual' ? 'business_annual' : 'business')} className="block w-full py-3 text-center rounded-xl bg-white text-blue-600 font-bold hover:bg-blue-50 transition-all mt-auto">
              Choisir Business {billingPeriod === 'annual' ? '(annuel)' : ''}
            </button>
            <p className="text-center text-blue-100 text-xs mt-2">Démo personnalisée incluse</p>
          </div></StaggerItem>
        </StaggerContainer>

        {/* Elite - Bandeau séparé */}
        <FadeUp>
        <div className="bg-white rounded-2xl border-2 border-amber-200 p-6 mb-16 max-w-3xl mx-auto hover:shadow-xl transition-all">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="flex-1">
              <h3 className="text-xl font-bold mb-1 flex items-center gap-2"><span>🏆</span> Elite — 999€/mois</h3>
              <p className="text-neutral-600 text-sm mb-3"><strong>5 500 crédits</strong> — Tout Business + Account Manager dédié, consulting stratégique 2h/mois, features custom, formation équipe, SLA 99.9%</p>
            </div>
            <button onClick={() => startCheckout(billingPeriod === 'annual' ? 'elite_annual' : 'elite')} className="px-6 py-3 border-2 border-amber-300 text-amber-700 font-semibold rounded-xl hover:bg-amber-50 transition-all whitespace-nowrap">
              Contacter pour Elite
            </button>
          </div>
        </div>
        </FadeUp>

        {/* Inclus gratuitement */}
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl border border-green-200 p-6 mb-10">
          <h3 className="text-lg font-bold text-green-900 mb-3 flex items-center gap-2">
            <span>🎁</span> Inclus gratuitement avec tous les plans
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {['Dashboard analytics', 'Masterclass marketing', 'Galerie & bibliothèque', 'Publication réseaux sociaux', 'Conversion vidéo'].map((item) => (
              <div key={item} className="flex items-center gap-2 bg-white/70 rounded-lg px-3 py-2">
                <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                <span className="text-xs font-medium text-green-800">{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Grille crédits */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-6 mb-10">
          <h3 className="text-lg font-bold text-neutral-900 mb-4 text-center">Coût en crédits par action</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-sm">
            <div className="p-3 bg-blue-50 rounded-lg"><p className="font-bold text-blue-700">5 cr</p><p className="text-xs text-neutral-600">Image</p></div>
            <div className="p-3 bg-blue-50 rounded-lg"><p className="font-bold text-blue-700">3 cr</p><p className="text-xs text-neutral-600">Retouche image</p></div>
            <div className="p-3 bg-purple-50 rounded-lg"><p className="font-bold text-purple-700">25 cr</p><p className="text-xs text-neutral-600">Vidéo 5s</p></div>
            <div className="p-3 bg-purple-50 rounded-lg"><p className="font-bold text-purple-700">40 cr</p><p className="text-xs text-neutral-600">Vidéo 10s</p></div>
            <div className="p-3 bg-green-50 rounded-lg"><p className="font-bold text-green-700">1 cr</p><p className="text-xs text-neutral-600">Suggestion IA</p></div>
            <div className="p-3 bg-green-50 rounded-lg"><p className="font-bold text-green-700">1 cr</p><p className="text-xs text-neutral-600">Audio narration</p></div>
            <div className="p-3 bg-green-50 rounded-lg"><p className="font-bold text-green-700">1 cr</p><p className="text-xs text-neutral-600">Assistant marketing</p></div>
          </div>
        </div>

        {/* Comparatif rapide */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-8 mb-16">
          <h3 className="text-2xl font-bold text-center mb-2">Comparatif des plans</h3>
          <p className="text-center text-neutral-500 text-sm mb-8">Chaque plan débloque de nouvelles fonctionnalités — les crédits s{"'"}utilisent librement</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2">Fonctionnalité</th>
                  <th className="text-center py-3 px-2">Gratuit</th>
                  <th className="text-center py-3 px-2">Solo</th>
                  <th className="text-center py-3 px-2 bg-purple-50">Pro</th>
                  <th className="text-center py-3 px-2 bg-amber-50">Fondateurs Pro</th>
                  <th className="text-center py-3 px-2">Business</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b bg-blue-50/30">
                  <td className="py-3 px-2 font-medium">Crédits/mois</td>
                  <td className="text-center py-3 px-2">15</td>
                  <td className="text-center py-3 px-2"><strong>220</strong></td>
                  <td className="text-center py-3 px-2 bg-purple-50"><strong>400</strong></td>
                  <td className="text-center py-3 px-2 bg-amber-50"><strong>660</strong></td>
                  <td className="text-center py-3 px-2"><strong>1 750</strong></td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">Rythme de publication</td>
                  <td className="text-center py-3 px-2 text-neutral-400">test</td>
                  <td className="text-center py-3 px-2">~2/semaine</td>
                  <td className="text-center py-3 px-2 bg-purple-50"><strong>~3/semaine</strong></td>
                  <td className="text-center py-3 px-2 bg-amber-50"><strong>~4/semaine</strong></td>
                  <td className="text-center py-3 px-2"><strong>quotidien</strong></td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">Images + Vidéos IA</td>
                  <td className="text-center py-3 px-2">3 (watermark)</td>
                  <td className="text-center py-3 px-2 text-blue-600">✓ sans watermark</td>
                  <td className="text-center py-3 px-2 bg-purple-50 text-purple-600">✓</td>
                  <td className="text-center py-3 px-2 bg-amber-50 text-amber-600">✓</td>
                  <td className="text-center py-3 px-2 text-blue-600">✓</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">Suggestions texte + Assistant IA</td>
                  <td className="text-center py-3 px-2 text-neutral-400">—</td>
                  <td className="text-center py-3 px-2 text-blue-600">✓</td>
                  <td className="text-center py-3 px-2 bg-purple-50 text-purple-600">✓</td>
                  <td className="text-center py-3 px-2 bg-amber-50 text-amber-600">✓</td>
                  <td className="text-center py-3 px-2 text-blue-600">✓</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">Instagram</td>
                  <td className="text-center py-3 px-2 text-neutral-400">—</td>
                  <td className="text-center py-3 px-2">Post</td>
                  <td className="text-center py-3 px-2 bg-purple-50"><strong className="text-purple-600">Post + Story</strong></td>
                  <td className="text-center py-3 px-2 bg-amber-50">Post + Story</td>
                  <td className="text-center py-3 px-2">Post + Story</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">LinkedIn</td>
                  <td className="text-center py-3 px-2 text-neutral-400">—</td>
                  <td className="text-center py-3 px-2 text-blue-600">✓</td>
                  <td className="text-center py-3 px-2 bg-purple-50 text-purple-600">✓</td>
                  <td className="text-center py-3 px-2 bg-amber-50 text-amber-600">✓</td>
                  <td className="text-center py-3 px-2 text-blue-600">✓</td>
                </tr>
                <tr className="border-b bg-cyan-50/30">
                  <td className="py-3 px-2 font-medium">🎵 TikTok</td>
                  <td className="text-center py-3 px-2 text-neutral-400">—</td>
                  <td className="text-center py-3 px-2 text-neutral-400">—</td>
                  <td className="text-center py-3 px-2 bg-purple-50"><strong className="text-cyan-600">✓ Débloqué</strong></td>
                  <td className="text-center py-3 px-2 bg-amber-50 text-cyan-600">✓</td>
                  <td className="text-center py-3 px-2 text-cyan-600">✓</td>
                </tr>
                <tr className="border-b bg-cyan-50/30">
                  <td className="py-3 px-2 font-medium">🎙️ Audio narration IA</td>
                  <td className="text-center py-3 px-2 text-neutral-400">—</td>
                  <td className="text-center py-3 px-2 text-neutral-400">—</td>
                  <td className="text-center py-3 px-2 bg-purple-50"><strong className="text-purple-600">✓ Débloqué</strong></td>
                  <td className="text-center py-3 px-2 bg-amber-50 text-amber-600">✓</td>
                  <td className="text-center py-3 px-2 text-blue-600">✓</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">Analytics</td>
                  <td className="text-center py-3 px-2 text-neutral-400">—</td>
                  <td className="text-center py-3 px-2 text-neutral-400">—</td>
                  <td className="text-center py-3 px-2 bg-purple-50">Instagram</td>
                  <td className="text-center py-3 px-2 bg-amber-50"><strong className="text-amber-600">Multi-plateforme</strong></td>
                  <td className="text-center py-3 px-2">Multi-plateforme</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">Calendrier</td>
                  <td className="text-center py-3 px-2 text-neutral-400">—</td>
                  <td className="text-center py-3 px-2">Basique</td>
                  <td className="text-center py-3 px-2 bg-purple-50">Planning</td>
                  <td className="text-center py-3 px-2 bg-amber-50"><strong className="text-amber-600">Planif. auto</strong></td>
                  <td className="text-center py-3 px-2">Collaboratif</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">Multi-comptes</td>
                  <td className="text-center py-3 px-2 text-neutral-400">—</td>
                  <td className="text-center py-3 px-2 text-neutral-400">—</td>
                  <td className="text-center py-3 px-2 bg-purple-50 text-neutral-400">—</td>
                  <td className="text-center py-3 px-2 bg-amber-50 text-neutral-400">—</td>
                  <td className="text-center py-3 px-2"><strong>1+5 clients</strong></td>
                </tr>
                <tr>
                  <td className="py-3 px-2 font-medium">Prix</td>
                  <td className="text-center py-3 px-2 font-bold">0€</td>
                  <td className="text-center py-3 px-2 font-bold">49€</td>
                  <td className="text-center py-3 px-2 bg-purple-50 font-bold text-purple-600">89€</td>
                  <td className="text-center py-3 px-2 bg-amber-50 font-bold text-amber-600">149€*</td>
                  <td className="text-center py-3 px-2 font-bold text-blue-600">349€</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-neutral-500 text-center mt-4">* Prix Fondateurs Pro : 149€ pour les 50 premiers, puis 199€ · Tous les crédits s{"'"}utilisent librement : 1 image = 5 cr · 1 vidéo 5s = 25 cr · 1 suggestion = 1 cr · Report 1 mois</p>
        </div>

        {/* Comparateur Keiro vs. Prestataires */}
        <FadeUp>
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-8 md:p-12 mb-16 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-72 h-72 bg-blue-500/10 rounded-full -mr-36 -mt-36 blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-56 h-56 bg-cyan-500/10 rounded-full -ml-28 -mb-28 blur-3xl"></div>

          <div className="relative z-10">
            <div className="text-center mb-8">
              <h3 className="text-2xl md:text-3xl font-bold mb-2">
                Pourquoi payer <span className="text-red-400">3 300€/mois</span> quand vous pouvez payer <span className="text-cyan-400">149€</span> ?
              </h3>
              <p className="text-slate-300">Graphiste freelance + Community Manager vs. KeiroAI Fondateurs</p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-8">
              {/* Colonne prestataires */}
              <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                    <span className="text-red-400 text-lg">✗</span>
                  </div>
                  <div>
                    <h4 className="font-bold">Graphiste + CM</h4>
                    <p className="text-2xl font-bold text-red-400">~3 300€<span className="text-sm font-normal text-slate-400">/mois</span></p>
                  </div>
                </div>
                <ul className="space-y-2.5 text-sm text-slate-300">
                  <li className="flex gap-2"><span className="text-red-400">✗</span> Délai 2-5 jours par visuel</li>
                  <li className="flex gap-2"><span className="text-red-400">✗</span> Modifications facturées en supplément</li>
                  <li className="flex gap-2"><span className="text-red-400">✗</span> ~4 campagnes/mois max</li>
                  <li className="flex gap-2"><span className="text-red-400">✗</span> 0 vidéo incluse (supplément ~500€)</li>
                  <li className="flex gap-2"><span className="text-red-400">✗</span> 1 seul réseau géré</li>
                  <li className="flex gap-2"><span className="text-red-400">✗</span> Congés, absences, retards</li>
                  <li className="flex gap-2"><span className="text-red-400">✗</span> Aucune réactivité sur l{"'"}actu</li>
                </ul>
              </div>

              {/* Colonne KeiroAI */}
              <div className="bg-gradient-to-br from-blue-500/20 to-cyan-500/20 backdrop-blur-sm rounded-2xl border border-cyan-400/30 p-6 shadow-lg shadow-cyan-500/10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-cyan-500/20 rounded-lg flex items-center justify-center">
                    <span className="text-cyan-400 text-lg">✓</span>
                  </div>
                  <div>
                    <h4 className="font-bold">KeiroAI Fondateurs</h4>
                    <p className="text-2xl font-bold text-cyan-400">149€<span className="text-sm font-normal text-slate-400">/mois</span></p>
                  </div>
                </div>
                <ul className="space-y-2.5 text-sm text-slate-200">
                  <li className="flex gap-2"><span className="text-cyan-400 font-bold">✓</span> <strong>5 minutes</strong> par visuel</li>
                  <li className="flex gap-2"><span className="text-cyan-400 font-bold">✓</span> Modifications <strong>illimitées</strong> et instantanées</li>
                  <li className="flex gap-2"><span className="text-cyan-400 font-bold">✓</span> <strong>~4 campagnes/semaine</strong> (16/mois)</li>
                  <li className="flex gap-2"><span className="text-cyan-400 font-bold">✓</span> Vidéo + audio + texte IA inclus</li>
                  <li className="flex gap-2"><span className="text-cyan-400 font-bold">✓</span> <strong>Instagram + TikTok + LinkedIn</strong></li>
                  <li className="flex gap-2"><span className="text-cyan-400 font-bold">✓</span> Disponible 24/7, jamais en congé</li>
                  <li className="flex gap-2"><span className="text-cyan-400 font-bold">✓</span> Visuels <strong>basés sur l{"'"}actu</strong> du jour</li>
                </ul>
              </div>
            </div>

            {/* Barre économie */}
            <div className="bg-green-500/15 backdrop-blur-sm rounded-xl border border-green-400/20 p-4 text-center">
              <p className="text-green-400 font-bold text-lg">
                Économie : <span className="text-2xl">3 151€/mois</span> <span className="text-green-300 font-normal text-sm">(soit 37 812€/an)</span>
              </p>
              <p className="text-slate-400 text-xs mt-1">Basé sur graphiste 1 500€ + CM 1 800€ vs. KeiroAI Fondateurs 149€</p>
            </div>
          </div>
        </div>
        </FadeUp>

        {/* FAQ Section */}
        <FadeUp>
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-10">Questions fréquentes</h2>
          <div className="space-y-4">
            <details className="bg-white rounded-xl p-6 border border-neutral-200">
              <summary className="font-semibold cursor-pointer text-neutral-900">
                Comment fonctionne l'essai 3 jours à 4.99€ ?
              </summary>
              <p className="mt-3 text-neutral-600 text-sm">
                Vous payez 4.99€ pour accéder à toutes les fonctionnalités Fondateurs pendant 3 jours. Si vous continuez,
                ces 4.99€ sont déduits de votre premier mois (vous payez 144.01€ au lieu de 149€). Sinon, aucun engagement - vous gardez vos créations.
              </p>
            </details>

            <details className="bg-white rounded-xl p-6 border border-neutral-200">
              <summary className="font-semibold cursor-pointer text-neutral-900">
                Qu'est-ce que l'offre Fondateurs ?
              </summary>
              <p className="mt-3 text-neutral-600 text-sm">
                <strong>Les 50 premières places bénéficient du tarif de 149€/mois verrouillé à vie.</strong>
                Après les 50 premiers, le prix passera à 199€/mois. Tant que vous restez abonné parmi les 50 premiers,
                votre prix de 149€ ne changera jamais. Vous bénéficiez également d'une démo personnalisée offerte pour vous accompagner.
              </p>
            </details>

            <details className="bg-white rounded-xl p-6 border border-neutral-200">
              <summary className="font-semibold cursor-pointer text-neutral-900">
                Puis-je annuler à tout moment ?
              </summary>
              <p className="mt-3 text-neutral-600 text-sm">
                Oui, absolument ! Tous nos plans sont sans engagement. Vous pouvez annuler à tout moment en 1 clic depuis votre espace.
                Tous les plans incluent une garantie satisfait ou remboursé 30 jours.
              </p>
            </details>

            <details className="bg-white rounded-xl p-6 border border-neutral-200">
              <summary className="font-semibold cursor-pointer text-neutral-900">
                Les visuels m'appartiennent-ils ?
              </summary>
              <p className="mt-3 text-neutral-600 text-sm">
                Oui ! Tous les visuels et vidéos que vous générez avec Keiro vous appartiennent. Vous pouvez les utiliser librement
                pour vos réseaux sociaux, votre site web, vos campagnes publicitaires, etc.
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
              Une question ? Besoin d'aide ?
            </h2>
            <p className="text-neutral-600 max-w-2xl mx-auto">
              Notre équipe est là pour vous accompagner dans votre choix et répondre à toutes vos questions. Contactez-nous gratuitement.
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
                  <h3 className="font-bold text-neutral-900 mb-2">Appel téléphonique</h3>
                  <p className="text-sm text-neutral-600 mb-3">
                    Bookez un appel gratuit de 15-30 minutes pour discuter de vos besoins et découvrir comment Keiro peut vous aider.
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
                    Prendre rendez-vous
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
              <p className="text-xs text-neutral-600">Réponse moyenne</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">98%</p>
              <p className="text-xs text-neutral-600">Satisfaction client</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-cyan-600">7j/7</p>
              <p className="text-xs text-neutral-600">Disponibilité</p>
            </div>
          </div>
        </div>
        </FadeUp>

        {/* CTA Final */}
        <FadeUp>
        <div className="mt-20 text-center bg-gradient-to-r from-blue-600 to-cyan-600 rounded-3xl p-12">
          <h2 className="text-4xl font-bold text-white mb-4">
            Prêt à transformer votre communication ?
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Rejoignez les créateurs qui utilisent déjà Keiro pour booster leur présence en ligne.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/generate"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-blue-600 font-bold rounded-xl hover:bg-blue-50 transition-all text-lg shadow-xl hover:shadow-2xl hover:scale-105"
            >
              Commencer gratuitement
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link
              href="/generate"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600 transition-all text-lg shadow-xl hover:shadow-2xl hover:scale-105"
            >
              Devenir Fondateur ⭐
            </Link>
          </div>
          <p className="text-blue-100 text-sm mt-4">3 visuels gratuits • Sans carte bancaire • En 2 minutes</p>
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
