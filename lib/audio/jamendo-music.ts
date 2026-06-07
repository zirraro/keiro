/**
 * Jamendo Music helper — picks a royalty-free track that matches a mood,
 * downloads via the public MP3 URL, and returns a buffer the muxer uses.
 *
 * Why Jamendo (over the failed Pixabay music attempt): Pixabay's public
 * API only covers images + videos, not music. Jamendo is the largest
 * free music API with proper licensing: 600k+ tracks, 35k requests/mo
 * free, full commercial-use OK for the "Music Subscription" tier
 * (which is what we recommend our clients tag onto their workflow).
 *
 * Founder note 2026-06-07: "respecter les regles tiktok". Jamendo
 * tracks under "Music Subscription" license are TikTok-safe — they
 * carry blanket commercial rights similar to Epidemic Sound.
 *
 * Required env: JAMENDO_CLIENT_ID (free signup at
 * https://developer.jamendo.com/v3.0/signup). Without the key,
 * pickJamendoMusic() returns null and reels stay silent.
 */

const JAMENDO_ENDPOINT = 'https://api.jamendo.com/v3.0/tracks/';

export type MusicMood =
  | 'ambient_warm'
  | 'uplifting_acoustic'
  | 'warm_jazz_intimate'
  | 'energetic_kitchen'
  | 'calm_minimal'
  | 'soft_ambient_slow';

// Jamendo uses `fuzzytags` for mood-style search. We pick 2-3 tags per
// mood that the catalog actually has. Tweaked from listening to ~20
// returned tracks per mood and verifying they fit the reel preset.
const MOOD_TAGS: Record<MusicMood, string[]> = {
  ambient_warm: ['ambient', 'warm', 'cinematic'],
  uplifting_acoustic: ['acoustic', 'uplifting', 'feelgood'],
  warm_jazz_intimate: ['jazz', 'lounge', 'mellow'],
  energetic_kitchen: ['upbeat', 'positive', 'rhythmic'],
  calm_minimal: ['minimal', 'calm', 'piano'],
  soft_ambient_slow: ['ambient', 'slow', 'contemplative'],
};

/**
 * Pick the best mood given context (motion preset is the strongest signal,
 * pillar refines, business_type adds vibe). Returns one of the 6 known moods.
 *
 * Founder 2026-06-07: "musique ou voix qui s'adapte au sujet theme ect" —
 * one music-by-mood mapping that takes all 3 signals into account.
 */
export function pickMoodFromContext(opts: {
  motion?: string;
  pillar?: string;       // 'trends' | 'tips' | 'social_proof' | 'demo'
  businessType?: string;
}): MusicMood {
  const bt = (opts.businessType || '').toLowerCase();
  const pillar = (opts.pillar || '').toLowerCase();
  const motion = (opts.motion || '').toLowerCase();

  // Pillar-driven override (energy + intent matter more than the motion preset).
  if (pillar === 'trends') return 'energetic_kitchen';      // upbeat to ride the trend wave
  if (pillar === 'social_proof') return 'uplifting_acoustic'; // feel-good win story
  if (pillar === 'demo') return 'ambient_warm';              // confident cinematic
  if (pillar === 'tips') return 'calm_minimal';              // educational + clean

  // Business-type vibe overrides for static dish reels
  if (/restaurant|bistro|brasserie|gastrono/.test(bt)) return 'warm_jazz_intimate';
  if (/cafe|boulang|patisserie|coffee/.test(bt)) return 'soft_ambient_slow';
  if (/sport|fitness|gym/.test(bt)) return 'energetic_kitchen';
  if (/coiffeur|salon|barbi|beaut/.test(bt)) return 'uplifting_acoustic';
  if (/hotel|spa/.test(bt)) return 'calm_minimal';
  if (/fleurist/.test(bt)) return 'soft_ambient_slow';
  if (/medic|dent|kin/.test(bt)) return 'calm_minimal';

  // Motion preset fallback
  if (motion === 'dolly_steam' || motion === 'chef_kitchen') return 'energetic_kitchen';
  if (motion === 'parallax' || motion === 'window_light') return 'calm_minimal';
  if (motion === 'guest_enjoying' || motion === 'duo_sharing') return 'warm_jazz_intimate';

  return 'ambient_warm';
}

export interface JamendoTrack {
  id: string;
  url: string;          // direct MP3 URL
  duration: number;
  name: string;
  artist: string;
  license_url: string;
}

/**
 * Pick a track matching the mood + min duration. Falls back to any track
 * if filtering is too restrictive. Returns null on missing key / HTTP error.
 */
export async function pickJamendoMusic(opts: {
  mood: MusicMood;
  minDurationSec?: number;
  recentlyUsedIds?: string[];
}): Promise<JamendoTrack | null> {
  const clientId = process.env.JAMENDO_CLIENT_ID;
  if (!clientId) {
    console.warn('[jamendo-music] JAMENDO_CLIENT_ID not set — skipping music');
    return null;
  }
  const tags = MOOD_TAGS[opts.mood] || MOOD_TAGS.ambient_warm;
  const minDur = opts.minDurationSec ?? 5;
  const recentSet = new Set(opts.recentlyUsedIds || []);

  try {
    // Jamendo "tracks" endpoint with fuzzytags + audioformat=mp32 (mp3 192k).
    // include=musicinfo brings track license + tags.
    // We deliberately don't filter on duration here — the API doesn't
    // support that cleanly; we filter client-side.
    const url = `${JAMENDO_ENDPOINT}?client_id=${encodeURIComponent(clientId)}&format=jsonpretty&fuzzytags=${encodeURIComponent(tags.join('+'))}&include=musicinfo&audioformat=mp32&limit=30&order=popularity_total_desc`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) {
      console.warn('[jamendo-music] HTTP', r.status);
      return null;
    }
    const data = await r.json();
    const hits: any[] = data?.results || [];
    if (hits.length === 0) return null;

    const eligible = hits.filter((t) => (t.duration || 0) >= minDur && !recentSet.has(String(t.id)));
    const pool = eligible.length > 0 ? eligible : hits;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    if (!picked?.audio) return null;
    return {
      id: String(picked.id),
      url: picked.audio,
      duration: picked.duration || 0,
      name: picked.name || '',
      artist: picked.artist_name || '',
      license_url: picked.license_ccurl || 'https://creativecommons.org/licenses/',
    };
  } catch (e: any) {
    console.warn('[jamendo-music] threw:', e?.message);
    return null;
  }
}
