'use client';

import { PhotoIcon } from './Icons';
import { useLanguage } from '@/lib/i18n/context';

interface VisitorBannerProps {
  onStartFree?: () => void;
}

export default function VisitorBanner({ onStartFree }: VisitorBannerProps) {
  const { t } = useLanguage();

  return (
    <div className="mb-6 bg-gradient-to-r from-[#0c1a3a] to-[#1e3a5f] rounded-xl p-6 text-white shadow-lg">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="text-center md:text-left">
          <div className="flex items-center gap-2 justify-center md:justify-start mb-2">
            <PhotoIcon className="w-5 h-5" />
            <span className="text-sm font-semibold uppercase tracking-wider">{t.library.vbVisitorMode}</span>
          </div>
          <h2 className="text-xl md:text-2xl font-bold mb-1">{t.library.vbDiscoverWorkspace}</h2>
          <p className="text-[#0c1a3a]/10 text-sm md:text-base">
            {t.library.vbUploadAndCreate}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 flex-shrink-0 justify-center">
          <button
            onClick={onStartFree}
            className="px-6 py-3 rounded-lg bg-white text-[#0c1a3a] font-semibold hover:bg-[#0c1a3a]/5 transition-all shadow-md hover:shadow-lg flex items-center gap-2"
          >
            <span>{t.library.vbStartFree}</span>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
          <a
            href="/login"
            className="px-6 py-3 rounded-lg bg-[#0c1a3a] text-white font-semibold hover:bg-[#1e3a5f] transition-colors border-2 border-white"
          >
            {t.library.vbSignIn}
          </a>
        </div>
      </div>
    </div>
  );
}
