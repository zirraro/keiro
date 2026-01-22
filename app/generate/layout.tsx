import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Générer un visuel marketing IA - Keiro",
  description: "Créez des visuels marketing professionnels en associant votre business aux actualités du jour. IA générative, templates pro, optimisé pour Instagram, Facebook, LinkedIn.",
  keywords: [
    "générateur visuel IA",
    "création contenu marketing",
    "visuel actualité",
    "post Instagram IA",
    "design automatique",
    "marketing automation",
    "newsjacking",
    "visuel tendance",
    "création rapide visuel"
  ],
  openGraph: {
    title: "Générer un visuel marketing IA - Keiro",
    description: "Créez des visuels marketing pro en quelques secondes avec l'IA. Surfez sur l'actualité pour maximiser l'engagement.",
    url: "https://keiro.ai/generate",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Générer un visuel marketing IA - Keiro",
    description: "Créez des visuels marketing pro en quelques secondes avec l'IA."
  },
  alternates: {
    canonical: "/generate"
  }
};

export default function GenerateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
