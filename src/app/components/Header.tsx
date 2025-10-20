'use client';
import Link from 'next/link';
export default function Header(){
  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b">
      <div className="mx-auto max-w-7xl px-4 h-12 flex items-center justify-between">
        <Link href="/" className="font-semibold">KeiroAI</Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/" className="hover:underline">Accueil</Link>
          <Link href="/generate" className="hover:underline">Générer</Link>
        </nav>
      </div>
    </header>
  );
}
