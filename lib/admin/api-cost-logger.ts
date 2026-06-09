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
    await supabase.from('api_cost_events').insert([{
      provider: event.provider,
      kind: event.kind,
      units: event.units,
      cost_eur: event.cost_eur,
      user_id: event.user_id ?? null,
      agent: event.agent ?? null,
      metadata: event.metadata ?? null,
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
  seedance_5s: 0.31,
  seedance_10s: 0.55,
  seedance_15s: 0.83,
  seedance_30s: 1.65,
  kling_5s: 0.30,
  kling_10s: 0.55,
  elevenlabs_per_1k_chars: 0.30 * USD_TO_EUR,
};
