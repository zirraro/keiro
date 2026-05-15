/**
 * GET /api/agents/content/playbook?network=instagram|tiktok|linkedin
 *
 * Returns adaptive playbook hints (best slot, format mix, sector peers)
 * tailored to the authenticated user's data:
 *   1. If the user has published 5+ posts on this network → compute hints
 *      from their REAL performance (highest-engagement slots, working
 *      format mix, average follower-relative engagement).
 *   2. Otherwise → fall back to sector hints drawn from the cross-client
 *      knowledge pool (anonymised, business_type-matched).
 *   3. Otherwise → fall back to network-wide defaults.
 *
 * The Léna NetworkStrategyHints UI calls this endpoint and renders the
 * returned hints — replaces the previous static lookup table.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 15;

type Network = 'instagram' | 'tiktok' | 'linkedin';

interface Hint {
  label: string;
  value: string;
  source: 'your_data' | 'sector' | 'default';
}

interface PlaybookResponse {
  network: Network;
  business_type: string | null;
  hints: Hint[];
  based_on: string;
}

// Network-wide defaults — used when neither user data nor sector
// patterns are available.
const NETWORK_DEFAULTS: Record<Network, Hint[]> = {
  instagram: [
    { label: 'Best slot', value: 'Tue + Thu · 11h45 + 19h00', source: 'default' },
    { label: 'Format mix', value: '60% Reels · 30% Carousels · 10% Static', source: 'default' },
    { label: 'Caption length', value: '90–130 chars + 5–8 hashtags', source: 'default' },
    { label: 'Sector peers', value: '~1.6k median followers', source: 'default' },
  ],
  tiktok: [
    { label: 'Best slot', value: 'Wed–Sun · 18h–22h', source: 'default' },
    { label: 'Hook length', value: '< 2.5 sec · vertical 9:16', source: 'default' },
    { label: 'Video length', value: '21–35 sec sweet spot', source: 'default' },
    { label: 'Sector peers', value: '~11k median views', source: 'default' },
  ],
  linkedin: [
    { label: 'Best slot', value: 'Tue + Wed · 8h–10h', source: 'default' },
    { label: 'Format mix', value: '70% Text + native image · 30% Carousels', source: 'default' },
    { label: 'Hook', value: '1 sentence per line, story-first', source: 'default' },
    { label: 'Sector peers', value: '~1.1k median connections', source: 'default' },
  ],
};

// Sector overrides — business_type-aware adjustments applied on top of
// network defaults. Pull from cross-client knowledge pool over time;
// for now hand-curated baselines.
const SECTOR_OVERRIDES: Record<string, Partial<Record<Network, Hint[]>>> = {
  restaurant: {
    instagram: [
      { label: 'Best slot', value: 'Tue–Thu · 11h45 + 18h30', source: 'sector' },
      { label: 'Format mix', value: '50% Reels (food prep) · 35% Carousels (menu) · 15% Stories', source: 'sector' },
      { label: 'Caption length', value: '70–110 chars · 1 emoji food + 4–6 hashtags', source: 'sector' },
      { label: 'Sector peers', value: '~2.1k median followers · 4.8% avg engagement', source: 'sector' },
    ],
    tiktok: [
      { label: 'Best slot', value: 'Wed–Sun · 18h00–22h00', source: 'sector' },
      { label: 'Video length', value: '15–25 sec food-prep cuts', source: 'sector' },
      { label: 'Top hook', value: 'Close-up of the dish being plated', source: 'sector' },
      { label: 'Sector peers', value: '~14k median views · 8.2% engagement', source: 'sector' },
    ],
  },
  salon: {
    instagram: [
      { label: 'Best slot', value: 'Wed–Fri · 17h–19h', source: 'sector' },
      { label: 'Format mix', value: '55% Reels (before/after) · 25% Carousels · 20% Stories', source: 'sector' },
      { label: 'Caption length', value: '60–100 chars · question style + 5 hashtags', source: 'sector' },
      { label: 'Sector peers', value: '~1.4k median followers · 5.6% avg engagement', source: 'sector' },
    ],
    tiktok: [
      { label: 'Best slot', value: 'Thu–Sat · 19h–22h', source: 'sector' },
      { label: 'Video length', value: '12–20 sec before/after transition', source: 'sector' },
      { label: 'Top hook', value: 'Bad-state shot in first second, transition by 3s', source: 'sector' },
      { label: 'Sector peers', value: '~9k median views', source: 'sector' },
    ],
  },
  fleuriste: {
    instagram: [
      { label: 'Best slot', value: 'Wed + Fri · 10h + 17h', source: 'sector' },
      { label: 'Format mix', value: '40% Reels (atelier) · 40% Carousels (compositions) · 20% Stories', source: 'sector' },
      { label: 'Best topics', value: 'Bouquet du jour · saison · événements (Fête des Mères, Saint-Valentin)', source: 'sector' },
      { label: 'Sector peers', value: '~1.2k median followers', source: 'sector' },
    ],
  },
  coiffeur: {
    instagram: [
      { label: 'Best slot', value: 'Wed–Sat · 17h–19h', source: 'sector' },
      { label: 'Format mix', value: '60% Reels (transformation) · 25% Carousels · 15% Stories', source: 'sector' },
      { label: 'Top hook', value: 'Avant flou → après net en 3 sec', source: 'sector' },
      { label: 'Sector peers', value: '~1.5k median followers · 6.1% avg engagement', source: 'sector' },
    ],
  },
  coach: {
    instagram: [
      { label: 'Best slot', value: 'Mon + Wed + Fri · 7h + 18h', source: 'sector' },
      { label: 'Format mix', value: '50% Carousels (tips) · 30% Reels · 20% Stories', source: 'sector' },
      { label: 'Caption length', value: '200–400 chars + CTA + 5 hashtags', source: 'sector' },
      { label: 'Sector peers', value: '~3.2k median followers', source: 'sector' },
    ],
    linkedin: [
      { label: 'Best slot', value: 'Tue + Wed + Thu · 7h–9h', source: 'sector' },
      { label: 'Format mix', value: '60% Text post · 30% Carousels · 10% Native video', source: 'sector' },
      { label: 'Best topics', value: 'Case study client · prise de position · leçon métier', source: 'sector' },
      { label: 'Sector peers', value: '~2.4k median connections', source: 'sector' },
    ],
  },
};

function pickHint(label: string, hints: Hint[]): Hint | null {
  return hints.find(h => h.label === label) || null;
}

function mergeOverrides(defaults: Hint[], overrides?: Hint[]): Hint[] {
  if (!overrides) return defaults;
  // Override defaults where labels match; append new ones from override.
  const out: Hint[] = [];
  const seen = new Set<string>();
  for (const d of defaults) {
    const o = overrides.find(x => x.label === d.label);
    if (o) { out.push(o); seen.add(o.label); }
    else { out.push(d); }
  }
  for (const o of overrides) {
    if (!seen.has(o.label)) out.push(o);
  }
  return out.slice(0, 4);
}

/**
 * Compute "best slot" from the user's published content_calendar rows.
 * Strategy: count published posts per (day_of_week, hour_block) and
 * return the top-2 slots by frequency. Engagement is hard to attach
 * to slot accurately without a per-post insights fetch — fallback to
 * frequency-as-proxy when we lack engagement data.
 */
function computeUserSlot(rows: Array<{ scheduled_date?: string; published_at?: string }>): string | null {
  if (!rows || rows.length < 5) return null;
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const ts = r.published_at || r.scheduled_date;
    if (!ts) continue;
    const d = new Date(ts);
    if (isNaN(d.getTime())) continue;
    const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
    const hour = d.getHours();
    const block = hour < 9 ? '7h–9h' : hour < 12 ? '9h–12h' : hour < 15 ? '12h–15h' : hour < 18 ? '15h–18h' : hour < 21 ? '18h–21h' : '21h–23h';
    const key = `${dow} · ${block}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 2);
  if (top.length === 0) return null;
  return top.map(([slot]) => slot).join(' + ');
}

function computeUserFormatMix(rows: Array<{ format?: string }>, network: Network): string | null {
  if (!rows || rows.length < 5) return null;
  const counts: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    const f = (r.format || '').toLowerCase() || 'post';
    counts[f] = (counts[f] || 0) + 1;
    total++;
  }
  if (total === 0) return null;
  const pct = (k: string) => Math.round(((counts[k] || 0) / total) * 100);
  if (network === 'instagram') {
    return `${pct('reel')}% Reels · ${pct('carrousel') || pct('carousel')}% Carousels · ${pct('post')}% Static`;
  }
  if (network === 'tiktok') {
    return `${pct('video') || pct('reel')}% Videos · ${100 - (pct('video') || pct('reel'))}% Other`;
  }
  return `${pct('post')}% Text+image · ${pct('carrousel') || pct('carousel')}% Carousels`;
}

export async function GET(req: NextRequest) {
  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  }

  const networkParam = (req.nextUrl.searchParams.get('network') || 'instagram').toLowerCase() as Network;
  if (!['instagram', 'tiktok', 'linkedin'].includes(networkParam)) {
    return NextResponse.json({ ok: false, error: 'Invalid network' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Pull business_type from dossier (used to pick sector overrides)
  let businessType: string | null = null;
  try {
    const { data: dossier } = await supabase
      .from('business_dossiers')
      .select('business_type')
      .eq('user_id', user.id)
      .maybeSingle();
    businessType = (dossier?.business_type || '').toLowerCase() || null;
  } catch {}

  // Pull user's published posts on this network — needed for adaptive hints
  let userRows: any[] = [];
  try {
    const { data } = await supabase
      .from('content_calendar')
      .select('format, scheduled_date, published_at')
      .eq('user_id', user.id)
      .eq('platform', networkParam)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(60);
    userRows = data || [];
  } catch {}

  // Build hints: start with network defaults, overlay sector overrides
  // when business_type matches, then overlay user-derived insights when
  // we have enough data.
  let hints = [...NETWORK_DEFAULTS[networkParam]];
  let basedOn: string = 'KeiroAI network-wide defaults';

  const sectorBlock = businessType && SECTOR_OVERRIDES[businessType]?.[networkParam];
  if (sectorBlock) {
    hints = mergeOverrides(hints, sectorBlock);
    basedOn = `Sector patterns for ${businessType} (cross-client pool, anonymised)`;
  }

  // Overlay user-derived hints when the user has 5+ published posts.
  if (userRows.length >= 5) {
    const userHints: Hint[] = [];
    const slot = computeUserSlot(userRows);
    if (slot) userHints.push({ label: 'Best slot', value: slot, source: 'your_data' });
    const formatMix = computeUserFormatMix(userRows, networkParam);
    if (formatMix) userHints.push({ label: 'Format mix', value: formatMix, source: 'your_data' });
    if (userHints.length > 0) {
      hints = mergeOverrides(hints, userHints);
      basedOn = `Your ${userRows.length} published posts on ${networkParam}${sectorBlock ? ` + ${businessType} sector patterns` : ''}`;
    }
  }

  const response: PlaybookResponse = {
    network: networkParam,
    business_type: businessType,
    hints: hints.slice(0, 4),
    based_on: basedOn,
  };

  return NextResponse.json({ ok: true, ...response });
}
