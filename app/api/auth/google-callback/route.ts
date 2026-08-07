import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { exchangeGoogleCode, listAccounts, listLocations } from '@/lib/google-business-oauth';

export const runtime = 'nodejs';

/**
 * GET /api/auth/google-callback
 * Handle Google OAuth callback — exchange code, save tokens, fetch accounts/locations.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const stateParam = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');

  // Decode state. On redirige TOUJOURS vers l'URL canonique du site, JAMAIS
  // state.origin : derrière nginx, le host interne peut être localhost:3000
  // → redirect cassé "https://localhost:3000/...". (Bug corrigé 28/06.)
  let userId = '';
  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://keiroai.com';

  if (stateParam) {
    try {
      const state = JSON.parse(Buffer.from(stateParam, 'base64').toString());
      userId = state.userId || '';
    } catch {}
  }

  if (error || !code) {
    return NextResponse.redirect(`${origin}/assistant?error=${encodeURIComponent(error || 'Google auth annulee')}`);
  }

  if (!userId) {
    return NextResponse.redirect(`${origin}/assistant?error=${encodeURIComponent('Session expiree')}`);
  }

  // DOIT correspondre EXACTEMENT au redirect_uri envoyé par /api/auth/google-oauth
  // (qui utilise NEXT_PUBLIC_SITE_URL), sinon Google renvoie redirect_uri_mismatch
  // à l'échange. On n'utilise plus state.origin (qui pouvait être www vs non-www).
  const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL || origin}/api/auth/google-callback`;

  try {
    // 1. Exchange code for tokens
    const tokens = await exchangeGoogleCode(code, redirectUri);
    console.log(`[GoogleCallback] Token exchange OK for user ${userId}`);

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // 2. Save tokens immediately (chiffrés au repos — CASA)
    const { encryptToken } = await import('@/lib/token-crypto');
    const tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    await supabase.from('profiles').update({
      google_business_access_token: encryptToken(tokens.access_token),
      google_business_refresh_token: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
      google_business_token_expiry: tokenExpiry,
      google_business_connected_at: new Date().toISOString(),
      // Doctrine "tout en auto" : Théo répond aux avis dès la connexion (les avis
      // sensibles — réclamations/litiges — restent escaladés à l'humain, pas auto-répondus).
      google_reviews_auto_reply: true,
    }).eq('id', userId);

    // 3. Fetch accounts and first location
    let accountName = '';
    let locationName = '';
    let locationTitle = '';

    // ── On parcourt TOUS les comptes, pas seulement le premier ──
    //
    // Le 7 août : le fondateur crée sa fiche, la fait valider, connecte
    // Google — et rien n'apparaît. account_id et location_id restaient vides.
    //
    // Deux causes, corrigées ensemble. D'abord accounts[0] : beaucoup de gens
    // ont un compte Google personnel ET un compte professionnel, et la fiche
    // n'est pas forcément sur le premier renvoyé. La boucle de réparation de
    // /api/agents/google-reviews itérait déjà tous les comptes ; ce rappel-ci,
    // non. Ensuite l'échec partait dans un console.warn que personne ne lit :
    // impossible de savoir si Google avait refusé, ou s'il n'y avait
    // réellement aucun établissement.
    const trace: string[] = [];
    try {
      const accounts = await listAccounts(tokens.access_token);
      trace.push(`${accounts.length} compte(s) Google Business`);

      for (const acc of accounts) {
        try {
          const locations = await listLocations(tokens.access_token, acc.name);
          trace.push(`${acc.name} → ${locations.length} établissement(s)`);
          if (locations.length > 0) {
            accountName = acc.name;
            locationName = locations[0].name;
            locationTitle = locations[0].title || locations[0].storefrontAddress?.locality || '';
            break;
          }
        } catch (e: any) {
          // Un compte qui refuse ne doit pas empêcher d'essayer les suivants.
          trace.push(`${acc.name} → refus : ${String(e?.message || e).slice(0, 140)}`);
        }
      }

      // On enregistre même sans établissement : connaître le compte permet à
      // la réparation ultérieure de repartir de là, et au chemin v4 d'avoir
      // son « accounts/X ».
      if (accountName) {
        await supabase.from('profiles').update({
          google_business_account_id: accountName,
          google_business_location_id: locationName,
          google_business_location_name: locationTitle,
        }).eq('id', userId);
      }
    } catch (e: any) {
      trace.push(`listAccounts a échoué : ${String(e?.message || e).slice(0, 200)}`);
    }

    // La trace est persistée : sans elle, « aucun établissement » est
    // indiscernable d'un refus d'API, et on envoie le client créer une fiche
    // qu'il possède déjà.
    try {
      await supabase.from('agent_logs').insert({
        agent: 'gmaps',
        action: 'google_connect_diagnostic',
        user_id: userId,
        status: locationName ? 'ok' : 'warning',
        data: { trace, account: accountName || null, location: locationName || null },
        created_at: new Date().toISOString(),
      });
    } catch { /* la trace ne doit jamais faire échouer la connexion */ }

    console.log(`[GoogleCallback] Google Business connected for user ${userId}: account=${accountName}, location=${locationName}`);

    // Use the same `just_connected=google` convention Gmail and Instagram
    // callbacks use — otherwise the /assistant/agent/[id] page listener won't
    // see the success, the dashboard won't reload, and the PreviewBanner keeps
    // showing even though tokens are actually saved. This is exactly why the
    // session notes said "Théo ne tourne pas car Google Business pas connecté"
    // — the client had connected but the UI never switched.
    return NextResponse.redirect(`${origin}/assistant/agent/gmaps?just_connected=google`);
  } catch (e: any) {
    console.error('[GoogleCallback] Error:', e.message);
    return NextResponse.redirect(`${origin}/assistant?error=${encodeURIComponent(`Google erreur: ${e.message}`)}`);
  }
}
