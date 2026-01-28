import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

/**
 * POST /api/tiktok/disconnect
 * Disconnect user's TikTok account
 */
export async function POST() {
  try {
    // Get authenticated user
    const { user, error: authError } = await getAuthUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Non authentifié' }, { status: 401 });
    }

    // Get Supabase credentials
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ ok: false, error: 'Configuration base de données manquante' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Clear TikTok tokens
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        tiktok_user_id: null,
        tiktok_username: null,
        tiktok_access_token: null,
        tiktok_refresh_token: null,
        tiktok_token_expiry: null,
        tiktok_connected_at: null,
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('[TikTokDisconnect] Error:', updateError);
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    console.log('[TikTokDisconnect] TikTok disconnected for user:', user.id);

    return NextResponse.json({ ok: true });

  } catch (error: any) {
    console.error('[TikTokDisconnect] Error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
