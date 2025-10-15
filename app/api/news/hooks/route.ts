import { NextRequest, NextResponse } from "next/server";

type Item = {
  id: string;
  title: string;
  source?: string;
  url?: string;
  link?: string;
  published?: string;
  topic?: string;
};

const PACK: Record<string, string[]> = {
  curiosite: [
    "Tu crois connaître {SUJET} ? Attends de voir ça…",
    "La plupart se trompent sur {SUJET}. Voilà pourquoi.",
    "Le détail que personne ne remarque en {SUJET}."
  ],
  autorite: [
    "{SUJET} : 3 choses que je répète à tous mes clients.",
    "Ce que les meilleurs font différemment en {SUJET}.",
    "{SUJET}: le framework en 4 étapes que j’utilise."
  ],
  fomo: [
    "Si tu n’agis pas sur {SUJET} cette semaine, tu vas le regretter.",
    "{SUJET} : la fenêtre d’opportunité se referme.",
    "Tout le monde saute dessus : {SUJET} expliqué simplement."
  ],
  erreur: [
    "Stop de faire cette erreur en {SUJET} (tu perds des résultats).",
    "J’ai testé {SUJET} 10 fois : voici la vraie erreur cachée.",
    "La pire pratique ‘conseillée’ en {SUJET}."
  ],
  mythe: [
    "3 mythes toxiques en {SUJET} (et ce qu’il faut faire à la place).",
    "On t’a menti : {SUJET} ne marche pas comme ça.",
    "FAUX : ‘{SUJET} c’est seulement pour…’"
  ],
  tuto: [
    "Tutoriel express : {SUJET} en 60 secondes.",
    "La méthode pas-à-pas pour {SUJET} (sans budget).",
    "Check-list: tout ce qu’il faut pour réussir {SUJET}."
  ],
  avantapres: [
    "Avant / Après : comment {SUJET} a changé le résultat.",
    "Le switch qui transforme {SUJET} (preuve à l’appui).",
    "De 0 à 1 : {SUJET} sur un cas réel."
  ],
  challenge: [
    "Fais ça pendant 7 jours : {SUJET} (et dis-moi ce que ça change).",
    "Le défi 30 minutes / jour pour {SUJET}.",
    "Oses-tu essayer ça en {SUJET} ?"
  ],
  stats: [
    "La stat qui m’a fait revoir {SUJET}.",
    "Personne n’utilise ce ratio en {SUJET}, et pourtant…",
    "{SUJET} : le chiffre qui explique tout."
  ],
  unpopular: [
    "Opinion impopulaire : {SUJET}.",
    "Je ne suis pas d’accord avec {SUJET} (voici pourquoi).",
    "{SUJET} : on surévalue complètement ça."
  ],
};

function fill(s: string, subject: string) {
  const sub = subject || "ton marché";
  return s.replaceAll("{SUJET}", sub);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const subject = searchParams.get("subject") || "";
  const limit = Math.min(parseInt(searchParams.get("limit") || "30", 10) || 30, 60);
  const items: Item[] = [];
  let id = 0;
  for (const [group, arr] of Object.entries(PACK)) {
    for (const t of arr) {
      items.push({
        id: `hook-${group}-${id++}`,
        title: fill(t, subject),
        source: `Hook ${group}`,
        url: "#",
        link: "#",
        published: new Date().toISOString(),
        topic: "hooks",
      });
    }
  }
  return NextResponse.json({ items: items.slice(0, limit) }, { status: 200 });
}
