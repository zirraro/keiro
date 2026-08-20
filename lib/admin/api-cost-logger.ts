/**
 * API cost logger — instrumentation des appels externes (Anthropic,
 * Gemini, Seedream, Seedance, Kling, Places, ElevenLabs, Brevo) pour
 * pilotage admin en temps réel des marges.
 *
 * Usage :
 *   import { logApiCost } from '@/lib/admin/api-cost-logger';
 *   // Après chaque appel externe
 *   logApiCost({
 *     provider: 'anthropic',
 *     kind: 'sonnet_input',
 *     units: usage.input_tokens,
 *     cost_eur: (usage.input_tokens / 1000) * 0.003 * 0.55, // w/ caching
 *     user_id: userId,
 *     agent: 'content',
 *     metadata: { model, cached: true },
 *   }).catch(() => {}); // fire-and-forget — JAMAIS bloquer la requête
 *
 * Pricing référence (2026-06-09) :
 *   - Sonnet 4 input : $0.003/1k tokens (× 0.55 avec prompt caching)
 *   - Sonnet 4 output: $0.015/1k tokens
 *   - Haiku 4 input  : $0.0008/1k tokens
 *   - Haiku 4 output : $0.004/1k tokens
 *   - Gemini Pro 1.5 input  : $1.25/1M tokens
 *   - Gemini Pro 1.5 output : $5/1M tokens
 *   - Gemini Search grounding : $35/1k queries
 *   - Places API Text Search : $32/1k
 *   - Places API Place Details : $17/1k
 *   - Seedream image : 0.045€/image (déjà en EUR)
 *   - Seedance 5s : 0.31€
 *   - Seedance 10s : 0.55€
 *   - Kling T2V 5s : 0.30€
 *   - ElevenLabs : $0.30/1k chars
 *   - Brevo email : inclus dans plan (~0€ par envoi)
 */

import { createClient } from '@supabase/supabase-js';
import { contexteCoutActuel } from '@/lib/admin/contexte-cout';

const USD_TO_EUR = 0.92; // taux indicatif 2026-06

let _adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (_adminClient) return _adminClient;
  _adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  return _adminClient;
}

export interface ApiCostEvent {
  provider: 'anthropic' | 'gemini' | 'seedream' | 'seedance' | 'kling' | 'places' | 'elevenlabs' | 'brevo' | 'stripe' | string;
  kind: string;
  units: number;
  cost_eur: number;
  user_id?: string | null;
  agent?: string | null;
  metadata?: Record<string, any>;
}

/**
 * Log a cost event. Fire-and-forget: errors silently dropped to never
 * block the calling request.
 */
export async function logApiCost(event: ApiCostEvent): Promise<void> {
  try {
    const supabase = getAdmin();

    // ── Une dépense sans nom ne se pilote pas ──
    //
    // Fondateur, 2026-08-13, devant une alerte de dérive : « comment ça,
    // inconnu ? On doit toujours identifier les dépenses et les vérifier. »
    // Il avait raison, et le poste « inconnu » était le PREMIER du classement :
    // 6,94 € sur 24 h, 5 210 appels, aucune étiquette.
    //
    // La cause : ce journal n'a jamais lu le contexte ambiant. Le contexte
    // existe pourtant — chaque route d'agent le pose — mais il fallait que
    // l'appelant repasse l'agent à la main, et la plupart l'oubliaient. Une
    // information disponible qu'on ne va pas chercher, c'est une information
    // perdue.
    //
    // On la récupère donc ici, une fois, pour tous les appelants. Et si même le
    // contexte est vide, on retombe sur la NATURE de l'appel plutôt que sur
    // « inconnu » : « hors_agent:qc_reecriture_legende » se cherche, « inconnu »
    // ne se cherche pas.
    const ambiant = contexteCoutActuel();
    const agent = event.agent ?? ambiant.agent ?? (event.kind ? `hors_agent:${event.kind}` : 'hors_agent');
    const userId = event.user_id ?? ambiant.userId ?? null;

    await supabase.from('api_cost_events').insert([{
      provider: event.provider,
      kind: event.kind,
      units: event.units,
      cost_eur: event.cost_eur,
      user_id: userId,
      agent,
      metadata: ambiant.origine
        ? { ...(event.metadata ?? {}), origine: ambiant.origine }
        : (event.metadata ?? null),
    }] as any);
  } catch (e) {
    // Never throw — logging cost shouldn't break user-facing routes
    console.warn('[api-cost-logger] log failed:', (e as any)?.message);
  }
}

// ─── Helpers pour les providers les plus utilisés ──────────────

export function anthropicCostEur(usage: {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}, model: 'sonnet' | 'haiku' | 'opus' = 'sonnet'): number {
  const inputRate = model === 'haiku' ? 0.0008 : model === 'opus' ? 0.015 : 0.003; // per 1k
  const outputRate = model === 'haiku' ? 0.004 : model === 'opus' ? 0.075 : 0.015;
  const cacheReadRate = inputRate * 0.10;     // 90% discount on cache reads
  const cacheCreateRate = inputRate * 1.25;   // 25% premium on cache writes
  const inputCost = ((usage.input_tokens || 0) / 1000) * inputRate;
  const outputCost = ((usage.output_tokens || 0) / 1000) * outputRate;
  const cacheReadCost = ((usage.cache_read_input_tokens || 0) / 1000) * cacheReadRate;
  const cacheCreateCost = ((usage.cache_creation_input_tokens || 0) / 1000) * cacheCreateRate;
  const totalUSD = inputCost + outputCost + cacheReadCost + cacheCreateCost;
  return totalUSD * USD_TO_EUR;
}

export function geminiCostEur(usage: {
  input_tokens?: number;
  output_tokens?: number;
  grounding_queries?: number;
}, model: 'pro' | 'flash' = 'pro'): number {
  const inputRate = model === 'flash' ? 0.075 / 1_000_000 : 1.25 / 1_000_000;
  const outputRate = model === 'flash' ? 0.30 / 1_000_000 : 5 / 1_000_000;
  const inputCost = (usage.input_tokens || 0) * inputRate;
  const outputCost = (usage.output_tokens || 0) * outputRate;
  const groundingCost = ((usage.grounding_queries || 0) / 1000) * 35;
  return (inputCost + outputCost + groundingCost) * USD_TO_EUR;
}

export function placesCostEur(kind: 'text_search' | 'place_details' | 'nearby_search', count: number): number {
  const rate = kind === 'text_search' ? 32 / 1000 : kind === 'place_details' ? 17 / 1000 : 32 / 1000;
  return count * rate * USD_TO_EUR;
}

// Seedream/Seedance/Kling déjà en EUR (provider chinois facture en USD
// mais nos calculs internes utilisent une approximation EUR direct).
export const PROVIDER_EUR = {
  seedream_image: 0.045,
  // ── Prix relevés sur la facture réelle, pas sur la grille affichée ──
  //
  // Fondateur, 19 août : « pour Seedance dix secondes nous coûtent 1,20 USD à
  // peu près, pas 0,26, donc attention, vérifie bien les coûts ».
  //
  // Il a raison sur les deux points. J'avais cité 0,26 € de mémoire — c'était
  // faux — et la constante du code disait 0,55 €, soit la moitié de la dépense
  // réelle. Un coût sous-évalué de moitié sur le poste le plus cher à l'unité
  // fausse toutes les décisions de marge : on croit pouvoir se permettre deux
  // fois plus de vidéos qu'on ne peut.
  //
  // Les valeurs suivent maintenant la facture (1,20 USD ≈ 1,10 EUR pour dix
  // secondes), les autres durées au prorata.
  seedance_5s: 0.55,
  seedance_10s: 1.10,
  seedance_15s: 1.65,
  seedance_30s: 3.30,
  kling_5s: 0.30,
  kling_10s: 0.55,
  elevenlabs_per_1k_chars: 0.30 * USD_TO_EUR,

  // ── Google : nouvelles sources de facturation, ajoutées le 2026-08-20 ──
  //
  // Jusqu'ici Gemini n'apparaissait pas dans cette table alors qu'il générait
  // déjà des images en secours : ces dépenses-là ne remontaient nulle part.
  // Depuis le 20 août il est passé DEVANT Kling dans la chaîne, et Veo devient
  // le secours vidéo — donc deux postes qui vont réellement coûter.
  //
  // Tarifs relevés à la source (ai.google.dev/gemini-api/docs/pricing) le
  // 2026-08-20, convertis en EUR. Relevés et non cités de mémoire : c'est une
  // citation de mémoire qui avait sous-évalué Seedance de moitié, et ce sont
  // les coûts vidéo qui décident de nos marges (voir plus bas).
  gemini_image_flash25: 0.039 * USD_TO_EUR,   // 0,036 € — MOINS cher que Seedream
  gemini_image_flash31: 0.067 * USD_TO_EUR,   // 0,062 € — 1K
  gemini_image_pro3: 0.134 * USD_TO_EUR,      // 0,124 € — écarté par défaut, voir ci-dessous

  // Veo facture À LA SECONDE, en 1080p. Les entrées ci-dessous sont ramenées à
  // dix secondes pour rester comparables à seedance_10s.
  veo_fast_10s: 0.12 * 10 * USD_TO_EUR,       // 1,11 € — parité avec Seedance
  veo_lite_10s: 0.08 * 10 * USD_TO_EUR,       // 0,74 € — 33 % sous Seedance
  veo_standard_10s: 0.40 * 10 * USD_TO_EUR,   // 3,70 € — 3,4× Seedance, jamais automatique
};

/**
 * ── Ce que ces chiffres disent de nos marges, mesuré le 2026-08-20 ──
 *
 * Le fondateur : « tu compares des modèles sur les prix, mais c'est la qualité
 * ET le prix qui font nos marges, et la satisfaction pour nos clients ».
 *
 * Calcul fait sur les quotas réels (lib/credits/constants.ts) et les prix des
 * plans, à consommation pleine — donc le pire cas, pas la moyenne :
 *
 *                      Seedream+Seedance   gemini-2.5+Veo lite
 *   Créateur  49 €           68 %                77 %
 *   Pro       99 €           73 %                81 %
 *   Business 149 €           62 %                73 %
 *
 * Deux enseignements qui changent les décisions :
 *
 * 1. LA VIDÉO ÉCRASE L'IMAGE. Sur Créateur, 12 vidéos coûtent 13,20 € contre
 *    2,70 € pour 60 images — 83 % du coût média. Changer de modèle d'image fait
 *    gagner 0,54 € ; changer de modèle vidéo en fait gagner 4,32 €, huit fois
 *    plus. C'est là qu'il faut regarder, pas ailleurs.
 *
 * 2. LE PLUS CHER N'EST PAS LE MEILLEUR. Banc du 20 août, nos prompts réels,
 *    notre juge : gemini-3-pro coûte 3,4× le 2.5-flash pour la MÊME note
 *    (8,3/10), met 3× plus de temps, et casse la consigne « zéro texte » une
 *    fois sur trois. Il est écarté par défaut, pas seulement parce qu'il est
 *    cher : parce qu'il est moins bon sur notre contrainte la plus dure.
 *
 * Réserve à garder en tête : Seedream n'a PAS été mesuré face à Gemini — le
 * compte ByteDance était en impayé le jour du banc. « Moins cher » est vérifié,
 * « meilleur » ne l'est pas. À refaire dès que le compte revit.
 */
