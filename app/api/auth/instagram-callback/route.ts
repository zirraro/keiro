import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getUserPages, getPageInstagramAccount } from '@/lib/meta';

/**
 * Helper: Extract access token from Supabase cookies
 */
async function getAccessTokenFromCookies(): Promise<string | null> {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();

  for (const cookie of allCookies) {
    if (cookie.name.startsWith('sb-') && cookie.name.endsWith('-auth-token')) {
      try {
        let cookieValue = cookie.value;

        if (cookieValue.startsWith('base64-')) {
          const base64Content = cookieValue.substring(7);
          cookieValue = Buffer.from(base64Content, 'base64').toString('utf-8');
        }

        const parsed = JSON.parse(cookieValue);
        return parsed.access_token || (Array.isArray(parsed) ? parsed[0] : null);
      } catch (err) {
        console.error('[InstagramCallback] Error processing cookie:', err);
      }
    }
  }

  return cookieStore.get('sb-access-token')?.value ||
         cookieStore.get('supabase-auth-token')?.value ||
         null;
}

/**
 * POST /api/auth/instagram-callback
 * Échange le code OAuth contre un token d'accès et sauvegarde les infos Instagram
 */
export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Récupérer l'utilisateur connecté
    let accessToken = await getAccessTokenFromCookies();

    if (!accessToken) {
      const authHeader = req.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        accessToken = authHeader.substring(7);
      }
    }

    if (!accessToken) {
      return NextResponse.json(
        { ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' },
        { status: 401 }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' },
        { status: 401 }
      );
    }

    // Récupérer le code d'autorisation
    const { code } = await req.json();

    if (!code) {
      return NextResponse.json(
        { ok: false, error: 'Code d\'autorisation manquant' },
        { status: 400 }
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

    console.log('[InstagramCallback] Exchanging code for access token...');

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
        // Vérifier que la page a un access_token avant de continuer
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

    // Étape 4: Sauvegarder les informations dans Supabase
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        meta_app_user_id: user.id, // Utiliser l'ID utilisateur Supabase
        instagram_business_account_id: instagramAccount.id,
        instagram_username: instagramAccount.username,
        instagram_access_token: selectedPage.access_token, // Token de la Page (long-lived)
        facebook_page_id: selectedPage.id,
        facebook_page_access_token: selectedPage.access_token,
        instagram_connected_at: new Date().toISOString(),
        instagram_last_sync_at: new Date().toISOString(),
        instagram_token_expiry: null // Les tokens de Page ne expirent généralement pas
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('[InstagramCallback] Error saving to database:', updateError);
      return NextResponse.json(
        { ok: false, error: 'Erreur lors de la sauvegarde des informations' },
        { status: 500 }
      );
    }

    console.log('[InstagramCallback] ✅ Instagram account connected successfully');

    return NextResponse.json({
      ok: true,
      instagram: {
        id: instagramAccount.id,
        username: instagramAccount.username
      }
    });

  } catch (error: any) {
    console.error('[InstagramCallback] ❌ Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
