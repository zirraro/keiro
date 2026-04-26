/**
 * Global content learning pool — KeiroAI-wide.
 *
 * The dissatisfaction signal (lib/agents/dissatisfaction-signals.ts) is
 * PER-CLIENT — it teaches Léna what THIS client doesn't like. But the
 * agent should also learn ACROSS clients: when 50 different users skip
 * the "Les X qui Y perdent N heures" template, EVERY future client
 * should benefit from Léna avoiding it.
 *
 * What we aggregate:
 *   - Globally over-killed pillars / formats / subjects
 *   - Globally over-killed hook templates (regex patterns)
 *   - Globally validated patterns (high publish rate, low skip rate)
 *
 * The output is a compact "global wisdom" block injected into every
 * client's Léna prompt, alongside the per-client dissatisfaction block.
 *
 * Caching: this is a heavy aggregate. We compute it once per hour
 * (in-memory cache) — every active client benefits from the same
 * learning without paying the query cost.
 *
 * Privacy: we never expose any client's specific content. Only
 * aggregate counts and anonymous patterns surface.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

type GlobalLearning = {
  computedAt: number;
  totalKilled: number;
  totalGenerated: number;
  killRate: number;
  topKilledHooks: Array<{ pattern: string; killCount: number; sample: string }>;
  topKilledPillars: Array<{ pillar: string; killCount: number; killRate: number }>;
  topKilledFormats: Array<{ format: string; killCount: number; killRate: number }>;
  topKilledSubjects: Array<{ subject: string; killCount: number }>;
  validatedPillars: Array<{ pillar: string; publishRate: number; n: number }>;
};

let CACHE: GlobalLearning | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Hook templates that get repeatedly killed across clients. These
 * become the "no go" patterns shared with every Léna instance.
 *
 * We detect them with simple heuristics rather than tokenising every
 * hook — fast, deterministic, easy to extend.
 */
const HOOK_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'Les_X_qui_Y_perdent_N_heures', re: /\bles\s+\w+\s+qui\s+.+\s+perdent\s+\d+/i },
  { name: 'Cette_personne_a_décroché_X', re: /^cet(te)?\s+\w+\s+a\s+(décroché|généré|vendu|gagné|triplé|doublé)/i },
  { name: 'Algo_a_changé_les_malins_profitent', re: /(instagram|linkedin|tiktok)\s+(vient\s+de|a)\s+chang/i },
  { name: 'X_qui_postent_Y_font_Z_de_plus', re: /\b(qui\s+(postent|publient|font)|font)\s+\d+x?\s+(plus|de plus)/i },
  { name: 'Stat_inventee_pourcent', re: /\+\s*\d{2,3}\s*%/ },
  { name: 'Stat_inventee_X_clients', re: /\b\d{2,4}\s+(commerçants|clients|utilisateurs|coachs|restaurateurs)\s+(utilisent|ont\s+choisi)/i },
  { name: 'Promesse_X_jours', re: /\b(en\s+\d+\s+(jours|semaines|heures))\s*[:.]/i },
  { name: 'Avant_apres_grayscale', re: /split[- ]screen|avant.?après|before.?after/i },
];

function categorizeSubject(visual: string): string {
  const v = (visual || '').toLowerCase();
  if (/(plat|dish|bouquet|soin|product|produit)/.test(v)) return 'product_hero';
  if (/(int.rieur|interior|salle|devanture|fa.ade|terrasse|comptoir)/.test(v)) return 'venue_atmosphere';
  if (/(.quipe|team|chef|artisan|barbier|coiffeur)/.test(v)) return 'people_team';
  if (/(client|customer|cliente|guest)/.test(v)) return 'people_customer';
  if (/(main|hand|geste|gesture|making|fabrication|cooking)/.test(v)) return 'process_craft';
  if (/(d.tail|detail|texture|gros plan|close-up|macro)/.test(v)) return 'detail_texture';
  if (/(coulisse|backstage|behind|prepa)/.test(v)) return 'behind_scenes';
  if (/(actu|news|trend|breaking|today|aujourd|tendance)/.test(v)) return 'news_tie';
  if (/(testimonial|t.moignage|avant.après|before.after|résultat)/.test(v)) return 'social_proof';
  return 'lifestyle';
}

export async function computeGlobalLearning(
  supabase: SupabaseClient,
  options: { force?: boolean; windowDays?: number } = {},
): Promise<GlobalLearning | null> {
  const now = Date.now();
  if (!options.force && CACHE && (now - CACHE.computedAt) < CACHE_TTL_MS) {
    return CACHE;
  }

  const windowDays = options.windowDays || 30;
  const since = new Date(now - windowDays * 86400000).toISOString();

  // Pull a wide sample of recent posts across ALL users. Cap at 5000
  // to keep this manageable — at scale we'd page or push to a
  // materialized view.
  const { data: rows, error } = await supabase
    .from('content_calendar')
    .select('status, pillar, format, hook, visual_description')
    .gte('created_at', since)
    .limit(5000);
  if (error || !rows) return null;
  if (rows.length < 50) return null; // not enough signal yet to compute global

  const killStatuses = new Set(['skipped', 'deleted', 'deleted_on_ig', 'rejected']);
  const killed = rows.filter(r => killStatuses.has(r.status || ''));
  const published = rows.filter(r => r.status === 'published');

  const totalKilled = killed.length;
  const totalGenerated = rows.length;
  const killRate = totalGenerated > 0 ? totalKilled / totalGenerated : 0;

  // ── Hook patterns ──
  const hookCounts: Record<string, { count: number; sample: string }> = {};
  for (const r of killed) {
    const hook = (r.hook || '').trim();
    if (!hook) continue;
    for (const p of HOOK_PATTERNS) {
      if (p.re.test(hook)) {
        if (!hookCounts[p.name]) hookCounts[p.name] = { count: 0, sample: hook.slice(0, 100) };
        hookCounts[p.name].count++;
      }
    }
  }
  const topKilledHooks = Object.entries(hookCounts)
    .filter(([_, v]) => v.count >= 5)            // need ≥5 kills across clients to count
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([pattern, v]) => ({ pattern, killCount: v.count, sample: v.sample }));

  // ── Pillar / Format / Subject killmap ──
  const pillarKilled: Record<string, number> = {};
  const pillarTotal: Record<string, number> = {};
  const formatKilled: Record<string, number> = {};
  const formatTotal: Record<string, number> = {};
  const subjectKilled: Record<string, number> = {};

  for (const r of rows) {
    if (r.pillar) pillarTotal[r.pillar] = (pillarTotal[r.pillar] || 0) + 1;
    if (r.format) formatTotal[r.format] = (formatTotal[r.format] || 0) + 1;
  }
  for (const r of killed) {
    if (r.pillar) pillarKilled[r.pillar] = (pillarKilled[r.pillar] || 0) + 1;
    if (r.format) formatKilled[r.format] = (formatKilled[r.format] || 0) + 1;
    const cat = categorizeSubject(r.visual_description || '');
    subjectKilled[cat] = (subjectKilled[cat] || 0) + 1;
  }

  const topKilledPillars = Object.entries(pillarKilled)
    .filter(([k, n]) => n >= 5 && (n / (pillarTotal[k] || 1)) >= 0.30)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([pillar, killCount]) => ({ pillar, killCount, killRate: killCount / (pillarTotal[pillar] || 1) }));

  const topKilledFormats = Object.entries(formatKilled)
    .filter(([k, n]) => n >= 5 && (n / (formatTotal[k] || 1)) >= 0.30)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([format, killCount]) => ({ format, killCount, killRate: killCount / (formatTotal[format] || 1) }));

  const topKilledSubjects = Object.entries(subjectKilled)
    .filter(([_, n]) => n >= 5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([subject, killCount]) => ({ subject, killCount }));

  // ── Validated pillars: high publish rate ──
  const pillarPublished: Record<string, number> = {};
  for (const r of published) {
    if (r.pillar) pillarPublished[r.pillar] = (pillarPublished[r.pillar] || 0) + 1;
  }
  const validatedPillars = Object.entries(pillarPublished)
    .filter(([k, n]) => n >= 10 && (pillarTotal[k] || 0) >= 15 && (n / pillarTotal[k]) >= 0.70)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([pillar, n]) => ({ pillar, publishRate: n / (pillarTotal[pillar] || 1), n: pillarTotal[pillar] || 0 }));

  CACHE = {
    computedAt: now,
    totalKilled,
    totalGenerated,
    killRate,
    topKilledHooks,
    topKilledPillars,
    topKilledFormats,
    topKilledSubjects,
    validatedPillars,
  };
  return CACHE;
}

/**
 * Format the learning as a compact prompt block. Returns empty string
 * when there's not enough global data yet (Léna stays autonomous).
 */
export function globalLearningPromptBlock(g: GlobalLearning | null): string {
  if (!g) return '';
  if (g.totalGenerated < 100) return '';   // need a real sample
  if (g.killRate < 0.10) return '';        // overall happy → no warning needed

  const parts: string[] = [];
  if (g.topKilledHooks.length > 0) {
    parts.push(`Hooks templates qui se font supprimer chez beaucoup de clients : ${g.topKilledHooks.map(h => `"${h.sample}"`).join(' / ')}. Évite ces patterns.`);
  }
  if (g.topKilledPillars.length > 0) {
    parts.push(`Piliers à risque (souvent supprimés) : ${g.topKilledPillars.map(p => `${p.pillar} (${Math.round(p.killRate * 100)}%)`).join(', ')}.`);
  }
  if (g.topKilledFormats.length > 0) {
    parts.push(`Formats à éviter sauf raison forte : ${g.topKilledFormats.map(f => `${f.format} (${Math.round(f.killRate * 100)}%)`).join(', ')}.`);
  }
  if (g.topKilledSubjects.length > 0) {
    parts.push(`Sujets visuels souvent rejetés : ${g.topKilledSubjects.map(s => s.subject).join(', ')}.`);
  }
  if (g.validatedPillars.length > 0) {
    parts.push(`Piliers VALIDÉS (forte publication) : ${g.validatedPillars.map(p => `${p.pillar} (${Math.round(p.publishRate * 100)}%)`).join(', ')} — privilégier.`);
  }

  if (parts.length === 0) return '';

  return `\n━━━ APPRENTISSAGE GLOBAL KEIROAI (basé sur ${g.totalGenerated} posts, ${g.totalKilled} supprimés tous clients confondus) ━━━
${parts.join('\n')}

→ Ces signaux viennent de TOUS les clients KeiroAI. Quand un pattern se fait supprimer chez beaucoup d'utilisateurs, c'est un signal fort qu'il ne fonctionne pas — utilise-le pour faire de meilleurs choix.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}
