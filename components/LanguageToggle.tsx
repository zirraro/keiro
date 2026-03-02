'use client';

import { useLanguage } from '@/lib/i18n/context';

export default function LanguageToggle() {
  const { locale, setLocale } = useLanguage();

  return (
    <div className="flex items-center bg-neutral-100 rounded-full p-0.5">
      <button
        onClick={() => setLocale('fr')}
        className={`px-2.5 py-1 text-xs font-medium rounded-full transition-all ${
          locale === 'fr'
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-neutral-600 hover:text-neutral-900'
        }`}
      >
        FR
      </button>
      <button
        onClick={() => setLocale('en')}
        className={`px-2.5 py-1 text-xs font-medium rounded-full transition-all ${
          locale === 'en'
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-neutral-600 hover:text-neutral-900'
        }`}
      >
        EN
      </button>
    </div>
  );
}
