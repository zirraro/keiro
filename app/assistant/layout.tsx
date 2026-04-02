import type { Metadata } from "next";
import ClaraHelper from "./components/ClaraHelper";

export const metadata: Metadata = {
  title: "Agents IA - Automatisation Business - Keiro",
  description: "15 agents IA qui automatisent votre business : publication, SEO, prospection, emails, comptabilité. Pas un chatbot — des agents qui exécutent.",
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
    description: "15 agents IA qui automatisent votre business : publication, SEO, prospection, emails, comptabilité.",
    url: "https://www.keiroai.com/assistant",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Agents IA - Automatisation Business - Keiro",
    description: "15 agents IA qui exécutent vos tâches automatiquement"
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
  return (
    <>
      {children}
      <ClaraHelper />
    </>
  );
}
