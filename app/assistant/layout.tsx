import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mon Assistant Marketing IA - Keiro",
  description: "Dashboard marketing personnalisé avec analytics, insights IA et recommandations stratégiques. Optimisez vos performances Instagram avec l'intelligence artificielle.",
  keywords: [
    "assistant marketing IA",
    "analytics Instagram",
    "dashboard marketing",
    "insights personnalisés",
    "recommandations IA",
    "optimisation contenu",
    "performance réseaux sociaux",
    "formation marketing"
  ],
  openGraph: {
    title: "Mon Assistant Marketing IA - Keiro",
    description: "Optimisez vos performances avec votre assistant marketing IA personnalisé. Analytics, insights et recommandations.",
    url: "https://www.keiroai.com/assistant",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Mon Assistant Marketing IA - Keiro",
    description: "Dashboard marketing personnalisé avec IA"
  },
  alternates: {
    canonical: "/assistant"
  }
};

export default function AssistantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
