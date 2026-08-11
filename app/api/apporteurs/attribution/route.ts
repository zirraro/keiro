import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { attribuerClient } from '@/lib/apporteurs';

export const runtime = 'nodejs';

/**
 * Rattache un compte fraîchement créé à l'apporteur dont il a suivi le lien.
 *
 * ── Pourquoi cette route accepte l'identifiant en clair ──
 *
 * Elle est appelée juste après `signUp`, à un instant où la session n'est pas
 * toujours établie — un compte en attente de confirmation d'e-mail n'en a pas
 * encore. Exiger une session ferait perdre l'attribution précisément sur le
 * chemin le plus courant.
 *
 * Le risque est borné par la logique elle-même : rattacher un compte ne donne
 * accès à rien, un client ne peut être rattaché qu'UNE fois (contrainte
 * d'unicité en base), et la commission n'est versée que sur des abonnements
 * réellement payés. Le pire cas est un apporteur crédité d'un client qui ne
 * paiera jamais — donc aucun euro.
 *
 * On refuse en revanche un compte inexistant : sans ce contrôle, on pourrait
 * gonfler un compteur de paliers avec des identifiants inventés.
 */
export async function POST(req: NextRequest) {
  const { code, userId } = await req.json().catch(() => ({} as any));
  if (!code || !userId) {
    return NextResponse.json({ ok: false, error: 'code et userId requis' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const { data: profil } = await supabase
      .from('profiles').select('id').eq('id', userId).maybeSingle();
    if (!profil) return NextResponse.json({ ok: false, error: 'compte inconnu' }, { status: 404 });

    const r = await attribuerClient(supabase, code, userId);
    return NextResponse.json({ ok: r.attribue, ...r });
  } catch (e: any) {
    // Les tables ne sont pas encore installées : on ne fait pas échouer une
    // inscription pour autant.
    return NextResponse.json({ ok: false, error: e?.message || 'erreur' });
  }
}
