/**
 * 2026-06-03 — Trend Winners Extractor.
 *
 * Founder ask: "tu peux analyser les images et vidéos qui fonctionnent
 * bien via scraping TikTok trend et Insta et LinkedIn et tu prends le
 * hook qui fonctionne et les caractéristiques et sujets qui fonctionnent
 * pour faire les liens avec le business du client KeiroAI et générer
 * comme des contenus qui surperforment".
 *
 * Pipeline:
 *   1. fetchAllTrends() agrège Google + TikTok + Insta + LinkedIn
 *   2. extractWinningPatterns() utilise Gemini pour identifier les hooks
 *      gagnants par secteur business
 *   3. Stocke dans content_trend_winners (TTL 30j)
 *   4. Lena consulte cette table avant de générer un post
 *
 * Plus tard (V2): scraping direct des Reels/TikToks via APIs publiques
 * pour extraire engagement_score réel et palette/framing visuels.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllTrends } from './index';

export interface WinningPattern {
  platform: 'instagram' | 'tiktok' | 'linkedin';
  sector: string;
  format: 'reel' | 'carousel' | 'post' | 'story' | 'video' | 'text';
  hook_text: string;
  hook_pattern: string; // pattern réutilisable, ex: "[Number] [outcome] in [time]"
  subject_summary: string;
  visual_characteristics: {
    palette?: string;
    framing?: string;
    composition?: string;
    style?: string;
  };
  hashtags?: string[];
}

const SECTORS_TO_COVER = [
  'restaurant', 'boutique', 'coiffeur', 'barbier', 'salon_beaute',
  'coach', 'photographe', 'fleuriste', 'patisserie', 'boulangerie',
  'cafe', 'bar', 'hotel', 'caviste', 'traiteur',
];

/**
 * Use Gemini to convert raw trend feeds into actionable winning patterns
 * organized by sector. Stored in content_trend_winners.
 */
export async function extractAndStoreWinners(supabase: SupabaseClient): Promise<{
  inserted: number;
  expired_purged: number;
  by_sector: Record<string, number>;
}> {
  // 1. Purge expired patterns (>30 days)
  const { count: expiredCount } = await supabase
    .from('content_trend_winners')
    .delete({ count: 'exact' })
    .lt('expires_at', new Date().toISOString());

  // 2. Fetch latest trends
  const trends = await fetchAllTrends(false, 'fr');

  // Top trends to feed Gemini
  const topGoogle = trends.googleTrends.slice(0, 15).map(t => `Google: "${t.title}" (traffic=${t.traffic || '?'})`).join('\n');
  const topTiktok = trends.tiktokRealHashtags.slice(0, 15).map(t => `TikTok: ${t.hashtag} (views=${t.viewsFormatted || t.views || '?'})`).join('\n');
  const topInsta = trends.instagramHashtags.slice(0, 15).map(h => `Insta: ${h.hashtag} (${h.posts || h.engagement || '?'} posts)`).join('\n');
  // LinkedIn trends are less structured; map from socialTrends
  const topLinkedin = trends.linkedinTrends.slice(0, 10).map(t => `LinkedIn: ${t.keyword || t.title}`).join('\n');

  const prompt = `Tu es un expert en contenu social media qui analyse ce qui PERFORME en ce moment sur les réseaux.

TENDANCES BRUTES DU JOUR :
=== Google Trends ===
${topGoogle}

=== TikTok ===
${topTiktok}

=== Instagram ===
${topInsta}

=== LinkedIn ===
${topLinkedin}

MISSION : pour chacun des secteurs suivants, identifie 1-3 PATTERNS GAGNANTS adaptables au business.

SECTEURS : ${SECTORS_TO_COVER.join(', ')}

POUR CHAQUE PATTERN, retourne :
- platform : "tiktok" / "instagram" / "linkedin"
- sector : un des secteurs ci-dessus
- format : "reel" / "carousel" / "post" / "story"
- hook_text : le hook PRÉCIS qui marche (ex: "POV: tu rentres dans le meilleur kebab de Paris")
- hook_pattern : la formule réutilisable (ex: "POV: tu [action] dans le meilleur [lieu] de [ville]")
- subject_summary : 1 phrase sur le sujet
- visual_characteristics : { palette, framing, composition, style }
- hashtags : 3-5 hashtags FR pertinents

Output JSON strict :
{
  "patterns": [
    { "platform": "...", "sector": "...", "format": "...", "hook_text": "...", "hook_pattern": "...", "subject_summary": "...", "visual_characteristics": {...}, "hashtags": [...] }
  ]
}

Cible : 20-30 patterns total, bien répartis entre les secteurs et plateformes.
Privilégie les hooks qui marchent sur les NICHES locales (resto, boutique, etc.) — pas le contenu lifestyle générique.
Sortie : JSON pur, zéro markdown.`;

  const { callGemini } = await import('@/lib/agents/gemini');
  let patterns: WinningPattern[] = [];
  try {
    const raw = await callGemini({
      system: 'Tu es un analyste social media expert. Output JSON strict uniquement.',
      message: prompt,
      maxTokens: 4000,
    });
    let txt = (raw || '').trim().replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    const parsed = JSON.parse(txt);
    patterns = Array.isArray(parsed.patterns) ? parsed.patterns : [];
  } catch (e: any) {
    console.error('[winners-extractor] Gemini parse failed:', e?.message?.slice(0, 200));
    return { inserted: 0, expired_purged: expiredCount || 0, by_sector: {} };
  }

  if (patterns.length === 0) {
    return { inserted: 0, expired_purged: expiredCount || 0, by_sector: {} };
  }

  // 3. Insert into content_trend_winners
  const rows = patterns.slice(0, 50).map(p => ({
    platform: p.platform,
    sector: p.sector,
    format: p.format,
    hook_text: String(p.hook_text || '').slice(0, 500),
    hook_pattern: String(p.hook_pattern || '').slice(0, 500),
    subject_summary: String(p.subject_summary || '').slice(0, 500),
    visual_characteristics: p.visual_characteristics || {},
    hashtags: p.hashtags || [],
    source_username: 'gemini_synthesis',
    effectiveness_score: 50, // baseline; will be updated when client posts using this pattern perform
  }));

  const { error: insertErr } = await supabase
    .from('content_trend_winners')
    .insert(rows);
  if (insertErr) {
    console.error('[winners-extractor] Insert failed:', insertErr.message);
    return { inserted: 0, expired_purged: expiredCount || 0, by_sector: {} };
  }

  const bySector: Record<string, number> = {};
  for (const p of patterns) {
    bySector[p.sector] = (bySector[p.sector] || 0) + 1;
  }

  return {
    inserted: rows.length,
    expired_purged: expiredCount || 0,
    by_sector: bySector,
  };
}

/**
 * Fetch the top winning patterns for a given sector. Lena uses this
 * before generating a post to anchor the content on what actually works.
 */
export async function getWinnersForSector(
  supabase: SupabaseClient,
  sector: string,
  platform?: string,
  limit: number = 5,
): Promise<WinningPattern[]> {
  let q = supabase
    .from('content_trend_winners')
    .select('platform, sector, format, hook_text, hook_pattern, subject_summary, visual_characteristics, hashtags')
    .eq('sector', sector.toLowerCase())
    .gte('expires_at', new Date().toISOString())
    .order('effectiveness_score', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (platform) q = q.eq('platform', platform);

  const { data } = await q;
  return (data || []) as WinningPattern[];
}

/**
 * Format winners for inclusion in Lena's content prompt. Returns the
 * block to inject just before generation.
 */
export function formatWinnersForPrompt(patterns: WinningPattern[]): string {
  if (patterns.length === 0) return '';
  const lines: string[] = ['', '━━━ HOOKS GAGNANTS du moment sur ce secteur (à adapter au client) ━━━'];
  for (const p of patterns) {
    lines.push(`• [${p.platform.toUpperCase()} ${p.format}] Hook: "${p.hook_text}"`);
    if (p.hook_pattern) lines.push(`  Formule réutilisable: ${p.hook_pattern}`);
    if (p.subject_summary) lines.push(`  Sujet: ${p.subject_summary}`);
    if (p.visual_characteristics?.style) lines.push(`  Style visuel: ${p.visual_characteristics.style}`);
  }
  lines.push('');
  lines.push('➡️ Inspire-toi d\'UN de ces patterns pour ton post. Adapte le hook au business spécifique du client (son nom, son angle, son produit phare). NE COPIE PAS littéralement — adapte la formule.');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  return lines.join('\n');
}
