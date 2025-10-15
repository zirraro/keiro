import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = {
  title: "Keiro",
  description: "Générez des visuels & vidéos pilotés par l’actualité.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh bg-neutral-50 text-neutral-900">
        <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-black text-[11px] text-white">K</span>
              Keiro
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/" className="hover:opacity-80">Accueil</Link>
              <Link href="/generate" className="rounded-md border px-3 py-1 hover:bg-neutral-100">Générer</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
