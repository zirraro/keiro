"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Accueil" },
  { href: "/generate", label: "Générer" },
  { href: "/studio", label: "Studio Édition" },
  { href: "/library", label: "Librairie" },
  { href: "/pricing", label: "Tarifs", highlight: true },
];

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Logo / marque */}
        <Link href="/" className="text-lg font-bold text-neutral-900">
          KeiroAI
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-6">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const isHighlight = (item as any).highlight;

            if (isHighlight) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="relative px-4 py-2 text-sm font-medium bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg hover:shadow-lg transition-all"
                >
                  <span className="relative">
                    {item.label}
                    <span className="absolute -top-2 -right-3 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
                    </span>
                  </span>
                </Link>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm transition ${
                  isActive
                    ? "font-semibold text-blue-600"
                    : "text-neutral-600 hover:text-neutral-900"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Bouton auth placeholder */}
        <div>
          <Link
            href="#"
            className="text-sm text-neutral-500 hover:text-neutral-800"
          >
            Se connecter
          </Link>
        </div>
      </div>
    </header>
  );
}
