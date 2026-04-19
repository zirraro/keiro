import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserPages, getPageInstagramAccount } from '@/lib/meta';

export const runtime = 'edge';

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

    // Étape 3.2: Fetch profile details (picture, followers, media count) to
    // populate the persistent Instagram Asset Badge shown in every panel.
    // This is required for Meta App Review screencasts — the reviewer
    // must see the connected asset at all times.
    let profilePictureUrl: string | null = null;
    let followersCount: number | null = null;
    let mediaCount: number | null = null;
    try {
      const profileRes = await fetch(
        `https://graph.facebook.com/v21.0/${instagramAccount.id}?fields=profile_picture_url,followers_count,media_count&access_token=${encodeURIComponent(selectedPage.access_token)}`
      );
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        profilePictureUrl = profileData.profile_picture_url || null;
        followersCount = typeof profileData.followers_count === 'number' ? profileData.followers_count : null;
        mediaCount = typeof profileData.media_count === 'number' ? profileData.media_count : null;
        console.log(`[InstagramCallback] IG profile enriched: ${followersCount} followers, ${mediaCount} media`);
      }
    } catch (e: any) {
      console.warn('[InstagramCallback] Profile enrichment failed (non-fatal):', e.message);
    }

    // Étape 3.5: Get IGAA token for DM API access (graph.instagram.com)
    let igaaToken: string | null = null;
    // Try Instagram App Secret first (for IGAA tokens), then Meta App Secret
    const igSecret = process.env.INSTAGRAM_APP_SECRET;
    const metaSecret = process.env.META_APP_SECRET;
    const secretsToTry = [igSecret, metaSecret].filter(Boolean) as string[];

    for (const secret of secretsToTry) {
      try {
        const igaaRes = await fetch(
          `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${secret}&access_token=${selectedPage.access_token}`
        );
        if (igaaRes.ok) {
          const igaaData = await igaaRes.json();
          igaaToken = igaaData.access_token || null;
          if (igaaToken) {
            console.log('[InstagramCallback] IGAA token obtained via', secret === igSecret ? 'IG secret' : 'Meta secret');
            break;
          }
        } else {
          const errText = await igaaRes.text().catch(() => '');
          console.warn(`[InstagramCallback] IGAA exchange failed with ${secret === igSecret ? 'IG' : 'Meta'} secret:`, errText.substring(0, 150));
        }
      } catch (e: any) {
        console.warn('[InstagramCallback] IGAA exchange error:', e.message);
      }
    }
    if (!igaaToken) {
      console.warn('[InstagramCallback] Could not obtain IGAA token — DMs may not work until token is manually set');
    }

    // Étape 4: Sauvegarder les informations dans Supabase (avec service role key)
    // IMPORTANT: Don't overwrite existing IGAA token with FB page token
    const updateData: Record<string, any> = {
      meta_app_user_id: userId,
      instagram_business_account_id: instagramAccount.id,
      instagram_username: instagramAccount.username,
      instagram_profile_picture_url: profilePictureUrl,
      instagram_followers_count: followersCount,
      instagram_media_count: mediaCount,
      facebook_page_id: selectedPage.id,
      facebook_page_name: selectedPage.name || null,
      facebook_page_access_token: selectedPage.access_token,
      instagram_connected_at: new Date().toISOString(),
      instagram_last_sync_at: new Date().toISOString(),
      instagram_token_expiry: null,
    };
    // Only update instagram_access_token if we got a real IGAA token
    // Don't overwrite an existing IGAA token with a FB page token
    if (igaaToken) {
      updateData.instagram_access_token = igaaToken;
    } else {
      // Check if existing token is already IGAA — don't overwrite
      const { data: existingProfile } = await supabase.from('profiles').select('instagram_access_token').eq('id', userId).single();
      if (!existingProfile?.instagram_access_token || !existingProfile.instagram_access_token.startsWith('IGAA')) {
        updateData.instagram_access_token = selectedPage.access_token;
      }
      console.log(`[InstagramCallback] IGAA exchange failed — ${existingProfile?.instagram_access_token?.startsWith('IGAA') ? 'keeping existing IGAA token' : 'using FB page token'}`);
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update(updateData)
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
