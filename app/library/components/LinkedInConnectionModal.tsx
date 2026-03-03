'use client';

import { LinkedInIcon } from './Icons';
import { useLanguage } from '@/lib/i18n/context';

interface LinkedInConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LinkedInConnectionModal({ isOpen, onClose }: LinkedInConnectionModalProps) {
  const { t } = useLanguage();

  const handleConnect = () => {
    window.location.href = '/api/auth/linkedin-oauth';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
        <div className="relative bg-gradient-to-br from-[#0077B5] to-blue-700 px-5 py-5 text-white rounded-t-2xl">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors z-10"
            aria-label="Close"
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="relative flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <LinkedInIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{t.library.lcmTitle}</h2>
              <p className="text-white/90 text-xs">{t.library.connPublishOnProfile}</p>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="bg-gradient-to-r from-blue-50 to-sky-50 rounded-lg p-3 border border-blue-200">
            <h3 className="text-sm font-semibold text-neutral-900 mb-2">{t.library.connWhyConnect}</h3>
            <div className="grid grid-cols-2 gap-1.5 text-xs text-neutral-700">
              <div className="flex items-start gap-1.5">
                <span className="text-[#0077B5] font-bold">✓</span>
                <span><strong>{t.library.lcmDirectPublish}</strong></span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-[#0077B5] font-bold">✓</span>
                <span><strong>{t.library.lcmMediaSupported}</strong></span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-[#0077B5] font-bold">✓</span>
                <span><strong>{t.library.lcmSmartDrafts}</strong></span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-[#0077B5] font-bold">✓</span>
                <span><strong>{t.library.lcmTimeSaving}</strong></span>
              </div>
            </div>
          </div>

          <div className="border border-neutral-200 rounded-lg p-3">
            <h3 className="text-sm font-semibold text-neutral-900 mb-2">{t.library.connWhatYouNeed}</h3>
            <div className="flex gap-4 text-xs text-neutral-700">
              <div className="flex items-center gap-1.5">
                <span className="bg-blue-100 text-[#0077B5] font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-[10px]">1</span>
                <span>{t.library.lcmNeedAccount}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="bg-blue-100 text-[#0077B5] font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-[10px]">2</span>
                <span>{t.library.lcmAuthorizeKeiro}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="bg-blue-100 text-[#0077B5] font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-[10px]">3</span>
                <span>{t.library.lcmThatsAll}</span>
              </div>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex gap-2">
            <span className="text-lg">🔒</span>
            <p className="text-xs text-yellow-800">
              <strong>{t.library.connSecureOAuth}</strong>
            </p>
          </div>

          <button
            onClick={handleConnect}
            className="w-full py-3 bg-gradient-to-r from-[#0077B5] to-blue-600 text-white font-bold rounded-xl hover:from-[#005f8f] hover:to-blue-700 hover:shadow-lg transition-all flex items-center justify-center gap-2"
          >
            <LinkedInIcon className="w-5 h-5 text-white" />
            {t.library.lcmConnectBtn}
          </button>

          <p className="text-[10px] text-center text-neutral-500">
            {t.library.lcmDisconnect}
          </p>
        </div>
      </div>
    </div>
  );
}
