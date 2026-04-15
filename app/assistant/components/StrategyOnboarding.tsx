'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLanguage } from '@/lib/i18n/context';

/**
 * StrategyOnboarding — First popup for new paying clients.
 * Multi-select focus areas → credits estimate adapts dynamically.
 * User picks what matters, Clara auto-configures agents accordingly.
 *
 * Persistence:
 *   - Writes to profiles.strategy_focuses (DB, via /api/me/strategy) — survives cache clear.
 *   - Mirrors to localStorage (keiro_strategy_done) so CeoPanel can read it without a fetch.
 *
 * Trigger:
 *   - Paying user, DB focuses === null (never shown).
 *   - Empty array (skipped) does NOT re-show.
 */

interface Focus {
  id: string;
  nameKey: string;
  descKey: string;
  icon: string;
  creditsPerMonth: number;
  agents: Record<string, Record<string, boolean>>;
}

const FOCUS_OPTIONS: Focus[] = [
  {
    id: 'instagram',
    nameKey: 'stratOptInstagram',
    descKey: 'stratOptInstagramDesc',
    icon: '\u{1F4F8}',
    creditsPerMonth: 120,
    agents: { content: { auto_mode: true, auto_mode_instagram: true } },
  },
  {
    id: 'tiktok',
    nameKey: 'stratOptTiktok',
    descKey: 'stratOptTiktokDesc',
    icon: '\u{1F3B5}',
    creditsPerMonth: 140,
    agents: { content: { auto_mode: true, auto_mode_tiktok: true } },
  },
  {
    id: 'linkedin',
    nameKey: 'stratOptLinkedin',
    descKey: 'stratOptLinkedinDesc',
    icon: '\u{1F4BC}',
    creditsPerMonth: 80,
    agents: { content: { auto_mode: true, auto_mode_linkedin: true } },
  },
  {
    id: 'prospection',
    nameKey: 'stratOptProspection',
    descKey: 'stratOptProspectionDesc',
    icon: '\u{1F3AF}',
    creditsPerMonth: 60,
    agents: { email: { auto_mode: true }, dm_instagram: { auto_mode: true }, commercial: { auto_mode: true } },
  },
  {
    id: 'reputation',
    nameKey: 'stratOptReputation',
    descKey: 'stratOptReputationDesc',
    icon: '\u2B50',
    creditsPerMonth: 20,
    agents: { gmaps: { auto_mode: true } },
  },
  {
    id: 'seo',
    nameKey: 'stratOptSeo',
    descKey: 'stratOptSeoDesc',
    icon: '\u{1F50D}',
    creditsPerMonth: 40,
    agents: { seo: { auto_mode: true } },
  },
  {
    id: 'chatbot',
    nameKey: 'stratOptChatbot',
    descKey: 'stratOptChatbotDesc',
    icon: '\u{1F916}',
    creditsPerMonth: 30,
    agents: { chatbot: { auto_mode: true } },
  },
];

const PLAN_NAMES_DISPLAY: Record<string, string> = {
  free: 'Free',
  createur: 'Créateur',
  pro: 'Pro',
  fondateurs: 'Fondateurs',
  business: 'Business',
  elite: 'Elite',
  agence: 'Agence',
};

function fmtTemplate(str: string, vars: Record<string, string | number>) {
  return Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, String(v)), str);
}

export default function StrategyOnboarding() {
  const { t } = useLanguage();
  const p = t.panels;
  const [show, setShow] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [step, setStep] = useState<'choose' | 'done'>('choose');
  const [plan, setPlan] = useState<string>('createur');
  const [planCredits, setPlanCredits] = useState<number>(400);

  useEffect(() => {
    const check = async () => {
      try {
        // Prefer DB state (cross-device, survives cache clears).
        const res = await fetch('/api/me/strategy', { credentials: 'include' });
        if (!res.ok) return; // 401 = not logged in, nothing to do.
        const data = await res.json();

        // Skipped or already set → don't show again.
        if (Array.isArray(data.focuses)) return;

        // Free plan → no popup (nothing to optimize).
        if (!data.plan || data.plan === 'free') return;

        setPlan(data.plan);
        setPlanCredits(data.planCredits || 400);

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

  const overBudget = totalCredits > planCredits;

  const applyFocuses = useCallback(async () => {
    if (selected.size === 0) return;
    setApplying(true);
    try {
      // Merge all agent configs from selected focuses.
      const mergedAgents: Record<string, Record<string, boolean>> = {};
      for (const focus of FOCUS_OPTIONS) {
        if (!selected.has(focus.id)) continue;
        for (const [agentId, config] of Object.entries(focus.agents)) {
          if (!mergedAgents[agentId]) mergedAgents[agentId] = {};
          Object.assign(mergedAgents[agentId], config);
        }
      }

      // Content agent: networks not picked are explicitly disabled.
      if (mergedAgents.content) {
        if (!mergedAgents.content.auto_mode_instagram) mergedAgents.content.auto_mode_instagram = false;
        if (!mergedAgents.content.auto_mode_tiktok) mergedAgents.content.auto_mode_tiktok = false;
        if (!mergedAgents.content.auto_mode_linkedin) mergedAgents.content.auto_mode_linkedin = false;
      }

      // Apply each agent config.
      for (const [agentId, config] of Object.entries(mergedAgents)) {
        await fetch('/api/agents/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ agent_id: agentId, ...config, setup_completed: true }),
        });
      }

      // Persist to DB so it survives cache clears / cross-device.
      const focusesArr = [...selected];
      await fetch('/api/me/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ focuses: focusesArr }),
      });

      // Mirror to localStorage for CeoPanel's existing cheap read.
      try {
        localStorage.setItem('keiro_strategy_done', focusesArr.join('+'));
        localStorage.setItem('keiro_strategy_date', new Date().toISOString());
      } catch {}

      setStep('done');
    } catch {} finally {
      setApplying(false);
    }
  }, [selected]);

  const skip = useCallback(async () => {
    setShow(false);
    // Persist empty array = skipped, so we don't re-show.
    try {
      await fetch('/api/me/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ focuses: [] }),
      });
      localStorage.setItem('keiro_strategy_done', 'skipped');
    } catch {}
  }, []);

  if (!show) return null;

  const planDisplayName = PLAN_NAMES_DISPLAY[plan] || plan;
  const selectedNames = [...selected]
    .map(id => {
      const f = FOCUS_OPTIONS.find(x => x.id === id);
      return f ? (p as any)[f.nameKey] : id;
    })
    .filter(Boolean)
    .join(', ');

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0f1d38] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-white/10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-emerald-500 to-green-600 flex items-center justify-center text-lg">{'\u{1F680}'}</div>
            <div>
              <h2 className="text-white font-bold text-lg">{p.stratTitle}</h2>
              <p className="text-white/50 text-xs">{p.stratSubtitle}</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {step === 'choose' && (
            <>
              <p className="text-white/80 text-sm mb-4">
                {p.stratQuestion} <span className="text-white/40 text-xs">{p.stratMultiHint}</span>
              </p>

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
                      <span className={`text-xs font-bold ${isSelected ? 'text-cyan-400' : 'text-white'}`}>
                        {(p as any)[f.nameKey]}
                      </span>
                      <span className="text-[9px] text-white/40 leading-tight">{(p as any)[f.descKey]}</span>
                      <span className="text-[9px] text-white/20">
                        {fmtTemplate(p.stratCreditsPerMonth, { n: f.creditsPerMonth })}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Credits estimate */}
              {selected.size > 0 && (
                <div className={`rounded-xl p-3 mb-4 border ${overBudget ? 'border-amber-500/30 bg-amber-500/10' : 'border-emerald-500/30 bg-emerald-500/10'}`}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/70">{p.stratEstimateLabel}</span>
                    <span className={`font-bold ${overBudget ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {fmtTemplate(p.stratCreditsFraction, { used: totalCredits, total: planCredits })}
                    </span>
                  </div>
                  <div className="mt-2 h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${overBudget ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min((totalCredits / planCredits) * 100, 100)}%` }}
                    />
                  </div>
                  {overBudget && (
                    <>
                      <p className="text-[10px] text-amber-400/80 mt-2 leading-relaxed">
                        {fmtTemplate(p.stratOverBudget, { plan: planDisplayName, total: planCredits })}
                      </p>
                      <div className="flex gap-2 mt-2">
                        <a
                          href="/pricing"
                          className="flex-1 px-2 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-[10px] font-semibold rounded-lg text-center transition"
                        >
                          {p.stratOverBudgetCtaUpgrade}
                        </a>
                        <button
                          onClick={() => setSelected(new Set())}
                          className="flex-1 px-2 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white/80 text-[10px] font-semibold rounded-lg transition"
                        >
                          {p.stratOverBudgetCtaReduce}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              <button
                onClick={applyFocuses}
                disabled={selected.size === 0 || applying}
                className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-sm rounded-xl hover:opacity-90 transition disabled:opacity-30 min-h-[44px]"
              >
                {applying
                  ? p.stratApplying
                  : fmtTemplate(selected.size > 1 ? p.stratApplyCtaPlural : p.stratApplyCta, { n: selected.size })}
              </button>

              <button
                onClick={skip}
                className="mt-3 text-white/30 text-xs hover:text-white/50 transition w-full text-center"
              >
                {p.stratSkipLater}
              </button>
            </>
          )}

          {step === 'done' && (
            <div className="text-center py-6">
              <div className="text-4xl mb-3">{'\u2705'}</div>
              <h3 className="text-white font-bold text-lg mb-2">{p.stratDoneTitle}</h3>
              <p className="text-white/60 text-sm mb-2">
                {fmtTemplate(
                  selected.size > 1 ? p.stratDoneBodyPlural : p.stratDoneBody,
                  { n: selected.size, list: selectedNames }
                )}
              </p>
              <p className="text-white/40 text-xs mb-6">{p.stratDoneHint}</p>
              <button
                onClick={() => { setShow(false); window.location.reload(); }}
                className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-sm rounded-xl hover:opacity-90 transition min-h-[44px]"
              >
                {p.stratDoneCta}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
