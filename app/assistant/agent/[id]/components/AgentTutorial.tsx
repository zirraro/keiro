'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * AgentTutorial — Overlay that appears when the wizard navigates to an agent page.
 * Shows key features of the agent, then offers to go to next agent or finish.
 */

const AGENT_TUTORIALS: Record<string, {
  title: string;
  features: Array<{ icon: string; title: string; desc: string }>;
}> = {
  content: {
    title: 'Lena est activee !',
    features: [
      { icon: '\u{1F4F8}', title: 'Posts automatiques', desc: 'Lena genere et publie 3 posts/jour sur tes reseaux' },
      { icon: '\u{1F4C5}', title: 'Calendrier editorial', desc: 'Visualise tes publications passees et a venir par plateforme' },
      { icon: '\u2705', title: 'Validation', desc: 'En mode manuel, tu valides chaque post avant publication' },
    ],
  },
  dm_instagram: {
    title: 'Jade est activee !',
    features: [
      { icon: '\u{1F4AC}', title: 'Conversations DM', desc: 'Tes conversations Instagram apparaissent ici en temps reel' },
      { icon: '\u{1F916}', title: 'Reponses auto', desc: 'Jade repond automatiquement et qualifie tes prospects' },
      { icon: '\u{1F525}', title: 'Alertes prospects chauds', desc: 'Tu es notifie quand un prospect est pret a acheter' },
    ],
  },
  email: {
    title: 'Hugo est active !',
    features: [
      { icon: '\u{1F4E7}', title: 'Inbox email', desc: 'Tes emails envoyes et recus apparaissent ici' },
      { icon: '\u{1F680}', title: 'Sequences auto', desc: 'Hugo envoie des sequences personnalisees a tes prospects' },
      { icon: '\u{1F4CA}', title: 'Suivi', desc: 'Ouvertures, clics et reponses en temps reel' },
    ],
  },
  gmaps: {
    title: 'Theo est active !',
    features: [
      { icon: '\u2B50', title: 'Avis Google', desc: 'Tes avis apparaissent ici avec un bouton repondre' },
      { icon: '\u{1F916}', title: 'Reponses IA', desc: 'Theo genere des reponses personnalisees a chaque avis' },
      { icon: '\u{1F4E8}', title: 'Publication directe', desc: 'Publie la reponse sur Google en 1 clic' },
    ],
  },
  commercial: {
    title: 'Leo est active !',
    features: [
      { icon: '\u{1F465}', title: 'CRM prospects', desc: 'Tes prospects sont qualifies et scores automatiquement' },
      { icon: '\u{1F310}', title: 'Prospection Google Maps', desc: 'Leo trouve des prospects dans ta zone automatiquement' },
      { icon: '\u{1F4C8}', title: 'Pipeline', desc: 'Suis la conversion de tes leads en clients' },
    ],
  },
  seo: {
    title: 'Oscar est active !',
    features: [
      { icon: '\u{1F50D}', title: 'Audit SEO', desc: 'Oscar analyse ton site et donne des recommandations concretes' },
      { icon: '\u{1F4DD}', title: 'Mots-cles', desc: 'Suivi de tes positions Google et opportunites' },
    ],
  },
  instagram_comments: {
    title: 'Commentaires IG actives !',
    features: [
      { icon: '\u{1F4AC}', title: 'Commentaires', desc: 'Tes commentaires Instagram apparaissent ici' },
      { icon: '\u{1F916}', title: 'Reponses auto', desc: 'Reponses contextuelles generees par l\'IA' },
    ],
  },
};

// Default tutorial for agents without specific config
const DEFAULT_TUTORIAL = {
  title: 'Agent active !',
  features: [
    { icon: '\u2705', title: 'Pret a travailler', desc: 'Cet agent va commencer a executer ses taches automatiquement' },
  ],
};

export default function AgentTutorial({ agentId }: { agentId: string }) {
  const [active, setActive] = useState(false);
  const [wizardAgents, setWizardAgents] = useState<string[]>([]);
  const [nextIndex, setNextIndex] = useState(0);
  const [totalAgents, setTotalAgents] = useState(0);
  const router = useRouter();

  useEffect(() => {
    try {
      const isWizard = sessionStorage.getItem('keiro_wizard_active');
      const currentAgent = sessionStorage.getItem('keiro_wizard_agent');
      if (isWizard === 'true' && currentAgent === agentId) {
        setActive(true);
        setNextIndex(parseInt(sessionStorage.getItem('keiro_wizard_next') || '0'));
        setTotalAgents(parseInt(sessionStorage.getItem('keiro_wizard_total') || '0'));
        setWizardAgents(JSON.parse(sessionStorage.getItem('keiro_wizard_agents') || '[]'));
        // Clear current agent marker
        sessionStorage.removeItem('keiro_wizard_agent');
      }
    } catch {}
  }, [agentId]);

  const goNext = () => {
    if (nextIndex < wizardAgents.length) {
      const nextAgentId = wizardAgents[nextIndex];
      // Save wizard state for next agent
      try {
        sessionStorage.setItem('keiro_wizard_agent', nextAgentId);
        sessionStorage.setItem('keiro_wizard_next', String(nextIndex + 1));
      } catch {}
      // Activate next agent
      fetch('/api/agents/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ agent_id: nextAgentId, auto_mode: true, setup_completed: true }),
      }).catch(() => {});
      router.push('/assistant/agent/' + nextAgentId);
    } else {
      finishWizard();
    }
  };

  const finishWizard = () => {
    try {
      sessionStorage.removeItem('keiro_wizard_active');
      sessionStorage.removeItem('keiro_wizard_agent');
      sessionStorage.removeItem('keiro_wizard_next');
      sessionStorage.removeItem('keiro_wizard_total');
      sessionStorage.removeItem('keiro_wizard_agents');
    } catch {}
    setActive(false);
  };

  const showOptionalList = nextIndex >= 2; // After Lena + Jade, show optional list

  if (!active) return null;

  const tut = AGENT_TUTORIALS[agentId] || DEFAULT_TUTORIAL;
  const hasMore = nextIndex < wizardAgents.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-gray-900/95 backdrop-blur-xl border border-emerald-500/20 rounded-2xl shadow-2xl p-5 sm:p-6 max-w-md w-full animate-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="text-center mb-4">
          <div className="text-3xl mb-2">{'\u{1F389}'}</div>
          <h3 className="text-lg font-bold text-white">{tut.title}</h3>
          <div className="flex justify-center gap-1 mt-2">
            {wizardAgents.slice(0, Math.min(nextIndex, wizardAgents.length)).map((_, i) => (
              <div key={i} className="w-2 h-2 rounded-full bg-emerald-400" />
            ))}
            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
            {wizardAgents.slice(nextIndex + 1).map((_, i) => (
              <div key={i} className="w-2 h-2 rounded-full bg-white/20" />
            ))}
          </div>
        </div>

        {/* Features */}
        <div className="space-y-3 mb-5">
          {tut.features.map((f, i) => (
            <div key={i} className="flex items-start gap-3 bg-white/5 rounded-xl p-3">
              <span className="text-lg">{f.icon}</span>
              <div>
                <div className="text-xs font-bold text-white">{f.title}</div>
                <div className="text-[10px] text-white/50">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        {showOptionalList ? (
          <div className="space-y-2">
            <p className="text-xs text-white/50 text-center mb-2">Agents principaux actives ! Veux-tu activer les suivants ?</p>
            {hasMore ? (
              <div className="flex gap-2">
                <button onClick={goNext} className="flex-1 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-500 transition min-h-[40px]">
                  {'\u26A1'} Activer le suivant
                </button>
                <button onClick={finishWizard} className="flex-1 py-2.5 bg-white/10 text-white/60 text-xs rounded-xl hover:bg-white/15 transition min-h-[40px]">
                  Plus tard
                </button>
              </div>
            ) : (
              <button onClick={finishWizard} className="w-full py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl min-h-[40px]">
                {'\u{1F680}'} C&apos;est parti !
              </button>
            )}
          </div>
        ) : (
          <button onClick={goNext} className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-bold rounded-xl hover:shadow-lg transition min-h-[44px]">
            {hasMore ? `Agent suivant (${nextIndex + 1}/${totalAgents})` : '\u{1F680} C\'est parti !'}
          </button>
        )}
      </div>
    </div>
  );
}
