import { fetchIPv4 } from '@/lib/net/ipv4';
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
  provider: 'flux_schnell' | 'flux_dev' | 'seedream' | 'gemini';
  cost_eur_estimate: number;
  reason: string;
}

// 2026-07-19 — Founder ask: "quand on arrive sur un fallback je veux être
// prévenu sur contact@keiroai.com sur TOUS les fallback". Seedream est le
// provider primaire (qualité top). Dès qu'une génération tombe sur Kling ou
// Flux (ou échoue complètement), on :
//   1. log le fallback dans agent_logs (audit "quel provider a servi")
//   2. envoie un mail admin à contact@keiroai.com (throttlé pour ne pas
//      spammer si un provider reste down).
// Fire-and-forget : ne bloque jamais la génération.
const _lastFallbackAlert: Record<string, number> = {};
const FALLBACK_ALERT_COOLDOWN_MS = 15 * 60 * 1000; // 15 min par type de transition

/**
 * 2026-07-28 — Provider de secours QUALITÉ : Gemini (image).
 *
 * Contexte : Seedream (BytePlus) et Kling peuvent tomber ensemble sur un
 * problème de solde, et le dernier recours Flux Schnell est bridé quand le
 * crédit Replicate est bas. Le compte Google, lui, est déjà approvisionné
 * pour le texte → on s'en sert comme filet AVANT de dégrader sur Flux.
 *
 * Gemini renvoie l'image en base64 (pas d'URL) : on la pousse dans le
 * storage Supabase pour obtenir une URL publique stable, comme les autres
 * visuels. Renvoie null si quoi que ce soit échoue (le caller continue la
 * chaîne de fallback).
 */
async function generateWithGemini(opts: ImageGenOptions, size: string): Promise<string | null> {
  const key = (process.env.GEMINI_API_KEY || '').trim();
  if (!key) return null;

  const aspectRatio = size === '1024x1792' ? '9:16' : size === '1792x1024' ? '16:9' : '1:1';
  // Gemini n'a pas de negative_prompt : les interdits passent en consigne.
  const textRule = opts.exactTextInImage
    ? `The ONLY text visible in the image is the exact phrase "${opts.exactTextInImage}", rendered cleanly in one readable font. No other words, letters or gibberish anywhere.`
    : 'ZERO text in the image: no words, letters, numbers, captions, signage, labels, logos or watermarks (text is added later as an overlay).';

  const prompt = `${opts.prompt}. ${textRule} EDITORIAL DOCUMENTARY photograph: 50mm or 80mm prime lens, Kodak Portra 400 film aesthetic, natural diffused window light or golden hour (no studio strobes, no ring light), shallow depth of field, real candid moment, gentle 35mm grain, true-to-life muted colors. Real people with authentic skin texture and correct hands, diverse in age and origin, caught mid-action rather than posing. Absolutely NOT a 3D render, NOT an illustration, NOT a stock photo, no plastic or porcelain skin, no neon or oversaturated colors, no AI portrait artifacts.`;

  try {
    const res = await fetchIPv4(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { imageConfig: { aspectRatio } },
        }),
        signal: AbortSignal.timeout(90_000),
      },
    );
    if (!res.ok) {
      console.warn('[image-provider] Gemini HTTP', res.status, (await res.text().catch(() => '')).substring(0, 200));
      return null;
    }
    const data = await res.json();
    const part = (data?.candidates?.[0]?.content?.parts || []).find((p: any) => p?.inlineData || p?.inline_data);
    const inline = part?.inlineData || part?.inline_data;
    if (!inline?.data) {
      console.warn('[image-provider] Gemini: pas d\'image dans la réponse');
      return null;
    }

    // Gemini rend un PNG ~2 Mo : on repasse en JPEG comme le reste du
    // pipeline (publication réseaux + CDN), sans perte visible.
    let buf: Buffer = Buffer.from(inline.data, 'base64');
    let contentType = inline.mimeType || inline.mime_type || 'image/png';
    let ext = 'png';
    try {
      const sharp = (await import('sharp')).default;
      buf = Buffer.from(await sharp(buf).jpeg({ quality: 92, mozjpeg: true }).toBuffer());
      contentType = 'image/jpeg';
      ext = 'jpg';
    } catch { /* si sharp indisponible, on garde le PNG d'origine */ }

    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const path = `generated-gemini/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await sb.storage
      .from('business-assets')
      .upload(path, buf, { contentType, upsert: true });
    if (upErr) {
      console.warn('[image-provider] Gemini upload storage échoué:', upErr.message);
      return null;
    }
    const { data: pub } = sb.storage.from('business-assets').getPublicUrl(path);
    return pub?.publicUrl || null;
  } catch (e: any) {
    console.warn('[image-provider] Gemini error:', e?.message?.substring(0, 200));
    return null;
  }
}

async function notifyProviderFallback(payload: {
  used: 'kling' | 'gemini' | 'flux_schnell' | 'none';
  seedreamError?: string;
  klingError?: string;
  geminiError?: string;
  reason: string;
  callTag?: string;
}): Promise<void> {
  try {
    const transitionKey = payload.used; // kling | flux_schnell | none
    const now = Date.now();
    const last = _lastFallbackAlert[transitionKey] || 0;

    // Toujours logger l'événement (audit non throttlé), même si l'email l'est.
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );
      await sb.from('agent_logs').insert({
        agent: 'content',
        action: 'image_provider_fallback',
        status: payload.used === 'none' ? 'error' : 'warning',
        data: {
          used_provider: payload.used,
          seedream_error: payload.seedreamError?.substring(0, 300) || null,
          kling_error: payload.klingError?.substring(0, 300) || null,
          gemini_error: payload.geminiError?.substring(0, 300) || null,
          reason: payload.reason,
          call_tag: payload.callTag || null,
        },
      });
    } catch { /* audit best-effort */ }

    // Email admin throttlé (sinon flood si Seedream reste down).
    if (now - last < FALLBACK_ALERT_COOLDOWN_MS) return;
    _lastFallbackAlert[transitionKey] = now;

    const isCritical = payload.used === 'none';
    const providerLabel = payload.used === 'kling' ? 'Kling' : payload.used === 'gemini' ? 'Gemini' : 'Flux Schnell';
    const subject = isCritical
      ? '🚨 [KeiroAI] Génération image ÉCHOUÉE — tous les providers down'
      : `⚠️ [KeiroAI] Image en fallback ${providerLabel} (Seedream a échoué)`;
    const qualityNote = payload.used === 'flux_schnell'
      ? 'Qualité DÉGRADÉE (Flux Schnell = dernier recours, moins bon que Seedream).'
      : payload.used === 'gemini'
        ? 'Qualité correcte (Gemini) mais Seedream ET Kling sont indisponibles — on tient sur le filet de sécurité.'
        : payload.used === 'kling'
          ? 'Qualité correcte (Kling) mais Seedream — le provider premium — est indisponible.'
          : 'AUCUNE image générée : Seedream, Kling, Gemini ET Flux ont tous échoué. Des posts peuvent partir sans visuel.';

    // Diagnostic actionnable : distinguer une panne technique d'un problème
    // de solde (le cas réel du 27/07 : 3 comptes à sec en même temps).
    const all = `${payload.seedreamError || ''} ${payload.klingError || ''}`.toLowerCase();
    const billingHints: string[] = [];
    if (/overdue|arrears|insufficient|balance/.test(all) || /403/.test(payload.seedreamError || '')) {
      if (/overdue|403/.test((payload.seedreamError || '').toLowerCase())) billingHints.push('Seedream/BytePlus : compte en solde négatif → RECHARGER (console BytePlus).');
      if (/balance|1102|429/.test((payload.klingError || '').toLowerCase())) billingHints.push('Kling : solde insuffisant → RECHARGER (console KlingAI).');
    }
    billingHints.push('Replicate : sous 5$ de crédit, le compte est bridé à 6 requêtes/min (rafale 1) → recharger pour retrouver du débit.');

    const html = `
      <h2>${isCritical ? '🚨 Échec total génération image' : '⚠️ Fallback provider image'}</h2>
      <p><strong>Provider utilisé :</strong> ${payload.used}</p>
      <p><strong>${qualityNote}</strong></p>
      <p><strong>Erreur Seedream :</strong> ${payload.seedreamError || 'n/a'}</p>
      ${payload.klingError ? `<p><strong>Erreur Kling :</strong> ${payload.klingError}</p>` : ''}
      ${payload.geminiError ? `<p><strong>Erreur Gemini :</strong> ${payload.geminiError}</p>` : ''}
      <p><strong>Raison :</strong> ${payload.reason}</p>
      ${payload.callTag ? `<p><strong>Contexte :</strong> ${payload.callTag}</p>` : ''}
      <h3>À faire</h3>
      <ul>${billingHints.map(h => `<li>${h}</li>`).join('')}</ul>
      <hr>
      <p style="color:#888;font-size:12px">Alerte throttlée à 1 mail / 15 min par type de fallback. Chaîne : Seedream → Kling → Gemini → Flux Schnell.</p>
    `;
    const { sendEmailWithFallback } = await import('@/lib/email/send-with-fallback');
    await sendEmailWithFallback({
      to: 'contact@keiroai.com',
      subject,
      html,
    });
  } catch { /* never let alerting break generation */ }
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
  // Erreurs capturées pour l'alerte fallback (founder 2026-07-19).
  let seedreamError: string | undefined;
  let klingError: string | undefined;
  let geminiError: string | undefined;

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
  ? `${opts.prompt}. The ONLY text visible in the image is the exact phrase "${opts.exactTextInImage}" rendered cleanly in a single readable font, centered or composed naturally. NO other words, gibberish, or random letters anywhere. EDITORIAL DOCUMENTARY photograph shot on a Leica M11 or Hasselblad X2D with a 50mm or 80mm prime lens, Kodak Portra 400 film aesthetic, natural diffused window light or golden-hour sun (NO studio strobes, NO ring lights), shallow depth of field f/2.0 ~1/250s ~ISO 400, real candid moment caught mid-action, gentle 35mm grain, true-to-life muted color palette (warm naturals, no neon, no saturated cyan/magenta, no oversaturation), authentic human expression caught between two thoughts (not a posed smile), real skin texture with visible pores, fine lines, micro-imperfections and a tiny asymmetry, hands rendered correctly with 5 fingers each, ambient occlusion and natural shadows under chin and behind ears — looks like a frame from a National Geographic / Magnum / Cereal Magazine / Apartamento editorial story. Reference: Annie Leibovitz, Cass Bird, Sebastiao Salgado intimate documentary style. NOT a stock illustration, NOT midjourney, NOT a 3D render, ZERO AI portrait artifacts.`
  : opts.prompt + '. CRITICAL: ZERO text in this image. No words, no letters, no numbers, no captions, no signage with text, no labels, no logos with readable text, no watermarks. The image must be 100% text-free — text will be added later via overlay. EDITORIAL DOCUMENTARY photograph shot on a Leica M11 or Hasselblad X2D with a 50mm or 80mm prime lens, Kodak Portra 400 film aesthetic, natural diffused window light or golden-hour sun (NO studio strobes, NO ring lights), shallow depth of field f/2.0 ~1/250s ~ISO 400, real candid moment caught mid-action, gentle 35mm grain, true-to-life muted color palette (warm naturals, no neon, no saturated cyan/magenta, no oversaturation), authentic human expression caught between two thoughts (not a posed smile), real skin texture with visible pores, fine lines, micro-imperfections and a tiny asymmetry, hands rendered correctly with 5 fingers each, ambient occlusion and natural shadows under chin and behind ears — looks like a frame from a National Geographic / Magnum / Cereal Magazine / Apartamento editorial story. Reference: Annie Leibovitz, Cass Bird, Sebastiao Salgado intimate documentary style. NOT a stock illustration, NOT midjourney, NOT a 3D render, ZERO AI portrait artifacts.'),
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
          seedreamError = `HTTP ${res.status}: no url in response`;
        } else {
          const errTxt = await res.text().catch(() => '');
          seedreamError = `HTTP ${res.status}: ${errTxt.substring(0, 200)}`;
        }
        console.warn('[image-provider] Seedream failed → trying Kling fallback:', seedreamError);
      } catch (e: any) {
        seedreamError = e?.message?.substring(0, 200) || 'unknown seedream error';
        console.warn('[image-provider] Seedream error → Kling fallback:', seedreamError);
      }
    } else {
      seedreamError = 'ARK_API_KEY / SEEDREAM_API_KEY manquante';
    }
  }

  // ── Provider 2 : Gemini image — PASSÉ DEVANT KLING le 2026-08-20 ──
  //
  // Le fondateur : « c'est ByteDance tous les modèles, puis Gemini, pas Kling ».
  //
  // Les chiffres lui donnent raison. Tarifs officiels relevés le jour même
  // (ai.google.dev/gemini-api/docs/pricing), pas de mémoire :
  //   Seedream            0,045 €/image  (référence)
  //   gemini-2.5-flash    0,036 €/image  → moins cher que Seedream
  //   Kling               0,025 €/image  → le moins cher, mais le plus faible
  //
  // Kling était deuxième pour son prix. Or un secours ne sert que pendant une
  // panne, quelques heures par an : économiser 0,011 € l'image sur ces heures-là
  // ne compense pas une image que le client ne publiera pas. La règle du
  // fondateur — la qualité ne doit que monter — tranche l'ordre : le secours le
  // plus proche de Seedream passe devant le secours le moins cher.
  //
  // Vérifié en réel le 2026-08-20 pendant l'impayé ByteDance : HTTP 200,
  // image de 1,7 Mo. Le filet fonctionne au moment où il sert.
  {
    const geminiUrl = await generateWithGemini(opts, size);
    if (geminiUrl) {
      void notifyProviderFallback({ used: 'gemini', seedreamError, reason: 'gemini_fallback_seedream_failed', callTag: opts.callTag });
      return {
        url: geminiUrl,
        provider: 'gemini',
        cost_eur_estimate: 0.036,
        reason: 'gemini_fallback_seedream_failed',
      };
    }
    geminiError = 'Gemini image indisponible';
  }

  // Provider 3: Kling (Kuaishou) — recours économique, après Gemini.
  // Uses HMAC-SHA256 JWT auth via lib/kling.ts (generateKlingT2I).
  if (process.env.KLING_ACCESS_KEY && process.env.KLING_SECRET_KEY) {
    try {
      const { generateKlingT2I } = await import('@/lib/kling');
      const aspectRatio = size === '1024x1792' ? '9:16' : size === '1792x1024' ? '16:9' : '1:1';
      const result = await generateKlingT2I({ prompt: opts.prompt, aspectRatio });
      if (result?.imageUrl) {
        // Fallback Seedream → Kling : prévenir l'admin (throttlé).
        void notifyProviderFallback({ used: 'kling', seedreamError, reason: 'kling_fallback_seedream_failed', callTag: opts.callTag });
        return {
          url: result.imageUrl,
          provider: 'flux_dev' as any, // reuse slot for kling — TODO: extend provider type
          cost_eur_estimate: 0.025,
          reason: 'kling_fallback_seedream_failed',
        };
      }
      klingError = 'Kling returned no imageUrl';
    } catch (e: any) {
      klingError = e?.message?.substring(0, 200) || 'unknown kling error';
      console.warn('[image-provider] Kling failed → Flux Schnell fallback:', klingError);
    }
  }

  // Provider 4: Flux Schnell (Replicate) — last resort cheap fallback.
  // 2026-07-28 : sous 5$ de crédit, Replicate bride à 6 req/min avec une
  // rafale de 1 → on retente une fois après la fenêtre au lieu de rendre
  // null (c'est ce throttle qui faisait passer des générations à zéro image).
  if (process.env.REPLICATE_API_TOKEN) {
    for (let attempt = 0; attempt < 2; attempt++) {
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
          // Fallback jusqu'à Flux Schnell (dernier recours, qualité dégradée) : alerte.
          void notifyProviderFallback({ used: 'flux_schnell', seedreamError, klingError, geminiError, reason: 'flux_schnell_last_resort_fallback', callTag: opts.callTag });
          return {
            url,
            provider: 'flux_schnell',
            cost_eur_estimate: 0.003,
            reason: 'flux_schnell_last_resort_fallback',
          };
        }
        const throttled = res.status === 429 || /throttl/i.test(JSON.stringify(data?.detail || ''));
        console.warn('[image-provider] Flux Schnell returned no URL:', JSON.stringify(data).substring(0, 200));
        if (!throttled || attempt === 1) break;
        await new Promise(r => setTimeout(r, 12_000));
      } catch (e: any) {
        console.error('[image-provider] Flux Schnell failed:', e.message?.substring(0, 150));
        break;
      }
    }
  }

  // Échec TOTAL des providers → alerte critique (des posts peuvent partir sans visuel).
  void notifyProviderFallback({ used: 'none', seedreamError, klingError, geminiError, reason: 'all_providers_failed', callTag: opts.callTag });
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
