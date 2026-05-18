/**
 * Realistic-but-fake Instagram / TikTok / LinkedIn insight numbers used
 * as PLACEHOLDER data when the user hasn't connected the network yet.
 *
 * Why: a brand-new workspace with zeros everywhere reads as "the product
 * is broken". Showing realistic sample numbers in disconnected panels
 * — with a prominent SAMPLE badge — gives the user a preview of what
 * the dashboard will look like once they connect, and removes the
 * empty-page feeling on first login.
 *
 * The values intentionally look like a small local business doing decent
 * but not viral numbers — so they feel plausible. Every consumer MUST
 * pair these with the `isSample: true` flag + a "Sample data" banner
 * so the user is never confused about what's real.
 */

export interface SampleNetworkInsights {
  isSample: true;
  followersCount: number;
  postsCount: number;
  likes: number;
  comments: number;
  reach: number;
  engagement: number; // percentage
}

export const SAMPLE_INSTAGRAM: SampleNetworkInsights = {
  isSample: true,
  followersCount: 2840,
  postsCount: 178,
  likes: 4760,
  comments: 312,
  reach: 1240,
  engagement: 3.6,
};

export const SAMPLE_TIKTOK: SampleNetworkInsights = {
  isSample: true,
  followersCount: 1120,
  postsCount: 42,
  likes: 8400,
  comments: 280,
  reach: 0,
  engagement: 5.2,
};

export const SAMPLE_LINKEDIN: SampleNetworkInsights = {
  isSample: true,
  followersCount: 470,
  postsCount: 28,
  likes: 320,
  comments: 64,
  reach: 0,
  engagement: 2.1,
};

export function sampleFor(network: 'instagram' | 'tiktok' | 'linkedin'): SampleNetworkInsights {
  if (network === 'tiktok') return SAMPLE_TIKTOK;
  if (network === 'linkedin') return SAMPLE_LINKEDIN;
  return SAMPLE_INSTAGRAM;
}
