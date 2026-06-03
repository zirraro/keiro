/**
 * 2026-06-03 — Image provider router (cost optim sans perte qualité).
 *
 * Founder ask: atteindre 70% marge Créateur dès 10 clients, 80% Pro dès
 * 30 clients, SANS perdre en qualité.
 *
 * Stratégie : Flux Schnell par défaut (0.003€/image, qualité marketing
 * excellente), Seedream gardé pour les cas complexes (mix 2 univers,
 * photos client à remixer, news integration).
 *
 * Comparatif coûts/qualité (juin 2026) :
 *   Flux Schnell (Replicate)  : $0.003/image · qualité ⭐⭐⭐⭐⭐ marketing
 *   Flux Dev (Replicate)      : $0.025/image · qualité ⭐⭐⭐⭐⭐ artistic
 *   Seedream 4.5 (ByteDance)  : $0.04/image  · qualité ⭐⭐⭐⭐⭐ photoreal
 *
 * → Pour 95 % des cas KeiroAI (posts marketing prospects), Flux Schnell
 *   est totalement suffisant. Seedream pour les cas où on doit absolument
 *   contrôler la composition (client photos + venue mix).
 */

export type ImageComplexity = 'simple' | 'standard' | 'complex';

export interface ImageGenOptions {
  prompt: string;
  complexity?: ImageComplexity;
  size?: '1024x1024' | '1024x1792' | '1792x1024';
  forceProvider?: 'flux' | 'seedream';
  callTag?: string;
}

export interface ImageGenResult {
  url: string;
  provider: 'flux_schnell' | 'flux_dev' | 'seedream';
  cost_eur_estimate: number;
  reason: string;
}

/**
 * Generate an image picking the best price/quality provider for the task.
 * Falls back to Seedream if Flux fails (or REPLICATE_API_TOKEN missing).
 */
export async function generateImage(opts: ImageGenOptions): Promise<ImageGenResult | null> {
  const complexity = opts.complexity || 'standard';
  const size = opts.size || '1024x1024';
  const useSeedream = opts.forceProvider === 'seedream'
    || complexity === 'complex'; // complex = Seedream for photoreal control
  const useFlux = !useSeedream && (opts.forceProvider === 'flux' || true);

  // Provider 1: Flux Schnell via Replicate (default)
  if (useFlux && process.env.REPLICATE_API_TOKEN) {
    try {
      const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
        method: 'POST',
        headers: {
          'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
          'Content-Type': 'application/json',
          'Prefer': 'wait',
        },
        body: JSON.stringify({
          input: {
            prompt: opts.prompt + '. Professional marketing visual, cinematic lighting, modern premium aesthetic, social media ready, no text, no words, no letters, no watermarks',
            aspect_ratio: size === '1024x1792' ? '9:16' : size === '1792x1024' ? '16:9' : '1:1',
            num_outputs: 1,
            output_format: 'png',
            output_quality: 90,
          },
        }),
        signal: AbortSignal.timeout(45_000),
      });
      const data = await res.json();
      const url = Array.isArray(data.output) ? data.output[0] : data.output;
      if (url && typeof url === 'string' && url.startsWith('http')) {
        return {
          url,
          provider: 'flux_schnell',
          cost_eur_estimate: 0.003,
          reason: `flux_schnell_default (complexity=${complexity})`,
        };
      }
      console.warn('[image-provider] Flux Schnell returned no URL:', JSON.stringify(data).substring(0, 200));
    } catch (e: any) {
      console.warn('[image-provider] Flux Schnell failed, falling back to Seedream:', e.message?.substring(0, 150));
    }
  }

  // Provider 2: Seedream (fallback or complex cases)
  const seedreamUrl = process.env.SEEDREAM_API_URL || 'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations';
  const seedreamKey = (process.env.SEEDREAM_API_KEY || process.env.ARK_API_KEY || '').replace(/\\n/g, '').trim();
  if (!seedreamKey) {
    console.error('[image-provider] No SEEDREAM_API_KEY and Flux failed/missing');
    return null;
  }
  try {
    const res = await fetch(seedreamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${seedreamKey}` },
      body: JSON.stringify({
        model: 'seedream-4-5-251128',
        prompt: opts.prompt + '. Ultra high quality, professional marketing visual, cinematic lighting, modern premium aesthetic, social media ready, no text, no words, no letters, no watermarks',
        negative_prompt: 'text, words, letters, numbers, writing, typography, signs, labels, watermarks, logos, low quality, blurry',
        response_format: 'url',
        watermark: false,
        size,
        seed: -1,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) {
      const data = await res.json();
      const url = data.data?.[0]?.url || data.images?.[0]?.url || data.url;
      if (url) {
        return {
          url,
          provider: 'seedream',
          cost_eur_estimate: 0.04,
          reason: complexity === 'complex' ? 'seedream_complex_task' : 'seedream_fallback_flux_failed',
        };
      }
    }
    console.warn('[image-provider] Seedream API error:', res.status, (await res.text()).substring(0, 200));
  } catch (e: any) {
    console.error('[image-provider] Seedream also failed:', e.message?.substring(0, 200));
  }
  return null;
}

/**
 * Detect complexity from prompt keywords. Matches detectLenaComplexity
 * in llm-router so the LLM brief AND the image generation upgrade
 * together when needed.
 */
export function detectImageComplexity(prompt: string): ImageComplexity {
  if (!prompt) return 'standard';
  const lowered = prompt.toLowerCase();
  const complexSignals = [
    'mix', 'mélange', 'fusion', 'combine',
    'client photo', 'client photos', 'photos fournies', 'photo du client',
    'venue mix', 'salle mixée', 'plat mixé',
    'before after', 'avant après', 'avant/après',
    'composite', 'overlay', 'incrustation',
    'multi-source', 'two scenes', 'two universes',
  ];
  if (complexSignals.some(s => lowered.includes(s))) return 'complex';
  if (lowered.length < 80) return 'simple';
  return 'standard';
}
