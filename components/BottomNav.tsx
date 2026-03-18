"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/lib/i18n/context";
import { useTheme } from "@/lib/theme/context";

export default function BottomNav() {
  const pathname = usePathname();
  const { t, locale, setLocale } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';

  const toggleLocale = () => {
    setLocale(locale === 'fr' ? 'en' : 'fr');
  };

  const navItems = [
    {
      href: "/",
      label: t.nav.home,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      )
    },
    {
      href: "/generate",
      label: t.nav.generate,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      )
    },
    {
      href: "/studio",
      label: t.nav.studio,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      )
    },
    {
      href: "/library",
      label: t.nav.gallery,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      )
    },
    {
      href: "/assistant",
      label: t.nav.assistant,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      )
    },
    {
      href: "/pricing",
      label: t.nav.pricing,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      highlight: true
    },
  ];

  return (
    <nav className={`lg:hidden fixed bottom-0 left-0 right-0 z-40 backdrop-blur-lg border-t safe-area-inset-bottom transition-colors duration-300 ${
      isLight
        ? 'bg-white/80 border-neutral-200/50'
        : 'bg-[#0c1a3a]/80 border-white/10'
    }`}>
      {/* Language toggle + theme toggle — floating pills above bottom nav */}
      <div className="absolute -top-10 right-3 flex items-center gap-1.5">
        <button
          onClick={toggleTheme}
          className={`flex items-center justify-center w-8 h-8 backdrop-blur-sm border rounded-full shadow-sm active:scale-95 transition-all ${
            isLight
              ? 'bg-white/90 border-neutral-200 text-neutral-500 hover:bg-neutral-100'
              : 'bg-[#0c1a3a]/90 border-white/10 text-white/70 hover:bg-white/10'
          }`}
          title={isLight ? 'Mode sombre' : 'Mode clair'}
        >
          {isLight ? (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          )}
        </button>
        <button
          onClick={toggleLocale}
          className={`flex items-center gap-1 px-2.5 py-1 backdrop-blur-sm border rounded-full shadow-sm text-[11px] font-medium active:scale-95 transition-all ${
            isLight
              ? 'bg-white/90 border-neutral-200 text-neutral-500 hover:bg-neutral-100'
              : 'bg-[#0c1a3a]/90 border-white/10 text-white/70 hover:bg-white/10'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
          {locale === 'fr' ? 'EN' : 'FR'}
        </button>
      </div>

      <div className="flex justify-around items-center px-2 py-2 pb-[env(safe-area-inset-bottom,0.5rem)]">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const isHighlight = (item as any).highlight;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center min-w-[64px] px-3 py-2 rounded-lg transition-all ${
                isActive
                  ? (isLight ? 'text-neutral-900' : 'text-white')
                  : isHighlight
                    ? 'text-cyan-400'
                    : (isLight ? 'text-neutral-400' : 'text-white/60')
              } ${isLight ? 'hover:bg-neutral-100' : 'hover:bg-white/10'} active:scale-95`}
            >
              <div className={`mb-1 ${isActive ? 'scale-110' : ''} transition-transform`}>
                {item.icon}
              </div>
              <span className={`text-[10px] font-medium ${isActive ? 'font-semibold' : ''}`}>
                {item.label}
              </span>
              {isActive && (
                <div className={`mt-1 w-1 h-1 rounded-full ${isLight ? 'bg-neutral-900' : 'bg-white'}`} />
              )}
              {isHighlight && !isActive && (
                <div className="absolute -top-1 right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
