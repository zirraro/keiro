/**
 * CAPABILITY STATUS — source de vérité de l'honnêteté produit (Fable 5, plan 20M).
 *
 * Règle d'or : « Réel = vendu. Aperçu = bêta offerte OU bientôt, JAMAIS facturé,
 * JAMAIS ✅. » Chaque incohérence « aperçu vendu » en ligne érode le positionnement
 * sérieux qui est TOUT le différentiel vs les horizontaux (Limova/Sintra).
 *
 * Consommé par : landing, pricing, dashboard agents, CGV. Une seule table à mettre
 * à jour le jour J (approbation Meta → flip 'soon'→'live', zéro autre changement).
 *
 * `degraded` = dégradation gracieuse par canal (indépendance plateforme) : si une
 * API saute, on passe le canal en `degraded` sans casser le reste ni mentir.
 */
export type CapStatus = 'live' | 'beta' | 'soon' | 'degraded';

export interface Capability {
  key: string;
  agent: string;          // persona (content/dm_instagram/…)
  status: CapStatus;
  billable: boolean;      // facturable UNIQUEMENT si live (garde-fou honnêteté)
}

// État au 08/07/2026 — À METTRE À JOUR quand une capacité change de statut.
export const CAPABILITIES: Record<string, Capability> = {
  // ── Léna (contenu) ──
  content_tiktok:   { key: 'content_tiktok',   agent: 'content', status: 'live',  billable: true },
  content_linkedin: { key: 'content_linkedin', agent: 'content', status: 'live',  billable: true },
  content_instagram:{ key: 'content_instagram',agent: 'content', status: 'soon',  billable: false }, // publish IG = approbation Meta PENDING → flip 'live' le jour J
  // ── Jade (DM/commentaires) ──
  dm_instagram:     { key: 'dm_instagram',     agent: 'dm_instagram', status: 'live', billable: true },
  // ── Théo (réputation + SEO) ──
  theo_reviews:     { key: 'theo_reviews',     agent: 'gmaps', status: 'live', billable: true },
  theo_seo:         { key: 'theo_seo',         agent: 'seo',   status: 'soon', billable: false }, // OAuth Google verification PENDING
  // ── Hugo (email) / Léo (prospection) ──
  hugo_email:       { key: 'hugo_email',       agent: 'email',      status: 'live', billable: true },
  leo_prospection:  { key: 'leo_prospection',  agent: 'commercial', status: 'live', billable: true },
  // ── Add-ons / différenciateurs ──
  stella_whatsapp:  { key: 'stella_whatsapp',  agent: 'whatsapp',  status: 'soon', billable: false }, // BSP Meta Cloud API PENDING — NE PAS facturer avant 'live'
  sara_docs:        { key: 'sara_docs',        agent: 'rh',        status: 'beta', billable: false }, // bêta offerte tant que les docs ne sortent pas irréprochables
  louis_docs:       { key: 'louis_docs',       agent: 'comptable', status: 'beta', billable: false },
};

export function getCapability(key: string): Capability | null {
  return CAPABILITIES[key] || null;
}

/** Un add-on/plan ne peut facturer une capacité que si elle est 'live'. */
export function isBillable(key: string): boolean {
  return CAPABILITIES[key]?.status === 'live' && CAPABILITIES[key]?.billable === true;
}

const BADGES: Record<CapStatus, { fr: string; en: string; tone: string }> = {
  live:     { fr: '',              en: '',            tone: 'live' },      // pas de badge = c'est réel/vendu
  beta:     { fr: 'Bêta offerte',  en: 'Free beta',   tone: 'beta' },
  soon:     { fr: 'Bientôt',       en: 'Coming soon', tone: 'soon' },
  degraded: { fr: 'Momentanément limité', en: 'Temporarily limited', tone: 'degraded' },
};

/** Libellé de badge honnête pour l'UI (vide si 'live'). */
export function capabilityBadge(key: string, locale: 'fr' | 'en' = 'fr'): { label: string; tone: string } | null {
  const c = CAPABILITIES[key];
  if (!c || c.status === 'live') return null;
  const b = BADGES[c.status];
  return { label: locale === 'en' ? b.en : b.fr, tone: b.tone };
}
