/**
 * QA gate — brief v3 Section 3 (2026-06-12).
 *
 * Deterministic, brand-kit-grounded checks run on EVERY public output (Léna
 * posts, Théo review replies, Jade auto-replies, Hugo emails) BEFORE it ships.
 * A failed gate → the output goes to pending_approval with the violations
 * surfaced. NEVER a silent drop, NEVER auto-publish on fail. Never bypassed by
 * the auto toggle.
 *
 * Spelling (LanguageTool self-hosted) is pluggable: set LANGUAGETOOL_URL to
 * enable it; absent → spelling check is skipped (other rules still run).
 */

export type GateAgent = 'content' | 'gmaps_reply' | 'dm_auto_reply' | 'email';

export interface GateInput {
  orgId: string;
  agent: GateAgent;
  channel: 'instagram' | 'tiktok' | 'linkedin' | 'google' | 'email' | 'dm';
  text: string;
  lang?: 'fr' | 'en' | 'auto';
}

export interface GateViolation {
  rule:
    | 'PRICE_NOT_IN_KIT' | 'NO_PRICES_CONFIGURED' | 'OFFER_NOT_IN_KIT' | 'OFFER_EXPIRED'
    | 'FORBIDDEN_TOPIC' | 'COMPENSATION_PROMISE' | 'SPELLING' | 'STALE_DATE' | 'DUPLICATE';
  detail: string;
  span?: [number, number];
}

export interface GateVerdict {
  pass: boolean;
  violations: GateViolation[];
  kitVersion: string;
  checkedAt: string;
}

interface KitData {
  exists: boolean;
  no_public_prices: boolean;
  updated_at: string;
  prices: { amount: number; no_discount: boolean }[];
  offers: { label: string; description: string | null; discount_value: number | null; valid_from: string; valid_to: string }[];
  forbidden: string[];
}

// ── helpers ────────────────────────────────────────────────────────────
const MONEY_RE = /(\d+[.,]?\d*)\s?(?:€|eur(?:os)?)\b/gi;
const PROMO_RE = /(promo|promotion|r[ée]duction|offre|offert|gratuit|cadeau|\-\s?\d+\s?%)/i;
const COMPENSATION_RE = /(rembours\w*|d[ée]dommag\w*|geste commercial|avoir|offert|gratuit)/i;

function norm(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function parseAmount(raw: string): number {
  return parseFloat(raw.replace(/\s/g, '').replace(',', '.'));
}

// Short in-memory cache of kit data per org (invalidated by TTL).
const kitCache = new Map<string, { at: number; data: KitData }>();
const KIT_TTL_MS = 60_000;

async function loadKit(supabase: any, orgId: string): Promise<KitData> {
  const cached = kitCache.get(orgId);
  // Date.now is unavailable in workflow scripts but fine in app runtime.
  const now = Date.now();
  if (cached && now - cached.at < KIT_TTL_MS) return cached.data;

  const empty: KitData = { exists: false, no_public_prices: false, updated_at: '', prices: [], offers: [], forbidden: [] };
  try {
    const { data: kit } = await supabase
      .from('brand_kits')
      .select('id, no_public_prices, updated_at')
      .eq('org_id', orgId)
      .maybeSingle();
    if (!kit) { kitCache.set(orgId, { at: now, data: empty }); return empty; }

    const today = new Date().toISOString().split('T')[0];
    const [{ data: prices }, { data: offers }, { data: topics }] = await Promise.all([
      supabase.from('brand_kit_prices').select('amount_eur, no_discount').eq('brand_kit_id', kit.id).eq('is_active', true),
      supabase.from('brand_kit_offers').select('label, description, discount_value, valid_from, valid_to').eq('brand_kit_id', kit.id),
      supabase.from('brand_kit_forbidden_topics').select('topic').eq('brand_kit_id', kit.id),
    ]);
    const data: KitData = {
      exists: true,
      no_public_prices: !!kit.no_public_prices,
      updated_at: kit.updated_at || '',
      prices: (prices || []).map((p: any) => ({ amount: Number(p.amount_eur), no_discount: !!p.no_discount })),
      offers: (offers || []).map((o: any) => ({ label: o.label, description: o.description, discount_value: o.discount_value != null ? Number(o.discount_value) : null, valid_from: o.valid_from, valid_to: o.valid_to })),
      forbidden: (topics || []).map((t: any) => t.topic).filter(Boolean),
      // keep today out of the struct; computed per-check
    } as KitData;
    void today;
    kitCache.set(orgId, { at: now, data });
    return data;
  } catch {
    return empty;
  }
}

async function checkSpelling(text: string, lang: string): Promise<GateViolation[]> {
  const base = process.env.LANGUAGETOOL_URL;
  if (!base) return []; // not configured → skip (other rules still enforce)
  // Strip emojis, hashtags, @mentions, URLs before checking.
  const cleaned = (text || '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[@#]\w+/g, ' ')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, ' ');
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/v2/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ text: cleaned, language: lang === 'en' ? 'en-US' : 'fr' }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const matches = (data.matches || []).filter((m: any) => m.rule?.issueType === 'misspelling' || m.rule?.category?.id === 'TYPOS');
    return matches.slice(0, 10).map((m: any) => ({
      rule: 'SPELLING' as const,
      detail: `${m.context?.text?.substr(m.context.offset, m.context.length) || ''} — ${m.shortMessage || m.message}`,
      span: [m.offset, m.offset + m.length] as [number, number],
    }));
  } catch {
    return [];
  }
}

/**
 * Run the deterministic QA gate. Pure brand-kit checks + optional spelling.
 * Does NOT cover DUPLICATE/STALE_DATE — those stay in the existing
 * publish-guard preflight (run separately on the content path).
 */
export async function runPublishGate(supabase: any, input: GateInput): Promise<GateVerdict> {
  const violations: GateViolation[] = [];
  const text = input.text || '';
  const kit = await loadKit(supabase, input.orgId);
  const today = new Date().toISOString().split('T')[0];

  // ── Rule 2: money amounts ──
  const amounts: { value: number; span: [number, number] }[] = [];
  let m: RegExpExecArray | null;
  MONEY_RE.lastIndex = 0;
  while ((m = MONEY_RE.exec(text)) !== null) {
    amounts.push({ value: parseAmount(m[1]), span: [m.index, m.index + m[0].length] });
  }
  if (amounts.length > 0) {
    const hasActivePrices = kit.exists && !kit.no_public_prices && kit.prices.length > 0;
    if (!hasActivePrices) {
      // No usable prices. Block money mentions when EITHER the client has a kit
      // (explicit: empty prices or no_public_prices) OR this is client content
      // (Léna interim safety, brief v3 §1 filet 2). For other agents on an
      // account with NO kit at all (e.g. KeiroAI's own sales replies), don't
      // over-block — there's nothing to validate against.
      const enforceNoPrices = kit.exists || input.agent === 'content';
      if (enforceNoPrices) {
        for (const a of amounts) {
          violations.push({ rule: 'NO_PRICES_CONFIGURED', detail: `${a.value}€ mentionné mais aucun prix configuré dans le brand kit`, span: a.span });
        }
      }
    } else {
      const validOfferValues = kit.offers
        .filter(o => o.valid_from <= today && today <= o.valid_to && o.discount_value != null)
        .map(o => o.discount_value as number);
      for (const a of amounts) {
        const ok = kit.prices.some(p => Math.abs(p.amount - a.value) < 0.005) || validOfferValues.some(v => Math.abs(v - a.value) < 0.005);
        if (!ok) violations.push({ rule: 'PRICE_NOT_IN_KIT', detail: `${a.value}€ ne correspond à aucun prix actif ni offre valide`, span: a.span });
      }
    }
  }

  // ── Rule 3: promos must map to a valid offer ──
  if (PROMO_RE.test(text)) {
    const activeOffers = kit.offers.filter(o => o.valid_from <= today && today <= o.valid_to);
    const expiredOnly = kit.offers.length > 0 && activeOffers.length === 0;
    // Fuzzy: does any active offer's label/description share a token with the text?
    const textN = norm(text);
    const matchesActive = activeOffers.some(o => {
      const hay = norm(`${o.label} ${o.description || ''}`).split(/\s+/).filter(w => w.length > 3);
      return hay.some(w => textN.includes(w));
    });
    if (!matchesActive) {
      if (expiredOnly) violations.push({ rule: 'OFFER_EXPIRED', detail: 'Une promo est mentionnée mais aucune offre n\'est valide à cette date' });
      else violations.push({ rule: 'OFFER_NOT_IN_KIT', detail: 'Une promo est mentionnée mais ne correspond à aucune offre configurée' });
    }
  }

  // ── Rule 4: forbidden topics ──
  const textN = norm(text);
  for (const topic of kit.forbidden) {
    const t = norm(topic);
    if (t && (textN.includes(t) || textN.includes(t.replace(/s$/, '')) || textN.includes(t + 's'))) {
      violations.push({ rule: 'FORBIDDEN_TOPIC', detail: `Sujet interdit mentionné : "${topic}"` });
    }
  }

  // ── Rule 5: compensation promise (review/DM replies only) ──
  if (input.agent === 'gmaps_reply' || input.agent === 'dm_auto_reply') {
    if (COMPENSATION_RE.test(text)) {
      // Allowed only if covered by a valid offer (e.g. a real "1 produit offert" offer)
      const activeOffers = kit.offers.filter(o => o.valid_from <= today && today <= o.valid_to);
      const coveredByOffer = activeOffers.some(o => norm(o.label).match(/offert|gratuit|cadeau/));
      if (!coveredByOffer) {
        violations.push({ rule: 'COMPENSATION_PROMISE', detail: 'Promesse de compensation/remboursement/geste commercial non couverte par une offre valide' });
      }
    }
  }

  // ── Rule 6: spelling (pluggable) ──
  const spellViolations = await checkSpelling(text, input.lang === 'en' ? 'en' : 'fr');
  violations.push(...spellViolations);

  return {
    pass: violations.length === 0,
    violations,
    kitVersion: kit.updated_at || 'none',
    checkedAt: new Date().toISOString(),
  };
}

/** Log a gate verdict to agent_logs (action=qa_gate). */
export async function logGateVerdict(supabase: any, orgId: string, input: Pick<GateInput, 'agent' | 'channel'>, verdict: GateVerdict, ref?: string): Promise<void> {
  try {
    await supabase.from('agent_logs').insert({
      agent: 'content',
      action: 'qa_gate',
      status: verdict.pass ? 'ok' : 'warn',
      user_id: orgId,
      data: { agent: input.agent, channel: input.channel, pass: verdict.pass, violations: verdict.violations, kitVersion: verdict.kitVersion, ref: ref || null },
      created_at: new Date().toISOString(),
    });
  } catch { /* non-fatal */ }
}
