'use client';

/**
 * Clara — Onboarding guide dashboard panel.
 * Extracted from AgentDashboard.tsx. Embeds the StrategyPresets
 * multi-select focus picker as a private sub-component (only used here).
 */

import { useState, useEffect } from 'react';
import {
  fmtPercent,
  KpiCard, SectionTitle, ActionButton,
} from './Primitives';
import { useLanguage } from '@/lib/i18n/context';
import type { PanelProps } from './types';

/** Strategy presets — multi-select focus areas, changeable anytime from Clara's dashboard */
function StrategyPresets({ gradientFrom, gradientTo }: { gradientFrom: string; gradientTo: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [saved, setSaved] = useState(false);

  const focuses = [
    { id: 'instagram', icon: '\u{1F4F8}', name: 'Instagram', desc: '4-5 posts/sem + reels + stories', credits: 120, agents: { content: { auto_mode: true, auto_mode_instagram: true } } },
    { id: 'tiktok', icon: '\u{1F3B5}', name: 'TikTok', desc: '3-4 videos/sem', credits: 140, agents: { content: { auto_mode: true, auto_mode_tiktok: true } } },
    { id: 'linkedin', icon: '\u{1F4BC}', name: 'LinkedIn', desc: '3 posts pro/sem', credits: 80, agents: { content: { auto_mode: true, auto_mode_linkedin: true } } },
    { id: 'prospection', icon: '\u{1F3AF}', name: 'Prospection', desc: 'Emails + DM + CRM', credits: 60, agents: { email: { auto_mode: true }, dm_instagram: { auto_mode: true }, commercial: { auto_mode: true } } },
    { id: 'reputation', icon: '\u2B50', name: 'Avis Google', desc: 'Reponses auto', credits: 20, agents: { gmaps: { auto_mode: true } } },
    { id: 'seo', icon: '\u{1F50D}', name: 'SEO & Blog', desc: 'Articles optimises', credits: 40, agents: { seo: { auto_mode: true } } },
    { id: 'chatbot', icon: '\u{1F916}', name: 'Chatbot', desc: 'Capture leads 24/7', credits: 30, agents: { chatbot: { auto_mode: true } } },
  ];

  useEffect(() => {
    try {
      const stored = localStorage.getItem('keiro_strategy_done');
      if (stored && stored !== 'skipped') {
        setSelected(new Set(stored.split('+')));
      }
    } catch {}
  }, []);

  const totalCredits = focuses.filter(f => selected.has(f.id)).reduce((s, f) => s + f.credits, 0);

  const apply = async () => {
    setApplying(true);
    try {
      const mergedAgents: Record<string, Record<string, boolean>> = {};
      for (const focus of focuses) {
        if (!selected.has(focus.id)) continue;
        for (const [agentId, config] of Object.entries(focus.agents)) {
          if (!mergedAgents[agentId]) mergedAgents[agentId] = {};
          Object.assign(mergedAgents[agentId], config);
        }
      }
      if (mergedAgents.content) {
        if (!mergedAgents.content.auto_mode_instagram) mergedAgents.content.auto_mode_instagram = false;
        if (!mergedAgents.content.auto_mode_tiktok) mergedAgents.content.auto_mode_tiktok = false;
        if (!mergedAgents.content.auto_mode_linkedin) mergedAgents.content.auto_mode_linkedin = false;
      }
      for (const [agentId, config] of Object.entries(mergedAgents)) {
        await fetch('/api/agents/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ agent_id: agentId, ...config, setup_completed: true }),
        });
      }
      localStorage.setItem('keiro_strategy_done', [...selected].join('+'));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {} finally { setApplying(false); }
  };

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
        {focuses.map(f => {
          const active = selected.has(f.id);
          return (
            <button key={f.id} onClick={() => setSelected(prev => { const n = new Set(prev); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n; })}
              className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border transition text-center ${active ? 'border-cyan-500/50 bg-cyan-500/15' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'}`}>
              <span className="text-lg">{f.icon}</span>
              <span className={`text-[10px] font-bold ${active ? 'text-cyan-400' : 'text-white/70'}`}>{f.name}</span>
              <span className="text-[8px] text-white/30">~{f.credits} cr</span>
            </button>
          );
        })}
      </div>
      {selected.size > 0 && (
        <div className={`flex items-center justify-between px-3 py-2 rounded-lg mb-3 text-xs ${totalCredits <= 400 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
          <span>~{totalCredits} cr/mois</span>
          {totalCredits > 400 && <span className="text-[9px]">Depasse Createur (400 cr)</span>}
        </div>
      )}
      <button onClick={apply} disabled={selected.size === 0 || applying}
        className={`w-full py-2.5 text-xs font-bold rounded-xl transition ${saved ? 'bg-emerald-500/30 text-emerald-300' : 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:opacity-90'} disabled:opacity-30`}>
        {saved ? '\u2713 Strategie appliquee' : applying ? 'Application...' : 'Appliquer cette strategie'}
      </button>
    </div>
  );
}

export function OnboardingPanel({ data, agentName, gradientFrom, gradientTo }: PanelProps) {
  const { t } = useLanguage();
  const p = t.panels;
  const rawStats: any = data.onboardingStats || {};
  const stats: any = {
    completionPercent: rawStats.completenessScore ?? rawStats.completionPercent ?? 0,
    agentsActivated: rawStats.agentsDiscovered ?? 0,
    totalAgents: rawStats.totalAgents ?? 18,
    steps: rawStats.stepsCompleted ? [
      { name: 'Profil business', completed: rawStats.completenessScore >= 50 },
      { name: 'Dossier complet', completed: rawStats.completenessScore >= 80 },
      { name: 'Premier agent', completed: rawStats.agentsDiscovered >= 1 },
      { name: 'Réseaux connectés', completed: !!(data as any).connections?.instagram },
      { name: 'Premier lancement', completed: rawStats.agentsDiscovered >= 3 },
    ] : [
      { name: 'Identité marque', completed: false },
      { name: 'Connexion réseaux', completed: false },
      { name: 'Premier lancement', completed: false },
    ],
  };

  const defaultSteps = stats.steps.length > 0
    ? stats.steps
    : [
        { name: 'Identite marque', completed: false },
        { name: 'Connexion reseaux', completed: false },
        { name: 'Objectifs', completed: false },
        { name: 'Agents actives', completed: false },
        { name: 'Premier lancement', completed: false },
      ];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard
          label="Etape onboarding"
          value={`${stats.steps?.filter((s: any) => s.completed).length || 0}/${stats.steps?.length || 5}`}
          gradientFrom={gradientFrom}
          gradientTo={gradientTo}
        />
        <KpiCard label="% complete" value={fmtPercent(stats.completionPercent)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard
          label="Agents actives"
          value={`${stats.agentsActivated}/${stats.totalAgents}`}
          gradientFrom={gradientFrom}
          gradientTo={gradientTo}
        />
      </div>

      {/* Progress bar */}
      <SectionTitle>Progression</SectionTitle>
      <div className="bg-white/5 rounded-xl border border-white/10 p-4">
        <div className="h-4 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${stats.completionPercent}%`,
              background: `linear-gradient(90deg, ${gradientFrom}, ${gradientTo})`,
            }}
          />
        </div>
        <p className="text-xs text-white/50 mt-2 text-center">
          {stats.completionPercent < 100
            ? `Encore ${100 - stats.completionPercent}% pour terminer l'onboarding`
            : 'Onboarding termine !'}
        </p>
      </div>

      {/* Checklist */}
      <SectionTitle>Checklist</SectionTitle>
      <div className="bg-white/5 rounded-xl border border-white/10 p-4 flex flex-col gap-3">
        {defaultSteps.map((step: any, i: number) => (
          <div key={i} className="flex items-center gap-3">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
              style={{
                background: step.completed
                  ? `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`
                  : 'rgba(255,255,255,0.06)',
                color: step.completed ? '#fff' : 'rgba(255,255,255,0.3)',
              }}
            >
              {step.completed ? '\u2713' : i + 1}
            </div>
            <span
              className={`text-sm ${step.completed ? 'text-white/80 line-through' : 'text-white/60'}`}
            >
              {step.name}
            </span>
          </div>
        ))}
      </div>

      <ActionButton label="Reprendre l'onboarding" gradientFrom={gradientFrom} gradientTo={gradientTo} />

      {/* Strategy presets */}
      <SectionTitle>Strategie recommandee</SectionTitle>
      <StrategyPresets gradientFrom={gradientFrom} gradientTo={gradientTo} />
    </>
  );
}
