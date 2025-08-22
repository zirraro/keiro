import "./globals.css";
import Link from "next/link";
import Onboarding from "../components/site/onboarding";

export const metadata = {
  title: "Keiro",
  description: "Générateur d'images et vidéos basé sur l'actualité",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-neutral-950 text-neutral-100">
        <Onboarding />
        {/* Header global */}
        <header className="border-b border-neutral-900 bg-neutral-950/80 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <Link href="/" className="font-bold text-lg text-white">Keiro</Link>
            <nav className="flex gap-4 text-sm text-neutral-300">
              <Link href="/dashboard" className="hover:text-white transition">Dashboard</Link>
              <Link href="/generate" className="hover:text-white transition">Générer</Link>
              <Link href="/pricing" className="hover:text-white transition">Tarifs</Link>
              <Link href="/brand" className="hover:text-white transition">Marque</Link>
            </nav>
          </div>
        </header>

        <main>{children}</main>
      </body>
    </html>
  );
}
