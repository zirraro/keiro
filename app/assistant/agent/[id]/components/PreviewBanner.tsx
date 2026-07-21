'use client';

/**
 * PreviewBanner — shown at the top of agent dashboards when using demo data.
 * Includes Clara's message + connect CTA.
 * i18n: follows the workspace language (EN/FR). If `onConnect` is provided the
 * CTA becomes a button (for JS flows like the WhatsApp Embedded Signup) instead
 * of a plain link.
 */

import { useLanguage } from '@/lib/i18n/context';

interface PreviewBannerProps {
  agentName: string;
  connectLabel: string;
  connectUrl: string;
  claraMessage: string;
  gradientFrom: string;
  gradientTo: string;
  onConnect?: () => void;
}

export default function PreviewBanner({ agentName, connectLabel, connectUrl, claraMessage, gradientFrom, gradientTo, onConnect }: PreviewBannerProps) {
  const { locale } = useLanguage();
  const en = locale === 'en';
  const ctaClass = 'inline-flex items-center gap-1.5 px-4 py-2.5 text-xs sm:text-sm font-bold rounded-xl text-white shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all';
  const ctaStyle = { background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` };
  return (
    <div className="rounded-xl border-2 border-dashed border-amber-500/30 bg-gradient-to-r from-amber-900/10 to-orange-900/10 p-3 sm:p-4 mb-4">
      <div className="flex items-start gap-3">
        {/* Clara avatar */}
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-lg">
          C
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs font-bold text-emerald-400">Clara</span>
            <span className="text-[10px] text-white/30">{en ? 'Getting-started guide' : 'Guide de demarrage'}</span>
          </div>
          <p className="text-xs sm:text-sm text-white/70 leading-relaxed mb-3">{claraMessage}</p>

          <div className="flex flex-wrap items-center gap-2">
            {onConnect ? (
              <button type="button" onClick={onConnect} className={ctaClass} style={ctaStyle}>
                {'⚡'} {connectLabel}
              </button>
            ) : (
              <a href={connectUrl} className={ctaClass} style={ctaStyle}>
                {'⚡'} {connectLabel}
              </a>
            )}
            <span className="text-[10px] text-amber-400/60 flex items-center gap-1">
              {'\u{1F4F8}'} {en ? `This is a preview — connect to activate ${agentName}` : `Ceci est un apercu — connecte-toi pour activer ${agentName}`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
