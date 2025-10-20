'use client';
import Link from 'next/link';

export default function TopNav() {
  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        <Link href="/" className="font-semibold tracking-tight">KeiroAI</Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/" className="hover:underline">Accueil</Link>
          <Link href="/generate" className="hover:underline">Générer</Link>
          {/* Tendances retiré */}
        </nav>
      </div>
    </header>
  );
}
