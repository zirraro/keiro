import Link from "next/link";
import type { ReactNode } from "react";

export const revalidate = 0;

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <header className="border-b border-neutral-200 sticky top-0 bg-white/90 backdrop-blur z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="font-bold">Keiro</Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/dashboard" className="hover:underline">Dashboard</Link>
            <Link href="/dashboard/library" className="hover:underline">Librairie</Link>
            <Link href="/pricing" className="hover:underline">Pricing</Link>
          </nav>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8 grid lg:grid-cols-12 gap-8">
        <section className="lg:col-span-8">
          {children}
        </section>

        {/* Colonne de droite : sous-partie "Librairie d’assets" */}
        <aside className="lg:col-span-4">
          <div className="sticky top-20 space-y-4">
            <div className="rounded-2xl border border-neutral-200 p-4">
              <h3 className="text-sm font-semibold mb-2">Librairie d’assets</h3>
              <p className="text-sm text-neutral-500">
                Centralisez vos logos, palettes, templates et médias pour des générations plus personnalisées.
              </p>
              <div className="mt-3 flex gap-2">
                <Link
                  href="/dashboard/library"
                  className="px-3 py-2 rounded-md bg-neutral-900 text-white text-sm hover:opacity-90"
                >
                  Ouvrir la librairie
                </Link>
                <Link
                  href="/dashboard?upload=1"
                  className="px-3 py-2 rounded-md border border-neutral-300 text-sm hover:bg-neutral-50"
                >
                  Importer
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-200 p-4">
              <h3 className="text-sm font-semibold mb-2">Raccourcis</h3>
              <ul className="text-sm list-disc ml-5 space-y-1 text-neutral-700">
                <li><Link className="hover:underline" href="/generate">Générer une image</Link></li>
                <li><Link className="hover:underline" href="/generate?mode=video">Générer une vidéo</Link></li>
                <li><Link className="hover:underline" href="/pricing">Voir les offres</Link></li>
              </ul>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
