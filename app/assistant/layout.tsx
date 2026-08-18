import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agents IA - Automatisation Business - Keiro",
  description: "10 agents IA qui automatisent votre business : publication, SEO, prospection, emails, comptabilité. Pas un chatbot — des agents qui exécutent.",
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
    description: "10 agents IA qui automatisent votre business : publication, SEO, prospection, emails, comptabilité.",
    url: "https://www.keiroai.com/assistant",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Agents IA - Automatisation Business - Keiro",
    description: "10 agents IA qui exécutent vos tâches automatiquement"
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
  /**
   * ── Le panneau Clara ne s'affiche plus dans l'espace agents ──
   *
   * Fondateur, 18 août : « supprime-le de l'espace agent, puisqu'il amène aux
   * agents dédiés quand on clique dessus. »
   *
   * C'est le bon raisonnement : ce panneau listait les agents inactifs et
   * renvoyait vers eux. Or on est déjà sur la page qui les liste tous, avec
   * leur état. Il redisait ce que l'écran montrait, en occupant le premier
   * plan pour le dire.
   *
   * Une aide n'a de valeur que là où l'information manque. Ici elle ne
   * manquait pas — le client voyait déjà ses agents et pouvait cliquer
   * dessus. Le panneau n'ajoutait qu'un obstacle entre lui et eux.
   *
   * Le composant reste dans le dépôt : il sait présenter les agents un par un
   * en mode assistant, ce qui a sa place dans un parcours de première
   * découverte. Ce n'est pas le code qui était en trop, c'est l'endroit.
   */
  return <>{children}</>;
}
