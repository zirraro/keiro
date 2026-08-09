import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Les résultats de chaque agent, regroupés chez Ami.
 *
 * Demande du fondateur (2026-08-09) : « on veut le moins de stats possible dans
 * les agents pour que ce soit plus simple et plus clair. C'est Ami qui regroupe
 * les stats et qui explique. Ça doit être fluide et compréhensible par réseau
 * social, et par tâches/agents. »
 *
 * ── Pourquoi passer par collecterResultats ──
 *
 * Ce module mesure déjà chaque canal depuis les tables métier — publications
 * réellement parties, DM réellement répondus, prospects réellement ajoutés —
 * et non depuis des compteurs d'exécution. La différence est décisive : « 60
 * actions de l'agent contenu » ne dit rien à un commerçant, « 12 publications
 * dont 4 reels » lui dit tout.
 *
 * Il porte aussi la taille d'échantillon, ce qui permet de refuser de conclure
 * sur trois observations plutôt que d'afficher une variation de +300 % qui ne
 * veut rien dire.
 */

export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

  const jours = Math.min(Math.max(Number(req.nextUrl.searchParams.get('jours')) || 7, 1), 90);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const { collecterResultats } = await import('@/lib/agents/ami-results');
    const r = await collecterResultats(supabase, user.id, jours);

    // On ne renvoie que ce qui s'affiche : le détail brut alourdirait la
    // réponse sans servir l'écran.
    return NextResponse.json({
      ok: true,
      fenetreJours: r.fenetreJours,
      canaux: r.canaux.map(c => ({
        canal: c.canal,
        agent: c.agent,
        actif: c.actif,
        metriques: c.metriques,
      })),
      canauxInactifs: r.canauxInactifs,
    });
  } catch (e: any) {
    console.error('[Ami/resultats]', e?.message);
    // Un tableau de bord qui tombe est pire qu'un tableau de bord vide : on
    // rend une réponse exploitable et l'interface dit qu'elle n'a rien reçu.
    return NextResponse.json({ ok: false, canaux: [], canauxInactifs: [] }, { status: 200 });
  }
}
