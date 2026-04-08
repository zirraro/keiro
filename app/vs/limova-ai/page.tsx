import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'KeiroAI vs Limova AI — Comparaison Marketing IA 2026',
  description:
    'Comparaison detaillee entre KeiroAI et Limova AI : fonctionnalites, prix, agents IA, automatisation marketing. Decouvrez pourquoi KeiroAI est le choix #1 des petits commerces.',
  openGraph: {
    title: 'KeiroAI vs Limova AI — Comparaison Marketing IA 2026',
    description:
      'Quel outil IA choisir pour le marketing de votre commerce ? Comparaison complete entre KeiroAI et Limova AI.',
  },
};

const CHECK = '\u2705';
const CROSS = '\u274C';
const PARTIAL = '\u{1F7E1}';

const features = [
  { name: 'Agents IA specialises', keiro: `${CHECK} 15+ agents (contenu, email, DM, SEO, CRM...)`, limova: `${PARTIAL} Agent unique generaliste` },
  { name: 'Generation de visuels IA', keiro: `${CHECK} Seedream + styles adaptes au metier`, limova: `${PARTIAL} Templates basiques` },
  { name: 'Publication Instagram automatique', keiro: `${CHECK} Feed, Reels, Stories, Carrousels`, limova: `${PARTIAL} Feed uniquement` },
  { name: 'Publication TikTok', keiro: `${CHECK} Upload direct + brouillon`, limova: `${CROSS} Non supporte` },
  { name: 'DM Instagram automatique', keiro: `${CHECK} Prospection + reponses IA`, limova: `${CROSS} Non supporte` },
  { name: 'Email marketing IA', keiro: `${CHECK} Sequences auto via Gmail API`, limova: `${PARTIAL} Emails basiques` },
  { name: 'CRM integre', keiro: `${CHECK} Pipeline, scoring, import Excel`, limova: `${CROSS} Non inclus` },
  { name: 'SEO & Blog IA', keiro: `${CHECK} Articles optimises + mots-cles`, limova: `${PARTIAL} SEO basique` },
  { name: 'Chatbot site web', keiro: `${CHECK} Max — capture leads 24/7`, limova: `${CROSS} Non inclus` },
  { name: 'Agent comptable/finance', keiro: `${CHECK} Louis — suivi depenses/revenus`, limova: `${CROSS} Non inclus` },
  { name: 'Gestion des commentaires', keiro: `${CHECK} Reponses IA Instagram + TikTok`, limova: `${CROSS} Non supporte` },
  { name: 'Reputation Google Avis', keiro: `${CHECK} Reponses automatiques aux avis`, limova: `${CROSS} Non inclus` },
  { name: 'Tendances en temps reel', keiro: `${CHECK} Google Trends + TikTok + Instagram`, limova: `${PARTIAL} Suggestions manuelles` },
  { name: 'Calendrier editorial IA', keiro: `${CHECK} 7 jours auto + planning complet`, limova: `${PARTIAL} Calendrier basique` },
  { name: 'Multi-langues', keiro: `${CHECK} FR, EN, ES, PT, DE, IT, NL`, limova: `${PARTIAL} FR, EN` },
  { name: 'Support & onboarding', keiro: `${CHECK} Agent Milo + chat direct`, limova: `${PARTIAL} Email uniquement` },
];

const pricing = [
  { plan: 'Entree', keiro: '49 euros/mois (Createur)', limova: '~59 euros/mois' },
  { plan: 'Pro', keiro: '99 euros/mois (Pro)', limova: '~129 euros/mois' },
  { plan: 'Business', keiro: '199 euros/mois (Business)', limova: 'Sur devis' },
];

export default function VsLimovaPage() {
  return (
    <div className="min-h-screen bg-[#0c1a3a] text-white">
      {/* Hero */}
      <section className="pt-24 pb-16 px-4 text-center max-w-4xl mx-auto">
        <div className="inline-block px-3 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded-full text-cyan-400 text-xs font-medium mb-6">
          Comparaison 2026
        </div>
        <h1 className="text-3xl sm:text-5xl font-bold mb-6 leading-tight">
          KeiroAI vs Limova AI
        </h1>
        <p className="text-lg text-white/60 max-w-2xl mx-auto leading-relaxed">
          Deux plateformes de marketing IA pour les petits commerces. Laquelle est faite pour vous ?
          Comparaison objective des fonctionnalites, prix et performances.
        </p>
      </section>

      {/* Comparison Table */}
      <section className="max-w-5xl mx-auto px-4 pb-16">
        <div className="rounded-2xl border border-white/10 overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-3 bg-white/5 border-b border-white/10">
            <div className="p-4 text-sm font-semibold text-white/50">Fonctionnalite</div>
            <div className="p-4 text-sm font-bold text-cyan-400 text-center">KeiroAI</div>
            <div className="p-4 text-sm font-semibold text-white/50 text-center">Limova AI</div>
          </div>
          {/* Rows */}
          {features.map((f, i) => (
            <div
              key={i}
              className={`grid grid-cols-3 border-b border-white/5 ${i % 2 === 0 ? 'bg-white/[0.02]' : ''}`}
            >
              <div className="p-4 text-sm text-white/80 font-medium">{f.name}</div>
              <div className="p-4 text-xs text-white/70 text-center">{f.keiro}</div>
              <div className="p-4 text-xs text-white/50 text-center">{f.limova}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing Comparison */}
      <section className="max-w-4xl mx-auto px-4 pb-16">
        <h2 className="text-2xl font-bold text-center mb-8">Comparaison des prix</h2>
        <div className="rounded-2xl border border-white/10 overflow-hidden">
          <div className="grid grid-cols-3 bg-white/5 border-b border-white/10">
            <div className="p-4 text-sm font-semibold text-white/50">Formule</div>
            <div className="p-4 text-sm font-bold text-cyan-400 text-center">KeiroAI</div>
            <div className="p-4 text-sm font-semibold text-white/50 text-center">Limova AI</div>
          </div>
          {pricing.map((p, i) => (
            <div key={i} className={`grid grid-cols-3 border-b border-white/5 ${i % 2 === 0 ? 'bg-white/[0.02]' : ''}`}>
              <div className="p-4 text-sm text-white/80 font-medium">{p.plan}</div>
              <div className="p-4 text-sm text-cyan-400 font-semibold text-center">{p.keiro}</div>
              <div className="p-4 text-sm text-white/50 text-center">{p.limova}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Key Differentiators */}
      <section className="max-w-4xl mx-auto px-4 pb-16">
        <h2 className="text-2xl font-bold text-center mb-8">Pourquoi choisir KeiroAI ?</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            {
              title: '15+ agents specialises',
              desc: 'Chaque agent maitrise son domaine : Lena pour le contenu, Hugo pour les emails, Jade pour les DM, Oscar pour le SEO... Pas un seul agent generaliste.',
            },
            {
              title: 'Tout-en-un sans extras',
              desc: 'CRM, email marketing, chatbot, gestion des avis, calendrier editorial — tout est inclus. Pas besoin de 5 outils differents.',
            },
            {
              title: 'IA adaptee a votre metier',
              desc: 'Coiffeur, restaurant, boutique, coach, fleuriste... KeiroAI connait votre secteur et genere du contenu pertinent des le premier jour.',
            },
            {
              title: 'Prix transparent',
              desc: 'A partir de 49 euros/mois, tout inclus. Pas de frais caches, pas de credits a acheter en plus pour les fonctions essentielles.',
            },
          ].map((d, i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <h3 className="text-sm font-bold text-white mb-2">{d.title}</h3>
              <p className="text-xs text-white/60 leading-relaxed">{d.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-3xl mx-auto px-4 pb-24 text-center">
        <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 p-8">
          <h2 className="text-xl font-bold mb-3">Pret a essayer KeiroAI ?</h2>
          <p className="text-sm text-white/60 mb-6">
            Creez votre compte gratuitement et laissez nos agents IA travailler pour votre business.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/login"
              className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-sm rounded-xl hover:opacity-90 transition"
            >
              Essayer gratuitement
            </Link>
            <Link
              href="/pricing"
              className="px-6 py-3 bg-white/10 text-white/80 font-medium text-sm rounded-xl hover:bg-white/15 transition"
            >
              Voir les tarifs
            </Link>
          </div>
        </div>
      </section>

      {/* SEO FAQ Schema */}
      <section className="max-w-3xl mx-auto px-4 pb-16">
        <h2 className="text-xl font-bold text-center mb-8">Questions frequentes</h2>
        <div className="space-y-4">
          {[
            {
              q: 'Quelle est la difference principale entre KeiroAI et Limova AI ?',
              a: 'KeiroAI propose 15+ agents IA specialises (contenu, email, DM, SEO, CRM, chatbot, finance) avec une automatisation complete, tandis que Limova AI offre un agent unique generaliste. KeiroAI est concu specifiquement pour les petits commerces francais.',
            },
            {
              q: 'KeiroAI est-il moins cher que Limova AI ?',
              a: 'Oui, KeiroAI demarre a 49 euros/mois pour le plan Createur avec 7 agents actifs, contre environ 59 euros/mois pour l\'offre basique de Limova AI avec moins de fonctionnalites.',
            },
            {
              q: 'Peut-on publier sur TikTok avec KeiroAI ?',
              a: 'Oui, KeiroAI supporte la publication directe sur TikTok (videos + brouillons), Instagram (feed, reels, stories, carrousels), et bientot LinkedIn. Limova AI ne supporte pas TikTok.',
            },
            {
              q: 'KeiroAI inclut-il un CRM ?',
              a: 'Oui, KeiroAI integre un CRM complet avec pipeline de vente, scoring de prospects, import Excel, et suivi des interactions email/DM. Le tout est alimente automatiquement par les agents.',
            },
          ].map((faq, i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
              <h3 className="text-sm font-bold text-white mb-2">{faq.q}</h3>
              <p className="text-xs text-white/60 leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
