import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Galerie & Posts Instagram - Keiro",
  description: "Gérez vos visuels marketing créés avec l'IA. Organisez par dossiers, préparez vos posts Instagram, exportez en un clic. Votre galerie de contenu marketing centralisée.",
  keywords: [
    "galerie visuels marketing",
    "gestion contenu Instagram",
    "bibliothèque images IA",
    "organisation posts",
    "planification Instagram",
    "médiathèque marketing",
    "stockage visuels",
    "posts Instagram IA"
  ],
  openGraph: {
    title: "Galerie & Posts Instagram - Keiro",
    description: "Gérez vos visuels marketing créés avec l'IA. Organisez, préparez et publiez vos posts Instagram.",
    url: "https://www.keiroai.com/library",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Galerie & Posts Instagram - Keiro",
    description: "Gérez vos visuels marketing créés avec l'IA."
  },
  alternates: {
    canonical: "/library"
  }
};

export default function LibraryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
