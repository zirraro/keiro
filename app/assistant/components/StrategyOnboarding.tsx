'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

/**
 * StrategyOnboarding — First popup for new paying clients.
 * Multi-select focus areas → credits estimate adapts dynamically.
 * User picks what matters, Clara auto-configures agents accordingly.
 */

interface Focus {
  id: string;
  name: string;
  icon: string;
  desc: string;
  creditsPerMonth: number;
  agents: Record<string, Record<string, boolean>>;
}

const FOCUS_OPTIONS: Focus[] = [
  {
    id: 'instagram',
    name: 'Instagram',
    icon: '\u{1F4F8}',
    desc: '4-5 posts/sem + reels + stories',
    creditsPerMonth: 120,
    agents: { content: { auto_mode: true, auto_mode_instagram: true } },
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    icon: '\u{1F3B5}',
    desc: '3-4 videos/sem',
    creditsPerMonth: 140,
    agents: { content: { auto_mode: true, auto_mode_tiktok: true } },
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: '\u{1F4BC}',
    desc: '3 posts pro/sem',
    creditsPerMonth: 80,
    agents: { content: { auto_mode: true, auto_mode_linkedin: true } },
  },
  {
    id: 'prospection',
    name: 'Prospection',
    icon: '\u{1F3AF}',
    desc: 'Emails + DM auto + CRM',
    creditsPerMonth: 60,
    agents: { email: { auto_mode: true }, dm_instagram: { auto_mode: true }, commercial: { auto_mode: true } },
  },
  {
    id: 'reputation',
    name: 'Avis Google',
    icon: '\u2B50',
    desc: 'Reponses auto aux avis',
    creditsPerMonth: 20,
    agents: { gmaps: { auto_mode: true } },
  },
  {
    id: 'seo',
    name: 'SEO & Blog',
    icon: '\u{1F50D}',
    desc: 'Articles blog optimises',
    creditsPerMonth: 40,
    agents: { seo: { auto_mode: true } },
  },
  {
    id: 'chatbot',
    name: 'Chatbot site web',
    icon: '\u{1F916}',
    desc: 'Capture leads 24/7',
    creditsPerMonth: 30,
    agents: { chatbot: { auto_mode: true } },
  },
];

export default function StrategyOnboarding() {
  const [show, setShow] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [step, setStep] = useState<'choose' | 'done'>('choose');

  useEffect(() => {
    const done = localStorage.getItem('keiro_strategy_done');
    if (done) return;

    const check = async () => {
      try {
        const res = await fetch('/api/me', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        if (!data.user) return;

        const planRes = await fetch('/api/agents/dashboard?agent_id=marketing', { credentials: 'include' });
        if (!planRes.ok) return;
        const planData = await planRes.json();
        const plan = planData?.connections?.subscription_plan || 'free';
        if (plan === 'free') return;

        setTimeout(() => setShow(true), 1500);
      } catch {}
    };
    check();
  }, []);

  const toggle = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const totalCredits = useMemo(() => {
    return FOCUS_OPTIONS.filter(f => selected.has(f.id)).reduce((sum, f) => sum + f.creditsPerMonth, 0);
  }, [selected]);

  const creditsBudget = 400; // Default Créateur — could read from plan

  const applyFocuses = useCallback(async () => {
    if (selected.size === 0) return;
    setApplying(true);
    try {
      // Merge all agent configs from selected focuses
      const mergedAgents: Record<string, Record<string, boolean>> = {};
      for (const focus of FOCUS_OPTIONS) {
        if (!selected.has(focus.id)) continue;
        for (const [agentId, config] of Object.entries(focus.agents)) {
          if (!mergedAgents[agentId]) mergedAgents[agentId] = {};
          Object.assign(mergedAgents[agentId], config);
        }
      }

      // For content agent: set networks not selected to false explicitly
      if (mergedAgents.content) {
        if (!mergedAgents.content.auto_mode_instagram) mergedAgents.content.auto_mode_instagram = false;
        if (!mergedAgents.content.auto_mode_tiktok) mergedAgents.content.auto_mode_tiktok = false;
        if (!mergedAgents.content.auto_mode_linkedin) mergedAgents.content.auto_mode_linkedin = false;
      }

      // Apply each agent config
      for (const [agentId, config] of Object.entries(mergedAgents)) {
        await fetch('/api/agents/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ agent_id: agentId, ...config, setup_completed: true }),
        });
      }

      localStorage.setItem('keiro_strategy_done', [...selected].join('+'));
      localStorage.setItem('keiro_strategy_date', new Date().toISOString());
      setStep('done');
    } catch {} finally {
      setApplying(false);
    }
  }, [selected]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0f1d38] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-white/10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-emerald-500 to-green-600 flex items-center justify-center text-lg">{'\u{1F680}'}</div>
            <div>
              <h2 className="text-white font-bold text-lg">Clara — Configuration rapide</h2>
              <p className="text-white/50 text-xs">Choisis tes priorites, on configure tout</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {step === 'choose' && (
            <>
              <p className="text-white/80 text-sm mb-4">Sur quoi veux-tu te concentrer ? <span className="text-white/40 text-xs">(choisis 1 ou plusieurs)</span></p>

              <div className="grid grid-cols-2 gap-2 mb-5">
                {FOCUS_OPTIONS.map(f => {
                  const isSelected = selected.has(f.id);
                  return (
                    <button
                      key={f.id}
                      onClick={() => toggle(f.id)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition text-center ${
                        isSelected
                          ? 'border-cyan-500/50 bg-cyan-500/15 shadow-lg shadow-cyan-500/10'
                          : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20'
                      }`}
                    >
                      <span className="text-xl">{f.icon}</span>
                      <span className={`text-xs font-bold ${isSelected ? 'text-cyan-400' : 'text-white'}`}>{f.name}</span>
                      <span className="text-[9px] text-white/40 leading-tight">{f.desc}</span>
                      <span className="text-[9px] text-white/20">~{f.creditsPerMonth} cr/mois</span>
                    </button>
                  );
                })}
              </div>

              {/* Credits estimate */}
              {selected.size > 0 && (
                <div className={`rounded-xl p-3 mb-4 border ${totalCredits <= creditsBudget ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/70">Estimation mensuelle :</span>
                    <span className={`font-bold ${totalCredits <= creditsBudget ? 'text-emerald-400' : 'text-amber-400'}`}>
                      ~{totalCredits} / {creditsBudget} credits
                    </span>
                  </div>
                  <div className="mt-2 h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${totalCredits <= creditsBudget ? 'bg-emerald-500' : 'bg-amber-500'}`}
                      style={{ width: `${Math.min((totalCredits / creditsBudget) * 100, 100)}%` }}
                    />
                  </div>
                  {totalCredits > creditsBudget && (
                    <p className="text-[10px] text-amber-400/70 mt-1.5">
                      Depasse ton budget credits — pense a passer au Pro (800 cr) ou reduis tes focus
                    </p>
                  )}
                </div>
              )}

              <button
                onClick={applyFocuses}
                disabled={selected.size === 0 || applying}
                className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-sm rounded-xl hover:opacity-90 transition disabled:opacity-30"
              >
                {applying ? 'Configuration en cours...' : `Configurer ${selected.size} focus${selected.size > 1 ? '' : ''}`}
              </button>

              <button onClick={() => { setShow(false); localStorage.setItem('keiro_strategy_done', 'skipped'); }} className="mt-3 text-white/30 text-xs hover:text-white/50 transition w-full text-center">
                Configurer moi-meme plus tard
              </button>
            </>
          )}

          {step === 'done' && (
            <div className="text-center py-6">
              <div className="text-4xl mb-3">{'\u2705'}</div>
              <h3 className="text-white font-bold text-lg mb-2">C&apos;est configure !</h3>
              <p className="text-white/60 text-sm mb-2">
                {selected.size} focus active{selected.size > 1 ? 's' : ''} : {[...selected].map(id => FOCUS_OPTIONS.find(f => f.id === id)?.name).filter(Boolean).join(', ')}
              </p>
              <p className="text-white/40 text-xs mb-6">
                Tes agents sont prets. Active-les un par un pour commencer.
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
