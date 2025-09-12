export const runtime = "nodejs";
import { NextRequest } from "next/server";

type Heat = "very_hot" | "hot" | "warm" | "watch";

function heatLabel(score: number): { heat: Heat; emoji: string } {
  if (score >= 0.75) return { heat: "very_hot", emoji: "🔥🔥" };
  if (score >= 0.60) return { heat: "hot", emoji: "🔥" };
  if (score >= 0.45) return { heat: "warm", emoji: "♨️" };
  return { heat: "watch", emoji: "👀" };
}

const HOT_TOKENS = [
  "leak","leaks","vs","battle","best","top","guide","hack","hacked","lawsuit","sues",
  "viral","trend","drama","ai","gpt","openai","elon","billion","billionaire","free",
  "upgrade","massive","huge","record","breaks","explodes","ban","banned","tiktok","instagram"
];

/** Score social + raisons explicatives */
function socialScore(item: any, nowMs: number, hoursWindow: number) {
  const reasons: string[] = [];
  const title: string = String(item.title || "");
  const lower = title.toLowerCase();

  const published = item.publishedAt ? new Date(item.publishedAt).getTime() : nowMs;
  const ageH = Math.max(1, (nowMs - published) / 36e5); // heures

  // Décroissance temporelle plus sévère pour petites fenêtres
  const tightness = Math.max(1, 72 / Math.max(24, hoursWindow)); // 24h=>3, 48h=>1.5, 72h=>1, 168h=>~0.43
  const recency = Math.max(0, 1 - (Math.log10(ageH) * 0.45 * tightness));
  if (recency > 0.75) reasons.push("🕒 Très récent");
  else if (recency > 0.5) reasons.push("🕒 Récent");

  let hotHits = 0;
  for (const k of HOT_TOKENS) if (lower.includes(k)) hotHits++;
  const hotTermBoost = Math.min(1, hotHits / 3);
  if (hotHits >= 3) reasons.push("💬 Mots clés forts");
  else if (hotHits >= 1) reasons.push("💬 Mot clé populaire");

  const digits = (title.match(/\d+/g) || []).length;
  const pct = (title.match(/\d+\s?%/g) || []).length;
  if (digits >= 2 || pct >= 1) reasons.push("🔢 Chiffres ou %");

  const bangs = (title.match(/!/g) || []).length;
  if (bangs >= 1) reasons.push("❗️ Accent fort");

  const len = title.length;
  const lenBoost = len < 40 ? 0.2 : len < 90 ? 0.35 : len < 140 ? 0.25 : 0.1;
  if (len >= 40 && len <= 90) reasons.push("✍️ Titre concis");

  let score =
    0.45 * recency +
    0.25 * hotTermBoost +
    0.15 * Math.min(1, digits / 2 + pct / 1) +
    0.05 * Math.min(1, bangs / 1) +
    0.10 * lenBoost;

  score = Math.max(0, Math.min(1, score));
  const { heat, emoji } = heatLabel(score);

  return { score, heat, emoji, reasons };
}

function pickHiddenGems(items: any[]) {
  return items
    .filter(x => x._socialScore >= 0.28 && x._socialScore <= 0.45)
    .sort((a, b) => b._socialScore - a._socialScore);
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const hours = Number(url.searchParams.get("hours") || 48);
    const strict = url.searchParams.get("strict") === "1";
    const limit = Math.min(50, Number(url.searchParams.get("limit") || 12));

    // seuils dynamiques par fenêtre (strict +0.05)
    const baseMin =
      hours <= 24 ? 0.35 :
      hours <= 48 ? 0.32 :
      hours <= 72 ? 0.30 : 0.28;
    const minScore = baseMin + (strict ? 0.05 : 0);

    const host = req.headers.get("host") || "localhost:3002";
    const isHttps = host.includes("app.github.dev") || host.includes("codespaces");
    const origin = `${isHttps ? "https" : "http"}://${host}`;

    // Récupère les actus brutes
    const r = await fetch(`${origin}/api/news?hours=${hours}`, { cache: "no-store" });
    const j = await r.json();
    if (!j?.ok) {
      return Response.json({ ok: false, error: j?.error || "news endpoint failed" }, { status: 500 });
    }

    const now = Date.now();
    const items = (Array.isArray(j.items) ? j.items : [])
      // 1) Filtre dur par fenêtre de temps
      .filter((it: any) => {
        const ts = it.publishedAt ? new Date(it.publishedAt).getTime() : now;
        return now - ts <= hours * 3600 * 1000;
      })
      // 2) Scoring
      .map((it: any) => {
        const s = socialScore(it, now, hours);
        return { ...it, _socialScore: s.score, _heat: s.heat, _emoji: s.emoji, _reasons: s.reasons };
      });

    // 3) Tri + filtres
    const trending = items
      .filter(x => x._socialScore >= minScore)
      .sort((a, b) => b._socialScore - a._socialScore)
      .slice(0, limit);

    const gems = pickHiddenGems(items).slice(0, limit);

    return Response.json({
      ok: true,
      hours,
      strict,
      minScore,
      count: items.length,
      trending,
      hiddenGems: gems,
    });
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message || "unexpected error" }, { status: 500 });
  }
}
