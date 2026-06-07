/**
 * Score TikTok prospects against a client's audience persona.
 *
 * Today the JadeTiktokLive follows tab just lists prospects sorted by an
 * arbitrary score (often 0). Founder ask 2026-06-07: "analyse de compte
 * à follow trouve un moyen de faire ca pour proposer des comptes a
 * follows selon cible du client".
 *
 * Pipeline per prospect:
 *   1. scrapeTiktok() pulls bio + ambiance + domaine (already in lib).
 *   2. callMatchModel() asks Haiku 4.5 to score 0-100 the match between
 *      the prospect's profile and the client's audience persona +
 *      business_type + value_proposition.
 *   3. Write back into crm_prospects.score + crm_prospects.business_notes
 *      (JSONB key 'tiktok_match_reason').
 *
 * Used by a hourly cron that processes up to 30 unscored TikTok prospects
 * per client (cheap: each scoring = 1 Haiku call ~€0.001).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { scrapeTiktok } from './prospect-scraper';

interface ScoreResult {
  score: number;       // 0-100
  reason: string;      // one-line rationale
  signals: string[];   // 2-4 short tags ("foodie 30+", "Paris-based", etc.)
}

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

async function callMatchModel(opts: {
  prospectProfile: {
    handle: string;
    bio?: string;
    domaine?: string[];
    ambiance?: string[];
    follower_count?: number;
  };
  clientPersona: string;
  businessType?: string;
  valueProposition?: string;
}): Promise<ScoreResult | null> {
  if (!ANTHROPIC_KEY) return null;
  const profileSummary = [
    `Handle: ${opts.prospectProfile.handle}`,
    opts.prospectProfile.follower_count != null ? `Followers: ${opts.prospectProfile.follower_count}` : '',
    opts.prospectProfile.bio ? `Bio: ${opts.prospectProfile.bio.substring(0, 280)}` : '',
    opts.prospectProfile.domaine?.length ? `Domaines: ${opts.prospectProfile.domaine.join(', ')}` : '',
    opts.prospectProfile.ambiance?.length ? `Ambiance: ${opts.prospectProfile.ambiance.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  const system = `Tu es l'analyste prospection senior de KeiroAI. Pour un compte TikTok donné et la cible audience d'un client, tu retournes un score de matching 0-100 + 1 ligne de justification + 2-4 signaux courts (tags). STRICTEMENT JSON.

CRITÈRES (priorité décroissante) :
1. Audience overlap : le profil prospect correspond-il à la cible décrite par le client ? (~50% du score)
2. Engagement & influence : taille de communauté pertinente pour le secteur (~20%)
3. Cohérence sectorielle : le domaine du prospect est-il complémentaire/aligné avec le business du client ? (~20%)
4. Géo/timing : prospect dans la même zone ou créant une opportunité saisonnière (~10%)

SORTIE STRICTE :
{"score": <int 0-100>, "reason": "<une phrase concrète>", "signals": ["<tag 1>", "<tag 2>", ...]}
JSON only.`;

  const message = `CLIENT:
- Business type: ${opts.businessType || 'unknown'}
- Value proposition: ${opts.valueProposition || 'unknown'}
- Audience cible: ${opts.clientPersona}

PROSPECT TIKTOK:
${profileSummary}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 250,
        system,
        messages: [{ role: 'user', content: message }],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const text = data?.content?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const score = Math.max(0, Math.min(100, parseInt(String(parsed.score), 10) || 0));
    return {
      score,
      reason: String(parsed.reason || '').substring(0, 180),
      signals: Array.isArray(parsed.signals) ? parsed.signals.map((x: any) => String(x).substring(0, 32)).slice(0, 4) : [],
    };
  } catch {
    return null;
  }
}

/**
 * Score one TikTok prospect for a given client and persist the result.
 * Returns the score (or null on failure).
 */
export async function scoreOneTiktokProspect(
  supabase: SupabaseClient,
  prospectId: string,
  ctx: { audiencePersona: string; businessType?: string; valueProposition?: string },
): Promise<ScoreResult | null> {
  const { data: prospect } = await supabase
    .from('crm_prospects')
    .select('id, tiktok_handle, business_notes')
    .eq('id', prospectId)
    .maybeSingle();
  if (!prospect?.tiktok_handle) return null;

  // Pull fresh scrape (cached at the scrapeTiktok level already if any)
  const scraped = await scrapeTiktok(prospect.tiktok_handle);
  if (!scraped) return null;

  const result = await callMatchModel({
    prospectProfile: {
      handle: prospect.tiktok_handle,
      bio: scraped.insta_bio || (scraped.website_description as any),
      domaine: (scraped as any).domaine,
      ambiance: scraped.ambiance,
      follower_count: scraped.follower_count,
    },
    clientPersona: ctx.audiencePersona,
    businessType: ctx.businessType,
    valueProposition: ctx.valueProposition,
  });
  if (!result) return null;

  const notes = (prospect.business_notes as any) || {};
  notes.tiktok_match_reason = result.reason;
  notes.tiktok_match_signals = result.signals;
  notes.tiktok_match_scored_at = new Date().toISOString();

  await supabase.from('crm_prospects')
    .update({ score: result.score, business_notes: notes })
    .eq('id', prospect.id);

  return result;
}
