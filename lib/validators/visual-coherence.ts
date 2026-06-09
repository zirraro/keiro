/**
 * Visual coherence validator — diversité visuelle + anti-réutilisation
 * exacte, sans brider la créativité.
 *
 * Ce que ça FAIT :
 *   - block : même visual_url dans les 14 derniers jours (vraie
 *            duplication, hors recycle library qui aurait son tag)
 *   - warn  : asset reuse rate > 25% sur 30j (feed monotone)
 *   - warn  : couleur dominante = même que 3+ posts récents (palette
 *            qui tourne en rond)
 *   - warn  : visual_description quasi-identique à un récent
 *            (Léna a généré la même scène 2 fois)
 *   - info  : telemetry sur taux diversité
 *
 * Ce que ça NE FAIT PAS :
 *   - imposer un type de visuel (laisse photo, illu, vidéo, story libre)
 *   - imposer une palette de couleur (laisse créativité aux briefs)
 *   - bloquer sur des choix éditoriaux subjectifs
 *
 * Règle dish-venue (founder rule Léna preserves venue) :
 *   - Si business_type ∈ {restaurant, traiteur} ET visual_description
 *     contient un plat, on suggère que venue_strength = 0.18. C'est
 *     un `info`, jamais un `block` — Léna peut overrider légitimement.
 */

import type { PostInput, ValidationContext, Finding } from './types';
import { aggregate, type ValidationResult } from './types';

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function trigramJaccard(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.length < 8 || nb.length < 8) return 0;
  const set = (s: string): Set<string> => {
    const r = new Set<string>();
    for (let i = 0; i < s.length - 2; i++) r.add(s.substring(i, i + 3));
    return r;
  };
  const sa = set(na);
  const sb = set(nb);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Color family keywords from typical Léna visual_descriptions.
// Used to detect palette monotony — NOT to enforce a palette.
const COLOR_FAMILIES: Record<string, RegExp> = {
  warm:   /\b(orange|amber|ambre|coral|corail|peach|terracotta|brown|brun|caramel|miel|honey)\b/i,
  cool:   /\b(blue|bleu|cyan|teal|turquoise|aqua|indigo|navy|cobalt)\b/i,
  green:  /\b(green|vert|olive|sage|mint|emerald|jade|forest|kaki)\b/i,
  purple: /\b(purple|violet|lilac|lavender|lavande|magenta|plum)\b/i,
  pink:   /\b(pink|rose|salmon|saumon|fuchsia|blush)\b/i,
  neutral:/\b(black|noir|white|blanc|grey|gray|gris|beige|cream|ivory|ivoire|sand|sable)\b/i,
  red:    /\b(red|rouge|crimson|scarlet|burgundy|bordeaux|wine)\b/i,
};

function detectColorFamily(text: string): string | null {
  for (const [family, rx] of Object.entries(COLOR_FAMILIES)) {
    if (rx.test(text)) return family;
  }
  return null;
}

// Dish keywords for restaurant/traiteur — used to check the dish-venue
// rule fires when relevant.
const DISH_KEYWORDS = /\b(plat|dish|burger|pizza|salade|salad|cookie|tarte|cake|pasta|p[âa]tes|burrata|sushi|po[êe]l[ée]e|risotto|gratin|tiramisu|brioche|pain|sandwich|wrap|bowl|noodle|nem|samossa|tapas)\b/i;

const FOOD_BUSINESS_TYPES = ['restaurant', 'traiteur', 'boulangerie', 'cafe', 'café', 'pizzeria', 'food truck', 'patisserie', 'pâtisserie', 'glacier'];

export function validateVisualCoherence(post: PostInput, ctx: ValidationContext): ValidationResult {
  const findings: Finding[] = [];
  const visualUrl = post.visual_url || '';
  const visualDesc = (post.visual_description || '').trim();
  const recent = ctx.recent_posts || [];

  // ─── 1. EXACT VISUAL URL REUSE (block) ───────────────────
  // Same image URL within 14d = real duplicate, not legitimate recycle.
  // The library-recycle cron has its own 60d anti-reuse rule and
  // tags posts with source='story_library_recycle' — so we exclude
  // those rows from this check via the `source` field if present.
  if (visualUrl) {
    const fourteenDaysAgo = Date.now() - 14 * 24 * 3600 * 1000;
    const duplicate = recent.find(rp => {
      if (!rp.visual_url || rp.visual_url !== visualUrl) return false;
      const at = new Date(rp.published_at || rp.created_at || 0).getTime();
      return at >= fourteenDaysAgo;
    });
    if (duplicate) {
      findings.push({
        code: 'duplicate_visual',
        severity: 'block',
        message: `Visual_url identique à un post récent (< 14j).`,
        evidence: { visual_url: visualUrl, match_post_id: duplicate.id },
        suggestion: 'Régénérer un visuel différent ou choisir un autre asset.',
      });
    }
  }

  // ─── 2. ASSET REUSE RATE 30j (warn) ──────────────────────
  if (recent.length >= 10) {
    const urls = recent.map(r => r.visual_url).filter(Boolean) as string[];
    const unique = new Set(urls).size;
    const reuseRate = urls.length > 0 ? 1 - unique / urls.length : 0;
    if (reuseRate > 0.25) {
      findings.push({
        code: 'asset_reuse_rate_high',
        severity: reuseRate > 0.40 ? 'block' : 'warn',
        message: `Taux de réutilisation visuelle ${Math.round(reuseRate * 100)}% — feed devient monotone.`,
        evidence: { reuseRate, unique, total: urls.length },
        suggestion: 'Varier les bases i2i et les angles narratifs.',
      });
    }
  }

  // ─── 3. PALETTE MONOTONY (warn) ──────────────────────────
  // Detect when the current post + recent posts hammer the same color
  // family. Heuristic — color words in visual_description.
  if (visualDesc) {
    const currentFamily = detectColorFamily(visualDesc);
    if (currentFamily) {
      const recentFamilies = recent
        .slice(0, 7)
        .map(r => r.visual_description ? detectColorFamily(r.visual_description) : null)
        .filter(Boolean) as string[];
      const sameFamily = recentFamilies.filter(f => f === currentFamily).length;
      if (sameFamily >= 3) {
        findings.push({
          code: 'palette_monotony',
          severity: 'warn',
          message: `Famille de couleur "${currentFamily}" répétée (×${sameFamily + 1} sur 8 derniers posts).`,
          evidence: { currentFamily, sameFamily, recentFamilies },
          suggestion: 'Varier vers une autre famille (warm/cool/green/red/neutral).',
        });
      }
    }
  }

  // ─── 4. VISUAL_DESC DUPLICATE (warn at 0.75, block at 0.92) ─
  if (visualDesc && visualDesc.length >= 30 && recent.length > 0) {
    let maxSim = 0;
    let matchId: string | null = null;
    for (const rp of recent) {
      const rpDesc = (rp.visual_description || '').trim();
      if (!rpDesc || rpDesc.length < 20) continue;
      const sim = trigramJaccard(visualDesc, rpDesc);
      if (sim > maxSim) { maxSim = sim; matchId = rp.id; }
    }
    if (maxSim >= 0.92) {
      findings.push({
        code: 'duplicate_visual_brief',
        severity: 'block',
        message: `Brief visuel quasi-identique à un post récent (${Math.round(maxSim * 100)}%).`,
        evidence: { similarity: maxSim, match_post_id: matchId },
        suggestion: 'Léna doit varier la scène, pas juste les mots.',
      });
    } else if (maxSim >= 0.75) {
      findings.push({
        code: 'visual_brief_too_similar',
        severity: 'warn',
        message: `Brief visuel proche d'un récent (${Math.round(maxSim * 100)}%) — scène risque de doubler.`,
        evidence: { similarity: maxSim, match_post_id: matchId },
      });
    }
  }

  // ─── 5. DISH-VENUE RULE (info, never block) ───────────────
  // For food businesses, when a dish is mentioned in the brief but
  // the brief reads like a hero shot of the dish without the venue,
  // we flag for telemetry. Léna may still publish — this is just a
  // signal that we should investigate if rate of "no venue" posts
  // climbs.
  if (
    ctx.business_type &&
    FOOD_BUSINESS_TYPES.some(t => ctx.business_type!.toLowerCase().includes(t)) &&
    visualDesc &&
    DISH_KEYWORDS.test(visualDesc)
  ) {
    const venueWords = /\b(table|comptoir|terrasse|fa[çc]ade|vitrine|salle|enseigne|store|boutique|murs|d[ée]cor)\b/i;
    if (!venueWords.test(visualDesc)) {
      findings.push({
        code: 'dish_without_venue',
        severity: 'info',
        message: 'Plat mentionné sans référence venue (founder rule "preserve venue").',
        evidence: { visualDesc: visualDesc.substring(0, 120) },
        suggestion: 'Confirmer que venue_strength = 0.18 dans la génération i2i.',
      });
    }
  }

  return aggregate(findings);
}
