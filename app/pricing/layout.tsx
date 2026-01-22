import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tarifs - Plans Freemium, Pro & Business - Keiro",
  description: "Découvrez nos plans tarifaires adaptés à vos besoins. Essai gratuit, puis formules Pro et Business pour entrepreneurs, agences et créateurs de contenu. Sans engagement.",
  keywords: [
    "prix Keiro",
    "tarifs IA marketing",
    "abonnement création contenu",
    "plan freemium marketing",
    "tarif générateur visuel",
    "prix outil marketing",
    "abonnement pro marketing",
    "comparatif plans"
  ],
  openGraph: {
    title: "Tarifs - Plans Freemium, Pro & Business - Keiro",
    description: "Plans adaptés à vos besoins. Essai gratuit, formules Pro et Business. Sans engagement.",
    url: "https://keiro.ai/pricing",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Tarifs Keiro - Freemium, Pro & Business",
    description: "Plans adaptés à vos besoins. Essai gratuit disponible."
  },
  alternates: {
    canonical: "/pricing"
  }
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
