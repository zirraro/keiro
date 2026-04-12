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
    { target: 'auto-toggle', title: 'Publication automatique', description: 'Active le mode AUTO pour que Lena publie selon ton calendrier. En MANUEL, tu valides chaque post avant publication.', position: 'bottom' },
    { target: 'content-workflow', title: 'Tes publications', description: 'Tous tes posts generes apparaissent ici. Clique pour voir le visuel, la legende et les hashtags. Publie en un clic.', position: 'bottom' },
    { target: 'agent-dashboard', title: 'Onglet Planning', description: 'Va dans l\'onglet Planning pour voir ton calendrier editorial sur 14 jours avec les publications programmees par plateforme.', position: 'top' },
  ],
  dm_instagram: [
    { target: 'auto-toggle', title: 'DM automatique', description: 'En AUTO, Jade contacte tes prospects par DM Instagram et repond automatiquement. Tu es alerte quand un prospect est chaud.', position: 'bottom' },
    { target: 'agent-dashboard', title: 'Conversations', description: 'Tes DMs en cours avec les prospects. Tu peux reprendre la conversation a tout moment si Jade a besoin d\'aide.', position: 'bottom' },
  ],
  email: [
    { target: 'auto-toggle', title: 'Emails automatiques', description: 'Hugo envoie des sequences de prospection personnalisees. Chaque prospect recoit 3 a 6 emails espaces intelligemment.', position: 'bottom' },
    { target: 'email-inbox', title: 'Boite email', description: 'Tous les emails envoyes et les reponses recues. Filtre par statut (envoye, ouvert, repondu) et reponds directement.', position: 'top' },
  ],
  gmaps: [
    { target: 'auto-toggle', title: 'Reponses automatiques', description: 'Theo repond a chaque nouvel avis Google avec un message personnalise. Ameliore ta note et ta visibilite locale.', position: 'bottom' },
  ],
  commercial: [
    { target: 'agent-dashboard', title: 'Tes prospects', description: 'Leo cherche et qualifie tes prospects automatiquement. Tu vois ici le pipeline par canal : email, Instagram, TikTok.', position: 'bottom' },
  ],
  seo: [
    { target: 'agent-dashboard', title: 'Articles SEO', description: 'Oscar redige des articles blog optimises pour Google. Chaque article cible un mot-cle pour attirer du trafic vers ton site.', position: 'bottom' },
  ],
  marketing: [
    { target: 'agent-dashboard', title: 'Analyse marketing', description: 'Ami analyse les performances de tous tes canaux et te recommande des actions concretes pour ameliorer tes resultats.', position: 'bottom' },
  ],
  ceo: [
    { target: 'agent-dashboard', title: 'Vision strategique', description: 'Noah supervise tous tes agents. Il analyse les resultats, donne la direction et ajuste la strategie selon tes objectifs.', position: 'bottom' },
  ],
  chatbot: [
    { target: 'agent-dashboard', title: 'Chatbot sur ton site', description: 'Max accueille tes visiteurs 24/7, repond a leurs questions et capture leurs coordonnees. Installe-le via l\'onglet Parametres.', position: 'bottom' },
  ],
  rh: [
    { target: 'agent-dashboard', title: 'Documents juridiques', description: 'Sara genere tes contrats, CGV, mentions legales et documents RGPD. Va dans l\'onglet Editeur pour creer et modifier tes documents.', position: 'bottom' },
  ],
  comptable: [
    { target: 'agent-dashboard', title: 'Gestion financiere', description: 'Louis cree tes business plans, previsionnels et inventaires. Va dans l\'onglet Editeur pour travailler sur tes tableaux Excel.', position: 'bottom' },
  ],
  onboarding: [
    { target: 'agent-dashboard', title: 'Ton profil business', description: 'Complete ton dossier business pour que tes agents te connaissent mieux. Plus c\'est complet, plus ils sont efficaces.', position: 'bottom' },
  ],
  ads: [
    { target: 'agent-dashboard', title: 'Publicite (bientot)', description: 'Felix creera et optimisera tes campagnes Meta Ads et Google Ads automatiquement. Cette fonctionnalite arrive bientot.', position: 'bottom' },
  ],
  whatsapp: [
    { target: 'agent-dashboard', title: 'WhatsApp (bientot)', description: 'Stella repondra automatiquement a tes messages WhatsApp Business. Cette fonctionnalite arrive bientot.', position: 'bottom' },
  ],
  tiktok_comments: [
    { target: 'agent-dashboard', title: 'TikTok (bientot)', description: 'Axel engagera ta communaute TikTok en commentant et interagissant automatiquement. Arrive bientot.', position: 'bottom' },
  ],
  linkedin: [
    { target: 'agent-dashboard', title: 'LinkedIn (bientot)', description: 'Emma publiera du contenu optimise sur LinkedIn et engagera ton reseau pro. Arrive bientot.', position: 'bottom' },
  ],
  instagram_comments: [
    { target: 'agent-dashboard', title: 'Commentaires Instagram', description: 'Reponses automatiques et personnalisees a tous les commentaires sur tes posts Instagram.', position: 'bottom' },
  ],
};

export default function AgentTutorial({ agentId }: { agentId: string }) {
  const [phase, setPhase] = useState<'none' | 'confirm' | 'tour' | 'next_agent'>('none');
  const [wizardAgents, setWizardAgents] = useState<string[]>([]);
  const [nextIndex, setNextIndex] = useState(0);
  const router = useRouter();

  useEffect(() => {
    try {
      // Check for first activation spotlight (from workspace toggle)
      const spotlight = sessionStorage.getItem('keiro_show_spotlight');
      if (spotlight === agentId) {
        sessionStorage.removeItem('keiro_show_spotlight');
        setTimeout(() => setPhase('confirm'), 300);
        return;
      }

      // Check for "i" button replay — go directly to tour
      const replay = sessionStorage.getItem('keiro_tour_replay');
      if (replay === agentId) {
        sessionStorage.removeItem('keiro_tour_replay');
        setTimeout(() => setPhase('tour'), 200);
        return;
      }

      // Listen for live replay event (no page reload needed)
      const handler = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (detail === agentId) {
          sessionStorage.removeItem('keiro_tour_replay');
          setPhase('tour');
        }
      };
      window.addEventListener('keiro-tour-replay', handler);
      return () => window.removeEventListener('keiro-tour-replay', handler);

      // Check for wizard flow
      const isWizard = sessionStorage.getItem('keiro_wizard_active');
      const currentAgent = sessionStorage.getItem('keiro_wizard_agent');
      if (isWizard === 'true' && currentAgent === agentId) {
        setNextIndex(parseInt(sessionStorage.getItem('keiro_wizard_next') || '0'));
        setWizardAgents(JSON.parse(sessionStorage.getItem('keiro_wizard_agents') || '[]'));
        sessionStorage.removeItem('keiro_wizard_agent');

        // Check if agent's network is already connected → skip to tour directly
        const igAgents = ['content', 'dm_instagram', 'instagram_comments'];
        const googleAgents = ['gmaps'];
        const noConnectNeeded = ['email', 'commercial', 'seo', 'marketing', 'ads', 'chatbot', 'whatsapp', 'rh', 'comptable', 'onboarding'];

        const checkAndStart = async () => {
          let connected = false;
          if (noConnectNeeded.includes(agentId)) connected = true;
          else if (igAgents.includes(agentId)) {
            try {
              const r = await fetch('/api/instagram/check-token', { credentials: 'include' });
              if (r.ok) { const d = await r.json(); connected = d.valid || d.connected; }
            } catch {}
          } else if (googleAgents.includes(agentId)) {
            try {
              const r = await fetch('/api/agents/settings?agent_id=gmaps', { credentials: 'include' });
              if (r.ok) { const d = await r.json(); connected = !!d.settings?.setup_completed; }
            } catch {}
          }

          if (connected) {
            // Already connected → skip to spotlight tour
            setTimeout(() => setPhase('tour'), 500);
          } else {
            setPhase('confirm');
          }
        };
        checkAndStart();
      }
    } catch {}
  }, [agentId]);

  const startTour = useCallback(() => setPhase('tour'), []);

  const finishTour = useCallback(() => {
    // After tour, show "next agent" popup if there are more
    if (wizardAgents.length > 0 && nextIndex < wizardAgents.length) {
      setPhase('next_agent');
    } else {
      setPhase('none');
    }
  }, [wizardAgents, nextIndex]);

  const goToNextAgent = useCallback(() => {
    const nextAgent = wizardAgents[nextIndex];
    if (!nextAgent) { setPhase('none'); return; }
    try {
      sessionStorage.setItem('keiro_wizard_active', 'true');
      sessionStorage.setItem('keiro_wizard_agent', nextAgent);
      sessionStorage.setItem('keiro_wizard_next', String(nextIndex + 1));
      sessionStorage.setItem('keiro_wizard_agents', JSON.stringify(wizardAgents.slice(nextIndex + 1)));
    } catch {}
    fetch('/api/agents/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ agent_id: nextAgent, auto_mode: true, setup_completed: true }),
    }).catch(() => {});
    window.location.href = '/assistant/agent/' + nextAgent;
  }, [wizardAgents, nextIndex]);

  const finishAll = useCallback(() => {
    setPhase('none');
    try {
      sessionStorage.removeItem('keiro_wizard_active');
      sessionStorage.removeItem('keiro_wizard_agents');
    } catch {}
  }, []);

  const agentNames: Record<string, string> = {
    content: 'Lena', dm_instagram: 'Jade', email: 'Hugo', gmaps: 'Theo',
    commercial: 'Leo', seo: 'Oscar', marketing: 'AMI', ads: 'Felix',
    chatbot: 'Max', whatsapp: 'Stella', tiktok_comments: 'Axel',
    instagram_comments: 'Commentaires IG', rh: 'Sara', comptable: 'Louis', onboarding: 'Clara', linkedin: 'Emma',
  };

  // Next agent popup — Clara presents the next agent
  if (phase === 'next_agent') {
    const nextAgent = wizardAgents[nextIndex];
    const nextName = agentNames[nextAgent] || nextAgent;
    const agentDescs: Record<string, string> = {
      content: 'Lena publie automatiquement sur Instagram, TikTok et LinkedIn. Elle genere des visuels et legendes optimises.',
      dm_instagram: 'Jade prospecte en DM Instagram et repond automatiquement. Elle qualifie tes prospects et te signale les plus chauds.',
      email: 'Hugo envoie des sequences email personnalisees a tes prospects et suit les ouvertures et clics.',
      gmaps: 'Theo repond a tes avis Google avec des reponses IA personnalisees et ameliore ta reputation.',
      commercial: 'Leo prospecte sur Google Maps, qualifie les leads et gere ton pipeline CRM.',
      seo: 'Oscar analyse ton SEO, suit tes mots-cles et te donne des recommandations concretes.',
      instagram_comments: 'Reponds automatiquement aux commentaires Instagram avec des reponses contextuelles.',
      tiktok_comments: 'Axel engage ta communaute TikTok en commentant et interagissant automatiquement.',
      chatbot: 'Max accueille tes visiteurs 24/7 sur ton site et capture leurs coordonnees.',
      whatsapp: 'Stella repond a tes messages WhatsApp et qualifie les prospects automatiquement.',
      ads: 'Felix cree et optimise tes campagnes Meta Ads et Google Ads.',
      rh: 'Sara genere tes documents juridiques : CGV, RGPD, contrats.',
      comptable: 'Louis suit tes revenus, depenses et marge automatiquement.',
      linkedin: 'Emma publie sur LinkedIn, commente et engage ton reseau pro pour generer des leads B2B.',
    };
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-gray-900/95 backdrop-blur-xl border border-emerald-500/20 rounded-2xl shadow-2xl p-5 sm:p-6 max-w-sm w-full animate-in fade-in duration-200 relative">
          <button onClick={finishAll} className="absolute top-3 right-3 text-white/20 hover:text-white/50 transition p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold flex-shrink-0">C</div>
            <div>
              <div className="text-xs font-bold text-emerald-400 mb-0.5">Clara</div>
              <p className="text-sm text-white/80">Super ! Maintenant activons <strong className="text-white">{nextName}</strong></p>
            </div>
          </div>
          <div className="bg-white/5 rounded-xl p-3 mb-4">
            <h4 className="text-xs font-bold text-white mb-1">{nextName}</h4>
            <p className="text-[11px] text-white/50 leading-relaxed">{agentDescs[nextAgent] || 'Cet agent va automatiser une partie de ton business.'}</p>
          </div>
          <button onClick={goToNextAgent} className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-bold rounded-xl hover:shadow-lg transition min-h-[44px] mb-2">
            {'\u26A1'} Activer {nextName}
          </button>
          <button onClick={finishAll} className="w-full py-2 text-white/30 text-[10px] hover:text-white/50 transition">
            Je ferai plus tard
          </button>
        </div>
      </div>
    );
  }

  // Spotlight tour
  if (phase === 'tour') {
    const steps = AGENT_TOURS[agentId] || [{ target: 'agent-dashboard', title: 'Espace agent', description: 'Voici l\'espace de travail de cet agent. Explore les fonctionnalites !', position: 'bottom' as const }];
    return <SpotlightTour steps={steps} active={true} onFinish={finishTour} />;
  }

  // Confirmation modal with action
  if (phase !== 'confirm') return null;

  // What connection does this agent need?
  const agentConnections: Record<string, { label: string; url: string } | null> = {
    content: { label: 'Connecter Instagram', url: '/api/auth/instagram-oauth' },
    dm_instagram: { label: 'Connecter Instagram', url: '/api/auth/instagram-oauth' },
    instagram_comments: { label: 'Connecter Instagram', url: '/api/auth/instagram-oauth' },
    gmaps: { label: 'Connecter Google Business', url: '/api/auth/google-oauth' },
    tiktok_comments: { label: 'Connecter TikTok', url: '/api/auth/tiktok-oauth' },
    email: null, // Already configured
    commercial: null,
    seo: null,
    marketing: null,
    ads: null,
    chatbot: null,
    whatsapp: null,
    rh: null,
    comptable: null,
    onboarding: null,
    linkedin: { label: 'Connecter LinkedIn', url: '/api/auth/linkedin-oauth' },
  };

  const connection = agentConnections[agentId];
  const name = agentNames[agentId] || 'Agent';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-gray-900/95 backdrop-blur-xl border border-emerald-500/20 rounded-2xl shadow-2xl p-5 sm:p-6 max-w-sm w-full animate-in fade-in duration-200 relative text-center">
        <button onClick={finishAll} className="absolute top-3 right-3 text-white/20 hover:text-white/50 transition p-1">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        <div className="text-4xl mb-3">{'\u26A1'}</div>
        <h3 className="text-lg font-bold text-white mb-1">Activons {name} !</h3>

        {connection ? (
          <>
            <p className="text-xs text-white/50 mb-4">Connecte-toi pour que {name} puisse travailler pour toi</p>
            <a href={connection.url} className="block w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-bold rounded-xl hover:shadow-lg transition min-h-[44px] text-center mb-2">
              {'\u{1F517}'} {connection.label}
            </a>
            <button onClick={startTour} className="w-full py-2 text-white/40 text-xs hover:text-white/60 transition">
              Deja connecte ? Voir les fonctionnalites
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-white/50 mb-4">{name} est pret a travailler ! Decouvre ses fonctionnalites.</p>
            <button onClick={startTour} className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-bold rounded-xl hover:shadow-lg transition min-h-[44px]">
              {'\u{1F446}'} Voir les fonctionnalites
            </button>
          </>
        )}

        <button onClick={finishAll} className="w-full mt-2 py-2 text-white/30 text-[10px] hover:text-white/50 transition">
          Passer
        </button>
      </div>
    </div>
  );
}
