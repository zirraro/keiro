import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Studio d'édition - Keiro",
  description: "Éditez et personnalisez vos visuels marketing avec des outils professionnels. Ajoutez du texte, des logos, des effets. Studio d'édition tout-en-un pour créateurs de contenu.",
  keywords: [
    "éditeur visuel en ligne",
    "studio création marketing",
    "édition image IA",
    "personnalisation visuel",
    "ajout texte image",
    "design éditeur",
    "retouche image rapide",
    "outils design marketing"
  ],
  openGraph: {
    title: "Studio d'édition - Keiro",
    description: "Éditez et personnalisez vos visuels marketing avec des outils professionnels.",
    url: "https://www.keiroai.com/studio",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Studio d'édition - Keiro",
    description: "Éditez et personnalisez vos visuels marketing."
  },
  alternates: {
    canonical: "/studio"
  }
};

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
