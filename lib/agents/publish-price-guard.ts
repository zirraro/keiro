/**
 * Interim price safety net — brief v3 §1 filet 2 (2026-06-12).
 *
 * The single most likely week-1 incident in direct-auto mode is an INVENTED
 * price in a published post. Until the structured brand kit + full QA gate
 * (Sections 2 & 3) ship, this guard makes it impossible without asking the
 * client anything: if a client has NO configured price (or has declared
 * no_public_prices), ANY money mention in an auto-publishable output is routed
 * to pending_approval instead of being auto-published.
 *
 * Forward-compatible: once the brand_kits tables exist, configured prices let
 * legitimate amounts through; the full QA gate (Section 3) then supersedes this.
 */

// "85€", "85 €", "85eur", "25,50 €", "à partir de 25€"
const MONEY_RE = /(\d+[.,]?\d*)\s?(€|eur(?:os)?)\b/i;

export function mentionsMoney(text: string): boolean {
  return MONEY_RE.test(text || '');
}

/**
 * True only when the client has at least one ACTIVE configured price in the
 * structured brand kit. Until the brand_kits tables exist (Section 2) — or on
 * any error / no kit / no_public_prices — returns false, so money mentions are
 * conservatively sent to validation. Never throws.
 */
export async function hasConfiguredPrices(supabase: any, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  try {
    const { data: kit, error: kErr } = await supabase
      .from('brand_kits')
      .select('id, no_public_prices')
      .eq('org_id', userId)
      .maybeSingle();
    if (kErr || !kit || kit.no_public_prices) return false;
    const { count, error: pErr } = await supabase
      .from('brand_kit_prices')
      .select('id', { count: 'exact', head: true })
      .eq('brand_kit_id', kit.id)
      .eq('is_active', true);
    if (pErr) return false;
    return (count || 0) > 0;
  } catch {
    return false;
  }
}
