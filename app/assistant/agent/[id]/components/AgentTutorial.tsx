'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import SpotlightTour, { TourStep } from './SpotlightTour';

/**
 * AgentTutorial — Two phases:
 * 1. Quick confirmation modal "Agent activé!"
 * 2. Spotlight tour pointing at real UI elements
 *
 * Also handles "i" button replays.
 */

// Tour steps per agent — target matches data-tour="xxx" attributes on the page
const AGENT_TOURS: Record<string, TourStep[]> = {
  content: [
    { target: 'auto-toggle', title: 'Mode automatique', description: 'Active le mode auto pour que Lena publie selon ton calendrier, ou desactive pour valider chaque post manuellement.', position: 'bottom' },
    { target: 'content-workflow', title: 'File de contenu', description: 'Ici apparaissent tes posts prepares. Tu peux valider, publier ou ignorer chacun.', position: 'bottom' },
    { target: 'content-calendar', title: 'Calendrier editorial', description: 'Visualise tes publications passees et a venir par plateforme (Instagram, TikTok, LinkedIn).', position: 'top' },
  ],
  dm_instagram: [
    { target: 'auto-toggle', title: 'Mode DM', description: 'En auto, Jade repond et prospecte en DM pour toi. En manuel, tu valides chaque message.', position: 'bottom' },
    { target: 'dm-stats', title: 'Pipeline DM', description: 'Suis tes DMs envoyes, reponses recues et RDV generes. Clique CRM pour voir tes prospects.', position: 'bottom' },
    { target: 'dm-conversations', title: 'Conversations', description: 'Tes conversations Instagram DM apparaissent ici. Clique pour lire et repondre directement.', position: 'top' },
  ],
  email: [
    { target: 'auto-toggle', title: 'Mode email', description: 'En auto, Hugo envoie les sequences email automatiquement. En manuel, tu valides chaque envoi.', position: 'bottom' },
    { target: 'email-inbox', title: 'Boite de reception', description: 'Tes emails envoyes et recus apparaissent ici. Clique sur un prospect pour voir le fil complet et repondre.', position: 'top' },
    { target: 'email-campaign', title: 'Campagnes', description: 'Cree des campagnes email ciblees : choisis ta cible, genere le contenu avec l\'IA et lance.', position: 'bottom' },
  ],
  gmaps: [
    { target: 'auto-toggle', title: 'Reponses auto', description: 'Active pour que Theo reponde automatiquement a chaque nouvel avis Google.', position: 'bottom' },
    { target: 'google-reviews', title: 'Avis Google', description: 'Tes avis apparaissent ici. Clique Repondre pour generer une reponse IA et la publier sur Google.', position: 'top' },
  ],
  commercial: [
    { target: 'agent-dashboard', title: 'CRM Prospects', description: 'Leo qualifie et score tes prospects automatiquement. Vois ton pipeline ici.', position: 'bottom' },
  ],
  seo: [
    { target: 'agent-dashboard', title: 'Audit SEO', description: 'Oscar analyse ton site et te donne des recommandations concretes pour ameliorer ton referencement.', position: 'bottom' },
  ],
  marketing: [
    { target: 'agent-dashboard', title: 'Dashboard global', description: 'AMI supervise tous tes agents et te donne une vue d\'ensemble de tes performances.', position: 'bottom' },
  ],
  ads: [
    { target: 'agent-dashboard', title: 'Campagnes pub', description: 'Felix cree et optimise tes campagnes Meta Ads et Google Ads automatiquement.', position: 'bottom' },
  ],
  chatbot: [
    { target: 'agent-dashboard', title: 'Chatbot Max', description: 'Max accueille tes visiteurs 24/7. Installe le widget sur ton site pour demarrer.', position: 'bottom' },
  ],
  whatsapp: [
    { target: 'agent-dashboard', title: 'WhatsApp Stella', description: 'Stella repond automatiquement a tes messages WhatsApp et qualifie les prospects.', position: 'bottom' },
  ],
  tiktok_comments: [
    { target: 'agent-dashboard', title: 'TikTok Axel', description: 'Axel engage ta communaute TikTok en commentant et interagissant automatiquement.', position: 'bottom' },
  ],
  instagram_comments: [
    { target: 'agent-dashboard', title: 'Commentaires IG', description: 'Reponses automatiques et personnalisees a tous tes commentaires Instagram.', position: 'bottom' },
  ],
  rh: [
    { target: 'agent-dashboard', title: 'Documents Sara', description: 'Sara genere tes CGV, mentions legales, RGPD et contrats personnalises.', position: 'bottom' },
  ],
  comptable: [
    { target: 'agent-dashboard', title: 'Finance Louis', description: 'Louis suit tes revenus, depenses et marge. Tableau de bord financier automatique.', position: 'bottom' },
  ],
  onboarding: [
    { target: 'agent-dashboard', title: 'Clara t\'accompagne', description: 'Remplis ton profil business, upload des documents, et Clara partage tout avec tes agents.', position: 'bottom' },
  ],
};

export default function AgentTutorial({ agentId }: { agentId: string }) {
  const [phase, setPhase] = useState<'none' | 'confirm' | 'tour'>('none');
  const [wizardAgents, setWizardAgents] = useState<string[]>([]);
  const [nextIndex, setNextIndex] = useState(0);
  const router = useRouter();

  useEffect(() => {
    try {
      const isWizard = sessionStorage.getItem('keiro_wizard_active');
      const currentAgent = sessionStorage.getItem('keiro_wizard_agent');
      if (isWizard === 'true' && currentAgent === agentId) {
        setPhase('confirm');
        setNextIndex(parseInt(sessionStorage.getItem('keiro_wizard_next') || '0'));
        setWizardAgents(JSON.parse(sessionStorage.getItem('keiro_wizard_agents') || '[]'));
        sessionStorage.removeItem('keiro_wizard_agent');
      }
    } catch {}
  }, [agentId]);

  const startTour = useCallback(() => setPhase('tour'), []);

  const finishTour = useCallback(() => {
    setPhase('none');
    // Check if more agents in wizard
    if (wizardAgents.length > 0 && nextIndex < wizardAgents.length) {
      // Show "next agent" prompt after a short delay
      setTimeout(() => {
        const goNext = window.confirm('Agent suivant a activer ?');
        if (goNext) {
          const nextAgent = wizardAgents[nextIndex];
          try {
            sessionStorage.setItem('keiro_wizard_agent', nextAgent);
            sessionStorage.setItem('keiro_wizard_next', String(nextIndex + 1));
          } catch {}
          fetch('/api/agents/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ agent_id: nextAgent, auto_mode: true, setup_completed: true }),
          }).catch(() => {});
          router.push('/assistant/agent/' + nextAgent);
        } else {
          try {
            sessionStorage.removeItem('keiro_wizard_active');
            sessionStorage.removeItem('keiro_wizard_agents');
          } catch {}
        }
      }, 500);
    }
  }, [wizardAgents, nextIndex, router]);

  const finishAll = useCallback(() => {
    setPhase('none');
    try {
      sessionStorage.removeItem('keiro_wizard_active');
      sessionStorage.removeItem('keiro_wizard_agents');
    } catch {}
  }, []);

  // Spotlight tour
  if (phase === 'tour') {
    const steps = AGENT_TOURS[agentId] || [{ target: 'agent-dashboard', title: 'Espace agent', description: 'Voici l\'espace de travail de cet agent. Explore les fonctionnalites !', position: 'bottom' as const }];
    return <SpotlightTour steps={steps} active={true} onFinish={finishTour} />;
  }

  // Confirmation modal
  if (phase !== 'confirm') return null;

  const agentNames: Record<string, string> = {
    content: 'Lena', dm_instagram: 'Jade', email: 'Hugo', gmaps: 'Theo',
    commercial: 'Leo', seo: 'Oscar', marketing: 'AMI', ads: 'Felix',
    chatbot: 'Max', whatsapp: 'Stella', tiktok_comments: 'Axel',
    instagram_comments: 'Commentaires IG', rh: 'Sara', comptable: 'Louis', onboarding: 'Clara',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-gray-900/95 backdrop-blur-xl border border-emerald-500/20 rounded-2xl shadow-2xl p-5 sm:p-6 max-w-sm w-full animate-in zoom-in-95 duration-300 relative text-center">
        <button onClick={finishAll} className="absolute top-3 right-3 text-white/20 hover:text-white/50 transition p-1">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        <div className="text-4xl mb-3">{'\u{1F389}'}</div>
        <h3 className="text-lg font-bold text-white mb-1">{agentNames[agentId] || 'Agent'} est active !</h3>
        <p className="text-xs text-white/50 mb-4">Voyons les principales fonctionnalites</p>
        <button onClick={startTour} className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-bold rounded-xl hover:shadow-lg transition min-h-[44px]">
          {'\u{1F446}'} Montrer les fonctionnalites
        </button>
        <button onClick={finishAll} className="w-full mt-2 py-2 text-white/40 text-xs hover:text-white/60 transition">
          Je connais deja, passer
        </button>
      </div>
    </div>
  );
}
