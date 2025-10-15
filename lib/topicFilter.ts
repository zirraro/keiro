export type AnyItem = {
  title?: string;
  snippet?: string;
  source?: string;
  url?: string;
};

function hit(item: AnyItem, rx: RegExp) {
  const hay = [item.title, item.snippet, item.source, item.url]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return rx.test(hay);
}

/** Post-filtre local : ne garde que les actus pertinentes par thème */
export function filterByTopic<T extends AnyItem>(items: T[], topic: string): T[] {
  const t = (topic || "").toLowerCase();

  if (t === "sports") {
    const sportRX = /\b(football|foot|soccer|rugby|nba|basket|tennis|handball|volley|f1|formula\s?1|motogp|cycl|tour\s+de\s+france|giro|vuelta|golf|athl[ée]|olymp|nfl|nhl|mlb|uefa|ligue\s?1|premier\s+league|laliga|bundesliga|copa|champions)/i;
    const out = items.filter(it => hit(it, sportRX));
    // Si la source n'a rien donné, on ne casse pas l'écran : on renvoie la liste initiale
    return out.length ? out : items;
  }

  if (t === "health") {
    const healthRX = /\b(sant[é|e]|health|h[ôo]pit|m[ée]dec|maladie|virus|covid|vaccin|pharma|oms|who|cancer|cardio|nutrition|bien-?\s?être|mental|sommeil)/i;
    const out = items.filter(it => hit(it, healthRX));
    return out.length ? out : items;
  }

  return items;
}
