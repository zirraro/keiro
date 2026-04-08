import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'KeiroAI vs Limova AI — Comparaison Marketing IA 2026',
  description:
    'Comparaison detaillee entre KeiroAI et Limova AI : 15 agents vs 9 agents, prix, CRM, DM Instagram, TikTok. KeiroAI demarre a 49 EUR vs 83 EUR chez Limova.',
  openGraph: {
    title: 'KeiroAI vs Limova AI — Quelle plateforme IA choisir en 2026 ?',
    description:
      'Comparaison complete : agents IA, fonctionnalites, prix. KeiroAI : 15+ agents des 49 EUR/mois. Limova AI : 9 agents des 83 EUR/mois.',
  },
};

const CHECK = '\u2705';
const CROSS = '\u274C';
const PARTIAL = '\u{1F7E1}';

const features = [
  // Core — agents
  { cat: 'Agents IA', name: 'Nombre d\'agents', keiro: `${CHECK} 15+ agents specialises`, limova: `${PARTIAL} 9 agents` },
  { cat: 'Agents IA', name: 'Agent Email Marketing', keiro: `${CHECK} Hugo — sequences 6 etapes via Gmail API`, limova: `${CROSS} Pas d'agent email dedie` },
  { cat: 'Agents IA', name: 'Agent DM Instagram', keiro: `${CHECK} Jade — prospection + reponses IA auto`, limova: `${CROSS} Non supporte` },
  { cat: 'Agents IA', name: 'Agent Contenu', keiro: `${CHECK} Lena — feed, reels, stories, carrousels`, limova: `${CHECK} John — posts reseaux sociaux` },
  { cat: 'Agents IA', name: 'Agent SEO', keiro: `${CHECK} Oscar — articles optimises + keywords`, limova: `${CHECK} Lou — jusqu'a 300 articles/mois + audit SEO` },
  { cat: 'Agents IA', name: 'Agent Commercial', keiro: `${CHECK} Leo — CRM + pipeline + scoring prospects`, limova: `${CHECK} Elio — prospection LinkedIn` },
  { cat: 'Agents IA', name: 'Agent Chatbot', keiro: `${CHECK} Max — capture leads 24/7 sur site web`, limova: `${CHECK} Mickael — WhatsApp + site web (plan Pro)` },
  { cat: 'Agents IA', name: 'Agent Comptable', keiro: `${CHECK} Louis — suivi depenses/revenus`, limova: `${CHECK} Manue — gestion financiere` },
  { cat: 'Agents IA', name: 'Agent Juridique/RH', keiro: `${CHECK} Sara — droit du travail + documents`, limova: `${CHECK} Julia — droit francais + contrats` },
  { cat: 'Agents IA', name: 'Agent Telephonique', keiro: `${CROSS} Pas encore`, limova: `${CHECK} Tom — appels entrants/sortants, 140 langues` },
  { cat: 'Agents IA', name: 'Agent Reputation', keiro: `${CHECK} Theo — reponses auto avis Google`, limova: `${CROSS} Non inclus` },
  // Fonctionnalites
  { cat: 'Fonctionnalites', name: 'CRM integre', keiro: `${CHECK} Pipeline, scoring, import Excel, 20K+ prospects`, limova: `${CROSS} Pas de CRM natif` },
  { cat: 'Fonctionnalites', name: 'Publication Instagram', keiro: `${CHECK} Feed, Reels, Stories, Carrousels — auto`, limova: `${PARTIAL} Posts uniquement` },
  { cat: 'Fonctionnalites', name: 'Publication TikTok', keiro: `${CHECK} Upload direct + brouillon`, limova: `${CROSS} Non supporte` },
  { cat: 'Fonctionnalites', name: 'Publication LinkedIn', keiro: `${CHECK} 1 post/jour auto`, limova: `${CHECK} Via John` },
  { cat: 'Fonctionnalites', name: 'Commentaires IG/TikTok', keiro: `${CHECK} Reponses IA automatiques`, limova: `${CROSS} Non inclus` },
  { cat: 'Fonctionnalites', name: 'Tendances en temps reel', keiro: `${CHECK} Google Trends + TikTok + Instagram`, limova: `${CROSS} Non inclus` },
  { cat: 'Fonctionnalites', name: 'Calendrier editorial IA', keiro: `${CHECK} 7 jours auto + planning complet`, limova: `${CHECK} Calendrier editorial` },
  { cat: 'Fonctionnalites', name: 'Generation images IA', keiro: `${CHECK} Seedream v4.5 — visuels 2K`, limova: `${CHECK} Generation d'images` },
  { cat: 'Fonctionnalites', name: 'Generation videos IA', keiro: `${CHECK} Seedance + Kling (5-90s)`, limova: `${CHECK} Creation video` },
  { cat: 'Fonctionnalites', name: 'Integration WordPress/Wix', keiro: `${CROSS} Pas encore`, limova: `${CHECK} WordPress, PrestaShop, Wix, HubSpot` },
  { cat: 'Fonctionnalites', name: 'Transcription audio', keiro: `${CROSS} Pas encore`, limova: `${CHECK} Transcription incluse` },
  { cat: 'Fonctionnalites', name: 'Presentations PowerPoint', keiro: `${CROSS} Non`, limova: `${CHECK} Generation de decks` },
  // Technique
  { cat: 'Technique', name: 'Multi-langues', keiro: `${CHECK} FR, EN, ES, PT, DE, IT, NL`, limova: `${CHECK} 140 langues (via Tom)` },
  { cat: 'Technique', name: 'API disponible', keiro: `${PARTIAL} Bientot`, limova: `${CHECK} Plan Business+` },
  { cat: 'Technique', name: 'White label', keiro: `${CROSS} Non`, limova: `${CHECK} Plan Business+` },
  { cat: 'Technique', name: 'Essai gratuit', keiro: `${CHECK} Plan gratuit permanent`, limova: `${PARTIAL} 7 jours d'essai` },
];

const pricing = [
  { plan: 'Entree de gamme', keiro: '49 EUR/mois (Createur — 7 agents)', limova: '83 EUR/mois (Essential — 8 agents)', winner: 'keiro' },
  { plan: 'Intermediaire', keiro: '99 EUR/mois (Pro — 11 agents)', limova: '147 EUR/mois (Pro — chatbots inclus)', winner: 'keiro' },
  { plan: 'Avance', keiro: '199 EUR/mois (Business — 15+ agents)', limova: 'Sur devis (Business+)', winner: 'tie' },
  { plan: 'Engagement', keiro: 'Sans engagement, mensuel', limova: 'Annuel recommande (829 EUR/an)', winner: 'keiro' },
];

export default function VsLimovaPage() {
  let currentCat = '';

  return (
    <div className="min-h-screen bg-[#0c1a3a] text-white">
      {/* Hero */}
      <section className="pt-24 pb-16 px-4 text-center max-w-4xl mx-auto">
        <div className="inline-block px-3 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded-full text-cyan-400 text-xs font-medium mb-6">
          Comparaison objective 2026
        </div>
        <h1 className="text-3xl sm:text-5xl font-bold mb-6 leading-tight">
          KeiroAI vs Limova AI
        </h1>
        <p className="text-lg text-white/60 max-w-2xl mx-auto leading-relaxed">
          Deux plateformes francaises d'agents IA pour automatiser le marketing et les operations.
          Comparaison honnete : 15+ agents KeiroAI des 49 EUR vs 9 agents Limova des 83 EUR.
        </p>

        {/* Quick verdict */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
          {[
            { label: 'Prix d\'entree', keiro: '49 EUR/mois', limova: '83 EUR/mois', win: 'keiro' },
            { label: 'Nombre d\'agents', keiro: '15+', limova: '9', win: 'keiro' },
            { label: 'Specialite', keiro: 'Commerce local + reseaux sociaux', limova: 'PME + telephonie', win: 'tie' },
          ].map((v, i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center">
              <div className="text-[10px] text-white/40 mb-2">{v.label}</div>
              <div className={`text-sm font-bold ${v.win === 'keiro' ? 'text-cyan-400' : 'text-white/80'}`}>{v.keiro}</div>
              <div className="text-[10px] text-white/30 my-1">vs</div>
              <div className={`text-sm ${v.win === 'limova' ? 'font-bold text-purple-400' : 'text-white/50'}`}>{v.limova}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison Table */}
      <section className="max-w-5xl mx-auto px-4 pb-16">
        <h2 className="text-2xl font-bold text-center mb-8">Comparaison detaillee des fonctionnalites</h2>
        <div className="rounded-2xl border border-white/10 overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-3 bg-white/5 border-b border-white/10">
            <div className="p-4 text-sm font-semibold text-white/50">Fonctionnalite</div>
            <div className="p-4 text-sm font-bold text-cyan-400 text-center">KeiroAI</div>
            <div className="p-4 text-sm font-bold text-purple-400 text-center">Limova AI</div>
          </div>
          {/* Rows */}
          {features.map((f, i) => {
            const showCat = f.cat !== currentCat;
            currentCat = f.cat;
            return (
              <div key={i}>
                {showCat && (
                  <div className="bg-white/[0.04] border-b border-white/10 px-4 py-2">
                    <span className="text-xs font-bold text-white/60 uppercase tracking-wider">{f.cat}</span>
                  </div>
                )}
                <div className={`grid grid-cols-3 border-b border-white/5 ${i % 2 === 0 ? 'bg-white/[0.02]' : ''}`}>
                  <div className="p-4 text-sm text-white/80 font-medium">{f.name}</div>
                  <div className="p-4 text-xs text-white/70 text-center">{f.keiro}</div>
                  <div className="p-4 text-xs text-white/50 text-center">{f.limova}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Pricing Comparison */}
      <section className="max-w-4xl mx-auto px-4 pb-16">
        <h2 className="text-2xl font-bold text-center mb-8">Comparaison des prix</h2>
        <div className="rounded-2xl border border-white/10 overflow-hidden">
          <div className="grid grid-cols-3 bg-white/5 border-b border-white/10">
            <div className="p-4 text-sm font-semibold text-white/50">Formule</div>
            <div className="p-4 text-sm font-bold text-cyan-400 text-center">KeiroAI</div>
            <div className="p-4 text-sm font-bold text-purple-400 text-center">Limova AI</div>
          </div>
          {pricing.map((p, i) => (
            <div key={i} className={`grid grid-cols-3 border-b border-white/5 ${i % 2 === 0 ? 'bg-white/[0.02]' : ''}`}>
              <div className="p-4 text-sm text-white/80 font-medium">{p.plan}</div>
              <div className={`p-4 text-sm text-center font-semibold ${p.winner === 'keiro' ? 'text-cyan-400' : 'text-white/70'}`}>{p.keiro}</div>
              <div className={`p-4 text-sm text-center ${p.winner === 'limova' ? 'font-semibold text-purple-400' : 'text-white/50'}`}>{p.limova}</div>
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-white/30 mt-4">
          Prix Limova : source limova.ai/pricing, avril 2026. Prix en USD convertis au taux moyen.
        </p>
      </section>

      {/* Honest verdict */}
      <section className="max-w-4xl mx-auto px-4 pb-16">
        <h2 className="text-2xl font-bold text-center mb-8">Verdict honnete</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-6">
            <h3 className="text-lg font-bold text-cyan-400 mb-3">Choisissez KeiroAI si...</h3>
            <ul className="space-y-2 text-sm text-white/70">
              <li>Vous etes un commerce local (restaurant, coiffeur, boutique, coach)</li>
              <li>Instagram et TikTok sont vos canaux principaux</li>
              <li>Vous voulez un CRM integre avec scoring automatique</li>
              <li>La prospection par DM Instagram vous interesse</li>
              <li>Vous cherchez le meilleur rapport qualite/prix (des 49 EUR)</li>
              <li>Vous preferez un plan gratuit permanent pour tester</li>
            </ul>
          </div>
          <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-6">
            <h3 className="text-lg font-bold text-purple-400 mb-3">Choisissez Limova AI si...</h3>
            <ul className="space-y-2 text-sm text-white/70">
              <li>Vous avez besoin d'un agent telephonique (centre d'appels IA)</li>
              <li>Vous publiez du contenu SEO en volume (300 articles/mois)</li>
              <li>Vous utilisez WordPress, PrestaShop ou Wix</li>
              <li>Vous avez besoin de white label ou d'API</li>
              <li>La prospection LinkedIn est votre priorite</li>
              <li>Vous etes une agence gerant plusieurs clients</li>
            </ul>
          </div>
        </div>
      </section>

      {/* What KeiroAI does that Limova doesn't */}
      <section className="max-w-4xl mx-auto px-4 pb-16">
        <h2 className="text-2xl font-bold text-center mb-8">Ce que KeiroAI fait et pas Limova</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { title: 'DM Instagram automatique', desc: 'Jade prospecte et repond aux DM Instagram avec une strategie de conversion 4 phases. Limova ne gere pas les DM.' },
            { title: 'Publication TikTok', desc: 'Upload direct de videos sur TikTok avec le flow brouillon. Limova ne supporte pas TikTok.' },
            { title: 'CRM natif + scoring', desc: 'Pipeline de vente, scoring IA, import Excel, suivi des interactions. Chez Limova il faut un CRM externe.' },
            { title: 'Commentaires Instagram', desc: 'Reponses automatiques aux commentaires sur vos posts IG et TikTok. Pas dispo chez Limova.' },
            { title: 'Avis Google automatiques', desc: 'Theo repond automatiquement aux avis Google Business. Non inclus chez Limova.' },
            { title: 'Tendances temps reel', desc: 'Integration Google Trends + TikTok Trends dans la generation de contenu. Pas de veille tendance chez Limova.' },
          ].map((d, i) => (
            <div key={i} className="rounded-xl border border-cyan-500/10 bg-white/[0.03] p-5">
              <h3 className="text-sm font-bold text-white mb-2">{d.title}</h3>
              <p className="text-xs text-white/50 leading-relaxed">{d.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-3xl mx-auto px-4 pb-24 text-center">
        <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 p-8">
          <h2 className="text-xl font-bold mb-3">Pret a essayer KeiroAI ?</h2>
          <p className="text-sm text-white/60 mb-6">
            Plan gratuit permanent. 15+ agents IA. Aucune carte bancaire requise.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/login"
              className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-sm rounded-xl hover:opacity-90 transition"
            >
              Commencer gratuitement
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

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 pb-16">
        <h2 className="text-xl font-bold text-center mb-8">Questions frequentes</h2>
        <div className="space-y-4">
          {[
            {
              q: 'Quelle est la difference principale entre KeiroAI et Limova AI ?',
              a: 'KeiroAI est specialise pour les commerces locaux avec 15+ agents (DM Instagram, TikTok, CRM integre, avis Google) des 49 EUR/mois. Limova cible plutot les PME et agences avec 9 agents incluant un agent telephonique, et demarre a 83 EUR/mois.',
            },
            {
              q: 'KeiroAI est-il vraiment moins cher que Limova ?',
              a: 'Oui. KeiroAI Createur (7 agents) coute 49 EUR/mois vs 83 EUR/mois pour l\'Essential Limova (8 agents). Le plan Pro KeiroAI (11 agents) coute 99 EUR vs 147 EUR chez Limova. Et KeiroAI offre un plan gratuit permanent.',
            },
            {
              q: 'Limova a-t-il des avantages sur KeiroAI ?',
              a: 'Oui. Limova propose un agent telephonique IA (Tom), l\'integration WordPress/PrestaShop pour la publication SEO, la generation de PowerPoint, et une option white label pour les agences. KeiroAI ne propose pas encore ces fonctionnalites.',
            },
            {
              q: 'Peut-on migrer de Limova vers KeiroAI ?',
              a: 'Oui. Creez un compte KeiroAI gratuit, importez vos prospects via Excel (le CRM gere les doublons), connectez vos reseaux sociaux (Instagram, TikTok, Gmail), et les agents prennent le relais immediatement.',
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
