/**
 * 2026-06-03 — LLM model router by agent + task complexity.
 *
 * Founder decision after impartial analysis:
 *   - Sonnet 4 quality > Gemini Pro 1.5 on : sales psychology, complex
 *     reasoning, nuanced briefs, news integration, multi-source mix
 *   - Gemini Pro 1.5 quality == Sonnet on : simple FR captions, hashtags,
 *     basic Q&A, structured extraction (3-4x cheaper)
 *
 * Routing strategy = quality-where-it-matters, cost-where-it-doesnt:
 *   - Hugo (B2B cold email)       → Sonnet always (the nuance closes)
 *   - Jade (DM sales)             → Sonnet always (sales psychology)
 *   - Ami (marketing insights)    → Sonnet always (business reasoning)
 *   - Noah/CEO (strategy)         → Sonnet always (critical thinking)
 *   - Clara (chatbot Q&A simple)  → Gemini always (simple, parity)
 *   - Léo (data extraction)       → Gemini always (no need for nuance)
 *   - Lena (content) HYBRID :
 *       - simple caption + hashtags → Gemini (no quality drop)
 *       - complex visual brief (mix 2 universes, integrate news,
 *         client-provided photos to remix) → Sonnet (better directs
 *         Bytedance Seedream to top output)
 *
 * Use TaskComplexity to upgrade Lena to Sonnet when the brief is rich.
 */

import { callGemini } from './gemini';
import { callLlmWithFallback } from './llm-fallback';

export type AgentName =
  | 'lena'        // content agent
  | 'hugo'        // email cold
  | 'jade'        // DM commercial
  | 'ami'         // marketing
  | 'noah'        // CEO
  | 'clara'       // chatbot
  | 'leo'         // commercial enrichment
  | 'unknown';

export type TaskComplexity =
  | 'simple'      // basic generation : caption, hashtags, extraction
  | 'standard'    // default complexity, balanced
  | 'complex';    // brief multi-univers, news mix, client photos remix, sales closing

interface RouterDecision {
  provider: 'anthropic' | 'gemini';
  claudeModel?: string; // sonnet-4 or haiku-4
  reason: string;
}

/**
 * Pick the right model for an agent+task. Use directly when you know
 * the complexity, or use sensible default per agent.
 */
export function pickModel(agent: AgentName, complexity: TaskComplexity = 'standard'): RouterDecision {
  // Always-Sonnet agents — quality drives the business outcome
  if (agent === 'hugo' || agent === 'jade' || agent === 'ami' || agent === 'noah') {
    return {
      provider: 'anthropic',
      claudeModel: 'claude-sonnet-4-20250514',
      reason: `${agent}_always_sonnet (sales/strategy quality critical)`,
    };
  }

  // Always-Gemini agents — task is simple, cost matters
  if (agent === 'clara' || agent === 'leo') {
    return {
      provider: 'gemini',
      reason: `${agent}_always_gemini (simple task, cost-optimised)`,
    };
  }

  // Lena = hybrid
  if (agent === 'lena') {
    if (complexity === 'complex') {
      return {
        provider: 'anthropic',
        claudeModel: 'claude-sonnet-4-20250514',
        reason: 'lena_complex_brief (multi-source mix or news integration → Sonnet directs Bytedance better)',
      };
    }
    if (complexity === 'simple') {
      return {
        provider: 'gemini',
        reason: 'lena_simple (caption/hashtag — Gemini parity, 3x cheaper)',
      };
    }
    // Standard → Gemini default (caption with brand voice)
    return {
      provider: 'gemini',
      reason: 'lena_standard (default Gemini, upgrade to Sonnet on complex)',
    };
  }

  // Unknown → safe Gemini
  return { provider: 'gemini', reason: 'unknown_agent_safe_gemini' };
}

/**
 * Smart LLM call : picks the model based on agent + complexity, then
 * automatically falls back if the primary fails (Anthropic credit out
 * etc). Use this in agent code instead of calling Anthropic/Gemini
 * directly.
 */
export async function smartLlmCall(opts: {
  agent: AgentName;
  complexity?: TaskComplexity;
  system: string;
  message: string;
  maxTokens?: number;
  callTag?: string;
}): Promise<{ text: string; provider: 'anthropic' | 'gemini'; modelUsed: string; reason: string }> {
  const decision = pickModel(opts.agent, opts.complexity);

  if (decision.provider === 'gemini') {
    try {
      const text = await callGemini({ system: opts.system, message: opts.message, maxTokens: opts.maxTokens ?? 2000 });
      return { text, provider: 'gemini', modelUsed: 'gemini-pro-1.5', reason: decision.reason };
    } catch (e: any) {
      console.warn(`[llm-router] Gemini failed for ${opts.agent}, falling back to Sonnet:`, String(e?.message || e).slice(0, 150));
      const r = await callLlmWithFallback({
        system: opts.system,
        message: opts.message,
        maxTokens: opts.maxTokens,
        claudeModel: 'claude-sonnet-4-20250514',
        callTag: opts.callTag,
      });
      return { text: r.text, provider: r.provider, modelUsed: r.modelUsed, reason: decision.reason + ' (gemini_failed→sonnet_fallback)' };
    }
  }

  // Anthropic
  const r = await callLlmWithFallback({
    system: opts.system,
    message: opts.message,
    maxTokens: opts.maxTokens,
    claudeModel: decision.claudeModel,
    callTag: opts.callTag,
  });
  return { text: r.text, provider: r.provider, modelUsed: r.modelUsed, reason: decision.reason + (r.fallbackReason ? ` (${r.fallbackReason})` : '') };
}

/**
 * Helper for Lena : detect complexity from the brief itself.
 * Returns 'complex' when the request mentions multi-source mix, client
 * photos, news integration, or specific brand storytelling.
 */
export function detectLenaComplexity(brief: string): TaskComplexity {
  if (!brief) return 'standard';
  const lowered = brief.toLowerCase();
  // 2026-06-09 — Founder rule : "utilise Sonnet pour un meilleur lien
  // business client × actualité et attirer l'attention sur les réseaux".
  // Le planning hebdo de Léna doit être en Sonnet (creative critique).
  // Détecte les signaux du planning : cadence, history, mix...
  const planningSignals = [
    'cadence obligatoire',
    'historique news',
    'mix contenu',
    'savoir mutualisé',
    'visuels récents',
    'plan ma semaine',
    'génère un plan',
    'weekly plan',
  ];
  if (planningSignals.some(s => lowered.includes(s))) return 'complex';

  const complexSignals = [
    'mix', 'mixer', 'mélange', 'fusion', 'combine',
    'actualité', 'news', 'tendance du jour', 'breaking',
    'photo client', 'photo du client', 'photos fournies',
    'avant après', 'avant/après', 'before after',
    'storytelling', 'narration', 'série',
    'incrust', 'overlay', 'composite',
    'salle', 'boutique', 'atelier', 'extérieur', // venue mixed with product
  ];
  if (complexSignals.some(s => lowered.includes(s))) return 'complex';
  if (lowered.length < 80) return 'simple';
  return 'standard';
}
