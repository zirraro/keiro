"use client";

import { useEffect, useState } from 'react';

/**
 * Cadence mix slider — le client positionne son curseur entre 0% (full
 * images) et 100% (full vidéos). Affiche en LIVE la cadence résultante
 * + le coût estimé + la marge.
 *
 * Founder rule 2026-06-09 : "que le client mange ses crédits — il pose
 * son curseur où il veut, nous on s'adapte avec validation".
 *
 * Usage :
 *   <CadenceMixSlider plan="createur" onApply={(ratio) => ...} />
 *
 * Le `onApply` reçoit le ratio choisi pour que le parent puisse le
 * persister dans la config Léna (org_agent_configs.config.video_ratio).
 */

interface Cadence {
  ig_posts_per_week: number;
  ig_posts_per_day: number;
  ig_reels_per_week: number;
  tt_videos_per_week: number;
  tt_videos_per_day: number;
  tt_photos_per_day: number;
  stories_per_day: number;
  linkedin_per_week: number;
}

interface Preview {
  ok: boolean;
  plan: string;
  video_ratio: number;
  monthly_budget_eur: number;
  fixed_costs_eur: number;
  gen_budget_eur: number;
  cadence: Cadence;
  estimated_cost_per_month_eur: number;
  margin_pct: number;
  warnings: string[];
}

interface Props {
  plan: 'createur' | 'pro' | 'business' | 'elite' | 'agence' | 'fondateurs' | string;
  initialRatio?: number;
  onApply?: (ratio: number, preview: Preview) => void;
  /** If false, hides the "Appliquer" button — useful for read-only preview */
  showApply?: boolean;
}

export default function CadenceMixSlider({ plan, initialRatio = 40, onApply, showApply = true }: Props) {
  const [ratio, setRatio] = useState(initialRatio);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/agents/content/cadence-preview?plan=${plan}&video_ratio=${ratio}`)
      .then(r => r.json())
      .then((j: Preview) => { if (!cancelled) setPreview(j); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [plan, ratio]);

  const marginColor = preview?.margin_pct == null ? 'text-white/50'
    : preview.margin_pct >= 80 ? 'text-emerald-400'
    : preview.margin_pct >= 70 ? 'text-amber-400'
    : 'text-red-400';

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-bold text-white">⚖️ Ton mix contenu</h3>
          <p className="text-[11px] text-white/50">Positionne le curseur — on s'adapte pour rester dans ton budget plan {plan}.</p>
        </div>
        {preview && (
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-white/40">Marge estimée</div>
            <div className={`text-lg font-bold ${marginColor}`}>{preview.margin_pct}%</div>
          </div>
        )}
      </div>

      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] text-white/60">100% Images</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={ratio}
            onChange={(e) => setRatio(parseInt(e.target.value, 10))}
            className="flex-1 accent-cyan-500"
          />
          <span className="text-[11px] text-white/60">100% Vidéos</span>
        </div>
        <div className="flex justify-between text-[10px] text-white/40">
          <span>0%</span>
          <span className="font-bold text-cyan-400">{ratio}% vidéo</span>
          <span>100%</span>
        </div>
      </div>

      {loading && !preview && (
        <div className="text-xs text-white/40">Calcul en cours...</div>
      )}

      {preview && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
            <KpiTile label="📷 IG posts" main={`${preview.cadence.ig_posts_per_day}/jour`} sub={`${preview.cadence.ig_posts_per_week}/sem`} />
            <KpiTile label="🎬 IG reels" main={`${preview.cadence.ig_reels_per_week}/sem`} sub="" />
            <KpiTile label="🎥 TT vidéos" main={`${preview.cadence.tt_videos_per_week}/sem`} sub={preview.cadence.tt_videos_per_day >= 1 ? `~${preview.cadence.tt_videos_per_day}/jour` : ''} />
            <KpiTile label="🖼 TT Photo Mode" main={`${preview.cadence.tt_photos_per_day}/jour`} sub="recycle (gratuit)" />
            <KpiTile label="📌 Stories" main={`${preview.cadence.stories_per_day}/jour`} sub="recycle + teaser" />
            <KpiTile label="💼 LinkedIn" main={`${preview.cadence.linkedin_per_week}/sem`} sub={preview.cadence.linkedin_per_week === 0 ? 'plan supérieur' : ''} />
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.01] p-3 mb-3">
            <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
              <div>
                <div className="text-white/40 uppercase">Budget plan</div>
                <div className="text-sm font-bold text-white">{preview.monthly_budget_eur}€/mois</div>
              </div>
              <div>
                <div className="text-white/40 uppercase">Coût estimé</div>
                <div className={`text-sm font-bold ${preview.estimated_cost_per_month_eur > preview.monthly_budget_eur ? 'text-red-400' : 'text-emerald-400'}`}>
                  {preview.estimated_cost_per_month_eur}€
                </div>
              </div>
              <div>
                <div className="text-white/40 uppercase">Marge</div>
                <div className={`text-sm font-bold ${marginColor}`}>{preview.margin_pct}%</div>
              </div>
            </div>
          </div>

          {preview.warnings.length > 0 && (
            <ul className="space-y-1 mb-3">
              {preview.warnings.map((w, i) => (
                <li key={i} className="text-[10px] text-amber-300 flex items-start gap-1">
                  <span>⚠️</span><span>{w}</span>
                </li>
              ))}
            </ul>
          )}

          {showApply && onApply && (
            <button
              onClick={() => onApply(ratio, preview)}
              disabled={preview.warnings.some(w => w.includes('dépasse'))}
              className="w-full py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-400 text-[#0c1a3a] text-sm font-bold hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Appliquer ce mix
            </button>
          )}
        </>
      )}
    </div>
  );
}

function KpiTile({ label, main, sub }: { label: string; main: string; sub: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className="text-sm font-bold text-white mt-0.5">{main}</div>
      {sub && <div className="text-[10px] text-white/40 mt-0.5">{sub}</div>}
    </div>
  );
}
