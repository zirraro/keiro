import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Keiro',
  description: 'Génération IA d’images et de vidéos pour le social.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="bg-neutral-950">
      <body className="min-h-screen text-neutral-100 antialiased">
        {/* Décors globaux éventuels → doivent avoir pointer-events:none et z négatif */}
        <div id="global-decor" className="pointer-events-none fixed inset-0 -z-10">
          {/* Si tu avais des composants décoratifs globaux, importe-les ici,
              ex: <Spotlight/>, <GridBG/>, etc. avec pointer-events-none */}
        </div>

        {/* Couche interactive principale */}
        <div id="app" className="relative z-50">
          {children}
        </div>
      </body>
    </html>
  );
}
