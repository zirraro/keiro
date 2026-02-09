/**
 * Social ranker: score 0..1 avec décroissance temporelle + heuristiques simples.
 * Plus permissif, et fallback garanti sur les top N même si score < minScore.
 */
export type NewsItem = {
  id: string
  source?: string
  title: string
  summary?: string
  url: string
  image?: string
  publishedAt?: string // ISO
}

type Options = {
  // fenêtre en heures pour la décroissance
  horizonHours?: number
  // seuil minimal (non bloquant si none match – on garde un fallback)
  minScore?: number
  // un peu plus sélectif
  strict?: boolean
  // nombre d’items retournés
  limit?: number
}

const KEY_HITS = [
  /launch|unveil|announce|partnership|funding|raised/i,
  /viral|trend|mem(e|es)|craze|blows up|explodes/i,
  /instagram|tiktok|shorts|reels|influencer/i,
  /ai|gpt|genai|openai|anthropic|llama|stable|image|video/i,
  /beats|record|all-time high|ATH|surge|spike/i,
  /leak|rumor|teaser|sneak peek/i,
  // Patterns français
  /lancement|annonce|partenariat|levée de fonds|acquisition/i,
  /viral|tendance|buzz|polémique|scandale|clash|choc/i,
  /tiktok|instagram|youtube|snapchat|influenceur|créateur/i,
  /intelligence artificielle|ia générative|chatgpt|gemini/i,
  /record|historique|explosion|flambée|chute|effondrement/i,
  /exclusif|révélation|fuite|rumeur|inédit|breaking/i,
];

const SOURCE_BONUS: Record<string, number> = {
  "The Verge": 0.08,
  "TechCrunch": 0.07,
  "The Information": 0.06,
  "Bloomberg": 0.06,
  "Reuters": 0.05,
  "The Guardian": 0.04,
  // Sources françaises
  "Le Monde": 0.07,
  "Les Echos": 0.06,
  "France 24": 0.06,
  "BFM TV": 0.05,
  "L'Équipe": 0.05,
  "Numerama": 0.05,
  "Konbini": 0.04,
};

function sigmoid(x: number) {
  return 1 / (1 + Math.exp(-x));
}

function recencyDecay(publishedAt?: string, horizonHours = 72) {
  if (!publishedAt) return 0.6; // si date inconnue: ok mais pas top
  const now = Date.now();
  const t = new Date(publishedAt).getTime();
  const hours = Math.max(0, (now - t) / 36e5);
  // demi-vie ~ (horizon/2). À 0h → 1, à horizon → ~0.35
  const factor = Math.pow(0.5, hours / (horizonHours / 2));
  return Math.max(0, Math.min(1, factor));
}

function keywordScore(title: string, summary?: string) {
  const text = `${title} ${summary ?? ""}`;
  let hits = 0;
  for (const re of KEY_HITS) if (re.test(text)) hits++;
  // 0..1, avec légère courbe
  return sigmoid(hits - 1.5);
}

function sourceBonus(source?: string) {
  if (!source) return 0;
  return SOURCE_BONUS[source] ?? 0;
}

export function computeSocialScore(item: NewsItem, opts?: { horizonHours?: number }) {
  const r = recencyDecay(item.publishedAt, opts?.horizonHours ?? 72);   // 0..1
  const k = keywordScore(item.title, item.summary);                      // 0..1
  const s = sourceBonus(item.source);                                    // 0..0.1

  // pondérations simples (somme ≤ 1.1)
  const score = 0.55 * r + 0.4 * k + s;
  // clamp
  return Math.max(0, Math.min(1, score));
}

export function selectTrending(items: NewsItem[], options?: Options) {
  const {
    horizonHours = 72,
    strict = false,
    limit = 12,
  } = options ?? {};

  // seuils plus permissifs
  const minScore = options?.minScore ?? (strict ? 0.35 : 0.25);

  const scored = items.map(i => ({
    item: i,
    score: computeSocialScore(i, { horizonHours }),
  }));

  // tri desc par score
  scored.sort((a, b) => b.score - a.score);

  // 1) on tente avec le seuil
  const pass = scored.filter(s => s.score >= minScore).slice(0, limit);

  if (pass.length > 0) {
    return pass.map(s => ({ ...s.item, _socialScore: +s.score.toFixed(3) })) as (NewsItem & { _socialScore:number })[];
  }

  // 2) fallback garanti : top N même si < minScore
  const fallback = scored.slice(0, limit);
  return fallback.map(s => ({ ...s.item, _socialScore: +s.score.toFixed(3) })) as (NewsItem & { _socialScore:number })[];
}
