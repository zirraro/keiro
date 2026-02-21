import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserPages, getPageInstagramAccount } from '@/lib/meta';

/**
 * POST /api/auth/instagram-callback
 * Échange le code OAuth contre un token d'accès et sauvegarde les infos Instagram
 * Utilise le userId passé depuis le state parameter (fiable après redirect externe)
 */
export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Récupérer le code et userId depuis le body
    const { code, userId } = await req.json();

    if (!code) {
      return NextResponse.json(
        { ok: false, error: 'Code d\'autorisation manquant' },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: 'Session expirée. Veuillez vous reconnecter et réessayer.' },
        { status: 401 }
      );
    }

    // Vérifier que l'utilisateur existe dans la base
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { ok: false, error: 'Utilisateur introuvable. Veuillez vous reconnecter.' },
        { status: 401 }
      );
    }

    const metaAppId = process.env.META_APP_ID!;
    const metaAppSecret = process.env.META_APP_SECRET!;
    const redirectUri = process.env.NEXT_PUBLIC_META_REDIRECT_URI!;

    if (!metaAppId || !metaAppSecret || !redirectUri) {
      console.error('[InstagramCallback] Missing Meta configuration');
      return NextResponse.json(
        { ok: false, error: 'Configuration Meta manquante' },
        { status: 500 }
      );
    }

    console.log('[InstagramCallback] Exchanging code for access token for user:', userId);

    // Étape 1: Échanger le code contre un access token
    const tokenUrl = `https://graph.facebook.com/v20.0/oauth/access_token?client_id=${metaAppId}&redirect_uri=${redirectUri}&client_secret=${metaAppSecret}&code=${code}`;

    const tokenResponse = await fetch(tokenUrl);
    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('[InstagramCallback] Token exchange error:', tokenData.error);
      return NextResponse.json(
        { ok: false, error: tokenData.error.message || 'Erreur lors de l\'échange du token' },
        { status: 400 }
      );
    }

    const userAccessToken = tokenData.access_token;

    console.log('[InstagramCallback] Access token obtained, fetching user pages...');

    // Étape 2: Récupérer les Pages Facebook de l'utilisateur
    const pages = await getUserPages(userAccessToken);

    if (!pages || pages.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Aucune Page Facebook trouvée. Veuillez créer une Page et la connecter à un compte Instagram Business.' },
        { status: 400 }
      );
    }

    console.log(`[InstagramCallback] Found ${pages.length} Facebook page(s)`);

    // Étape 3: Pour chaque page, vérifier si elle a un compte Instagram Business
    let instagramAccount = null;
    let selectedPage = null;

    for (const page of pages) {
      try {
        if (!page.access_token) {
          console.log(`[InstagramCallback] Page ${page.id} has no access_token`);
          continue;
        }

        const igAccount = await getPageInstagramAccount(page.id, page.access_token);
        if (igAccount) {
          instagramAccount = igAccount;
          selectedPage = page;
          break;
        }
      } catch (error) {
        console.log(`[InstagramCallback] Page ${page.id} has no Instagram account`);
      }
    }

    if (!instagramAccount || !selectedPage || !selectedPage.access_token) {
      return NextResponse.json(
        { ok: false, error: 'Aucun compte Instagram Business trouvé. Veuillez connecter un compte Instagram Business à votre Page Facebook.' },
        { status: 400 }
      );
    }

    console.log('[InstagramCallback] Instagram Business Account found:', instagramAccount.id);

    // Étape 4: Sauvegarder les informations dans Supabase (avec service role key)
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        meta_app_user_id: userId,
        instagram_business_account_id: instagramAccount.id,
        instagram_username: instagramAccount.username,
        instagram_access_token: selectedPage.access_token,
        facebook_page_id: selectedPage.id,
        facebook_page_access_token: selectedPage.access_token,
        instagram_connected_at: new Date().toISOString(),
        instagram_last_sync_at: new Date().toISOString(),
        instagram_token_expiry: null
      })
      .eq('id', userId);

    if (updateError) {
      console.error('[InstagramCallback] Error saving to database:', updateError);
      return NextResponse.json(
        { ok: false, error: 'Erreur lors de la sauvegarde des informations' },
        { status: 500 }
      );
    }

    console.log('[InstagramCallback] Instagram account connected successfully for user:', userId);

    return NextResponse.json({
      ok: true,
      instagram: {
        id: instagramAccount.id,
        username: instagramAccount.username
      }
    });

  } catch (error: any) {
    console.error('[InstagramCallback] Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
