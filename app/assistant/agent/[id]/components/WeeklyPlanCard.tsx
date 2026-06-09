'use client';

/**
 * Weekly planning card + "Valider chaque publication" toggle.
 *
 * Moved out of ContentPanel (dashboard) into its own component to be
 * rendered in the Planning tab — founder ask 2026-06-09 :
 * "toute cette partie la doit etre dans l onglet planning pas dashboard".
 */

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function WeeklyPlanCard() {
  const [planningWeekly, setPlanningWeekly] = useState(false);
  const [planningWeeks, setPlanningWeeks] = useState<number | null>(null);
  const [weeklyToast, setWeeklyToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  const planWeek = async (weeks: 1 | 2 | 3 | 4) => {
    if (planningWeekly) return;
    const daysLabel = weeks === 1 ? '7 jours' : weeks === 2 ? '14 jours' : weeks === 3 ? '21 jours' : '30 jours (1 mois)';
    if (!window.confirm(`Léna va planifier ${daysLabel} de contenu (IG + TikTok + LinkedIn selon ce qui est connecté).\n\nTu pourras modifier ou supprimer chaque post avant sa date de publication.\n\nDémarrer la génération ?`)) return;
    setPlanningWeekly(true);
    setPlanningWeeks(weeks);
    try {
      const res = await fetch('/api/agents/content', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate_weekly', weeks }),
      });
      const d = await res.json();
      if (d.ok) {
        setWeeklyToast({ kind: 'ok', msg: `✓ ${d.inserted || 0} posts planifiés sur ${daysLabel}. Édite ou supprime chaque post avant sa date.` });
      } else {
        setWeeklyToast({ kind: 'err', msg: `Erreur : ${d.error || 'inconnu'}` });
      }
    } catch (e: any) {
      setWeeklyToast({ kind: 'err', msg: e?.message || 'Plan failed' });
    } finally {
      setPlanningWeekly(false);
      setPlanningWeeks(null);
      setTimeout(() => setWeeklyToast(null), 8000);
    }
  };

  return (
    <>
      <div className="rounded-xl border border-purple-500/30 bg-gradient-to-r from-purple-900/20 to-pink-900/20 p-3 mb-3">
        <div className="flex items-center gap-3 mb-2">
          <div className="text-2xl">📅</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-white">Planning à l&apos;avance</div>
            <div className="text-[11px] text-white/50">Génère 1 à 4 semaines de posts — modifie/supprime chaque post avant sa date</div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {([
            { weeks: 1, label: '7 jours', sub: '1 semaine' },
            { weeks: 2, label: '14 jours', sub: '2 semaines' },
            { weeks: 3, label: '21 jours', sub: '3 semaines' },
            { weeks: 4, label: '30 jours', sub: '1 mois' },
          ] as const).map(opt => {
            const isLoading = planningWeeks === opt.weeks;
            return (
              <button
                key={opt.weeks}
                onClick={() => planWeek(opt.weeks)}
                disabled={planningWeekly}
                className={`px-2 py-2.5 rounded-lg text-xs font-bold transition-all border ${
                  isLoading
                    ? 'bg-purple-600 text-white border-purple-400 cursor-wait'
                    : planningWeekly
                      ? 'bg-white/5 text-white/30 border-white/10 cursor-not-allowed'
                      : 'bg-white/10 text-white border-purple-500/30 hover:bg-gradient-to-r hover:from-purple-500 hover:to-pink-500 hover:border-transparent hover:scale-105 active:scale-95'
                }`}
              >
                {isLoading ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-1" />
                    <div className="text-[9px] text-white/70">en cours…</div>
                  </>
                ) : (
                  <>
                    <div>✨ {opt.label}</div>
                    <div className="text-[9px] text-white/40 mt-0.5">{opt.sub}</div>
                  </>
                )}
              </button>
            );
          })}
        </div>
        {/* Toggle Valider chaque publication — inline dans la card */}
        <div className="mt-3 pt-3 border-t border-purple-500/20">
          <ValidatePublicationsToggle />
        </div>
      </div>
      {weeklyToast && (
        <div className={`mb-3 px-3 py-2 rounded-lg text-xs ${weeklyToast.kind === 'ok' ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'}`}>
          {weeklyToast.msg}
        </div>
      )}
    </>
  );
}

function ValidatePublicationsToggle() {
  const [autoPublish, setAutoPublish] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const supabase = supabaseBrowser();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from('org_agent_configs')
          .select('config')
          .eq('user_id', user.id)
          .eq('agent_id', 'content')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const cfg = (data as any)?.config || {};
        // auto_publish === false means client validates manually
        setAutoPublish(cfg.auto_publish !== false);
      } catch {
        setAutoPublish(true);
      }
    })();
  }, []);

  const toggle = async () => {
    if (autoPublish === null || saving) return;
    const next = !autoPublish;
    setAutoPublish(next);
    setSaving(true);
    try {
      const supabase = supabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: existing } = await supabase
        .from('org_agent_configs')
        .select('id, config')
        .eq('user_id', user.id)
        .eq('agent_id', 'content')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const newConfig = { ...((existing as any)?.config || {}), auto_publish: next };
      if (existing?.id) {
        await supabase.from('org_agent_configs').update({ config: newConfig }).eq('id', (existing as any).id);
      } else {
        await supabase.from('org_agent_configs').insert({
          user_id: user.id,
          agent_id: 'content',
          is_enabled: true,
          config: newConfig,
        });
      }
    } catch {
      setAutoPublish(!next);
    } finally {
      setSaving(false);
    }
  };

  if (autoPublish === null) return null;
  const validateMode = !autoPublish;

  return (
    <div className="flex items-center gap-3">
      <div className="text-2xl">{validateMode ? '✋' : '⚡'}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-white">Valider chaque publication</div>
        <div className="text-[11px] text-white/50">
          {validateMode
            ? 'Léna prépare les posts dans le planning. TU valides chaque post manuellement avant publication.'
            : 'Léna publie automatiquement aux horaires planifiés. Pas de validation manuelle.'}
        </div>
      </div>
      <button
        onClick={toggle}
        disabled={saving}
        className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
          validateMode ? 'bg-cyan-500' : 'bg-white/20'
        } ${saving ? 'opacity-50' : ''}`}
        aria-label="Toggle valider publications"
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
            validateMode ? 'translate-x-6' : ''
          }`}
        />
      </button>
    </div>
  );
}
