import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { generateNarrationSuggestions } from '@/lib/audio/condense-text';
import { checkCredits, deductCredits, isAdmin } from '@/lib/credits/server';

export async function POST(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { ok: false, blocked: true, reason: 'requires_account', cta: true },
        { status: 403 }
      );
    }

    // --- Vérification crédits ---
    const isAdminUser = await isAdmin(user.id);
    if (!isAdminUser) {
      const check = await checkCredits(user.id, 'narration_suggest');
      if (!check.allowed) {
        return NextResponse.json(
          { ok: false, error: 'Crédits insuffisants', insufficientCredits: true, cost: check.cost, balance: check.balance },
          { status: 402 }
        );
      }
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

    // --- Déduction crédits après succès ---
    let newBalance: number | undefined;
    if (!isAdminUser) {
      const result = await deductCredits(user.id, 'narration_suggest', 'Suggestion narration IA');
      newBalance = result.newBalance;
    }

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
      newBalance,
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
