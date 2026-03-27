/**
 * Hybrid AI helper for all agents.
 *
 * STRATEGY:
 * - Gemini Flash: analytics, enrichment, scraping, monitoring (volume, Google Search)
 * - Claude Haiku: copywriting, emails, captions, DMs, strategy (quality français)
 *
 * Each agent picks the right model for the right task.
 */

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

interface GeminiOptions {
  system: string;
  message: string;
  maxTokens?: number;
}

/**
 * Call Gemini 2.5 Flash with a system prompt and user message.
 * Returns the text response or throws on error.
 */
export async function callGemini({ system, message, maxTokens = 1000 }: GeminiOptions): Promise<string> {
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
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature: 0.7,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text;
}

/**
 * Call Gemini with conversation history (for agent chat).
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

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: system }],
      },
      contents,
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature: 0.7,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini Chat API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text;
}

/**
 * Call Gemini with Google Search grounding enabled.
 * Uses Gemini's built-in web search to find real-time data (social profiles, websites, Google Maps, etc.).
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
  // Google Search grounding may return multiple parts
  const text = data.candidates?.[0]?.content?.parts
    ?.filter((p: any) => p.text)
    .map((p: any) => p.text)
    .join('\n') || '';
  return text;
}

// ──────────────────────────────────────
// Claude Haiku — for elite copywriting & strategic analysis
// Use for: emails, captions, DMs, CEO strategy, anything requiring
// nuanced French and persuasive writing
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

  // Fallback to Gemini if no Anthropic key
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
    // Fallback to Gemini on error
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
