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
  // 2026-06-03 — Founder ask: anti-charabia text. Si on veut UN mot précis
  // dans l'image (rare, pour overlay programmé), on le passe ici. Sinon
  // l'image est FORCÉE sans aucun texte (overlay côté KeiroAI).
  exactTextInImage?: string | null;
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
/**
 * 2026-06-03 v2 — Founder decision: Seedream PRIMARY (qualité top, vrai
 * prix officiel $0.03/image), Kling SECOND fallback, Flux Schnell 3rd
 * fallback (économie si Seedream + Kling fail).
 *
 * On garde toutes les générations en cache pour audit + futur réuse
 * intra-client.
 */
export async function generateImage(opts: ImageGenOptions): Promise<ImageGenResult | null> {
  const complexity = opts.complexity || 'standard';
  const size = opts.size || '1024x1024';

  // Provider 1: Seedream (PRIMARY) — quality top, $0.03/image
  if (!opts.forceProvider || opts.forceProvider === 'seedream') {
    const seedreamUrl = process.env.SEEDREAM_API_URL || 'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations';
    const seedreamKey = (process.env.SEEDREAM_API_KEY || process.env.ARK_API_KEY || '').replace(/\\n/g, '').trim();
    if (seedreamKey) {
      try {
        const res = await fetch(seedreamUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${seedreamKey}` },
          body: JSON.stringify({
            model: 'seedream-4-0-250828',
            prompt: (opts.exactTextInImage
  ? `${opts.prompt}. The ONLY text visible in the image is the exact phrase "${opts.exactTextInImage}" rendered cleanly in a single readable font, centered or composed naturally. NO other words, gibberish, or random letters anywhere. EDITORIAL DOCUMENTARY photograph shot on a Leica M11 or Hasselblad X2D with a 50mm or 80mm prime lens, Kodak Portra 400 film aesthetic, natural diffused window light or golden-hour sun (NO studio strobes, NO ring lights), shallow depth of field f/2.0 ~1/250s ~ISO 400, real candid moment caught mid-action, gentle 35mm grain, true-to-life muted color palette (warm naturals, no neon, no saturated cyan/magenta, no oversaturation), authentic human expression caught between two thoughts (not a posed smile), real skin texture with visible pores, fine lines, micro-imperfections and a tiny asymmetry, hands rendered correctly with 5 fingers each, ambient occlusion and natural shadows under chin and behind ears — looks like a frame from a Vogue Local / National Geographic / Cereal Magazine / Apartamento editorial story. Reference: Annie Leibovitz, Cass Bird, Sebastiao Salgado intimate documentary style. NOT a stock illustration, NOT midjourney, NOT a 3D render, ZERO AI portrait artifacts.`
  : opts.prompt + '. CRITICAL: ZERO text in this image. No words, no letters, no numbers, no captions, no signage with text, no labels, no logos with readable text, no watermarks. The image must be 100% text-free — text will be added later via overlay. EDITORIAL DOCUMENTARY photograph shot on a Leica M11 or Hasselblad X2D with a 50mm or 80mm prime lens, Kodak Portra 400 film aesthetic, natural diffused window light or golden-hour sun (NO studio strobes, NO ring lights), shallow depth of field f/2.0 ~1/250s ~ISO 400, real candid moment caught mid-action, gentle 35mm grain, true-to-life muted color palette (warm naturals, no neon, no saturated cyan/magenta, no oversaturation), authentic human expression caught between two thoughts (not a posed smile), real skin texture with visible pores, fine lines, micro-imperfections and a tiny asymmetry, hands rendered correctly with 5 fingers each, ambient occlusion and natural shadows under chin and behind ears — looks like a frame from a Vogue Local / National Geographic / Cereal Magazine / Apartamento editorial story. Reference: Annie Leibovitz, Cass Bird, Sebastiao Salgado intimate documentary style. NOT a stock illustration, NOT midjourney, NOT a 3D render, ZERO AI portrait artifacts.'),
            // 2026-06-04 — Founder: "attention aux couleur IA ou trop effet
            // IA on veut de la creativité et de la pertinence donc des
            // humaines objet reels". Add aggressive anti-AI patterns to
            // the negative prompt so Seedream stops producing the
            // tell-tale "ChatGPT-generated" look (porcelain skin, dead
            // eyes, neon glow, plastic).
            negative_prompt: opts.exactTextInImage
              ? 'gibberish text, random letters, fake words, distorted text, multiple text overlays, watermarks, logos, low quality, blurry, deformed faces, extra limbs, plastic skin, porcelain skin, doll-like, mannequin, uncanny valley, dead eyes, glowing eyes, neon glow, hyper-saturated, oversaturated, candy colors, magenta cyan dominant, airbrushed, smooth skin without texture, perfect teeth, perfect symmetry, fake hands, melting fingers, six fingers, seven fingers, mutated hands, symmetrical perfection, posed studio smile, ring light catchlight, studio strobe lighting, beauty dish, cyc wall background, white seamless backdrop, instagram filter look, vsco filter, hdr glow, dramatic vignette, lens flare overlay, stock photo, getty images watermark style, adobe stock look, shutterstock, AI portrait, midjourney style, stable diffusion default, dall-e style, cgi render, 3d render look, ray-traced, anime style, cartoon, illustration, vector art, flat illustration, vector flat design, generic minimalist illustration'
              // 2026-06-08 — Founder reinforcement on foreign-script
              // leakage: explicitly ban Chinese, Japanese, Korean,
              // Cyrillic, Arabic, Devanagari, Thai, Hebrew glyphs that
              // Seedream/Seedance sometimes hallucinates on French/EU
              // clients' content. Single foreign character = reject.
              : 'text, words, letters, numbers, writing, typography, captions, signs, labels, headlines, slogans, characters, alphabets, chinese characters, japanese characters, korean hangul, hanzi, kanji, hiragana, katakana, cyrillic letters, russian text, arabic script, devanagari, thai script, hebrew letters, greek letters, asian characters, foreign script, gibberish text, broken glyphs, garbled letters, watermarks, logos, low quality, blurry, deformed faces, extra limbs, plastic skin, porcelain skin, doll-like, mannequin, uncanny valley, dead eyes, glowing eyes, neon glow, hyper-saturated, oversaturated, candy colors, magenta cyan dominant, airbrushed, smooth skin without texture, perfect teeth, perfect symmetry, fake hands, melting fingers, six fingers, seven fingers, mutated hands, symmetrical perfection, posed studio smile, ring light catchlight, studio strobe lighting, beauty dish, cyc wall background, white seamless backdrop, instagram filter look, vsco filter, hdr glow, dramatic vignette, lens flare overlay, stock photo, getty images watermark style, adobe stock look, shutterstock, AI portrait, midjourney style, stable diffusion default, dall-e style, cgi render, 3d render look, ray-traced, anime style, cartoon, illustration, vector art, flat illustration, vector flat design, generic minimalist illustration',
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
              cost_eur_estimate: 0.028,
              reason: `seedream_primary (complexity=${complexity})`,
            };
          }
        }
        console.warn('[image-provider] Seedream failed → trying Kling fallback');
      } catch (e: any) {
        console.warn('[image-provider] Seedream error → Kling fallback:', e.message?.substring(0, 150));
      }
    }
  }

  // Provider 2: Kling (Kuaishou) — fallback if Seedream down
  // Uses HMAC-SHA256 JWT auth via lib/kling.ts (generateKlingT2I).
  if (process.env.KLING_ACCESS_KEY && process.env.KLING_SECRET_KEY) {
    try {
      const { generateKlingT2I } = await import('@/lib/kling');
      const aspectRatio = size === '1024x1792' ? '9:16' : size === '1792x1024' ? '16:9' : '1:1';
      const result = await generateKlingT2I({ prompt: opts.prompt, aspectRatio });
      if (result?.imageUrl) {
        return {
          url: result.imageUrl,
          provider: 'flux_dev' as any, // reuse slot for kling — TODO: extend provider type
          cost_eur_estimate: 0.025,
          reason: 'kling_fallback_seedream_failed',
        };
      }
    } catch (e: any) {
      console.warn('[image-provider] Kling failed → Flux Schnell fallback:', e.message?.substring(0, 150));
    }
  }

  // Provider 3: Flux Schnell (Replicate) — last resort cheap fallback
  if (process.env.REPLICATE_API_TOKEN) {
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
          reason: 'flux_schnell_last_resort_fallback',
        };
      }
      console.warn('[image-provider] Flux Schnell returned no URL:', JSON.stringify(data).substring(0, 200));
    } catch (e: any) {
      console.error('[image-provider] All 3 providers failed (Seedream → Kling → Flux):', e.message?.substring(0, 150));
    }
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
