/**
 * Client-side helper pour initier un Stripe Checkout.
 * Remplace les liens buy.stripe.com hardcodés.
 */
export async function startCheckout(planKey: string): Promise<void> {
  try {
    const res = await fetch('/api/stripe/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planKey }),
    });

    if (res.status === 401) {
      // User non connecté → rediriger vers login
      window.location.href = '/login?redirect=/pricing';
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
