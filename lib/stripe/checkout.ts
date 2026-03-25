/**
 * Client-side helper pour initier un Stripe Checkout.
 * Fonctionne AVEC et SANS connexion :
 * - Connecté → userId dans metadata, activation immédiate via webhook
 * - Non connecté → Stripe collecte l'email, après paiement → création de compte → activation
 */
import { supabaseBrowser } from '@/lib/supabase/client';

export async function startCheckout(planKey: string, upsellFrom?: string): Promise<void> {
  try {
    // 1. Vérifier si connecté (optionnel)
    const supabase = supabaseBrowser();
    const { data: { session } } = await supabase.auth.getSession();

    // 2. Appeler l'API — fonctionne avec ou sans auth
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }

    const body: Record<string, string> = { planKey };
    if (upsellFrom) body.upsellFrom = upsellFrom;

    const res = await fetch('/api/stripe/create-checkout', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || 'Erreur lors de la création du paiement');
      return;
    }

    if (data.url) {
      window.location.href = data.url;
    }
  } catch (err) {
    console.error('[Checkout] Error:', err);
    alert('Erreur réseau. Veuillez réessayer.');
  }
}
