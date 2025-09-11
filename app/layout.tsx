import './globals.css';
import type { Metadata } from 'next';
import NavAuth from '@/components/NavAuth';

export const metadata: Metadata = {
  title: 'Keiro',
  description: 'Générez des visuels et vidéos IA orientés actu.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-white text-neutral-900 antialiased">
        <header className="border-b">
          <nav className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-4">
            <a href="/" className="font-semibold">Keiro</a>
            <a href="/studio" className="text-sm text-neutral-700 hover:underline">Studio</a>
            <NavAuth />
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  )
}
