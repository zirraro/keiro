import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agents IA - Automatisation Business - Keiro",
  description: "15 agents IA qui automatisent votre business : publication, SEO, prospection, emails, comptabilite. Pas un chatbot — des agents qui executent.",
  keywords: [
    "agents IA automatisation",
    "automatisation business",
    "publication automatique",
    "prospection IA",
    "SEO automatique",
    "agents marketing",
    "KeiroAI"
  ],
  openGraph: {
    title: "Agents IA - Automatisation Business - Keiro",
    description: "15 agents IA qui automatisent votre business : publication, SEO, prospection, emails, comptabilite.",
    url: "https://www.keiroai.com/assistant",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Agents IA - Automatisation Business - Keiro",
    description: "15 agents IA qui executent vos taches automatiquement"
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
