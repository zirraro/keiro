export function buildNewsQuery(activeTopic: string, timeframe: string, q: string, limit = 30) {
  const CAT_MAP: Record<string, string> = {
    "Technologie": "technology",
    "Science": "science",
    "Santé": "health",
    "Restauration": "food",
    "Environnement": "environment",
    "Gaming": "gaming",
    "Monde": "world",
    "Sport": "sports",
    "Économie": "business",
    "Economie": "business",
  };

  const p = new URLSearchParams();
  const cat = CAT_MAP[activeTopic] || activeTopic || "world";
  p.set("cat", cat);
  p.set("timeframe", ["24h","48h","72h","7d"].includes(timeframe) ? timeframe : "24h");
  if (q) p.set("q", q);
  p.set("limit", String(Math.max(9, limit)));
  return p.toString();
}
