import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';

/**
 * GET /api/agents/google-reviews/historique
 *
 * Le travail de Théo sur les avis, réponse par réponse.
 *
 * Demande du fondateur (2026-08-06) : « on doit pouvoir voir l'historique au
 * besoin, pour voir le travail fait par Théo ou manuellement sur KeiroAI. »
 *
 * ── Pourquoi ça compte ──
 *
 * Un agent qui répond à la place du commerçant doit pouvoir être relu. Sans
 * historique, la seule façon de savoir ce que Théo a écrit sous son nom est
 * d'aller le lire sur Google, avis par avis. Et on ne peut pas distinguer ce
 * qu'il a fait seul de ce que le client a validé lui-même.
 *
 * L'origine (auto / manuelle) est donc affichée : c'est la première question
 * qu'on se pose en relisant une réponse qu'on ne se souvient pas d'avoir
 * écrite.
 */
export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const limite = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 50, 200);

  const { data, error: erreur } = await supabase
    .from('agent_logs')
    .select('action, status, data, created_at')
    .eq('user_id', user.id)
    .eq('agent', 'gmaps')
    // Seules les actions visibles par le client : les scans internes et les
    // rafraîchissements de pool n'apprennent rien à un commerçant.
    .in('action', ['review_reply_sent', 'review_escalated'])
    .order('created_at', { ascending: false })
    .limit(limite);

  if (erreur) {
    console.error('[Theo/historique]', erreur.message);
    return NextResponse.json({ ok: false, entrees: [] }, { status: 500 });
  }

  const entrees = (data || []).map((l: any) => ({
    date: l.created_at,
    type: l.action === 'review_escalated' ? 'escalade' : 'reponse',
    auteur: l.data?.author || null,
    note: typeof l.data?.rating === 'number' ? l.data.rating : null,
    texte: l.data?.reply || l.data?.review_text || null,
    // Une entrée sans marqueur vient d'avant l'enregistrement de l'origine
    // (2026-08-06). On ne devine pas : on laisse null et l'interface le dit.
    origine: typeof l.data?.auto === 'boolean' ? (l.data.auto ? 'auto' : 'manuelle') : null,
    motif: l.data?.rationale || null,
    echec: l.status !== 'ok',
  }));

  return NextResponse.json({ ok: true, entrees });
}
