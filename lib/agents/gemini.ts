/**
 * Hybrid AI helper for all agents.
 *
 * STRATEGY:
 * - Gemini Flash: analytics, enrichment, scraping, monitoring (volume, Google Search)
 * - Claude Haiku: copywriting, emails, captions, DMs, strategy (quality français)
 *
 * COST OPTIMIZATION:
 * - System prompt caching: identical system prompts are cached in-memory
 *   to avoid sending 3000+ tokens of identical context on every call.
 *   Gemini cached input = 0.025€/1M tokens vs 0.25€/1M normal = 10x savings.
 *
 * Each agent picks the right model for the right task.
 */

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// ── System Prompt Cache ──
// Hash system prompts and reuse cached content IDs to reduce input token costs.
// Gemini's cached content costs 0.025€/1M tokens vs 0.25€/1M for normal input.
const systemPromptCache = new Map<string, { cachedContentId: string; expiresAt: number }>();

function hashPrompt(text: string): string {
  // Simple hash for cache key (FNV-1a inspired)
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

async function getCachedSystemPrompt(apiKey: string, systemPrompt: string): Promise<string | null> {
  const hash = hashPrompt(systemPrompt);
  const cached = systemPromptCache.get(hash);

  // Return cached ID if still valid (5 min TTL)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.cachedContentId;
  }

  // Only cache prompts longer than 1000 chars (short ones aren't worth caching)
  if (systemPrompt.length < 1000) return null;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/gemini-2.5-flash',
          contents: [{
            role: 'user',
            parts: [{ text: 'System context follows.' }],
          }, {
            role: 'model',
            parts: [{ text: 'Understood. I will follow the system instructions.' }],
          }],
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          ttl: '600s', // 10 min cache
        }),
      }
    );

    if (!response.ok) {
      // Cache creation failed — fall back to normal (no savings but no break)
      return null;
    }

    const data = await response.json();
    const cachedContentId = data.name;

    if (cachedContentId) {
      systemPromptCache.set(hash, {
        cachedContentId,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 min local TTL
      });
      return cachedContentId;
    }
  } catch {
    // Silent fail — normal call will work fine
  }

  return null;
}

interface GeminiOptions {
  system: string;
  message: string;
  maxTokens?: number;
}

/**
 * Call Gemini 2.5 Flash with a system prompt and user message.
 * Uses cached system prompts when possible (10x cheaper input).
 * Returns the text response or throws on error.
 */
export async function callGemini({ system, message, maxTokens = 2000 }: GeminiOptions): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY non configurée');
  }

  // Try to use cached system prompt (10x cheaper)
  const cachedId = await getCachedSystemPrompt(apiKey, system);

  const body: any = {
    contents: [
      {
        role: 'user',
        parts: [{ text: message }],
      },
    ],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.7,
    },
  };

  if (cachedId) {
    // Use cached content — system prompt billed at cached rate (10x cheaper)
    body.cachedContent = cachedId;
  } else {
    // Normal call — system prompt billed at full rate
    body.system_instruction = {
      parts: [{ text: system }],
    };
  }

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    // If cached content expired/invalid, retry without cache
    if (cachedId && (response.status === 400 || response.status === 404)) {
      systemPromptCache.delete(hashPrompt(system));
      return callGemini({ system, message, maxTokens });
    }
    throw new Error(`Gemini API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text;
}

/**
 * Call Gemini with conversation history (for agent chat).
 * Uses cached system prompts when possible.
 */
export async function callGeminiChat({
  system,
  history,
  message,
  maxTokens = 2000,
}: {
  system: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  message: string;
  maxTokens?: number;
}): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY non configurée');
  }

  // Map history to Gemini format (assistant → model)
  const contents = [
    ...history.map((h) => ({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.content }],
    })),
    {
      role: 'user',
      parts: [{ text: message }],
    },
  ];

  // Try cached system prompt
  const cachedId = await getCachedSystemPrompt(apiKey, system);

  const body: any = {
    contents,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.7,
    },
  };

  if (cachedId) {
    body.cachedContent = cachedId;
  } else {
    body.system_instruction = {
      parts: [{ text: system }],
    };
  }

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    if (cachedId && (response.status === 400 || response.status === 404)) {
      systemPromptCache.delete(hashPrompt(system));
      return callGeminiChat({ system, history, message, maxTokens });
    }
    throw new Error(`Gemini Chat API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text;
}

/**
 * Call Gemini with Google Search grounding enabled.
 */
export async function callGeminiWithSearch({ system, message, maxTokens = 2000 }: GeminiOptions): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY non configurée');
  }

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: system }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: message }],
        },
      ],
      tools: [{ google_search: {} }],
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature: 0.3,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini Search API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts
    ?.filter((p: any) => p.text)
    .map((p: any) => p.text)
    .join('\n') || '';
  return text;
}

// ──────────────────────────────────────
// Claude Haiku — for elite copywriting & strategic analysis
// ──────────────────────────────────────

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Call Claude Haiku for high-quality French copywriting and strategic analysis.
 * Falls back to Gemini if ANTHROPIC_API_KEY is not set.
 */
export async function callClaudeHaiku({
  system,
  message,
  maxTokens = 2000,
}: GeminiOptions): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return callGemini({ system, message, maxTokens });
  }

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: message }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[Claude] API error ${response.status}: ${errText}`);
    return callGemini({ system, message, maxTokens });
  }

  const data = await response.json();
  return data.content?.[0]?.text || '';
}

/**
 * Call Claude Haiku with conversation history.
 * Falls back to Gemini if ANTHROPIC_API_KEY is not set.
 */
export async function callClaudeHaikuChat({
  system,
  history,
  message,
  maxTokens = 2000,
}: {
  system: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  message: string;
  maxTokens?: number;
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return callGeminiChat({ system, history, message, maxTokens });
  }

  const messages = [
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user' as const, content: message },
  ];

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[Claude] Chat API error ${response.status}: ${errText}`);
    return callGeminiChat({ system, history, message, maxTokens });
  }

  const data = await response.json();
  return data.content?.[0]?.text || '';
}
