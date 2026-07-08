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
      if (!localStorage.getItem('keiro_cookie_consent')) setVisible(true);
    } catch { /* SSR / private mode */ }
  }, []);

  const decide = (granted: boolean) => {
    try {
      localStorage.setItem('keiro_cookie_consent', granted ? 'granted' : 'denied');
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
      className="fixed bottom-3 left-3 right-3 sm:left-auto sm:right-4 sm:bottom-4 sm:max-w-sm z-[9999]
                 rounded-2xl border border-black/10 dark:border-white/15 bg-white dark:bg-[#0c1a3a]
                 shadow-2xl p-4 sm:p-5 text-sm"
    >
      <p className="font-semibold text-gray-900 dark:text-white mb-1">
        {isEn ? 'We respect your privacy' : 'On respecte ta vie privée'}
      </p>
      <p className="text-gray-600 dark:text-white/70 leading-snug mb-3">
        {isEn
          ? 'We use measurement cookies to improve KeiroAI. Nothing is stored without your consent.'
          : 'On utilise des cookies de mesure pour améliorer KeiroAI. Rien n\'est stocké sans ton accord.'}{' '}
        <a href="/legal/privacy" className="underline text-gray-700 dark:text-white/80 hover:opacity-80">
          {isEn ? 'Learn more' : 'En savoir plus'}
        </a>
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => decide(false)}
          className="flex-1 px-3 py-2 rounded-xl border border-black/15 dark:border-white/20
                     text-gray-700 dark:text-white/80 font-medium hover:bg-black/[0.03] dark:hover:bg-white/10 transition"
        >
          {isEn ? 'Refuse' : 'Refuser'}
        </button>
        <button
          onClick={() => decide(true)}
          className="flex-1 px-3 py-2 rounded-xl bg-[#0c1a3a] dark:bg-white text-white dark:text-[#0c1a3a]
                     font-semibold hover:opacity-90 transition"
        >
          {isEn ? 'Accept' : 'Accepter'}
        </button>
      </div>
    </div>
  );
}
