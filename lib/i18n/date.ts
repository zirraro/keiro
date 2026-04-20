/**
 * Date locale helper — returns the BCP-47 locale tag matching the current
 * UI language so Date.toLocaleString / toLocaleDateString don't hardcode
 * 'fr-FR' and leak French formatting to English users.
 *
 * Use inside client components:
 *   const dateLocale = useDateLocale();
 *   new Date(x).toLocaleDateString(dateLocale, { ... });
 */
'use client';

import { useLanguage } from './context';

export function useDateLocale(): string {
  const { locale } = useLanguage();
  if (locale === 'en') return 'en-US';
  return 'fr-FR';
}

/**
 * Non-hook variant for use inside helper functions that already receive
 * a locale string (from an outer useLanguage call).
 */
export function dateLocaleFor(locale: string | undefined): string {
  return locale === 'en' ? 'en-US' : 'fr-FR';
}
