import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-server';

/**
 * POST /api/auth/reassociate
 * Réassocie les données orphelines (user_id IS NULL + original_email match)
 * au nouveau compte utilisateur après re-inscription.
 *
 * Body: { userId: string, email: string }
 * Appelé depuis auth/callback après création du profil.
 *
 * SÉCURITÉ (audit CASA) : on ne réassocie QUE vers le compte authentifié appelant,
 * et seulement si l'email fourni == l'email du compte. Sinon un attaquant pourrait
 * s'approprier les données orphelines d'un tiers en passant son email.
 */
export async function POST(request: Request) {
  try {
    const { userId, email } = await request.json();

    if (!userId || !email) {
      return NextResponse.json({ error: 'userId and email required' }, { status: 400 });
    }

    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }
    if (user.id !== userId || (user.email || '').toLowerCase() !== String(email).toLowerCase()) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const admin = supabaseAdmin();

    // Appeler la fonction Postgres pour réassocier
    const { data, error } = await admin.rpc('reassociate_user_data', {
      new_user_id: userId,
      user_email: email,
    });

    if (error) {
      console.error('[Reassociate] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('[Reassociate] Data reassociated for', email, ':', data);

    return NextResponse.json({ ok: true, reassociated: data });
  } catch (err: any) {
    console.error('[Reassociate] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
