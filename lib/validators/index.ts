/**
 * Validator orchestrator. Runs caption + visual-coherence checks on a
 * post, returns an aggregated result. Caller decides what to do with
 * `result.severity`:
 *
 *   - 'block'  → don't publish. Mark status='draft_qa_failed' + notes.
 *   - 'warn'   → publish but log into agent_logs for supervisor audit.
 *   - 'info' / 'clean' → publish silently.
 *
 * Fetches recent_posts for the client/platform if the caller didn't
 * pre-fetch — but caller SHOULD pre-fetch when validating in bulk
 * (e.g. weekly plan generation) to avoid N+1 queries.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { validateCaption } from './caption';
import { validateVisualCoherence } from './visual-coherence';
import type { PostInput, ValidationContext, Finding, ValidationResult } from './types';
import { aggregate } from './types';

export type { Finding, ValidationResult, Severity, PostInput, ValidationContext } from './types';

async function fetchRecentPosts(supabase: SupabaseClient, userId: string, platform?: string, days = 30) {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  let q = supabase
    .from('content_calendar')
    .select('id, caption, visual_url, visual_description, format, platform, hook, published_at, created_at')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(60);
  if (platform) q = q.eq('platform', platform);
  const { data } = await q;
  return data || [];
}

export async function validatePost(
  supabase: SupabaseClient,
  post: PostInput,
  ctx: Omit<ValidationContext, 'recent_posts'> & { recent_posts?: ValidationContext['recent_posts'] },
): Promise<ValidationResult> {
  // Pre-fetch recent posts once for both validators
  let recent = ctx.recent_posts;
  if (!recent) {
    recent = await fetchRecentPosts(supabase, ctx.user_id, post.platform || ctx.platform);
  }
  const fullCtx: ValidationContext = { ...ctx, recent_posts: recent };

  const capResult = validateCaption(post, fullCtx);
  const visResult = validateVisualCoherence(post, fullCtx);

  const allFindings: Finding[] = [...capResult.findings, ...visResult.findings];
  return aggregate(allFindings);
}

/**
 * Validate many posts at once (e.g. a weekly plan). Pre-fetches recent
 * posts once, reuses for every check. Returns per-post result + a
 * summary at the end.
 */
export async function validatePostBatch(
  supabase: SupabaseClient,
  posts: PostInput[],
  ctx: Omit<ValidationContext, 'recent_posts'>,
): Promise<{ results: ValidationResult[]; summary: { ok: number; warn: number; block: number; avg_quality: number } }> {
  const recent = await fetchRecentPosts(supabase, ctx.user_id, ctx.platform);
  const results: ValidationResult[] = [];
  let ok = 0, warn = 0, block = 0;
  let qSum = 0;

  for (const p of posts) {
    const fullCtx: ValidationContext = { ...ctx, recent_posts: recent };
    const cap = validateCaption(p, fullCtx);
    const vis = validateVisualCoherence(p, fullCtx);
    const merged = aggregate([...cap.findings, ...vis.findings]);
    results.push(merged);
    if (merged.severity === 'block') block++;
    else if (merged.severity === 'warn') warn++;
    else ok++;
    qSum += merged.quality_score;

    // As we accept a post into the recent set, future posts in the
    // same batch can detect duplicates against it. This catches
    // intra-batch replication (Léna generates the same hook twice
    // in one week).
    recent.unshift({
      id: 'batch_' + results.length,
      caption: p.caption || null,
      visual_url: p.visual_url || null,
      visual_description: p.visual_description || null,
      format: p.format || null,
      platform: p.platform || ctx.platform,
      hook: p.hook || null,
      published_at: null,
      created_at: new Date().toISOString(),
    });
  }

  return {
    results,
    summary: {
      ok, warn, block,
      avg_quality: posts.length > 0 ? Math.round(qSum / posts.length) : 100,
    },
  };
}
