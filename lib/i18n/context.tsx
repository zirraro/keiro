'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { Locale, Translations } from './types';
import { fr } from './translations/fr';
import { en } from './translations/en';

const translations: Record<Locale, Translations> = { fr, en };

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType>({
  locale: 'fr',
  setLocale: () => {},
  t: fr,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('fr');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('keiro_language') as Locale | null;
    if (saved && (saved === 'fr' || saved === 'en')) {
      setLocaleState(saved);
    }
    setMounted(true);
  }, []);

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem('keiro_language', newLocale);
    document.documentElement.lang = newLocale;
  };

  // Avoid hydration mismatch — render nothing until mounted
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t: translations[locale] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
