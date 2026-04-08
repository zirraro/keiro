'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * StrategyOnboarding — First popup when a new paying client arrives.
 * Clara asks about their goals and proposes a strategy that auto-configures agents.
 *
 * Strategies are designed around credit budgets:
 * - Créateur 400 cr: focus on 1 platform max
 * - Pro 800 cr: 2 platforms + extras
 * - Business 2000 cr: everything
 */

interface Strategy {
  id: string;
  name: string;
  icon: string;
  desc: string;
  detail: string;
  agents: Record<string, { auto_mode: boolean; auto_mode_instagram?: boolean; auto_mode_tiktok?: boolean; auto_mode_linkedin?: boolean }>;
  estimatedCredits: number;
}

const STRATEGIES: Strategy[] = [
  {
    id: 'instagram_focus',
    name: 'Instagram Focus',
    icon: '\u{1F4F8}',
    desc: 'Concentre tout sur Instagram : posts, reels, stories + DM auto',
    detail: '4-5 posts/sem + 1 reel/sem + DM prospection auto + commentaires auto. Ideal si ton audience est sur Instagram.',
    agents: {
      content: { auto_mode: true, auto_mode_instagram: true, auto_mode_tiktok: false, auto_mode_linkedin: false },
      dm_instagram: { auto_mode: true },
      email: { auto_mode: true },
      commercial: { auto_mode: true },
      gmaps: { auto_mode: true },
    },
    estimatedCredits: 200,
  },
  {
    id: 'tiktok_focus',
    name: 'TikTok Focus',
    icon: '\u{1F3B5}',
    desc: 'Concentre tout sur TikTok : videos courtes + engagement',
    detail: '3-4 videos/sem sur TikTok + email prospection. Ideal pour toucher une audience jeune ou virale.',
    agents: {
      content: { auto_mode: true, auto_mode_instagram: false, auto_mode_tiktok: true, auto_mode_linkedin: false },
      email: { auto_mode: true },
      commercial: { auto_mode: true },
    },
    estimatedCredits: 220,
  },
  {
    id: 'prospection',
    name: 'Machine a Prospects',
    icon: '\u{1F3AF}',
    desc: 'Priorite acquisition clients : emails + DM + CRM auto',
    detail: 'Emails de prospection auto + DM Instagram + CRM enrichi + avis Google. Peu de contenu, max de contacts. Ideal pour remplir ton agenda.',
    agents: {
      email: { auto_mode: true },
      dm_instagram: { auto_mode: true },
      commercial: { auto_mode: true },
      gmaps: { auto_mode: true },
      content: { auto_mode: true, auto_mode_instagram: true, auto_mode_tiktok: false, auto_mode_linkedin: false },
    },
    estimatedCredits: 120,
  },
  {
    id: 'multi_platform',
    name: 'Multi-plateforme',
    icon: '\u{1F680}',
    desc: 'Instagram + TikTok + Email + DM — pour les ambitieux',
    detail: '3 posts IG/sem + 2 TikTok/sem + emails + DM. Consomme plus de credits — recommande pour Pro (800 cr) ou Business.',
    agents: {
      content: { auto_mode: true, auto_mode_instagram: true, auto_mode_tiktok: true, auto_mode_linkedin: false },
      dm_instagram: { auto_mode: true },
      email: { auto_mode: true },
      commercial: { auto_mode: true },
      gmaps: { auto_mode: true },
    },
    estimatedCredits: 380,
  },
  {
    id: 'linkedin_b2b',
    name: 'LinkedIn B2B',
    icon: '\u{1F4BC}',
    desc: 'Contenu LinkedIn + prospection B2B pro',
    detail: '3-4 posts LinkedIn/sem + emails B2B + CRM. Ideal pour coaches, consultants, freelances, agences.',
    agents: {
      content: { auto_mode: true, auto_mode_instagram: false, auto_mode_tiktok: false, auto_mode_linkedin: true },
      email: { auto_mode: true },
      commercial: { auto_mode: true },
    },
    estimatedCredits: 150,
  },
];

export default function StrategyOnboarding() {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState<'goal' | 'strategy' | 'done'>('goal');
  const [goal, setGoal] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    // Only show once — check if strategy already chosen
    const done = localStorage.getItem('keiro_strategy_done');
    if (done) return;

    // Check if user is authenticated + has a paid plan
    const check = async () => {
      try {
        const res = await fetch('/api/me', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        if (!data.user) return;

        // Check plan
        const planRes = await fetch('/api/agents/dashboard?agent_id=marketing', { credentials: 'include' });
        if (!planRes.ok) return;
        const planData = await planRes.json();
        const plan = planData?.connections?.subscription_plan || 'free';
        if (plan === 'free') return;

        // Show popup after short delay
        setTimeout(() => setShow(true), 1500);
      } catch {}
    };
    check();
  }, []);

  const applyStrategy = useCallback(async (strategy: Strategy) => {
    setApplying(true);
    try {
      // Apply agent configs
      for (const [agentId, config] of Object.entries(strategy.agents)) {
        await fetch('/api/agents/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ agent_id: agentId, ...config, setup_completed: true }),
        });
      }
      // Mark as done
      localStorage.setItem('keiro_strategy_done', strategy.id);
      localStorage.setItem('keiro_strategy_date', new Date().toISOString());
      setStep('done');
    } catch {} finally {
      setApplying(false);
    }
  }, []);

  const filteredStrategies = goal === 'clients'
    ? STRATEGIES.filter(s => ['prospection', 'instagram_focus', 'linkedin_b2b'].includes(s.id))
    : goal === 'visibility'
    ? STRATEGIES.filter(s => ['instagram_focus', 'tiktok_focus', 'multi_platform'].includes(s.id))
    : goal === 'both'
    ? STRATEGIES
    : STRATEGIES;

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0f1d38] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-white/10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-emerald-500 to-green-600 flex items-center justify-center text-lg">{'\u{1F680}'}</div>
            <div>
              <h2 className="text-white font-bold text-lg">Clara — Configuration rapide</h2>
              <p className="text-white/50 text-xs">2 questions et tes agents sont prets</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {step === 'goal' && (
            <>
              <p className="text-white/80 text-sm mb-4">Quel est ton objectif principal ?</p>
              <div className="space-y-2">
                {[
                  { id: 'clients', icon: '\u{1F3AF}', label: 'Trouver des clients', sub: 'Prospection, emails, DM, pipeline' },
                  { id: 'visibility', icon: '\u{1F4F8}', label: 'Gagner en visibilite', sub: 'Posts, reels, stories, engagement' },
                  { id: 'both', icon: '\u{1F680}', label: 'Les deux !', sub: 'Contenu + prospection en parallele' },
                ].map(g => (
                  <button
                    key={g.id}
                    onClick={() => { setGoal(g.id); setStep('strategy'); }}
                    className="w-full flex items-center gap-3 p-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl transition text-left"
                  >
                    <span className="text-2xl">{g.icon}</span>
                    <div>
                      <p className="text-white font-medium text-sm">{g.label}</p>
                      <p className="text-white/40 text-xs">{g.sub}</p>
                    </div>
                  </button>
                ))}
              </div>
              <button onClick={() => { setShow(false); localStorage.setItem('keiro_strategy_done', 'skipped'); }} className="mt-4 text-white/30 text-xs hover:text-white/50 transition w-full text-center">
                Configurer moi-meme plus tard
              </button>
            </>
          )}

          {step === 'strategy' && (
            <>
              <p className="text-white/80 text-sm mb-4">Choisis ta strategie — on configure tout automatiquement :</p>
              <div className="space-y-3">
                {filteredStrategies.map(s => (
                  <button
                    key={s.id}
                    onClick={() => applyStrategy(s)}
                    disabled={applying}
                    className="w-full text-left p-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-cyan-500/30 rounded-xl transition group"
                  >
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-xl">{s.icon}</span>
                      <span className="text-white font-semibold text-sm group-hover:text-cyan-400 transition">{s.name}</span>
                      <span className="ml-auto text-[10px] text-white/30 bg-white/5 px-2 py-0.5 rounded-full">~{s.estimatedCredits} cr/mois</span>
                    </div>
                    <p className="text-white/50 text-xs leading-relaxed ml-9">{s.detail}</p>
                  </button>
                ))}
              </div>
              <button onClick={() => setStep('goal')} className="mt-3 text-white/30 text-xs hover:text-white/50 transition">
                {'\u2190'} Retour
              </button>
            </>
          )}

          {step === 'done' && (
            <div className="text-center py-6">
              <div className="text-4xl mb-3">{'\u2705'}</div>
              <h3 className="text-white font-bold text-lg mb-2">C&apos;est configure !</h3>
              <p className="text-white/60 text-sm mb-6">
                Tes agents sont actifs et travaillent pour toi. Tu peux modifier les reglages de chaque agent a tout moment.
              </p>
              <button
                onClick={() => { setShow(false); window.location.reload(); }}
                className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-sm rounded-xl hover:opacity-90 transition"
              >
                Voir mes agents
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
