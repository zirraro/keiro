'use client';
import Link from "next/link";
export default function Header(){
  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-gray-900 text-white text-xs">K</span>
          KeiroAI
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/" className="inline-flex items-center rounded-xl px-4 py-2.5 border border-gray-300 bg-white text-gray-900 hover:bg-gray-50">Accueil</Link>
          <Link href="/generate" className="inline-flex items-center rounded-xl px-4 py-2.5 bg-gray-900 text-white hover:bg-gray-800">Générer</Link>
        </nav>
      </div>
    </header>
  );
}
