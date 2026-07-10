'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import SpotlightTour, { TourStep } from './SpotlightTour';
import { useLanguage } from '@/lib/i18n/context';

/**
 * AgentTutorial — Two phases:
 * 1. Quick confirmation modal "Agent activé!"
 * 2. Spotlight tour pointing at real UI elements
 *
 * Also handles "i" button replays.
 */

// Tour steps per agent, locale-aware. Target matches data-tour="xxx"
// attributes on the page. Kept as a hook so copy swaps with the UI
// language toggle without duplicating the table structure.
function useAgentTours(): Record<string, TourStep[]> {
  const { locale } = useLanguage();
  const isEn = locale === 'en';
  if (isEn) {
    return {
      content: [
        { target: 'auto-toggle', title: 'Auto publishing', description: 'Turn AUTO on so Léna publishes on your calendar. In MANUAL you approve every post before it ships.', position: 'bottom' },
        { target: 'agent-dashboard', title: 'Your posts', description: 'Every generated post lands here. Click to see the visual, caption and hashtags. Publish in one tap.', position: 'bottom' },
        { target: 'planning-view', switchTab: 'planning', title: 'Planning tab', description: 'Here is your 7-day editorial calendar with scheduled posts per platform. Click any post to preview, edit the caption/overlay, publish or reschedule.', position: 'bottom' },
      ],
      dm_instagram: [
        { target: 'auto-toggle', title: 'Auto DMs', description: 'In AUTO, Jade contacts prospects over Instagram DM and replies automatically. You are alerted when a prospect goes hot.', position: 'bottom' },
        { target: 'agent-dashboard', title: 'Conversations', description: 'Your ongoing DMs with prospects. Take over any conversation whenever Jade needs a hand.', position: 'bottom' },
        { target: 'agent-dashboard', title: 'What you handle yourself', description: 'In Settings, list keywords (e.g. "booking", "quote") you want to handle. Jade drafts a reply but notifies YOU to finalize. Sensitive messages (upset, threats, legal) auto-escalate too.', position: 'bottom' },
      ],
      email: [
        { target: 'auto-toggle', title: 'Auto emails', description: 'Hugo fires personalised prospecting sequences. Each prospect gets 3-6 emails spaced intelligently.', position: 'bottom' },
        { target: 'email-inbox', title: 'Inbox', description: 'Every email sent and every reply received. Filter by status (sent / opened / replied) and answer in place.', position: 'top' },
      ],
      gmaps: [
        { target: 'auto-toggle', title: 'Auto replies', description: 'Théo replies to every new Google review with a personalised message. Lifts your rating and local visibility.', position: 'bottom' },
      ],
      commercial: [
        { target: 'agent-dashboard', title: 'Your prospects', description: 'Léo sources and qualifies prospects automatically. See your pipeline per channel: email, Instagram, TikTok.', position: 'bottom' },
      ],
      seo: [
        { target: 'agent-dashboard', title: 'SEO articles', description: 'Théo writes blog articles optimised for Google. Each article targets a keyword to pull traffic to your site.', position: 'bottom' },
      ],
      marketing: [
        { target: 'agent-dashboard', title: 'Marketing analysis', description: 'Ami analyses performance across all channels and recommends concrete actions to improve results.', position: 'bottom' },
      ],
      ceo: [
        { target: 'agent-dashboard', title: 'Strategic view', description: 'Ami supervises every agent. He analyses results, sets direction, and adjusts strategy to your goals.', position: 'bottom' },
      ],
      chatbot: [
        { target: 'agent-dashboard', title: 'Chatbot on your site', description: 'Max greets visitors 24/7, answers questions and captures their contact details. Install it from the Settings tab.', position: 'bottom' },
      ],
      rh: [
        { target: 'agent-dashboard', title: 'Legal documents', description: 'Sara drafts your contracts, terms, legal notices and GDPR documents. Use the Editor tab to create and edit them.', position: 'bottom' },
      ],
      comptable: [
        { target: 'agent-dashboard', title: 'Finance', description: 'Louis builds business plans, forecasts and inventory tables. Use the Editor tab to work on your spreadsheets.', position: 'bottom' },
      ],
      onboarding: [
        { target: 'agent-dashboard', title: 'Your business profile', description: 'Complete your business dossier so every agent knows you better. The more complete it is, the sharper they get.', position: 'bottom' },
      ],
      ads: [
        { target: 'agent-dashboard', title: 'Ads (coming soon)', description: 'Félix will create and optimise your Meta Ads and Google Ads campaigns automatically. Coming soon.', position: 'bottom' },
      ],
      whatsapp: [
        { target: 'agent-dashboard', title: 'WhatsApp (coming soon)', description: 'Stella will reply to your WhatsApp Business messages automatically. Coming soon.', position: 'bottom' },
      ],
      tiktok_comments: [
        { target: 'agent-dashboard', title: 'TikTok (coming soon)', description: 'Axel will engage your TikTok community by commenting and interacting automatically. Coming soon.', position: 'bottom' },
      ],
      linkedin: [
        { target: 'agent-dashboard', title: 'LinkedIn (coming soon)', description: 'Lena will publish optimised LinkedIn content and engage your pro network. Coming soon.', position: 'bottom' },
      ],
      instagram_comments: [
        { target: 'agent-dashboard', title: 'Instagram comments', description: 'Automatic, personalised replies to every comment on your Instagram posts.', position: 'bottom' },
      ],
    };
  }
  return {
    content: [
      { target: 'auto-toggle', title: 'Publication automatique', description: 'Active le mode AUTO pour que Léna publie selon ton calendrier. En MANUEL, tu valides chaque post avant publication.', position: 'bottom' },
      { target: 'agent-dashboard', title: 'Tes publications', description: 'Tous tes posts generes apparaissent ici. Clique pour voir le visuel, la legende et les hashtags. Publie en un clic.', position: 'bottom' },
      { target: 'planning-view', switchTab: 'planning', title: 'Onglet Planning', description: 'Voici ton calendrier editorial sur 7 jours, avec les publications programmees par plateforme. Clique une publication pour la previsualiser, modifier la legende ou le texte sur l\u2019image, publier ou reprogrammer.', position: 'bottom' },
    ],
    dm_instagram: [
      { target: 'auto-toggle', title: 'DM automatique', description: 'En AUTO, Jade contacte tes prospects par DM Instagram et repond automatiquement. Tu es alerte quand un prospect est chaud.', position: 'bottom' },
      { target: 'agent-dashboard', title: 'Conversations', description: 'Tes DMs en cours avec les prospects. Tu peux reprendre la conversation a tout moment si Jade a besoin d\u2019aide.', position: 'bottom' },
      { target: 'agent-dashboard', title: 'Ce que tu g\u00e8res toi-m\u00eame', description: 'Dans les Param\u00e8tres, liste des mots-cl\u00e9s (ex : \u00ab r\u00e9servation \u00bb, \u00ab devis \u00bb) que tu veux g\u00e9rer. Jade pr\u00e9pare un brouillon mais te NOTIFIE pour que tu finalises. Les messages sensibles (m\u00e9content, menace, l\u00e9gal) escaladent aussi automatiquement.', position: 'bottom' },
    ],
    email: [
      { target: 'auto-toggle', title: 'Emails automatiques', description: 'Hugo envoie des sequences de prospection personnalisees. Chaque prospect recoit 3 a 6 emails espaces intelligemment.', position: 'bottom' },
      { target: 'email-inbox', title: 'Boite email', description: 'Tous les emails envoyes et les reponses recues. Filtre par statut (envoye, ouvert, repondu) et reponds directement.', position: 'top' },
    ],
    gmaps: [
      { target: 'auto-toggle', title: 'Reponses automatiques', description: 'Théo repond a chaque nouvel avis Google avec un message personnalise. Ameliore ta note et ta visibilite locale.', position: 'bottom' },
    ],
    commercial: [
      { target: 'agent-dashboard', title: 'Tes prospects', description: 'Léo cherche et qualifie tes prospects automatiquement. Tu vois ici le pipeline par canal : email, Instagram, TikTok.', position: 'bottom' },
    ],
    seo: [
      { target: 'agent-dashboard', title: 'Articles SEO', description: 'Théo redige des articles blog optimises pour Google. Chaque article cible un mot-cle pour attirer du trafic vers ton site.', position: 'bottom' },
    ],
    marketing: [
      { target: 'agent-dashboard', title: 'Analyse marketing', description: 'Ami analyse les performances de tous tes canaux et te recommande des actions concretes pour ameliorer tes resultats.', position: 'bottom' },
    ],
    ceo: [
      { target: 'agent-dashboard', title: 'Vision strategique', description: 'Ami supervise tous tes agents. Il analyse les resultats, donne la direction et ajuste la strategie selon tes objectifs.', position: 'bottom' },
    ],
    chatbot: [
      { target: 'agent-dashboard', title: 'Chatbot sur ton site', description: 'Max accueille tes visiteurs 24/7, repond a leurs questions et capture leurs coordonnees. Installe-le via l\u2019onglet Parametres.', position: 'bottom' },
    ],
    rh: [
      { target: 'agent-dashboard', title: 'Documents juridiques', description: 'Sara genere tes contrats, CGV, mentions legales et documents RGPD. Va dans l\u2019onglet Editeur pour creer et modifier tes documents.', position: 'bottom' },
    ],
    comptable: [
      { target: 'agent-dashboard', title: 'Gestion financiere', description: 'Louis cree tes business plans, previsionnels et inventaires. Va dans l\u2019onglet Editeur pour travailler sur tes tableaux Excel.', position: 'bottom' },
    ],
    onboarding: [
      { target: 'agent-dashboard', title: 'Ton profil business', description: 'Complete ton dossier business pour que tes agents te connaissent mieux. Plus c\u2019est complet, plus ils sont efficaces.', position: 'bottom' },
    ],
    ads: [
      { target: 'agent-dashboard', title: 'Publicite (bientot)', description: 'Félix creera et optimisera tes campagnes Meta Ads et Google Ads automatiquement. Cette fonctionnalite arrive bientot.', position: 'bottom' },
    ],
    whatsapp: [
      { target: 'agent-dashboard', title: 'WhatsApp (bientot)', description: 'Stella repondra automatiquement a tes messages WhatsApp Business. Cette fonctionnalite arrive bientot.', position: 'bottom' },
    ],
    tiktok_comments: [
      { target: 'agent-dashboard', title: 'TikTok (bientot)', description: 'Axel engagera ta communaute TikTok en commentant et interagissant automatiquement. Arrive bientot.', position: 'bottom' },
    ],
    linkedin: [
      { target: 'agent-dashboard', title: 'LinkedIn (bientot)', description: 'Lena publiera du contenu optimise sur LinkedIn et engagera ton reseau pro. Arrive bientot.', position: 'bottom' },
    ],
    instagram_comments: [
      { target: 'agent-dashboard', title: 'Commentaires Instagram', description: 'Reponses automatiques et personnalisees a tous les commentaires sur tes posts Instagram.', position: 'bottom' },
    ],
  };
}

export default function AgentTutorial({ agentId }: { agentId: string }) {
  const { locale } = useLanguage();
  const isEn = locale === 'en';
  const AGENT_TOURS = useAgentTours();
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
    commercial: 'Leo', seo: 'Théo', marketing: 'AMI', ads: 'Felix',
    chatbot: 'Clara', whatsapp: 'Stella', tiktok_comments: 'Axel',
    instagram_comments: 'Commentaires IG', rh: 'Sara', comptable: 'Louis', onboarding: 'Clara', linkedin: 'Lena',
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
      seo: 'Théo analyse ton SEO, suit tes mots-cles et te donne des recommandations concretes.',
      instagram_comments: 'Reponds automatiquement aux commentaires Instagram avec des reponses contextuelles.',
      tiktok_comments: 'Axel engage ta communaute TikTok en commentant et interagissant automatiquement.',
      chatbot: 'Max accueille tes visiteurs 24/7 sur ton site et capture leurs coordonnees.',
      whatsapp: 'Stella repond a tes messages WhatsApp et qualifie les prospects automatiquement.',
      ads: 'Felix cree et optimise tes campagnes Meta Ads et Google Ads.',
      rh: 'Sara genere tes documents juridiques : CGV, RGPD, contrats.',
      comptable: 'Louis suit tes revenus, depenses et marge automatiquement.',
      linkedin: 'Lena publie sur LinkedIn, commente et engage ton reseau pro pour generer des leads B2B.',
    };
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-gray-900/95 backdrop-blur-xl border border-emerald-500/20 rounded-2xl shadow-2xl p-5 sm:p-6 max-w-sm w-full animate-in fade-in duration-200 relative">
          <button onClick={finishAll} className="absolute top-3 right-3 text-white/45 hover:text-white/50 transition p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold flex-shrink-0">C</div>
            <div>
              <div className="text-xs font-bold text-emerald-400 mb-0.5">Clara</div>
              <p className="text-sm text-white/80">{isEn ? <>Nice work! Now let&apos;s activate <strong className="text-white">{nextName}</strong></> : <>Super ! Maintenant activons <strong className="text-white">{nextName}</strong></>}</p>
            </div>
          </div>
          <div className="bg-white/5 rounded-xl p-3 mb-4">
            <h4 className="text-xs font-bold text-white mb-1">{nextName}</h4>
            <p className="text-[11px] text-white/50 leading-relaxed">{agentDescs[nextAgent] || (isEn ? 'This agent will automate part of your business.' : 'Cet agent va automatiser une partie de ton business.')}</p>
          </div>
          <button onClick={goToNextAgent} className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-bold rounded-xl hover:shadow-lg transition min-h-[44px] mb-2">
            {'\u26A1'} {isEn ? 'Activate' : 'Activer'} {nextName}
          </button>
          <button onClick={finishAll} className="w-full py-2 text-white/30 text-[10px] hover:text-white/50 transition">
            {isEn ? 'I\u2019ll do it later' : 'Je ferai plus tard'}
          </button>
        </div>
      </div>
    );
  }

  // Spotlight tour
  if (phase === 'tour') {
    const base = AGENT_TOURS[agentId] || [{ target: 'agent-dashboard', title: isEn ? 'Agent workspace' : 'Espace agent', description: isEn ? 'This is the agent workspace — explore the features!' : 'Voici l\u2019espace de travail de cet agent. Explore les fonctionnalites !', position: 'bottom' as const }];
    // Étapes d'ONGLETS ajoutées dynamiquement (founder 10/07 : « montrer les
    // endroits concernés, si y'a un onglet montrer l'onglet »). On pointe le vrai
    // bouton d'onglet (data-tour="tab-xxx") pour que le halo tombe dessus.
    const extra: TourStep[] = [];
    if (['rh', 'comptable'].includes(agentId)) {
      extra.push({ target: 'tab-editor', title: isEn ? 'Editor tab' : 'Onglet Editeur',
        description: isEn ? 'Create and edit your documents/spreadsheets here — full editor with export.' : 'Cree et modifie tes documents/tableaux ici : editeur complet avec export.', position: 'bottom' });
    }
    // Tous les agents ont l'onglet Parametres : mis en evidence en dernier.
    extra.push({ target: 'tab-settings', title: isEn ? 'Settings tab' : 'Onglet Parametres',
      description: isEn ? 'Connect your accounts, set your preferences and the keywords you want to handle yourself. Everything is adjustable here.' : 'Connecte tes comptes, regle tes preferences et les mots-cles que tu veux gerer toi-meme. Tout est ajustable ici.', position: 'bottom' });

    const seen = new Set(base.map(s => s.target));
    const steps = [...base, ...extra.filter(s => !seen.has(s.target))];
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
        <button onClick={finishAll} className="absolute top-3 right-3 text-white/45 hover:text-white/50 transition p-1">
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
