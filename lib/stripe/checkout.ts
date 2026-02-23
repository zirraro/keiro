/**
 * Client-side helper pour initier un Stripe Checkout.
 * Si non connecté → redirige vers login avec le plan en paramètre.
 * Après login → la page pricing auto-déclenche le checkout.
 */
import { supabaseBrowser } from '@/lib/supabase/client';

export async function startCheckout(planKey: string): Promise<void> {
  try {
    // 1. Check auth client-side first
    const supabase = supabaseBrowser();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      // Not logged in → redirect to login with plan info
      window.location.href = `/login?redirect=/pricing&plan=${planKey}`;
      return;
    }

    // 2. Call API with explicit auth token
    const res = await fetch('/api/stripe/create-checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ planKey }),
    });

    if (res.status === 401) {
      // Session expired → redirect to login
      window.location.href = `/login?redirect=/pricing&plan=${planKey}`;
      return;
    }

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
