/**
 * Pixabay Music helper — picks a royalty-free track that matches a
 * mood and duration target, downloads it, and returns a local buffer
 * the muxer can use.
 *
 * Why Pixabay: free API (just register at pixabay.com/api/), ~14k tracks,
 * commercial-use OK on TikTok/IG/LinkedIn, no per-call cost. Tradeoff vs
 * Epidemic/Artlist: smaller catalog and fewer "current trends" tracks,
 * but zero subscription needed and acceptable quality for B2B social.
 *
 * Founder ask 2026-06-06: "si on peut trouver des librairies libre de
 * droit peut etre c'est mieux". Pixabay is the cleanest starting point —
 * once we have evidence the catalog limits us, we can upgrade to Mubert
 * (AI-mood-matched) or Epidemic (premium catalog, paid).
 *
 * Required env: PIXABAY_API_KEY (free, get one at pixabay.com/api/docs/).
 * Without the key, pickPixabayMusic() returns null and the caller
 * gracefully falls back to a silent video.
 */

const PIXABAY_MUSIC_ENDPOINT = 'https://pixabay.com/api/music/';

/**
 * Mood mapping that gets piped to Pixabay's search.
 * Adapt the mood per reel preset:
 *   - dolly_steam / dish-only static → "ambient cinematic warm"
 *   - guest_enjoying  → "uplifting acoustic feel-good"
 *   - duo_sharing    → "warm jazz dinner intimate"
 *   - chef_kitchen   → "energetic kitchen rhythmic"
 *   - parallax       → "calm minimal soft piano"
 *   - window_light   → "soft ambient slow"
 */
export type MusicMood =
  | 'ambient_warm'
  | 'uplifting_acoustic'
  | 'warm_jazz_intimate'
  | 'energetic_kitchen'
  | 'calm_minimal'
  | 'soft_ambient_slow';

const MOOD_QUERIES: Record<MusicMood, string> = {
  ambient_warm: 'ambient cinematic warm restaurant',
  uplifting_acoustic: 'uplifting acoustic feel-good',
  warm_jazz_intimate: 'warm jazz dinner intimate',
  energetic_kitchen: 'upbeat rhythmic positive',
  calm_minimal: 'calm minimal soft piano',
  soft_ambient_slow: 'soft ambient slow contemplative',
};

export interface PixabayTrack {
  /** ID we log so we never reuse the same track within 7 days for the same client */
  id: number;
  url: string;
  duration: number;
  tags: string;
  user: string;
}

/**
 * Pick a track that:
 *   - matches the mood query
 *   - has duration >= minDurationSec (so we can crop, not stretch)
 *   - hasn't been used by this client in recentlyUsedIds
 * Returns null if no Pixabay key, no match, or HTTP error.
 */
export async function pickPixabayMusic(opts: {
  mood: MusicMood;
  minDurationSec?: number;
  recentlyUsedIds?: number[];
}): Promise<PixabayTrack | null> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) {
    console.warn('[pixabay-music] PIXABAY_API_KEY not set — skipping music');
    return null;
  }
  const q = MOOD_QUERIES[opts.mood] || 'ambient cinematic warm';
  const minDur = opts.minDurationSec ?? 5;
  const recentSet = new Set(opts.recentlyUsedIds || []);
  try {
    const url = `${PIXABAY_MUSIC_ENDPOINT}?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&per_page=30&safesearch=true`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) {
      console.warn('[pixabay-music] HTTP', r.status);
      return null;
    }
    const data = await r.json();
    const hits: any[] = data.hits || [];
    if (hits.length === 0) return null;
    // Filter by min duration and freshness
    const eligible = hits.filter((h) => (h.duration || 0) >= minDur && !recentSet.has(h.id));
    const pool = eligible.length > 0 ? eligible : hits;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    if (!picked || !picked.audio) return null;
    return {
      id: picked.id,
      url: picked.audio,
      duration: picked.duration || 0,
      tags: picked.tags || '',
      user: picked.user || '',
    };
  } catch (e: any) {
    console.warn('[pixabay-music] threw:', e?.message);
    return null;
  }
}

/**
 * Download the track to a buffer ready for ffmpeg.
 * Caller handles the actual muxing.
 */
export async function downloadTrack(url: string): Promise<Buffer | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
}
