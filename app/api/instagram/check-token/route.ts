import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/instagram/check-token
 * Vérifie si le token Instagram/Facebook du user est valide.
 * Retourne: { valid: true/false, reason?, expires_soon? }
 */
export async function GET() {
  const { user } = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get user's Instagram tokens
  const { data: profile } = await supabase
    .from('profiles')
    .select('instagram_business_account_id, facebook_page_access_token, instagram_username')
    .eq('id', user.id)
    .single();

  if (!profile?.instagram_business_account_id || !profile?.facebook_page_access_token) {
    return NextResponse.json({
      valid: false,
      reason: 'not_connected',
      message: 'Instagram non connecte. Connectez votre compte Instagram pour publier automatiquement.',
    });
  }

  // Check token validity with Facebook Graph API
  try {
    const tokenCheckUrl = `https://graph.facebook.com/v21.0/debug_token?input_token=${profile.facebook_page_access_token}&access_token=${profile.facebook_page_access_token}`;
    const tokenRes = await fetch(tokenCheckUrl);
    const tokenData = await tokenRes.json();

    if (tokenData.data?.error) {
      return NextResponse.json({
        valid: false,
        reason: 'token_invalid',
        message: 'Votre token Instagram a expire. Reconnectez votre compte Instagram.',
        error: tokenData.data.error.message,
      });
    }

    // Check if token expires soon (within 7 days)
    const expiresAt = tokenData.data?.expires_at;
    const expiresSoon = expiresAt && (expiresAt * 1000 - Date.now()) < 7 * 24 * 3600 * 1000;
    const isNeverExpire = expiresAt === 0; // Long-lived tokens

    // Also verify IG account access
    const igCheckUrl = `https://graph.facebook.com/v21.0/${profile.instagram_business_account_id}?fields=id,username&access_token=${profile.facebook_page_access_token}`;
    const igRes = await fetch(igCheckUrl);

    if (!igRes.ok) {
      const igErr = await igRes.json();
      return NextResponse.json({
        valid: false,
        reason: 'ig_access_failed',
        message: 'Impossible d\'acceder a votre compte Instagram. Reconnectez-le.',
        error: igErr.error?.message,
      });
    }

    const igData = await igRes.json();

    return NextResponse.json({
      valid: true,
      username: igData.username || profile.instagram_username,
      expires_soon: expiresSoon && !isNeverExpire,
      expires_at: expiresAt ? new Date(expiresAt * 1000).toISOString() : null,
      message: expiresSoon && !isNeverExpire
        ? 'Votre token Instagram expire bientot. Reconnectez votre compte pour eviter une interruption.'
        : 'Instagram connecte et fonctionnel.',
    });
  } catch (err: any) {
    return NextResponse.json({
      valid: false,
      reason: 'check_failed',
      message: 'Erreur lors de la verification du token Instagram.',
      error: err.message,
    });
  }
}
