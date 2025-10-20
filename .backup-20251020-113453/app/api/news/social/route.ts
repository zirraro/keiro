export const runtime = "nodejs";
import { NextRequest } from "next/server";

type Heat = "very_hot" | "hot" | "warm" | "watch";
type NewsItem = {
  id?: string;
  source?: string;
  title?: string;
  url?: string;
  summary?: string;
  publishedAt?: string; // ISO
  image?: string;
  angles?: string[];
  _socialScore?: number;
  _heat?: Heat;
};

const HOT_TOKENS = [
  "leak","leaks","vs","battle","best","top","guide","hack","hacked","lawsuit","sues",
  "viral","trend","drama","ai","gpt","openai","elon","billion","billionaire","free",
  "upgrade","massive","huge","record","breaks","explodes","ban","banned","tiktok","instagram"
];

function heatLabel(score: number): Heat {
  if (score >= 0.75) return "very_hot";
  if (score >= 0.60) return "hot";
  if (score >= 0.45) return "warm";
  return "watch";
}

function socialScore(item: NewsItem, nowMs: number): number {
  const title = String(item.title ?? "");
  const publishedMs = item.publishedAt ? new Date(item.publishedAt).getTime() : nowMs;

  // Recency boost (<= 72h)
  const hoursOld = Math.max(1, (nowMs - publishedMs) / (1000 * 60 * 60));
  const recency = Math.max(0, Math.min(1, 1 - (hoursOld / 72)));

  // Tokens
  const low = title.toLowerCase();
  let tokenHits = 0;
  for (const t of HOT_TOKENS) if (low.includes(t)) tokenHits++;
  const tokenScore = Math.min(1, tokenHits / 3);

  // Chiffres, %, !
  const numbers = (title.match(/\d+/g) ?? []).length;
  const excls = (title.match(/!/g) ?? []).length;
  const percents = (title.match(/%/g) ?? []).length;
  const symScore = Math.min(1, (numbers + excls + percents) / 3);

  // Longueur de titre (idéal 35–90)
  const len = title.length;
  const ideal = len >= 35 && len <= 90 ? 1 : 0.6;

  // Blend (pondérations simples)
  const score = (
    0.42 * recency +
    0.28 * tokenScore +
    0.18 * symScore +
    0.12 * ideal
  );

  return Math.max(0, Math.min(1, score));
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const hours = Math.max(24, Math.min(24 * 7, Number(searchParams.get("hours")) || 48));
    const minScore = Math.max(0, Math.min(1, Number(searchParams.get("minScore")) || 0.32));
    const limit = Math.max(1, Math.min(50, Number(searchParams.get("limit")) || 12));
    const includeHidden = (searchParams.get("strict") === "0") ? true : false;

    // Récupère les actus existantes (même source que /api/news)
    const baseResp = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || ""}/api/news`, { cache: "no-store" }).catch(() => null);
    let items: NewsItem[] = [];
    if (baseResp && baseResp.ok) {
      const j = await baseResp.json();
      items = Array.isArray(j.items) ? j.items as NewsItem[] : [];
    }

    const now = Date.now();
    const minDateMs = now - hours * 60 * 60 * 1000;

    // 1) Filtrage temporel
    items = items.filter((it: NewsItem) => {
      if (!it.publishedAt) return includeHidden; // si strict, on vire les sans date
      return new Date(it.publishedAt).getTime() >= minDateMs;
    });

    // 2) Scoring
    items = items.map((it: NewsItem) => {
      const s = socialScore(it, now);
      return { ...it, _socialScore: s, _heat: heatLabel(s) };
    });

    // 3) Tri + filtres
    const trending: NewsItem[] = items
      .filter((x: NewsItem) => (x._socialScore ?? 0) >= minScore)
      .sort((a: NewsItem, b: NewsItem) => (b._socialScore ?? 0) - (a._socialScore ?? 0))
      .slice(0, limit);

    // Hidden gems (score un peu plus bas)
    const hiddenGems: NewsItem[] = items
      .filter((x: NewsItem) => (x._socialScore ?? 0) >= Math.max(0, minScore - 0.12) && (x._socialScore ?? 0) < minScore)
      .sort((a: NewsItem, b: NewsItem) => (b._socialScore ?? 0) - (a._socialScore ?? 0))
      .slice(0, 6);

    return Response.json({
      ok: true,
      params: { hours, minScore, limit },
      trending,
      hiddenGems,
      counts: { all: items.length, trending: trending.length, hiddenGems: hiddenGems.length }
    });
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message || "unexpected error" }, { status: 500 });
  }
}
