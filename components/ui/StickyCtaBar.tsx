'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/i18n/context';

/**
 * Persistent CTA bar pinned to the bottom of the viewport. Shows a
 * risk-reversal statement ("7 days free, no card required, cancel
 * anytime") + two CTAs (trial + pricing) on every page below the fold.
 *
 * Hides automatically on:
 *   - /checkout/* (user is already converting)
 *   - /assistant/* (logged-in product surface)
 *   - /login /signup (no upsell during auth)
 *
 * Dismissable once per session via the × button — we store the flag in
 * sessionStorage so it reappears on the next visit but not on every
 * page load within the same session.
 */
export function StickyCtaBar() {
  const { t, locale } = useLanguage();
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const path = window.location.pathname;
    const hidden =
      path.startsWith('/checkout') ||
      path.startsWith('/assistant') ||
      path.startsWith('/login') ||
      path.startsWith('/signup') ||
      path.startsWith('/admin') ||
      path.startsWith('/legal') ||
      path.startsWith('/api');
    if (hidden) return;

    if (sessionStorage.getItem('keiro_sticky_cta_dismissed') === '1') return;

    // Reveal after a short scroll so the bar doesn't smash into the hero.
    const onScroll = () => {
      if (window.scrollY > 400) {
        setVisible(true);
        window.removeEventListener('scroll', onScroll);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible || dismissed) return null;

  const en = locale === 'en';

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-40 border-t border-white/10 backdrop-blur-md"
      style={{ background: 'linear-gradient(to right, rgba(12,26,58,0.92), rgba(30,58,95,0.92))' }}
      role="region"
      aria-label={en ? 'Call to action' : 'Appel à l\'action'}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 flex items-center gap-3 sm:gap-5 flex-wrap sm:flex-nowrap">
        <p className="text-xs sm:text-sm text-white/85 flex-1 min-w-0">
          <span className="hidden sm:inline font-semibold text-white">
            {en ? '7 days free' : '7 jours gratuits'}
          </span>
          <span className="hidden sm:inline text-white/50"> · </span>
          <span className="text-white/80">
            {en ? 'no card required · cancel anytime' : 'sans carte bancaire · résilie quand tu veux'}
          </span>
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/checkout/upsell?plan=createur"
            className="px-3 sm:px-4 py-2 rounded-lg bg-white text-[#0c1a3a] text-xs sm:text-sm font-bold hover:opacity-90 transition whitespace-nowrap"
          >
            {en ? 'Start free' : 'Commencer gratuitement'}
          </Link>
          <Link
            href="/pricing"
            className="hidden sm:inline-flex px-3 sm:px-4 py-2 rounded-lg border border-white/25 text-white/85 text-xs sm:text-sm font-medium hover:bg-white/10 transition whitespace-nowrap"
          >
            {en ? 'See pricing' : 'Voir les prix'}
          </Link>
          <button
            onClick={() => {
              setDismissed(true);
              sessionStorage.setItem('keiro_sticky_cta_dismissed', '1');
            }}
            className="text-white/40 hover:text-white/80 p-1 -mr-1 transition"
            aria-label={en ? 'Dismiss' : 'Fermer'}
            type="button"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M6 18L18 6" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
