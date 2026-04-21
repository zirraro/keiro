/**
 * Single source of truth for the client's preferred communication
 * language. Every outbound agent (Hugo/Jade/Léna/Théo + TTS/video)
 * reads this before generating copy so we never publish English captions
 * for a French business or vice-versa.
 *
 * Stored in business_dossiers.communication_language (ISO 639-1 code).
 * Captured by Clara during onboarding; defaults to 'fr' for backwards
 * compatibility because every existing client as of 2026-04-21 is
 * French-speaking.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type ClientLang = 'fr' | 'en' | 'es' | 'de' | 'it' | 'pt';

const SUPPORTED: ClientLang[] = ['fr', 'en', 'es', 'de', 'it', 'pt'];

export function normalizeLang(raw: unknown): ClientLang {
  const v = String(raw || '').toLowerCase().slice(0, 2);
  return (SUPPORTED as string[]).includes(v) ? (v as ClientLang) : 'fr';
}

export async function getClientLanguage(
  supabase: SupabaseClient,
  userId: string | null | undefined,
): Promise<ClientLang> {
  if (!userId) return 'fr';
  const { data } = await supabase
    .from('business_dossiers')
    .select('communication_language')
    .eq('user_id', userId)
    .maybeSingle();
  return normalizeLang(data?.communication_language);
}

/**
 * Short instruction line that prepends any AI system prompt so the
 * model writes in the right language. We keep it explicit and absolute
 * because Claude/Gemini tend to drift back to English otherwise.
 */
export function languageInstruction(lang: ClientLang): string {
  const label: Record<ClientLang, string> = {
    fr: 'français',
    en: 'English',
    es: 'español',
    de: 'Deutsch',
    it: 'italiano',
    pt: 'português',
  };
  return `LANGUAGE — Write EVERY word of your output in ${label[lang]}. Never mix languages. If the source material is in a different language, translate it naturally into ${label[lang]} before responding.`;
}

/**
 * ElevenLabs language_code mapping. ElevenLabs infers language from the
 * voice + text, but passing an explicit code improves prosody.
 */
export function elevenlabsCode(lang: ClientLang): string {
  return lang; // ElevenLabs accepts fr/en/es/de/it/pt directly
}
