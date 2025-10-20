"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Accueil" },
  { href: "/generate", label: "Générer" },
  { href: "/trendy", label: "Tendances" },
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
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-sm ${
                pathname === item.href
                  ? "font-semibold text-neutral-900"
                  : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              {item.label}
            </Link>
          ))}
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
