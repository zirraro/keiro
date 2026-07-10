'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/i18n/context';

/**
 * Bannière de consentement cookies (conformité UE / Consent Mode v2).
 * Le défaut « denied » est posé dans layout.tsx AVANT GTM ; ici on met à jour
 * le consentement au clic. Tant qu'aucun choix n'est fait, aucun cookie de
 * mesure n'est déposé. Choix persisté (localStorage), re-appliqué au chargement.
 */
export default function CookieConsent() {
  const { locale } = useLanguage();
  const isEn = locale === 'en';
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      // Persisté via COOKIE domaine-parent (.keiroai.com) → une seule demande par
      // visiteur, partagée entre www / non-www (localStorage diffère entre eux et
      // ne survit pas à la navigation privée). localStorage = secours.
      const fromCookie = /(?:^|;\s*)keiro_cookie_consent=(granted|denied)/.exec(document.cookie);
      let stored = fromCookie?.[1] || null;
      if (!stored) { try { stored = localStorage.getItem('keiro_cookie_consent'); } catch { /* noop */ } }
      if (!stored) setVisible(true);
    } catch { /* SSR */ }
  }, []);

  const decide = (granted: boolean) => {
    try {
      const val = granted ? 'granted' : 'denied';
      // Cookie 1 an sur le domaine parent → jamais re-demandé sur tout keiroai.com.
      const host = window.location.hostname;
      const domain = host.endsWith('keiroai.com') ? '; domain=.keiroai.com' : '';
      document.cookie = `keiro_cookie_consent=${val}; max-age=31536000; path=/${domain}; SameSite=Lax`;
      try { localStorage.setItem('keiro_cookie_consent', val); } catch { /* noop */ }
      const w = window as any;
      if (typeof w.gtag === 'function') {
        w.gtag('consent', 'update', {
          ad_storage: granted ? 'granted' : 'denied',
          ad_user_data: granted ? 'granted' : 'denied',
          ad_personalization: granted ? 'granted' : 'denied',
          analytics_storage: granted ? 'granted' : 'denied',
        });
      }
    } catch { /* noop */ }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label={isEn ? 'Cookie consent' : 'Consentement cookies'}
      className="dark-section fixed bottom-3 left-3 right-3 sm:left-auto sm:right-4 sm:bottom-4 sm:max-w-sm z-[9999]
                 rounded-2xl border border-white/15 bg-[#0c1a3a]
                 shadow-2xl p-4 sm:p-5 text-sm"
    >
      <p className="font-semibold text-white mb-1">
        {isEn ? 'We respect your privacy' : 'On respecte ta vie privée'}
      </p>
      <p className="text-white/70 leading-snug mb-2">
        {isEn
          ? 'We use measurement cookies to improve KeiroAI. Nothing is stored without your consent.'
          : 'On utilise des cookies de mesure pour améliorer KeiroAI. Rien n\'est stocké sans ton accord.'}
      </p>
      <a
        href="/legal/privacy"
        className="inline-block mb-3 text-[10px] text-white/40 underline underline-offset-2 hover:opacity-70"
      >
        {isEn ? 'Learn more' : 'En savoir plus'}
      </a>
      <div className="flex gap-2">
        <button
          onClick={() => decide(false)}
          className="flex-1 px-3 py-2 rounded-xl border border-white/20
                     text-white/80 font-medium hover:bg-white/10 transition"
        >
          {isEn ? 'Refuse' : 'Refuser'}
        </button>
        <button
          onClick={() => decide(true)}
          className="flex-1 px-3 py-2 rounded-xl bg-white text-[#0c1a3a]
                     font-semibold hover:opacity-90 transition"
        >
          {isEn ? 'Accept' : 'Accepter'}
        </button>
      </div>
    </div>
  );
}
