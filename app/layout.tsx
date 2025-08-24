export const dynamic = 'force-dynamic';

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Keiro",
  description: "Générez des visuels et vidéos IA orientés actu.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-white text-neutral-900 antialiased">
        {children}
      </body>
    </html>
  );
}
