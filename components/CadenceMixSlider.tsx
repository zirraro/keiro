"use client";

import { useEffect, useState, type ReactElement } from 'react';

/**
 * Cadence mix slider — VUE CLIENT, version compacte avec :
 *   - Label "Image" à gauche + "Vidéo" à droite
 *   - Crédits restants au format "X / Y" sur l'enveloppe totale
 *   - Détail par plateforme avec LOGOS (Insta + TikTok + LinkedIn)
 *     plutôt que emojis génériques
 *   - Lignes claires : Image Insta, Image TikTok, Reel Insta,
 *     Reel TikTok, Story Insta, Story TikTok
 *
 * Founder rules 2026-06-09 :
 *   - "Image à gauche, vidéo à droite"
 *   - "X cr c'est pas parlant — montrer X/Y sur enveloppe totale"
 *   - "Mettre les logos plus que appareil photo et camera"
 *   - "Reel tiktok / reel insta, story insta / story tiktok,
 *      image insta / image tiktok avec les chiffres cohérents"
 */

interface Cadence {
  ig_posts_per_week: number;
  ig_reels_per_week: number;
  tt_videos_per_week: number;
  tt_photos_per_day: number;
  stories_per_day: number;
  linkedin_per_week: number;
}

interface Preview {
  ok: boolean;
  cadence: Cadence;
}

interface CreditBalance {
  balance: number;
  monthlyAllowance: number;
}

interface Props {
  plan: string;
  initialRatio?: number;
  onApply?: (ratio: number) => void;
  onBuyPack?: () => void;
}

// ─── Platform logos (inline SVG, no external dep) ──────────────
const InstagramLogo = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="inline-block flex-shrink-0">
    <defs>
      <linearGradient id="igGradMix" x1="0" y1="0" x2="24" y2="24">
        <stop offset="0%" stopColor="#FED576" />
        <stop offset="30%" stopColor="#F47133" />
        <stop offset="60%" stopColor="#BC3081" />
        <stop offset="100%" stopColor="#4C63D2" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="20" height="20" rx="5" fill="url(#igGradMix)" />
    <circle cx="12" cy="12" r="4.5" fill="none" stroke="#fff" strokeWidth="1.6" />
    <circle cx="17.5" cy="6.5" r="1.2" fill="#fff" />
  </svg>
);

const TikTokLogo = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="inline-block flex-shrink-0">
    <path d="M16.5 2v3.2a4 4 0 0 0 4 4V12a7 7 0 0 1-4-1.2v6.4a5.6 5.6 0 1 1-5.6-5.6h.7v3.3a2.4 2.4 0 1 0 1.7 2.3V2h3.2z" fill="#fff" />
    <path d="M14.5 2.5v14.5a3 3 0 1 1-3-3" stroke="#25F4EE" strokeWidth="0.8" fill="none" opacity="0.5" />
  </svg>
);

const LinkedInLogo = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="inline-block flex-shrink-0">
    <rect x="2" y="2" width="20" height="20" rx="3" fill="#0A66C2" />
    <path d="M6.5 9h2.5v8H6.5V9zm1.25-3.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM11 9h2.4v1.2c.5-.8 1.5-1.4 2.8-1.4 2.4 0 3.3 1.5 3.3 3.8V17h-2.5v-3.7c0-1-.2-2-1.5-2s-1.6 1-1.6 2V17H11V9z" fill="#fff" />
  </svg>
);

export default function CadenceMixSlider({ plan, initialRatio = 40, onApply, onBuyPack }: Props) {
  const [ratio, setRatio] = useState(initialRatio);
  const [cadence, setCadence] = useState<Cadence | null>(null);
  const [credits, setCredits] = useState<CreditBalance | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/agents/content/cadence-preview?plan=${plan}&video_ratio=${ratio}`)
      .then(r => r.json())
      .then((j: Preview) => { if (!cancelled && j.ok) setCadence(j.cadence); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [plan, ratio]);

  useEffect(() => {
    fetch('/api/credits/balance', { credentials: 'include' })
      .then(r => r.json())
      .then((j: any) => {
        if (typeof j?.balance === 'number') {
          setCredits({ balance: j.balance, monthlyAllowance: j.monthlyAllowance || j.balance });
        }
      })
      .catch(() => {});
  }, []);

  const pctRemaining = credits && credits.monthlyAllowance > 0
    ? Math.round((credits.balance / credits.monthlyAllowance) * 100)
    : 100;
  const lowCredits = pctRemaining < 15;

  const handleApply = async () => {
    if (!onApply) return;
    setApplying(true);
    try { await onApply(ratio); } finally { setApplying(false); }
  };

  // ─── Build platform breakdown rows ───────────────────────────
  const rows = cadence
    ? [
        {
          logo: <InstagramLogo />,
          label: 'Instagram',
          items: [
            cadence.ig_posts_per_week > 0 ? { type: 'Image', count: `${cadence.ig_posts_per_week}/sem` } : null,
            cadence.ig_reels_per_week > 0 ? { type: 'Reel', count: `${cadence.ig_reels_per_week}/sem` } : null,
            cadence.stories_per_day > 0 ? { type: 'Story', count: `${Math.round(cadence.stories_per_day * 7)}/sem` } : null,
          ].filter(Boolean) as { type: string; count: string }[],
        },
        {
          logo: <TikTokLogo />,
          label: 'TikTok',
          items: [
            cadence.tt_photos_per_day > 0 ? { type: 'Image', count: `${Math.round(cadence.tt_photos_per_day * 7)}/sem` } : null,
            cadence.tt_videos_per_week > 0 ? { type: 'Reel', count: `${cadence.tt_videos_per_week}/sem` } : null,
            cadence.stories_per_day > 0 ? { type: 'Story', count: `${Math.round(cadence.stories_per_day * 7)}/sem` } : null,
          ].filter(Boolean) as { type: string; count: string }[],
        },
        cadence.linkedin_per_week > 0
          ? {
              logo: <LinkedInLogo />,
              label: 'LinkedIn',
              items: [{ type: 'Post', count: `${cadence.linkedin_per_week}/sem` }],
            }
          : null,
      ].filter(Boolean) as { logo: ReactElement; label: string; items: { type: string; count: string }[] }[]
    : [];

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3">
      {/* Title row + crédits envelope */}
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-white/80">⚖️ Mix contenu</span>
        </div>
        {credits && (
          <div
            className={`text-[10px] px-2 py-0.5 rounded-full border ${
              lowCredits
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                : 'border-white/10 bg-white/5 text-white/70'
            }`}
            title={`Crédits restants ce mois sur ton plan`}
          >
            {credits.balance}<span className="text-white/40"> / {credits.monthlyAllowance}</span> crédits
          </div>
        )}
      </div>

      {/* Slider row : Image LEFT, Vidéo RIGHT */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] text-white/60 whitespace-nowrap font-medium">📷 Image</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={ratio}
          onChange={(e) => setRatio(parseInt(e.target.value, 10))}
          className="flex-1 accent-cyan-500"
        />
        <span className="text-[11px] text-white/60 whitespace-nowrap font-medium">🎬 Vidéo</span>
        <span className="text-[11px] font-bold text-cyan-400 whitespace-nowrap min-w-[42px] text-right">{ratio}%</span>
      </div>

      {/* Platform breakdown — logos + items concrets */}
      {rows.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px] flex-wrap">
              {row.logo}
              <span className="text-white/80 font-medium min-w-[60px]">{row.label}</span>
              <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                {row.items.length === 0 ? (
                  <span className="text-white/30">—</span>
                ) : (
                  row.items.map((it, j) => (
                    <span key={j} className="text-white/70">
                      {it.type} <strong className="text-white">{it.count}</strong>
                    </span>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Apply button */}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={handleApply}
          disabled={applying}
          className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-cyan-400 text-[#0c1a3a] text-xs font-bold hover:opacity-90 transition disabled:opacity-40"
        >
          {applying ? 'Application...' : 'Appliquer ce mix'}
        </button>
      </div>

      {/* Upsell pack quand crédits faibles */}
      {lowCredits && onBuyPack && (
        <div className="mt-2 flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <span className="text-[11px] text-amber-300">⚡ Quota faible ({pctRemaining}% restants ce mois)</span>
          <button onClick={onBuyPack} className="text-[10px] font-bold px-2 py-1 rounded bg-amber-500 text-[#0c1a3a] hover:opacity-90">💎 Booster</button>
        </div>
      )}
    </div>
  );
}
