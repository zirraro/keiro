'use client';

import { useLanguage } from '@/lib/i18n/context';

interface InstagramMetaInfoProps {
  onLearnMore?: () => void;
}

export default function InstagramMetaInfo({ onLearnMore }: InstagramMetaInfoProps) {
  const { t } = useLanguage();

  return (
    <div className="mb-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-blue-200 p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-md">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <div className="flex-1">
          <h4 className="font-bold text-neutral-900 text-sm mb-1 flex items-center gap-2">
            {t.library.imiTitle}
          </h4>
          <p className="text-xs text-neutral-700 leading-relaxed mb-3" dangerouslySetInnerHTML={{ __html: t.library.imiDesc }} />

          <div className="space-y-1.5 mb-3">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0"></div>
              <span className="text-neutral-600" dangerouslySetInnerHTML={{ __html: t.library.imiReqPro }} />
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-500 flex-shrink-0"></div>
              <span className="text-neutral-600" dangerouslySetInnerHTML={{ __html: t.library.imiReqFb }} />
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-1.5 h-1.5 rounded-full bg-pink-500 flex-shrink-0"></div>
              <span className="text-neutral-600" dangerouslySetInnerHTML={{ __html: t.library.imiReqMeta }} />
            </div>
          </div>

          {onLearnMore && (
            <button
              onClick={onLearnMore}
              className="inline-flex items-center gap-2 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors group"
            >
              <span>{t.library.imiLearnMore}</span>
              <svg className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
