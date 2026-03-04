'use client';

import { useLanguage } from '@/lib/i18n/context';

export default function Footer() {
  const { t, locale, setLocale } = useLanguage();

  return (
    <footer className="mt-16 border-t border-neutral-200/60">
      <div className="max-w-6xl mx-auto px-4 py-8 text-sm text-neutral-600 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div>© {new Date().getFullYear()} KeiroAI</div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setLocale(locale === 'fr' ? 'en' : 'fr')}
            className="flex items-center gap-1 text-neutral-500 hover:text-neutral-900 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
            {locale === 'fr' ? 'English' : 'Français'}
          </button>
          <a href="/pricing" className="hover:text-neutral-900 transition-colors">{t.nav.pricing}</a>
          <a href="/generate" className="hover:text-neutral-900 transition-colors">{t.nav.generate}</a>
        </div>
      </div>
    </footer>
  );
}
