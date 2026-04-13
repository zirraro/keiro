'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';

/**
 * AgentSetupGuide — Mini wizard shown when agent is not configured.
 * Guides user through 2-3 steps to activate the agent.
 * Replaces empty dashboards with actionable setup.
 */

// Setup steps per agent
const AGENT_SETUP: Record<string, {
  steps: Array<{
    title: string;
    description: string;
    action: 'connect_instagram' | 'connect_tiktok' | 'connect_linkedin' | 'connect_google' | 'connect_email' | 'import_crm' | 'choose_mode' | 'done';
    optional?: boolean;
  }>;
  benefit: string;
  timeEstimate: string;
}> = {
  content: {
    steps: [
      { title: 'Connecter Instagram', description: 'Lena publie automatiquement sur ton compte', action: 'connect_instagram' },
      { title: 'Connecter TikTok', description: 'Publie aussi tes videos sur TikTok', action: 'connect_tiktok', optional: true },
      { title: 'Choisir le mode', description: 'Publication auto ou validation manuelle ?', action: 'choose_mode' },
    ],
    benefit: 'Lena publie du contenu optimise selon ta frequence',
    timeEstimate: '1 min',
  },
  dm_instagram: {
    steps: [
      { title: 'Connecter Instagram', description: 'Jade envoie et recoit des DMs en ton nom', action: 'connect_instagram' },
      { title: 'Choisir le mode', description: 'DMs auto ou tu valides chaque message ?', action: 'choose_mode' },
    ],
    benefit: 'Jade va prospecter en DM et repondre automatiquement',
    timeEstimate: '1 min',
  },
  email: {
    steps: [
      { title: 'Configurer l\'email', description: 'Hugo envoie les emails depuis contact@keiroai.com pour toi', action: 'connect_email' },
      { title: 'Importer des contacts', description: 'Importe ta base prospect ou laisse Hugo prospecter', action: 'import_crm', optional: true },
      { title: 'Choisir le mode', description: 'Emails auto ou validation manuelle ?', action: 'choose_mode' },
    ],
    benefit: 'Hugo va envoyer des sequences email personnalisees a tes prospects',
    timeEstimate: '2 min',
  },
  gmaps: {
    steps: [
      { title: 'Connecter Google Business', description: 'Theo repond aux avis Google en ton nom', action: 'connect_google' },
      { title: 'Choisir le mode', description: 'Reponses auto ou manuelles ?', action: 'choose_mode' },
    ],
    benefit: 'Theo va repondre a tous tes avis Google avec des reponses personnalisees',
    timeEstimate: '1 min',
  },
  commercial: {
    steps: [
      { title: 'Importer des prospects', description: 'Leo prospecte sur Google Maps ou importe ton fichier', action: 'import_crm' },
      { title: 'Choisir le mode', description: 'Prospection auto ou manuelle ?', action: 'choose_mode' },
    ],
    benefit: 'Leo va trouver et qualifier des prospects dans ta zone automatiquement',
    timeEstimate: '1 min',
  },
  seo: {
    steps: [
      { title: 'Renseigner ton site web', description: 'Oscar analyse et optimise ton referencement', action: 'done' },
    ],
    benefit: 'Oscar va analyser ton SEO et te donner des recommandations concretes',
    timeEstimate: '30 sec',
  },
  instagram_comments: {
    steps: [
      { title: 'Connecter Instagram', description: 'Pour repondre automatiquement aux commentaires', action: 'connect_instagram' },
      { title: 'Choisir le mode', description: 'Reponses auto ou manuelles ?', action: 'choose_mode' },
    ],
    benefit: 'Reponses automatiques et personnalisees a tous tes commentaires Instagram',
    timeEstimate: '1 min',
  },
  tiktok_comments: {
    steps: [
      { title: 'Connecter TikTok', description: 'Axel engage ta communaute TikTok', action: 'connect_tiktok' },
      { title: 'Choisir le mode', description: 'Engagement auto ou manuel ?', action: 'choose_mode' },
    ],
    benefit: 'Axel va commenter et engager ta communaute TikTok automatiquement',
    timeEstimate: '1 min',
  },
};

const ACTION_URLS: Record<string, string> = {
  connect_instagram: '/api/auth/instagram-oauth',
  connect_tiktok: '/api/auth/tiktok-oauth',
  connect_linkedin: '/api/auth/linkedin-oauth',
  connect_google: '/api/auth/google-oauth',
};

interface AgentSetupGuideProps {
  agentId: string;
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
  userPlan: string;
  requiredPlan: string;
  onComplete?: () => void;
}

export default function AgentSetupGuide({ agentId, agentName, gradientFrom, gradientTo, userPlan, requiredPlan, onComplete }: AgentSetupGuideProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [autoMode, setAutoMode] = useState(true);
  const [completed, setCompleted] = useState(false);

  const setup = AGENT_SETUP[agentId];
  if (!setup) return null;

  // Plan check
  const planOrder = ['gratuit', 'free', 'createur', 'starter', 'pro', 'fondateurs', 'business', 'elite'];
  const userPlanIndex = planOrder.indexOf(userPlan?.toLowerCase() || 'free');
  const requiredPlanIndex = planOrder.indexOf(requiredPlan?.toLowerCase() || 'gratuit');
  const needsUpgrade = userPlanIndex < requiredPlanIndex && userPlanIndex >= 0;

  const step = setup.steps[currentStep];

  const handleNext = useCallback(() => {
    if (currentStep < setup.steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      // Save auto mode setting
      fetch('/api/agents/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ agent_id: agentId, auto_mode: autoMode, setup_completed: true }),
      }).catch(() => {});
      setCompleted(true);
      onComplete?.();
    }
  }, [currentStep, setup.steps.length, agentId, autoMode, onComplete]);

  const handleSkip = useCallback(() => {
    if (step?.optional) {
      setCurrentStep(prev => prev + 1);
    }
  }, [step]);

  if (completed) {
    return (
      <div className="rounded-2xl border-2 border-emerald-500/30 bg-emerald-900/10 p-6 sm:p-8 text-center">
        <div className="text-4xl mb-3">{'\u{1F389}'}</div>
        <h3 className="text-lg font-bold text-white mb-1">{agentName} est pret !</h3>
        <p className="text-sm text-white/50">{setup.benefit}</p>
      </div>
    );
  }

  // Upsell needed
  if (needsUpgrade) {
    return (
      <div className="rounded-2xl border-2 border-purple-500/20 bg-gradient-to-b from-purple-900/20 to-transparent p-5 sm:p-8">
        <div className="text-center mb-5">
          <div className="text-3xl mb-2">{'\u{1F512}'}</div>
          <h3 className="text-lg font-bold text-white mb-1">Active {agentName}</h3>
          <p className="text-sm text-white/50 mb-4">{setup.benefit}</p>
        </div>

        <div className="bg-white/5 rounded-xl p-4 mb-4">
          <p className="text-xs text-white/60 mb-3">
            {agentName} necessite le plan <strong className="text-purple-300">{requiredPlan}</strong>. Tu es actuellement sur le plan <strong className="text-white/80">{userPlan || 'gratuit'}</strong>.
          </p>
          <div className="flex flex-col gap-2">
            <Link
              href={`/checkout/upsell?plan=${requiredPlan}`}
              className="w-full py-3 text-center bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold text-sm rounded-xl hover:shadow-lg transition-all"
            >
              {'\u{1F680}'} Passer au plan {requiredPlan} — debloquer {agentName}
            </Link>
            <p className="text-[10px] text-white/30 text-center">0{'\u20AC'} pendant 7 jours {'\u00B7'} Annulation en 1 clic</p>
          </div>
        </div>

        <p className="text-xs text-white/30 text-center">
          Tu peux aussi commencer par les agents inclus dans ton plan et upgrader plus tard !
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-white/10 bg-gradient-to-b from-white/[0.03] to-transparent p-5 sm:p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}>
          <span className="text-white text-lg">{'\u26A1'}</span>
        </div>
        <div>
          <h3 className="text-sm font-bold text-white">Activer {agentName}</h3>
          <p className="text-[10px] text-white/40">{setup.timeEstimate} {'\u00B7'} {setup.steps.length} etapes</p>
        </div>
        <div className="ml-auto flex gap-1">
          {setup.steps.map((_, i) => (
            <div key={i} className={`w-2 h-2 rounded-full transition-all ${i < currentStep ? 'bg-emerald-400' : i === currentStep ? 'bg-white scale-125' : 'bg-white/20'}`} />
          ))}
        </div>
      </div>

      {/* Benefit */}
      <div className="bg-white/5 rounded-lg p-3 mb-4">
        <p className="text-xs text-white/60">{'\u2728'} {setup.benefit}</p>
      </div>

      {/* Current step */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-bold text-white/80">Etape {currentStep + 1}/{setup.steps.length}</span>
          {step?.optional && <span className="text-[9px] text-white/30 bg-white/10 px-2 py-0.5 rounded-full">Optionnel</span>}
        </div>
        <h4 className="text-sm font-bold text-white mb-1">{step?.title}</h4>
        <p className="text-xs text-white/50">{step?.description}</p>
      </div>

      {/* Action */}
      {step?.action === 'choose_mode' ? (
        <div className="space-y-2 mb-4">
          <button
            onClick={() => { setAutoMode(true); handleNext(); }}
            className={`w-full p-3 rounded-xl border-2 text-left transition-all ${autoMode ? 'border-emerald-500/50 bg-emerald-900/20' : 'border-white/10 bg-white/[0.03] hover:border-white/20'}`}
          >
            <div className="flex items-center gap-2">
              <span className="text-base">{'\u{1F916}'}</span>
              <div>
                <div className="text-xs font-bold text-white">100% Automatique</div>
                <div className="text-[10px] text-white/40">{agentName} gere tout sans intervention</div>
              </div>
            </div>
          </button>
          <button
            onClick={() => { setAutoMode(false); handleNext(); }}
            className={`w-full p-3 rounded-xl border-2 text-left transition-all ${!autoMode ? 'border-blue-500/50 bg-blue-900/20' : 'border-white/10 bg-white/[0.03] hover:border-white/20'}`}
          >
            <div className="flex items-center gap-2">
              <span className="text-base">{'\u{270D}\uFE0F'}</span>
              <div>
                <div className="text-xs font-bold text-white">Tu valides avant</div>
                <div className="text-[10px] text-white/40">Tu verifies et approuves chaque action</div>
              </div>
            </div>
          </button>
        </div>
      ) : step?.action === 'connect_email' ? (
        <div className="space-y-3 mb-4">
          <div className="bg-emerald-900/20 rounded-xl p-3 border border-emerald-500/20">
            <div className="flex items-center gap-2">
              <span className="text-base">{'\u2705'}</span>
              <div>
                <div className="text-xs font-bold text-white">Email deja configure !</div>
                <div className="text-[10px] text-white/40">Hugo envoie depuis contact@keiroai.com en ton nom</div>
              </div>
            </div>
          </div>
          <button onClick={handleNext} className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold text-sm rounded-xl hover:shadow-lg transition-all">
            Continuer
          </button>
        </div>
      ) : step?.action === 'import_crm' ? (
        <div className="space-y-2 mb-4">
          <Link href="/assistant/crm" className="block w-full py-3 text-center bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-sm rounded-xl hover:shadow-lg transition-all">
            {'\u{1F4C1}'} Importer des contacts
          </Link>
          <button onClick={handleNext} className="w-full py-2 text-xs text-white/40 hover:text-white/60 transition">
            Passer — Hugo trouvera des prospects tout seul
          </button>
        </div>
      ) : step?.action === 'done' ? (
        <div className="mb-4">
          <button onClick={handleNext} className="w-full py-3 text-center font-bold text-sm rounded-xl transition-all" style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`, color: 'white' }}>
            {'\u2705'} Activer {agentName}
          </button>
        </div>
      ) : (
        <div className="space-y-2 mb-4">
          {/* Connection button */}
          {ACTION_URLS[step?.action] && (
            <a href={ACTION_URLS[step.action]} className="block w-full py-3 text-center font-bold text-sm rounded-xl transition-all hover:shadow-lg" style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`, color: 'white' }}>
              Connecter {step.title.replace('Connecter ', '')}
            </a>
          )}
          {step?.optional && (
            <button onClick={handleSkip} className="w-full py-2 text-xs text-white/40 hover:text-white/60 transition">
              Passer cette etape
            </button>
          )}
        </div>
      )}
    </div>
  );
}
