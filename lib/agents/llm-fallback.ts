/**
 * LLM call with automatic Claude → Gemini fallback.
 *
 * Founder ask 2026-06-02: when Claude is unavailable (overload, rate limit,
 * insufficient credits), fall back to Gemini Pro 1.5 — not OpenAI. Gemini
 * is 2-3x cheaper than Claude AND the quality on French marketing copy is
 * very close. OpenAI is similar quality but similar price → no real gain.
 *
 * Triggers fallback on:
 *   - 401 / 403 (auth, insufficient credits)
 *   - 429 (rate limit)
 *   - 5xx (Anthropic outage / overload_error)
 *   - "overloaded_error" / "insufficient_credit" in body
 *   - fetch network error
 *
 * Returns: { text, provider, modelUsed, fallbackReason? }
 */

import { callGemini } from './gemini';

export interface LlmCallOptions {
  system: string;
  message: string;
  maxTokens?: number;
  // Override the Claude model — defaults to Sonnet 4
  claudeModel?: string;
  // Force a single provider (no fallback)
  providerOnly?: 'anthropic' | 'gemini';
  /**
   * Quel étage prend le relais quand Claude n'est pas joignable.
   *
   * Fondateur, 2026-08-14 : « Gemini est rodé, donc à prix égal autant garder
   * Gemini — sauf si DeepSeek a montré être meilleur, alors go. »
   *
   * C'est la bonne règle : nos prompts ont été corrigés pendant des mois contre
   * les travers propres à Gemini. Changer de modèle invalide ce réglage, et un
   * modèle « meilleur dans l'absolu » peut rendre moins bien sur un prompt
   * taillé pour un autre. On ne bascule donc que là où la mesure le justifie,
   * une tâche à la fois.
   *
   * Mesuré à ce jour — 6 prospects, contrôles automatiques, tâche « premier
   * mail de prospection » : les deux sont 6/6 conformes pour un coût identique
   * (420 vs 436 tokens), mais Gemini reste au conditionnel et sort du sujet
   * (il conseille d'offrir un café à un garagiste dont on doit soigner la
   * présence en ligne), là où DeepSeek part des chiffres de la fiche et donne
   * un geste précis. D'où : Hugo bascule, les autres attendent leur banc.
   */
  repliQualite?: 'deepseek' | 'gemini';
  // Tag for logging
  callTag?: string;
  // 2026-06-09 — Enable Anthropic prompt caching on the system prompt
  // (cache_control: { type: 'ephemeral' }). For repeated calls with
  // the same system prompt within 5min, the cached read is 10× cheaper.
  // Default: true if system >= 1024 tokens (~ 4096 chars) — Claude only
  // caches above this threshold. Set false to disable explicitly.
  cacheSystem?: boolean;
}

export interface LlmCallResult {
  text: string;
  provider: 'anthropic' | 'gemini' | 'ark';
  modelUsed: string;
  fallbackReason?: string;
  durationMs: number;
}

function isFallbackable(status: number, body: string): { yes: boolean; reason: string } {
  if (status === 401 || status === 403) return { yes: true, reason: `auth_or_credit_${status}` };
  if (status === 429) return { yes: true, reason: 'rate_limit_429' };
  if (status >= 500) return { yes: true, reason: `upstream_${status}` };
  const lowered = String(body || '').toLowerCase();
  if (lowered.includes('overloaded_error')) return { yes: true, reason: 'overloaded_error' };
  if (lowered.includes('insufficient_credit') || lowered.includes('insufficient credit')) return { yes: true, reason: 'insufficient_credit' };
  if (lowered.includes('balance')) return { yes: true, reason: 'low_balance' };
  return { yes: false, reason: '' };
}

export async function callLlmWithFallback(opts: LlmCallOptions): Promise<LlmCallResult> {
  const start = Date.now();
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const claudeModel = opts.claudeModel || 'claude-sonnet-4-6';

  // Caller can force a single provider — useful for non-fallbackable calls
  // (e.g. JSON-structured outputs where Gemini might format differently).
  if (opts.providerOnly === 'gemini') {
    const text = await callGemini({ system: opts.system, message: opts.message, maxTokens: opts.maxTokens ?? 2000 });
    return { text, provider: 'gemini', modelUsed: 'gemini-pro-1.5', durationMs: Date.now() - start };
  }

  // ── Sans clé Anthropic, on ne saute PAS directement à Gemini ──
  //
  // Cette ligne disait `|| !ANTHROPIC_KEY` et envoyait tout sur Gemini Flash
  // dès que la clé manquait. C'est ce raccourci qui a fait tourner Hugo, Jade,
  // Ami et Noah sur le modèle des tâches simples pendant deux semaines.
  //
  // On passe désormais par l'étage DeepSeek, qui tient le niveau et se facture
  // sur le compte ByteDance déjà approvisionné.
  if (!ANTHROPIC_KEY) {
    try {
      const { callDeepSeek, deepseekDisponible, MODELE_DEEPSEEK } = await import('./deepseek');
      if (opts.repliQualite === 'deepseek' && deepseekDisponible()) {
        const text = await callDeepSeek({ system: opts.system, message: opts.message, maxTokens: opts.maxTokens ?? 2000 });
        return { text, provider: 'ark', modelUsed: MODELE_DEEPSEEK, fallbackReason: 'pas_de_cle_anthropic', durationMs: Date.now() - start };
      }
    } catch (e: any) {
      console.warn(`[llm-fallback] DeepSeek indisponible sans clé Claude : ${e?.message?.slice(0, 160)}`);
    }
    const text = await callGemini({ system: opts.system, message: opts.message, maxTokens: opts.maxTokens ?? 2000 });
    return { text, provider: 'gemini', modelUsed: 'gemini-pro-1.5', fallbackReason: 'pas_de_cle_anthropic', durationMs: Date.now() - start };
  }

  // 2026-06-09 — Prompt caching : Anthropic charges 10× LESS on cached
  // reads of long system prompts. Threshold is ~1024 tokens (4096 chars
  // ~). We auto-enable above that to cut the Claude bill ~50% on
  // high-volume agents (Hugo/Jade/Lena send the same multi-KB system
  // prompt thousands of times per month).
  const shouldCache = (opts.cacheSystem !== false) && opts.system.length >= 4096;
  // Use the 'extended' beta header so cache hits cost is reflected
  // properly. Anthropic returns usage.cache_creation_input_tokens and
  // usage.cache_read_input_tokens to confirm caching took place.
  const headers: Record<string, string> = {
    'x-api-key': ANTHROPIC_KEY,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  };
  if (shouldCache) {
    headers['anthropic-beta'] = 'prompt-caching-2024-07-31';
  }

  // Try Claude first
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: claudeModel,
        max_tokens: opts.maxTokens ?? 2000,
        system: shouldCache
          ? [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }]
          : opts.system,
        messages: [{ role: 'user', content: opts.message }],
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const text = (data.content?.[0]?.text || '').trim();
      // 2026-06-09 — instrument cost (fire-and-forget)
      try {
        const { logApiCost, anthropicCostEur } = await import('@/lib/admin/api-cost-logger');
        const modelKind = claudeModel.includes('haiku') ? 'haiku' : claudeModel.includes('opus') ? 'opus' : 'sonnet';
        const costEur = anthropicCostEur(data.usage || {}, modelKind as any);
        logApiCost({
          provider: 'anthropic',
          // L'étiquette de l'appelant fait foi quand elle existe : sans elle,
          // tout se rangeait sous « haiku_fresh » et on ne pouvait plus dire
          // ce qui relevait de la PRODUCTION et ce qui relevait du CONTRÔLE.
          // Le modèle reste dans les métadonnées, on ne perd rien.
          kind: opts.callTag || `${modelKind}_${(data.usage?.cache_read_input_tokens || 0) > 0 ? 'cached' : 'fresh'}`,
          units: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
          cost_eur: costEur,
          metadata: { model: claudeModel, usage: data.usage },
        }).catch(() => {});
      } catch { /* silent */ }
      return { text, provider: 'anthropic', modelUsed: claudeModel, durationMs: Date.now() - start };
    }

    // Non-200 — decide whether to fall back to Gemini
    const body = await res.text().catch(() => '');
    const { yes, reason } = isFallbackable(res.status, body);
    if (!yes) {
      console.error(`[llm-fallback] Claude returned ${res.status} (not fallbackable):`, body.slice(0, 200));
      // Last-ditch: still try Gemini so we don't bubble a thrown error to the
      // caller — Gemini's free tier covers occasional 4xx blow-ups.
    }
    console.warn(`[llm-fallback] Claude failed (${reason || res.status}) — switching to Gemini${opts.callTag ? ` for ${opts.callTag}` : ''}`);
  } catch (e: any) {
    console.warn(`[llm-fallback] Claude network error — switching to Gemini: ${e?.message?.slice(0, 200)}`);
  }

  // ── Étage intermédiaire : DeepSeek, avant de tomber sur Gemini ──
  //
  // Fondateur, 2026-08-14 : « Anthropic n'a pas de crédit, et en plus c'est
  // très cher, et il faut mettre les sous en avance — c'est compliqué. »
  //
  // Ce n'est donc pas une panne à réparer mais un choix à respecter. Sauf que
  // le repli existant envoyait Hugo, Jade, Ami et Noah — les quatre agents
  // routés « toujours Sonnet » parce que la nuance ferme la vente — sur Gemini
  // Flash, le modèle qu'on avait choisi pour les tâches SIMPLES. Deux semaines
  // de prospection et de contenu sont sorties comme ça, sans que rien le dise.
  //
  // DeepSeek v3.2 tient le niveau sur nos briefs (mesuré le 14 août) et passe
  // par le compte ByteDance qui paie déjà Seedream et Seedance : pas de
  // nouveau fournisseur, pas de nouvelle avance de trésorerie.
  //
  // L'ordre reste Claude → DeepSeek → Gemini. Le jour où le crédit Anthropic
  // revient, les agents le retrouvent sans qu'on touche à quoi que ce soit.
  try {
    const { callDeepSeek, deepseekDisponible, MODELE_DEEPSEEK } = await import('./deepseek');
    if (opts.repliQualite === 'deepseek' && deepseekDisponible()) {
      const text = await callDeepSeek({ system: opts.system, message: opts.message, maxTokens: opts.maxTokens ?? 2000 });
      return {
        text,
        provider: 'ark',
        modelUsed: MODELE_DEEPSEEK,
        fallbackReason: 'claude_unavailable',
        durationMs: Date.now() - start,
      };
    }
  } catch (e: any) {
    console.warn(`[llm-fallback] DeepSeek indisponible — on descend sur Gemini : ${e?.message?.slice(0, 160)}`);
  }

  // Gemini fallback — dernier recours
  try {
    const text = await callGemini({ system: opts.system, message: opts.message, maxTokens: opts.maxTokens ?? 2000 });
    return {
      text,
      provider: 'gemini',
      modelUsed: 'gemini-pro-1.5',
      fallbackReason: 'claude_unavailable',
      durationMs: Date.now() - start,
    };
  } catch (e: any) {
    throw new Error(`Both Claude and Gemini failed: ${e?.message?.slice(0, 200)}`);
  }
}
