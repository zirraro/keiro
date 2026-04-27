/**
 * Rich Instagram profile snapshot via business_discovery.
 *
 * Where verifyInstagramHandle just answers "does this account exist?",
 * this helper returns everything Jade needs to write a DM that proves
 * she actually looked at the profile — biography, website, recent post
 * captions, engagement counts.
 *
 * Usage pattern: call right before generating/sending a DM or reply.
 * The response is designed to be fed directly into an AI system prompt.
 *
 * Important: business_discovery is only exposed on graph.facebook.com
 * with a Page access token. IGAA tokens on graph.instagram.com reject
 * this field with "Tried accessing nonexisting field (business_discovery)".
 */

export interface IgProfileSnapshotPost {
  id: string;
  caption: string;       // trimmed to ~200 chars
  like_count: number;
  comments_count: number;
  timestamp?: string;
  media_type?: string;
  permalink?: string;
  media_url?: string;    // direct image/video URL — fed to Sonnet vision
}

export interface IgProfileSnapshot {
  exists: boolean;
  username?: string;
  biography?: string;
  website?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
  profile_picture_url?: string;
  recent_posts: IgProfileSnapshotPost[];
  canLikelyReceiveDm: boolean;
  rawError?: string;
}

/**
 * Fetch a deep snapshot of a public IG business/creator account.
 *
 * @param handle   Raw handle — @ and urls stripped automatically.
 * @param ourIgId  The client's (or admin's) IG business account ID used
 *                 as the looker-upper in business_discovery.
 * @param ourToken Facebook Page access token paired with ourIgId.
 */
export async function getInstagramProfileSnapshot(
  handle: string,
  ourIgId: string,
  ourToken: string,
): Promise<IgProfileSnapshot> {
  const clean = (handle || '')
    .replace(/^@/, '')
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/[/?#].*$/, '')
    .replace(/\s/g, '')
    .trim()
    .toLowerCase();

  if (!clean || clean.length < 2 || clean === 'a_verifier') {
    return { exists: false, recent_posts: [], canLikelyReceiveDm: false, rawError: 'empty_handle' };
  }

  // Deep field set: profile meta + last 5 posts. business_discovery returns
  // these in a single request, so this is one HTTP round-trip per prospect.
  const mediaFields = 'id,caption,like_count,comments_count,timestamp,media_type,permalink,media_url,thumbnail_url';
  const bdFields = [
    'id',
    'username',
    'biography',
    'website',
    'followers_count',
    'follows_count',
    'media_count',
    'profile_picture_url',
    `media.limit(5){${mediaFields}}`,
  ].join(',');

  const url = `https://graph.facebook.com/v21.0/${ourIgId}` +
    `?fields=business_discovery.username(${encodeURIComponent(clean)}){${bdFields}}` +
    `&access_token=${encodeURIComponent(ourToken)}`;

  try {
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    const bd = data?.business_discovery;

    if (!bd?.id) {
      const err = data?.error?.message || 'no_business_discovery';
      return {
        exists: false,
        recent_posts: [],
        canLikelyReceiveDm: false,
        rawError: String(err).substring(0, 200),
      };
    }

    const rawPosts = (bd.media?.data || []) as any[];
    const posts: IgProfileSnapshotPost[] = rawPosts.map(p => ({
      id: p.id,
      caption: String(p.caption || '').substring(0, 200).trim(),
      like_count: typeof p.like_count === 'number' ? p.like_count : 0,
      comments_count: typeof p.comments_count === 'number' ? p.comments_count : 0,
      timestamp: p.timestamp,
      media_type: p.media_type,
      permalink: p.permalink,
      media_url: p.media_url || p.thumbnail_url || undefined,
    }));

    const followers = typeof bd.followers_count === 'number' ? bd.followers_count : undefined;
    const media = typeof bd.media_count === 'number' ? bd.media_count : undefined;

    return {
      exists: true,
      username: bd.username || clean,
      biography: bd.biography || undefined,
      website: bd.website || undefined,
      followers_count: followers,
      follows_count: typeof bd.follows_count === 'number' ? bd.follows_count : undefined,
      media_count: media,
      profile_picture_url: bd.profile_picture_url || undefined,
      recent_posts: posts,
      canLikelyReceiveDm: (followers ?? 0) > 5 && (media ?? 0) > 2,
    };
  } catch (e: any) {
    return {
      exists: false,
      recent_posts: [],
      canLikelyReceiveDm: false,
      rawError: (e?.message || 'fetch_error').substring(0, 200),
    };
  }
}

/**
 * Vision-based profile classification — looks at up to 3 recent
 * media URLs from the snapshot and asks Sonnet to summarize WHO
 * this account belongs to (existing business vs aspirational
 * entrepreneur vs personal account vs creator) so Jade can choose
 * the right CTA (USE KeiroAI vs WHITE-LABEL agency).
 *
 * Returns null when ANTHROPIC_API_KEY missing or no usable images.
 * Cost: ~€0.01 per call (Sonnet vision, 3 small images, 200 tokens
 * out). Cached implicitly by the calling site if needed.
 */
export type ProfileVisionRead = {
  // Sonnet's primary classification
  intent: 'has_business' | 'launching' | 'entrepreneur_curious' | 'personal' | 'creator' | 'unclear';
  // 1-sentence summary of the visual identity — useful for Jade's reply
  visual_summary: string;
  // Whether the account looks ready to USE KeiroAI as B2C, or fit
  // for the WHITE-LABEL B2B agency model.
  best_offer: 'use_keiroai' | 'white_label_agency' | 'unsure';
  // Confidence 0..1
  confidence: number;
};

export async function readProfileFromVisuals(snap: IgProfileSnapshot): Promise<ProfileVisionRead | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!snap.exists) return null;
  const images = snap.recent_posts
    .filter(p => p.media_url && (p.media_type === 'IMAGE' || p.media_type === 'CAROUSEL_ALBUM' || !p.media_type))
    .slice(0, 3)
    .map(p => p.media_url!) as string[];
  if (images.length === 0) return null;

  const system = `You analyse an Instagram profile to help an outbound DM agent (Jade) pick the RIGHT offer for the person. There are TWO products:

A. USE KeiroAI directly — for someone who has a business / is about to launch / has a clear project. Subscription, 7-day free trial, B2C.
B. WHITE-LABEL AGENCY — for someone who's curious about entrepreneurship but has NO business yet. They rebrand KeiroAI under their name and resell to clients. B2B partner program.

You see 1-3 recent posts from their account + their bio + stats. Classify them.

CLASSIFICATION RULES:
- "has_business" → bio mentions a business name, posts show products/services/customers/team. Offer A.
- "launching" → bio mentions 'coming soon', 'lance', 'projet en cours'. Offer A.
- "entrepreneur_curious" → bio mentions 'entrepreneur', 'business mindset', 'startup life', 'side hustle' WITHOUT a clear business. Posts are mostly motivational quotes, business tips, mindset content. → Offer B (white label).
- "personal" → no business signal at all (lifestyle, family, travel, food). Probably skip both.
- "creator" → influencer / artist / coach with engaged audience. Offer A makes sense.
- "unclear" → not enough signal.

Return STRICT JSON:
{
  "intent": "has_business" | "launching" | "entrepreneur_curious" | "personal" | "creator" | "unclear",
  "visual_summary": "1 sentence describing what we see (the actual images)",
  "best_offer": "use_keiroai" | "white_label_agency" | "unsure",
  "confidence": 0..1
}

JSON only.`;

  const bioBlock = `Username: @${snap.username}\nBio: "${(snap.biography || '(empty)').substring(0, 280)}"\nFollowers: ${snap.followers_count ?? '?'}\nMedia count: ${snap.media_count ?? '?'}\nWebsite: ${snap.website || 'none'}\n\nLook at the ${images.length} recent posts to confirm.`;

  try {
    const content: any[] = [{ type: 'text', text: bioBlock }];
    for (const img of images) {
      content.push({ type: 'image', source: { type: 'url', url: img } });
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 250,
        system,
        messages: [{ role: 'user', content }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const txt = (data.content?.[0]?.text || '').trim();
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    const validIntents = ['has_business', 'launching', 'entrepreneur_curious', 'personal', 'creator', 'unclear'];
    const validOffers = ['use_keiroai', 'white_label_agency', 'unsure'];
    return {
      intent: validIntents.includes(parsed.intent) ? parsed.intent : 'unclear',
      visual_summary: typeof parsed.visual_summary === 'string' ? parsed.visual_summary.slice(0, 200) : '',
      best_offer: validOffers.includes(parsed.best_offer) ? parsed.best_offer : 'unsure',
      confidence: Number.isFinite(parsed.confidence) ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
    };
  } catch {
    return null;
  }
}

/**
 * Format the snapshot as a tight text block for the AI system prompt.
 * Intentionally terse so it doesn't dominate the prompt and fits under
 * the token budget even when we add other context.
 */
export function snapshotToPromptContext(snap: IgProfileSnapshot, vision?: ProfileVisionRead | null): string {
  if (!snap.exists) {
    return `PROFIL INSTAGRAM @${snap.username || '?'} : introuvable via business_discovery (peut être un compte perso ou privé).`;
  }

  const lines: string[] = [];
  lines.push(`PROFIL INSTAGRAM @${snap.username} (analysé à l'instant via business_discovery) :`);
  if (snap.biography) lines.push(`- Bio : "${snap.biography.substring(0, 300)}"`);
  if (snap.website) lines.push(`- Site : ${snap.website}`);
  const stats = [
    typeof snap.followers_count === 'number' ? `${snap.followers_count} abonnés` : null,
    typeof snap.media_count === 'number' ? `${snap.media_count} posts` : null,
  ].filter(Boolean).join(' · ');
  if (stats) lines.push(`- Activité : ${stats}`);

  if (snap.recent_posts.length > 0) {
    lines.push(`- 5 derniers posts (plus récents en premier) :`);
    for (const p of snap.recent_posts) {
      const caption = p.caption ? `"${p.caption}"` : '(sans légende)';
      const engagement = `${p.like_count} likes, ${p.comments_count} commentaires`;
      lines.push(`  • ${caption} [${engagement}]`);
    }
  } else {
    lines.push(`- Aucun post récent disponible.`);
  }

  if (!snap.canLikelyReceiveDm) {
    lines.push(`- ⚠️ Compte peu actif (peu de followers ou peu de posts) — DM pourrait rester sans réponse.`);
  }

  // Vision-based classification — gives Jade the killer hint for picking
  // between the B2C "use KeiroAI" pitch and the B2B "white-label agency" pitch.
  if (vision) {
    lines.push('');
    lines.push(`ANALYSE VISUELLE (Sonnet) :`);
    lines.push(`- Profil détecté : ${vision.intent} (confiance ${Math.round(vision.confidence * 100)}%)`);
    lines.push(`- Identité visuelle : ${vision.visual_summary}`);
    lines.push(`- Offre recommandée : ${vision.best_offer === 'use_keiroai' ? 'OFFRE A — utiliser KeiroAI directement (B2C)' : vision.best_offer === 'white_label_agency' ? 'OFFRE B — marque blanche / agence partenaire (B2B)' : 'incertain — pose une question avant de choisir'}`);
  }

  return lines.join('\n');
}
