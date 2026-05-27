/**
 * Lightweight, no-Gemini scraping of a prospect's existing public web
 * presence (website + Instagram) to harvest structured business notes
 * used by Hugo for personalised visual examples.
 *
 * Founder ask 2026-05-27: "ne pas utiliser trop gemini research si ca
 * se trouve on a deja les info verifie et du coup on doit scrapper le
 * site internet et insta de nos prospects et y ajouter des notes qui
 * nous permettent ensuite d'enrichir le prompt pour leur preparer un
 * visuel de conversion en exemple tres personalisé".
 *
 * Pipeline: scrape → extract → summarise → persist into
 * crm_prospects.business_notes (JSONB).
 */

export interface BusinessNotes {
  source: 'website' | 'instagram' | 'mixed';
  signals: string[];      // free-form sentences ("propose des pizzas napolitaines au feu de bois", "ambiance industrielle bois et métal")
  signature: string[];    // signature products/services found ("burrata", "shooting mariage")
  ambiance: string[];     // mood / aesthetic cues ("cosy", "minimaliste", "warehouse")
  audience: string;       // inferred target ("jeunes urbains", "famille", "professionnels")
  follower_count?: number;
  posts_recent?: number;
  insta_bio?: string;
  website_title?: string;
  website_description?: string;
  fetched_at: string;
}

/**
 * Extracted contact info from a website. Used to fill essentials
 * (phone / email / address) without burning a Google Places call.
 */
export interface ExtractedContact {
  phone?: string;
  email?: string;
  address?: string;
  instagram?: string; // handle without @, harvested from <a href="instagram.com/...">
}

/**
 * Fetch + extract structured data from a website HTML. Very tolerant:
 * if the site is slow, behind Cloudflare, or returns HTML we can't
 * parse, we return null. 6s hard timeout.
 */
export async function scrapeWebsite(url: string): Promise<Partial<BusinessNotes> | null> {
  if (!url) return null;
  let normalized = url.trim();
  if (!/^https?:\/\//.test(normalized)) normalized = 'https://' + normalized;

  try {
    const res = await fetch(normalized, {
      signal: AbortSignal.timeout(6000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; KeiroAI/1.0; +https://keiroai.com)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const html = await res.text();
    if (!html || html.length < 200) return null;

    // Strip script/style for cleaner extraction
    const clean = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '');

    const title = (clean.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '').trim().slice(0, 200);
    const description = (
      clean.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]
      || clean.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1]
      || ''
    ).trim().slice(0, 400);
    const h1List = Array.from(clean.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi))
      .map(m => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(t => t.length > 2 && t.length < 200)
      .slice(0, 3);
    const h2List = Array.from(clean.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi))
      .map(m => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(t => t.length > 2 && t.length < 200)
      .slice(0, 6);

    // Heuristic signals to feed Hugo's visual brief
    const signals: string[] = [];
    if (title) signals.push(`Site titre: ${title}`);
    if (description) signals.push(`Description: ${description}`);
    if (h1List.length) signals.push(`Pages: ${h1List.join(' · ')}`);
    if (h2List.length) signals.push(`Sections: ${h2List.slice(0, 4).join(' · ')}`);

    // Naive ambiance/keyword harvest from the visible text
    const txtSample = clean.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 4000).toLowerCase();
    const ambiance: string[] = [];
    const AMBIANCE_KEYWORDS: Array<[RegExp, string]> = [
      [/(cosy|chaleureux|cocoon)/, 'cosy/chaleureux'],
      [/(industriel|industrial|loft|warehouse)/, 'industriel/loft'],
      [/(minimalist|épuré|moderne)/, 'minimaliste/moderne'],
      [/(traditionnel|authentique|familial|terroir)/, 'traditionnel/familial'],
      [/(luxe|premium|haut de gamme|raffin)/, 'haut de gamme'],
      [/(bistrot|comptoir|brasserie)/, 'bistrot/brasserie'],
      [/(végét|vegan|bio|local|durable)/, 'végé/bio/local'],
      [/(rooftop|terrasse|patio|jardin)/, 'extérieur/terrasse'],
    ];
    for (const [re, label] of AMBIANCE_KEYWORDS) if (re.test(txtSample)) ambiance.push(label);

    // ── Contact info extraction (phone / email / address / IG handle) ──
    // Free, fills essentials without burning a Google Places call.
    // Founder ask 2026-05-28: scraper should populate fiche essentials
    // from website HTML before any paid lookup.
    const contact: ExtractedContact = {};

    // Phone: FR (10 digits) or +33 international, accept various seps
    const phoneMatches = clean.match(/(?:(?:\+33|0033|0)\s?[1-9](?:[\s.\-]?\d{2}){4})/g);
    if (phoneMatches && phoneMatches.length > 0) {
      // Prefer phones in tel: links over plain text matches
      const telMatch = clean.match(/href=["']tel:([+\d\s.\-]{8,20})["']/i);
      const raw = telMatch?.[1] || phoneMatches[0];
      const normalized = raw.replace(/[\s.\-]/g, '').replace(/^0033/, '+33').replace(/^0(?=\d)/, '+33');
      contact.phone = normalized;
    }

    // Email: extract first non-noreply / non-example address
    const emailMatches = clean.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    const goodEmail = emailMatches.find(e => !/noreply|no-reply|example\.|sentry|wixpress|wixstudio|godaddy/i.test(e));
    if (goodEmail) contact.email = goodEmail.toLowerCase();

    // Address: look for postal-code patterns (5 digits) or common
    // schema.org/json-ld snippets
    const addrPatterns = [
      /"streetAddress"\s*:\s*"([^"]{5,120})"[\s\S]{0,200}"postalCode"\s*:\s*"(\d{5})"[\s\S]{0,200}"addressLocality"\s*:\s*"([^"]{2,60})"/i,
      /(\d{1,4}[,\s][^,\n<]{4,80}[,\s]\d{5}[,\s][A-ZÉÈÊÀÔÎ][\wÀ-ÿ\-' ]{2,60})/u,
    ];
    for (const re of addrPatterns) {
      const m = clean.match(re);
      if (m) {
        if (re.source.includes('streetAddress')) {
          contact.address = `${m[1]}, ${m[2]} ${m[3]}`.replace(/\s+/g, ' ').trim();
        } else {
          contact.address = m[1].replace(/\s+/g, ' ').trim();
        }
        break;
      }
    }

    // Instagram handle in <a href="instagram.com/...">
    const igLinkMatch = clean.match(/(?:href|src)=["']https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]{2,30})/i);
    if (igLinkMatch && igLinkMatch[1] && !/sharer|p\b|reel|tv/.test(igLinkMatch[1])) {
      contact.instagram = igLinkMatch[1].replace(/\/$/, '');
    }

    return {
      source: 'website',
      website_title: title || undefined,
      website_description: description || undefined,
      signals,
      ambiance,
      signature: [], // signature dishes/services need NLP to extract reliably → leave to Hugo prompt
      audience: '',
      // contact info attached separately so the orchestrator can merge
      // it into the prospect row's essential fields
      ...(Object.keys(contact).length > 0 ? { __contact: contact } : {}),
    } as any;
  } catch {
    return null;
  }
}

/**
 * Fetch Instagram profile + 3 most recent posts via Business Discovery
 * (already used elsewhere). Returns null if the handle can't be
 * resolved or we have no admin IG token to call it.
 */
export async function scrapeInstagram(
  supabase: any,
  handle: string,
): Promise<Partial<BusinessNotes> | null> {
  const cleanHandle = String(handle || '').replace(/^@/, '').trim();
  if (!cleanHandle) return null;

  try {
    const { data: admin } = await supabase
      .from('profiles')
      .select('instagram_business_account_id, facebook_page_access_token')
      .eq('is_admin', true)
      .not('facebook_page_access_token', 'is', null)
      .not('instagram_business_account_id', 'is', null)
      .limit(1)
      .maybeSingle();

    if (!admin?.instagram_business_account_id || !admin?.facebook_page_access_token) return null;
    const igId = admin.instagram_business_account_id;
    const token = admin.facebook_page_access_token;

    const url = `https://graph.facebook.com/v21.0/${igId}?fields=business_discovery.fields(username,name,biography,followers_count,media_count,profile_picture_url,media.limit(3){caption,timestamp,like_count,comments_count,media_url,media_type}).username(${cleanHandle})&access_token=${token}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
    if (!res.ok) return null;
    const data = await res.json();
    const bd = data?.business_discovery;
    if (!bd) return null;

    const bio = (bd.biography || '').slice(0, 300);
    const followers = bd.followers_count || 0;
    const mediaCount = bd.media_count || 0;
    const posts: Array<{ caption: string; like_count: number; media_type: string }> = (bd.media?.data || []).map((m: any) => ({
      caption: (m.caption || '').slice(0, 200),
      like_count: m.like_count || 0,
      media_type: m.media_type || 'UNKNOWN',
    }));

    const signals: string[] = [];
    if (bio) signals.push(`Bio IG: "${bio}"`);
    if (followers) signals.push(`${followers} abonnés, ${mediaCount} posts`);
    if (posts.length) signals.push(`Derniers posts: ${posts.map(p => `"${p.caption.slice(0, 80)}" (${p.like_count} likes)`).join(' | ')}`);

    // Audience inference from follower size
    let audience = '';
    if (followers < 500) audience = 'communauté locale en construction';
    else if (followers < 5000) audience = 'audience locale établie';
    else if (followers < 50000) audience = 'présence régionale solide';
    else audience = 'audience nationale / influenceur';

    return {
      source: 'instagram',
      signals,
      ambiance: [],
      signature: [],
      audience,
      follower_count: followers,
      posts_recent: posts.length,
      insta_bio: bio || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Orchestrator — scrape every available channel for a prospect, merge
 * findings, return the BusinessNotes object ready for persistence.
 * Returns null if nothing was harvestable.
 *
 * Also returns extracted essential contact fields (phone / email /
 * address / instagram) so the caller can fill them in crm_prospects
 * directly — pushing the type-aware completeness % naturally.
 */
export async function harvestBusinessNotes(
  supabase: any,
  prospect: { website?: string | null; instagram?: string | null },
): Promise<(BusinessNotes & { extractedContact?: ExtractedContact }) | null> {
  const tasks: Promise<Partial<BusinessNotes> | null>[] = [];
  if (prospect.website) tasks.push(scrapeWebsite(prospect.website));
  if (prospect.instagram && prospect.instagram !== 'A_VERIFIER') {
    tasks.push(scrapeInstagram(supabase, prospect.instagram));
  }
  if (tasks.length === 0) return null;

  const results = await Promise.all(tasks);
  const valid = results.filter((r): r is Partial<BusinessNotes> => r !== null);
  if (valid.length === 0) return null;

  // Merge
  const merged: BusinessNotes & { extractedContact?: ExtractedContact } = {
    source: valid.length > 1 ? 'mixed' : (valid[0].source || 'website'),
    signals: [],
    signature: [],
    ambiance: [],
    audience: '',
    fetched_at: new Date().toISOString(),
  };
  let collectedContact: ExtractedContact | undefined;
  for (const r of valid) {
    if (r.signals) merged.signals.push(...r.signals);
    if (r.signature) merged.signature.push(...r.signature);
    if (r.ambiance) merged.ambiance.push(...r.ambiance);
    if (r.audience && !merged.audience) merged.audience = r.audience;
    if (r.follower_count) merged.follower_count = r.follower_count;
    if (r.posts_recent) merged.posts_recent = r.posts_recent;
    if (r.insta_bio) merged.insta_bio = r.insta_bio;
    if (r.website_title) merged.website_title = r.website_title;
    if (r.website_description) merged.website_description = r.website_description;
    const rContact = (r as any).__contact as ExtractedContact | undefined;
    if (rContact) {
      collectedContact = collectedContact || {};
      if (rContact.phone && !collectedContact.phone) collectedContact.phone = rContact.phone;
      if (rContact.email && !collectedContact.email) collectedContact.email = rContact.email;
      if (rContact.address && !collectedContact.address) collectedContact.address = rContact.address;
      if (rContact.instagram && !collectedContact.instagram) collectedContact.instagram = rContact.instagram;
    }
  }
  if (collectedContact) merged.extractedContact = collectedContact;
  // De-dup ambiance
  merged.ambiance = Array.from(new Set(merged.ambiance));
  // Cap signals to avoid bloated JSON
  merged.signals = merged.signals.slice(0, 12);

  return merged;
}

/**
 * Render the business_notes into a compact prompt block usable by
 * Hugo's visual brief generator. Returns '' when notes are empty.
 */
export function notesToPromptBlock(notes: BusinessNotes | null | undefined): string {
  if (!notes) return '';
  const parts: string[] = [];
  if (notes.website_description) parts.push(`Pitch: ${notes.website_description}`);
  if (notes.insta_bio) parts.push(`Bio IG: ${notes.insta_bio}`);
  if (notes.ambiance.length) parts.push(`Ambiance détectée: ${notes.ambiance.join(', ')}`);
  if (notes.audience) parts.push(`Audience: ${notes.audience}`);
  if (notes.follower_count) parts.push(`${notes.follower_count} abonnés IG`);
  if (notes.signals.length) parts.push(`Signaux: ${notes.signals.slice(0, 4).join(' | ')}`);
  return parts.join('\n');
}
