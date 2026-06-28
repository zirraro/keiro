/**
 * Analyse SEO du site web du client (à la demande = levier d'UPSELL Pro).
 *
 * On crawl la home (+ best-effort), on extrait les signaux SEO, puis une passe
 * Claude (sonnet-4-6) produit un rapport actionnable : score, problèmes concrets,
 * opportunités, et sujets d'articles à rédiger. PAS d'analyse systématique
 * (coût) — déclenchée seulement quand le client/onboarding le demande.
 */

const UA = 'Mozilla/5.0 (compatible; KeiroSEO/1.0; +https://keiroai.com)';
const CLAUDE = 'claude-sonnet-4-6';

async function claude(system: string, message: string, maxTokens = 1200): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY manquante');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: CLAUDE, max_tokens: maxTokens, system, messages: [{ role: 'user', content: message }] }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}`);
  const data = await res.json();
  return (data.content?.[0]?.text || '').trim();
}

function extractSignals(html: string, finalUrl: string) {
  const pick = (re: RegExp) => (html.match(re)?.[1] || '').trim();
  const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDesc = pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
    || pick(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
  const h2count = (html.match(/<h2[\s>]/gi) || []).length;
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)];
  const imgsWithAlt = imgs.filter(m => /\balt\s*=\s*["'][^"']+["']/i.test(m[0])).length;
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = text ? text.split(' ').length : 0;
  return {
    finalUrl,
    title, titleLen: title.length,
    metaDesc, metaDescLen: metaDesc.length,
    h1: h1s, h1Count: h1s.length,
    h2Count: h2count,
    imgCount: imgs.length, imgsWithoutAlt: imgs.length - imgsWithAlt,
    wordCount,
    hasViewport: /<meta[^>]+name=["']viewport["']/i.test(html),
    hasCanonical: /<link[^>]+rel=["']canonical["']/i.test(html),
    hasSchema: /application\/ld\+json/i.test(html),
    hasOpenGraph: /property=["']og:/i.test(html),
    htmlBytes: html.length,
    lang: pick(/<html[^>]+lang=["']([^"']+)["']/i),
    excerpt: text.slice(0, 1500),
  };
}

export type SiteAnalysis = {
  ok: boolean;
  reason?: string;
  url?: string;
  score?: number;          // 0-100
  summary?: string;        // teaser (visible aussi en non-Pro)
  issues?: { title: string; severity: 'haute' | 'moyenne' | 'basse'; fix: string }[];
  opportunities?: string[];
  articleTopics?: string[];
  signals?: any;
};

export async function analyzeSite(siteUrlRaw: string, dossier: any): Promise<SiteAnalysis> {
  const siteUrl = String(siteUrlRaw || '').trim();
  if (!siteUrl) return { ok: false, reason: 'no_site' };
  const url = /^https?:\/\//i.test(siteUrl) ? siteUrl : `https://${siteUrl}`;

  let html = '', finalUrl = url;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9' }, signal: AbortSignal.timeout(12000), redirect: 'follow' });
    finalUrl = r.url || url;
    if (!r.ok) return { ok: false, reason: `http_${r.status}`, url };
    html = (await r.text()).slice(0, 600_000);
  } catch (e: any) {
    return { ok: false, reason: `fetch_failed: ${e?.message}`, url };
  }

  const signals = extractSignals(html, finalUrl);
  const facts = JSON.stringify({
    business: dossier?.company_name, type: dossier?.business_type, city: dossier?.city,
    products: dossier?.main_products, value: dossier?.value_proposition,
  }).slice(0, 800);

  const system = `Tu es un expert SEO local. On te donne les SIGNAUX techniques de la page d'accueil d'un commerce + son dossier. Produis un audit SEO ACTIONNABLE en JSON pur :
{"score": 0-100, "summary": "1-2 phrases accrocheuses (teaser upsell)", "issues":[{"title":"","severity":"haute|moyenne|basse","fix":"action concrète"}], "opportunities":["..."], "articleTopics":["3-5 sujets d'articles SEO locaux à rédiger pour ce business"]}
RÈGLES : factuel (base-toi sur les signaux + le secteur/ville du dossier), concret et local, 4-7 issues max priorisées (title trop long/court, meta manquante, H1 absent/multiple, peu de contenu, images sans alt, pas de viewport mobile, pas de données structurées, pas de mots-clés locaux…). Les articleTopics doivent cibler des requêtes que les clients du secteur tapent dans sa ville.`;
  let parsed: any = {};
  try {
    const raw = await claude(system, `SIGNAUX: ${JSON.stringify(signals)}\nDOSSIER: ${facts}`, 1400);
    const j = raw.match(/\{[\s\S]*\}/);
    if (j) parsed = JSON.parse(j[0]);
  } catch (e: any) {
    return { ok: false, reason: `analysis_failed: ${e?.message}`, url: finalUrl, signals };
  }

  return {
    ok: true,
    url: finalUrl,
    score: typeof parsed.score === 'number' ? parsed.score : undefined,
    summary: parsed.summary || '',
    issues: Array.isArray(parsed.issues) ? parsed.issues.slice(0, 8) : [],
    opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities.slice(0, 8) : [],
    articleTopics: Array.isArray(parsed.articleTopics) ? parsed.articleTopics.slice(0, 6) : [],
    signals,
  };
}
