import "./globals.css";
import type { Metadata } from "next";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";

export const metadata: Metadata = {
  title: "KeiroAI Studio",
  description: "Créez des visuels qui surfent sur l’actu",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="bg-white text-neutral-900">
        <Header />
        <main className="pb-20 lg:pb-0">
          {children}
        </main>
        <BottomNav />
      </body>
    </html>
  );
}
