/**
 * Client-side helper pour initier un Stripe Checkout.
 * Remplace les liens buy.stripe.com hardcodés.
 * Si non connecté → redirige vers login avec le plan en paramètre.
 * Après login → la page pricing auto-déclenche le checkout.
 */
export async function startCheckout(planKey: string): Promise<void> {
  try {
    const res = await fetch('/api/stripe/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planKey }),
    });

    if (res.status === 401) {
      // User non connecté → rediriger vers login, puis pricing avec auto-checkout
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
