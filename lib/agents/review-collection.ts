/**
 * THÉO v2 — MOTEUR DE COLLECTE D'AVIS (réservoir, Fable 5 §3.3).
 *
 * On ne fait plus que RÉPONDRE aux avis : on GÉNÈRE le flux. Boucle vertueuse :
 * visite → demande d'avis (QR vitrine / email post-visite) → avis → réponse Théo
 * → SEO local → visibilité. Conforme : demande SIMPLE, jamais incitée/conditionnée
 * (pas de contrepartie), on demande un avis honnête.
 *
 * Ce module fournit le LIEN d'avis officiel Google du client (le reste — QR,
 * email, kit vitrine — le consomme).
 */
import { SupabaseClient } from '@supabase/supabase-js';

export interface ReviewRequestLink {
  connected: boolean;
  reviewUrl: string | null;
  placeId?: string | null;
  name?: string | null;
  source: 'gbp' | 'search' | 'none';
}

/**
 * Lien de demande d'avis Google pour le client. Priorité :
 *  1. `metadata.newReviewUri` du GBP (lien "laisser un avis" officiel, 1 clic) ;
 *  2. `metadata.placeId` → writereview ;
 *  3. repli : recherche Google par nom d'établissement.
 * Best-effort, ne throw jamais.
 */
export async function getReviewRequestLink(supabase: SupabaseClient, userId: string): Promise<ReviewRequestLink> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('google_business_location_id, google_business_location_name, google_business_refresh_token')
      .eq('id', userId)
      .single();
    if (!profile?.google_business_refresh_token) return { connected: false, reviewUrl: null, source: 'none' };

    const name = profile.google_business_location_name || null;
    const locationId = profile.google_business_location_id;

    if (locationId) {
      try {
        const { getValidToken } = await import('@/lib/google-business-oauth');
        const token = await getValidToken(supabase, userId);
        if (token) {
          const r = await fetch(
            `https://mybusinessbusinessinformation.googleapis.com/v1/${locationId}?readMask=metadata`,
            { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) },
          );
          if (r.ok) {
            const j = await r.json();
            const uri = j?.metadata?.newReviewUri;
            const placeId = j?.metadata?.placeId || null;
            if (uri) return { connected: true, reviewUrl: uri, placeId, name, source: 'gbp' };
            if (placeId) return { connected: true, reviewUrl: `https://search.google.com/local/writereview?placeid=${placeId}`, placeId, name, source: 'gbp' };
          }
        }
      } catch { /* fall through to search */ }
    }

    // Repli : recherche Google par nom (moins direct mais toujours utile).
    if (name) {
      return { connected: true, reviewUrl: `https://www.google.com/search?q=${encodeURIComponent(`${name} avis google`)}`, name, source: 'search' };
    }
    return { connected: true, reviewUrl: null, source: 'none' };
  } catch {
    return { connected: false, reviewUrl: null, source: 'none' };
  }
}
