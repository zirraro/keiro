import "./globals.css";
import type { Metadata } from "next";
import Header from "@/components/Header";

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
        {children}
      </body>
    </html>
  );
}
