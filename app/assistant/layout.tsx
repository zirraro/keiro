import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Votre Equipe IA - Keiro",
  description: "Discutez avec votre equipe d'agents IA specialises : marketing, contenu, SEO, onboarding et plus. Chaque agent est personnalise pour votre business.",
  keywords: [
    "agents IA",
    "equipe IA",
    "assistant marketing",
    "coach contenu",
    "SEO IA",
    "chatbot business",
    "KeiroAI"
  ],
  openGraph: {
    title: "Votre Equipe IA - Keiro",
    description: "Discutez avec votre equipe d'agents IA specialises pour votre business.",
    url: "https://www.keiroai.com/assistant",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Votre Equipe IA - Keiro",
    description: "Votre equipe d'agents IA personnalises"
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
