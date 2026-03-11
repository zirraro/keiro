/**
 * AI Client — Central abstraction for LLM calls
 *
 * Uses Google Gemini API (gemini-2.5-flash).
 * Free tier: 10 req/min, 250 req/day on Gemini 2.5 Flash.
 * Paid tier (Tier 1): 150 RPM, 1500 RPD — enable billing in AI Studio.
 * Get your key at: https://ai.google.dev
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

// Model mapping: map legacy model names to Gemini equivalents
const MODEL_MAP: Record<string, string> = {
  'claude-haiku-4-5-20251001': 'gemini-2.5-flash',
  'claude-3-haiku-20240307': 'gemini-2.5-flash',
  'claude-sonnet-4-20250514': 'gemini-2.5-flash',
  'gemini-2.0-flash': 'gemini-2.5-flash',
};

function getGeminiModel(requestedModel?: string): string {
  if (!requestedModel) return 'gemini-2.5-flash';
  return MODEL_MAP[requestedModel] || 'gemini-2.5-flash';
}

function getClient() {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_GEMINI_API_KEY non configurée');
  }
  return new GoogleGenerativeAI(apiKey);
}

// Safety settings — permissive for business content generation
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIRequestParams {
  model?: string;
  max_tokens?: number;
  system?: string;
  messages: AIMessage[];
  temperature?: number;
}

export interface AIResponse {
  text: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Main function: send a message to the AI and get a response.
 * Compatible interface with the old Anthropic calls.
 */
export async function generateAIResponse(params: AIRequestParams): Promise<AIResponse> {
  const { model, max_tokens, system, messages, temperature } = params;

  const client = getClient();
  const geminiModel = client.getGenerativeModel({
    model: getGeminiModel(model),
    safetySettings,
    generationConfig: {
      maxOutputTokens: max_tokens || 2000,
      temperature: temperature ?? 0.7,
    },
    ...(system ? { systemInstruction: system } : {}),
  });

  // Convert messages to Gemini format
  const history = messages.slice(0, -1).map((msg) => ({
    role: msg.role === 'assistant' ? 'model' as const : 'user' as const,
    parts: [{ text: msg.content }],
  }));

  const lastMessage = messages[messages.length - 1];

  const chat = geminiModel.startChat({ history });
  const result = await chat.sendMessage(lastMessage.content);
  const response = result.response;
  const text = response.text();

  return {
    text,
    usage: {
      input_tokens: response.usageMetadata?.promptTokenCount || 0,
      output_tokens: response.usageMetadata?.candidatesTokenCount || 0,
    },
  };
}

/**
 * Call AI with automatic retry on rate limit (429).
 */
export async function generateAIResponseWithRetry(
  params: AIRequestParams,
  maxRetries = 3
): Promise<AIResponse> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await generateAIResponse(params);
    } catch (err: any) {
      const is429 = err?.status === 429 || err?.message?.includes('429') || err?.message?.includes('RESOURCE_EXHAUSTED');
      if (is429 && attempt < maxRetries) {
        const delay = Math.pow(2, attempt + 1) * 1000;
        console.warn(`[AI] Rate limited, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Unreachable');
}

/**
 * Direct fetch-based call (for routes that used raw fetch to Anthropic API).
 * Returns the same structure as generateAIResponse.
 */
export async function generateAIResponseFetch(params: AIRequestParams): Promise<AIResponse> {
  return generateAIResponse(params);
}

/**
 * Check if the AI API key is configured.
 */
export function isAIConfigured(): boolean {
  return !!process.env.GOOGLE_GEMINI_API_KEY;
}

/**
 * Get the env var name for error messages.
 */
export const AI_API_KEY_NAME = 'GOOGLE_GEMINI_API_KEY';
