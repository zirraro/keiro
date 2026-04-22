import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const maxDuration = 60;

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * POST /api/business-dossier/autofill
 * body: { website?: string, instagram?: string }
 *
 * Takes whatever the client types in one click — a website URL and/or
 * an Instagram handle — and fills the business_dossier fast.
 *
 * Strategy:
 *   1. If website: fetch homepage + about page, strip HTML, send body
 *      to Claude Sonnet with a structured extraction prompt.
 *   2. If instagram: call business_discovery via the admin IG/Page token
 *      and pull bio + website + media count.
 *   3. Merge both sources, upsert with overwrite=false so manual
 *      entries never get stomped.
 *
 * Returns { applied: { field: value, ... }, score_before, score_after }
 * so the UI can show "we pre-filled 12 fields, your dossier jumped
 * from 0% to 64%".
 */
export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const website: string | undefined = body?.website;
  const instagram: string | undefined = body?.instagram;
  if (!website && !instagram) {
    return NextResponse.json({ error: 'website or instagram required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Read existing dossier so we know which fields to leave alone.
  const { data: existing } = await supabase
    .from('business_dossiers')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  const scoreBefore = existing?.completeness_score || 0;

  // Build the extracted payload from both sources.
  const extracted: Record<string, any> = {};

  // ── Source 1: Website scraping ──
  if (website) {
    const url = website.startsWith('http') ? website : `https://${website}`;
    try {
      const fetched = await scrapeWebsite(url);
      if (fetched) {
        const parsed = await extractDossierFromWebText(fetched.text, fetched.title, url);
        Object.assign(extracted, parsed, { website_url: url });
      }
    } catch (e: any) {
      console.warn('[autofill] Website scrape failed:', e?.message?.substring?.(0, 200));
    }
  }

  // ── Source 2: Instagram business_discovery ──
  if (instagram) {
    const handle = instagram.replace(/^@/, '').trim();
    try {
      const { getInstagramProfileSnapshot } = await import('@/lib/agents/ig-profile-snapshot');
      // Use the admin account as the looker-upper (business_discovery
      // requires a connected IG business + Page token — most clients
      // haven't connected theirs yet at this stage of onboarding).
      const { data: admin } = await supabase
        .from('profiles')
        .select('instagram_business_account_id, facebook_page_access_token')
        .eq('is_admin', true)
        .limit(1)
        .maybeSingle();
      if (admin?.instagram_business_account_id && admin?.facebook_page_access_token) {
        const snap = await getInstagramProfileSnapshot(handle, admin.instagram_business_account_id, admin.facebook_page_access_token);
        if (snap.exists) {
          extracted.instagram_handle = `@${handle}`;
          if (snap.biography && !extracted.company_description) {
            extracted.company_description = snap.biography.substring(0, 500);
          }
          if (snap.website && !extracted.website_url) {
            extracted.website_url = snap.website;
          }
        }
      }
    } catch (e: any) {
      console.warn('[autofill] IG discovery failed:', e?.message?.substring?.(0, 200));
    }
  }

  // ── Merge into dossier, never overwrite what the client already filled ──
  const { upsertBusinessDossier } = await import('@/lib/agents/client-context');
  const toApply: Record<string, any> = {};
  for (const [k, v] of Object.entries(extracted)) {
    if (v === null || v === undefined || v === '') continue;
    const current = (existing as any)?.[k];
    if (current && String(current).trim().length > 0) continue; // don't stomp
    toApply[k] = v;
  }
  if (Object.keys(toApply).length > 0) {
    await upsertBusinessDossier(supabase, user.id, toApply);
  }

  // Re-read for the updated score.
  const { data: after } = await supabase
    .from('business_dossiers')
    .select('completeness_score')
    .eq('user_id', user.id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    applied: toApply,
    applied_count: Object.keys(toApply).length,
    score_before: scoreBefore,
    score_after: after?.completeness_score || scoreBefore,
  });
}

// ─────────────────────────────────────────────────────────────
// Website scraping — homepage + /about + naive text strip
// ─────────────────────────────────────────────────────────────

async function scrapeWebsite(homeUrl: string): Promise<{ title: string; text: string } | null> {
  const pages: string[] = [homeUrl];
  // Try common "about" / "contact" paths for richer context.
  try {
    const u = new URL(homeUrl);
    pages.push(new URL('/a-propos', u).toString());
    pages.push(new URL('/about', u).toString());
    pages.push(new URL('/contact', u).toString());
  } catch { /* bad url */ }

  let combinedTitle = '';
  let combinedText = '';
  for (const p of pages) {
    try {
      const controller = new AbortController();
      const tm = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(p, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 KeiroAI-DossierAutofill' },
      });
      clearTimeout(tm);
      if (!res.ok) continue;
      const html = await res.text();
      if (!combinedTitle) {
        const m = html.match(/<title>([^<]+)<\/title>/i);
        if (m) combinedTitle = m[1].trim();
      }
      const text = stripHtml(html).substring(0, 8000);
      combinedText += `\n\n=== ${p} ===\n${text}`;
      if (combinedText.length > 30_000) break;
    } catch { /* next page */ }
  }

  if (!combinedText.trim()) return null;
  return { title: combinedTitle, text: combinedText.trim().substring(0, 30_000) };
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// ─────────────────────────────────────────────────────────────
// Claude extraction — map raw text → dossier fields
// ─────────────────────────────────────────────────────────────

async function extractDossierFromWebText(
  text: string,
  title: string,
  url: string,
): Promise<Record<string, any>> {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return {};

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: `You extract a small business's identity from its website copy. Read the HTML-stripped text and title, then produce a strict JSON payload matching these keys (omit any key you genuinely cannot infer — NEVER invent):

{
  "company_name": "short name as it appears",
  "company_description": "one sentence describing what the business does",
  "business_type": "single-word category (restaurant, boulangerie, coach, fleuriste, salon, bar, agence, commerce, etc.)",
  "main_products": "comma-separated 3-5 concrete offerings",
  "target_audience": "one line on the customer profile",
  "unique_selling_points": "one line on what sets them apart",
  "brand_tone": "friendly | formal | casual | premium | playful",
  "city": "city only",
  "address": "full address if present",
  "phone": "primary phone",
  "email": "primary email",
  "horaires_ouverture": "opening hours if present",
  "specialite": "flagship product or service",
  "instagram_handle": "@handle (only if explicitly visible)",
  "tiktok_handle": "@handle (only if explicitly visible)",
  "facebook_url": "full url (only if explicitly visible)",
  "google_maps_url": "full url (only if explicitly visible)",
  "catchment_area": "local / regional / national / international — only if inferable"
}

Return ONLY the JSON — no markdown fences, no intro.`,
        messages: [{
          role: 'user',
          content: `Website URL: ${url}\n<title>${title}</title>\n\nText content:\n${text.substring(0, 20_000)}`,
        }],
      }),
    });

    if (!res.ok) return {};
    const data = await res.json();
    let txt = (data.content?.[0]?.text || '').trim();
    txt = txt.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    const parsed = JSON.parse(txt);
    // Minimal sanitisation — string-only + length caps.
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && v.trim()) out[k] = String(v).substring(0, 500).trim();
    }
    return out;
  } catch (e: any) {
    console.warn('[autofill] Claude extraction failed:', e?.message?.substring?.(0, 200));
    return {};
  }
}
