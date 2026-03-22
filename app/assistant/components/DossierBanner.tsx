'use client';

import { useState, useEffect } from 'react';

interface DossierBannerProps {
  profile: Record<string, any> | null;
  claraAvatarUrl: string | null;
}

const DOSSIER_FIELDS = [
  'company_name',
  'company_description',
  'website',
  'target_audience',
  'main_products',
  'brand_tone',
  'social_goals_monthly',
  'content_themes',
  'competitors',
  'posting_frequency',
];

function computeCompleteness(profile: Record<string, any> | null): number {
  if (!profile) return 0;
  let filled = 0;
  for (const field of DOSSIER_FIELDS) {
    const val = profile[field];
    if (val && (typeof val !== 'string' || val.trim().length > 0)) {
      filled++;
    }
  }
  return Math.round((filled / DOSSIER_FIELDS.length) * 100);
}

export default function DossierBanner({ profile, claraAvatarUrl }: DossierBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const completeness = computeCompleteness(profile);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('keiro_dossier_banner_dismissed');
      if (stored === 'true') setDismissed(true);
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem('keiro_dossier_banner_dismissed', 'true');
    }
  };

  // Don't show if dismissed or if dossier is mostly complete
  if (dismissed || completeness >= 80) return null;

  return (
    <div className="relative bg-gradient-to-r from-[#0891b2]/20 to-[#2563eb]/20 border border-[#0891b2]/30 rounded-2xl p-4 mb-6">
      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
        aria-label="Fermer"
      >
        <svg className="w-3.5 h-3.5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="flex items-start gap-3">
        {/* Clara avatar */}
        <div className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-[#0891b2] to-[#2563eb] flex items-center justify-center">
          {claraAvatarUrl ? (
            <img src={claraAvatarUrl} alt="Clara" className="w-full h-full object-cover" style={{ objectPosition: 'top center' }} />
          ) : (
            <span className="text-lg">🚀</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Speech bubble */}
          <p className="text-white/80 text-xs mb-3">
            Complete ton dossier business pour que toute l&apos;equipe IA te donne de meilleurs resultats !
          </p>

          {/* Progress bar */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-white/60 text-[10px] font-medium">Dossier business</span>
                <span className="text-white/80 text-[10px] font-bold">{completeness}%</span>
              </div>
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#0891b2] to-[#2563eb] transition-all duration-500"
                  style={{ width: `${completeness}%` }}
                />
              </div>
            </div>

            <a
              href="/assistant/dossier"
              className="flex-shrink-0 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-[11px] font-semibold rounded-lg transition-colors"
            >
              Completer
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
