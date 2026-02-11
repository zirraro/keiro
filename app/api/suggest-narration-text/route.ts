import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { generateNarrationSuggestions } from '@/lib/audio/condense-text';

/**
 * POST /api/suggest-narration-text
 * Generate AI-powered text suggestions for audio narration
 *
 * Body:
 * - context: string (caption, description, or current text)
 * - targetWords?: number (default 15 for ~5 seconds)
 *
 * Returns:
 * - suggestions: { informative, catchy, storytelling }
 */
export async function POST(req: NextRequest) {
  try {
    // Get authenticated user
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' },
        { status: 401 }
      );
    }

    const { context, targetWords = 15 } = await req.json();

    if (!context || typeof context !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'Contexte manquant ou invalide' },
        { status: 400 }
      );
    }

    console.log('[SuggestNarration] User:', user.id);
    console.log('[SuggestNarration] Context:', context.substring(0, 100) + '...');
    console.log('[SuggestNarration] Target words:', targetWords);

    // Generate 3 suggestions with different styles
    console.log('[SuggestNarration] Generating AI suggestions...');
    const suggestions = await generateNarrationSuggestions(context, targetWords);

    console.log('[SuggestNarration] ✅ Suggestions generated');
    console.log('[SuggestNarration] Informative:', suggestions.informative);
    console.log('[SuggestNarration] Catchy:', suggestions.catchy);
    console.log('[SuggestNarration] Storytelling:', suggestions.storytelling);

    return NextResponse.json({
      ok: true,
      suggestions: [
        {
          style: 'informative',
          label: 'Style Informatif (journalistique)',
          text: suggestions.informative,
        },
        {
          style: 'catchy',
          label: 'Style Accrocheur (viral TikTok)',
          text: suggestions.catchy,
        },
        {
          style: 'storytelling',
          label: 'Style Narratif (captivant)',
          text: suggestions.storytelling,
        },
      ],
    });
  } catch (error: any) {
    console.error('[SuggestNarration] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur lors de la génération de suggestions' },
      { status: 500 }
    );
  }
}

/**
 * Usage example:
 * ```
 * const response = await fetch('/api/suggest-narration-text', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({
 *     context: 'Les 3 tendances marketing incontournables de 2026',
 *     targetWords: 15
 *   })
 * });
 *
 * const { suggestions } = await response.json();
 * // suggestions = [
 * //   { style: 'informative', label: '...', text: '...' },
 * //   { style: 'catchy', label: '...', text: '...' },
 * //   { style: 'storytelling', label: '...', text: '...' }
 * // ]
 * ```
 */
