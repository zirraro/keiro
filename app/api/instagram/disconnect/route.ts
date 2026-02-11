import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST() {
  try {
    const { user, error: authError } = await getAuthUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Déconnecter Instagram : supprimer tous les tokens et infos
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        instagram_username: null,
        instagram_business_account_id: null,
        instagram_access_token: null,
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('[InstagramDisconnect] Error:', updateError);
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    console.log('[InstagramDisconnect] Instagram disconnected for user:', user.id);

    return NextResponse.json({ ok: true, message: 'Instagram déconnecté avec succès' });

  } catch (error: any) {
    console.error('[InstagramDisconnect] Error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
