'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * ClaraHelper — floating Clara popup that appears after the client
 * visits a few agent pages, offering help and tutorial.
 * Shows once per session, dismissable.
 */
export default function ClaraHelper() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // Only on agent pages
    if (!pathname?.startsWith('/assistant/agent/')) return;

    // Track visited agents in session
    try {
      const key = 'keiro_clara_visits';
      const visits = JSON.parse(sessionStorage.getItem(key) || '[]');
      if (!visits.includes(pathname)) {
        visits.push(pathname);
        sessionStorage.setItem(key, JSON.stringify(visits));
      }

      // Show after visiting 2+ agents
      if (visits.length >= 2) {
        const shownKey = 'keiro_clara_shown';
        if (!sessionStorage.getItem(shownKey)) {
          const timer = setTimeout(() => {
            setShow(true);
            sessionStorage.setItem(shownKey, 'true');
          }, 3000);
          return () => clearTimeout(timer);
        }
      }
    } catch {}
  }, [pathname]);

  if (!show || dismissed) return null;

  return (
    <div className="fixed bottom-20 lg:bottom-6 left-4 lg:left-6 z-50 animate-in slide-in-from-bottom-3 duration-300">
      <div className="bg-gray-900/95 backdrop-blur-xl border border-emerald-500/20 rounded-2xl shadow-2xl shadow-emerald-500/10 p-4 max-w-xs">
        <button
          onClick={() => setDismissed(true)}
          className="absolute top-2 right-2 text-white/20 hover:text-white/50 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-lg">
            C
          </div>
          <div>
            <div className="text-xs font-bold text-emerald-400 mb-1">Clara</div>
            <p className="text-xs text-white/70 leading-relaxed mb-2">
              Tout se passe bien ? Je peux t&apos;aider a configurer tes agents ou repondre a tes questions !
            </p>
            <div className="flex gap-2">
              <a
                href="/assistant/agent/onboarding"
                className="px-3 py-1.5 bg-emerald-600 text-white text-[10px] font-bold rounded-lg hover:bg-emerald-500 transition"
              >
                Aide-moi
              </a>
              <button
                onClick={() => setDismissed(true)}
                className="px-3 py-1.5 bg-white/10 text-white/50 text-[10px] rounded-lg hover:bg-white/15 transition"
              >
                Ca va merci !
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
