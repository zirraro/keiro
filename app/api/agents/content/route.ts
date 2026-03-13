import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { getAuthUser } from '@/lib/auth-server';
import { getContentSystemPrompt, getWeeklyPlanPrompt } from '@/lib/agents/content-prompt';
import { publishImageToInstagram, publishStoryToInstagram, publishCarouselToInstagram } from '@/lib/meta';
import { loadSharedContext, formatContextForPrompt, completeDirective } from '@/lib/agents/shared-context';

// ──────────────────────────────────────
// Claude Haiku for text generation (captions, hashtags, descriptions)
// Seedream for image generation (visual_url)
// ──────────────────────────────────────
async function callClaude({ system, message, maxTokens = 2000 }: { system: string; message: string; maxTokens?: number }): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY non configurée');

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: message }],
  });

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');
}

export const runtime = 'nodejs';
export const maxDuration = 120;

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function verifyAuth(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return { authorized: true, isCron: true };
  try {
    const { user, error } = await getAuthUser();
    if (error || !user) return { authorized: false };
    const supabase = getSupabaseAdmin();
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
    if (profile?.is_admin) return { authorized: true, isAdmin: true };
  } catch {}
  return { authorized: false };
}

// ──────────────────────────────────────
// Generate visual using KeiroAI's own Seedream API (proof of product)
// ──────────────────────────────────────
const SEEDREAM_API_KEY = process.env.SEEDREAM_API_KEY || '341cd095-2c11-49da-82e7-dc2db23c565c';
const SEEDREAM_API_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations';
const NO_TEXT_SUFFIX = '\nAbsolutely no text, letters, words, numbers, writing, signs, labels, watermarks, logos in the image. Pure visual only.';

const SEEDREAM_STYLE_GUIDE = `You are an elite prompt engineer for Seedream (text-to-image AI).
Your goal: create premium, brand-consistent visuals for KeiroAI (AI marketing tool for local businesses).

BRAND VISUAL IDENTITY:
- Primary color: deep violet (#7C3AED) — innovation, premium tech
- Secondary: soft purple (#A78BFA), deep black (#0F0F0F), warm white (#FAFAF9)
- Accent: amber (#F59E0B) for energy and CTAs
- Style: clean flat design, subtle 3D elements, modern tech aesthetic
- Mood: professional yet approachable, innovative yet simple

QUALITY STANDARDS:
- Studio-quality lighting (soft, directional, no harsh shadows)
- Clean compositions with clear focal point
- Negative space for breathing room
- Modern color grading (slightly desaturated, filmic)
- 4K detail level, sharp focus on subject
- Depth of field when appropriate

FOR SOCIAL MEDIA THUMBNAILS:
- The image must be READABLE at 100x100px thumbnail size
- Strong contrast between subject and background
- Single clear focal point (not cluttered)
- Bold color blocks rather than detailed textures

ABSOLUTELY FORBIDDEN:
- Any text, letters, numbers, writing, signs, watermarks, logos
- Cluttered compositions with too many elements
- Stock photo aesthetic (generic, lifeless)
- Low contrast or muddy colors

Output ONLY the optimized English prompt. Nothing else.`;

async function generateVisual(visualDescription: string, format: string): Promise<string | null> {
  try {
    // Optimize the visual description into an elite Seedream prompt
    const optimizedText = await callClaude({
      system: SEEDREAM_STYLE_GUIDE,
      message: `Create a premium visual prompt for a ${format} post.\n\nVisual brief: ${visualDescription}\n\nFormat context: ${format === 'carrousel' || format === 'post' ? 'Square 1:1, must look great as Instagram grid thumbnail' : format === 'reel' || format === 'video' || format === 'story' ? 'Vertical 9:16, mobile-first, bold and eye-catching' : 'Horizontal 16:9, professional LinkedIn style'}`,
      maxTokens: 400,
    });

    const rawPrompt = (optimizedText || visualDescription) + NO_TEXT_SUFFIX;
    const imagePrompt = rawPrompt.length > 2000 ? rawPrompt.substring(0, 2000) : rawPrompt;

    // Determine aspect ratio based on format
    // Seedream requires minimum 3,686,400 pixels — ALL sizes must meet this
    let width = 1920;
    let height = 1920; // 1920x1920 = 3,686,400 ✓
    if (format === 'story' || format === 'reel' || format === 'video') {
      width = 1440; height = 2560; // 9:16 mobile = 3,686,400 ✓
    } else if (format === 'text') {
      width = 2560; height = 1440; // 16:9 LinkedIn = 3,686,400 ✓
    }
    // carrousel, post = 1:1 (1920x1920 = 3,686,400)

    console.log(`[Content] Generating visual with Seedream (${width}x${height})...`);

    const seedreamRes = await fetch(SEEDREAM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SEEDREAM_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'seedream-4-5-251128',
        prompt: imagePrompt,
        size: `${width}x${height}`,
        response_format: 'url',
        seed: -1,
        watermark: false,
      }),
    });

    if (!seedreamRes.ok) {
      const errBody = await seedreamRes.text().catch(() => '');
      console.error('[Content] Seedream HTTP error:', seedreamRes.status, errBody.substring(0, 500));
      return null;
    }

    const seedreamData = await seedreamRes.json();
    const imageUrl = seedreamData.data?.[0]?.url || null;

    if (imageUrl) {
      console.log('[Content] Visual generated successfully');
    } else {
      console.warn('[Content] Seedream returned no image URL');
    }

    return imageUrl;
  } catch (e: any) {
    console.error('[Content] Visual generation error:', e.message);
    return null;
  }
}

// ──────────────────────────────────────
// Publish to Instagram via Graph API
// ──────────────────────────────────────
async function publishToInstagram(
  post: { format?: string; caption?: string; hashtags?: string[]; visual_url?: string },
  supabase: any
): Promise<{ success: boolean; permalink?: string; error?: string }> {
  try {
    // Find admin user's Instagram tokens
    const { data: adminProfile, error: profileError } = await supabase
      .from('profiles')
      .select('instagram_business_account_id, facebook_page_access_token, instagram_username')
      .eq('is_admin', true)
      .single();

    if (profileError || !adminProfile) {
      console.error('[Content] No admin profile found for Instagram publishing');
      return { success: false, error: 'No admin profile found' };
    }

    const igUserId = adminProfile.instagram_business_account_id;
    const pageAccessToken = adminProfile.facebook_page_access_token;

    if (!igUserId || !pageAccessToken) {
      console.error('[Content] Admin has no Instagram tokens configured');
      return { success: false, error: 'Instagram tokens not configured for admin user' };
    }

    if (!post.visual_url) {
      return { success: false, error: 'No visual_url available for publishing' };
    }

    // Build caption with hashtags
    const hashtagsArr = Array.isArray(post.hashtags) ? post.hashtags : [];
    const fullCaption = (post.caption || '') + (hashtagsArr.length > 0 ? '\n\n' + hashtagsArr.join(' ') : '');

    const format = (post.format || 'post').toLowerCase();

    console.log(`[Content] Publishing to Instagram as ${format} (ig_user: ${igUserId})...`);

    let result: { id: string; permalink?: string };

    if (format === 'story') {
      // Stories don't have captions via Graph API
      const storyResult = await publishStoryToInstagram(igUserId, pageAccessToken, post.visual_url);
      result = { id: storyResult.id };
    } else if (format === 'carrousel') {
      // For now, treat carousel as single image publish (carousel needs multiple images)
      console.log('[Content] Carousel detected — publishing as single image (multi-image carousel not yet supported)');
      result = await publishImageToInstagram(igUserId, pageAccessToken, post.visual_url, fullCaption);
    } else {
      // post, reel, or any other format → single image publish
      result = await publishImageToInstagram(igUserId, pageAccessToken, post.visual_url, fullCaption);
    }

    console.log(`[Content] Instagram publish success — media id: ${result.id}${result.permalink ? `, permalink: ${result.permalink}` : ''}`);

    return { success: true, permalink: result.permalink };
  } catch (error: any) {
    console.error('[Content] Instagram publish error:', error.message || error);
    return { success: false, error: error.message || 'Unknown Instagram publishing error' };
  }
}

// ──────────────────────────────────────
// GET: Cron — generate daily post OR weekly plan
// ──────────────────────────────────────
export async function GET(request: NextRequest) {
  const { authorized, isCron } = await verifyAuth(request);
  if (!authorized) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, error: 'ANTHROPIC_API_KEY non configurée' }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...

  try {
    // Check if there's already a post for today
    const { data: todayPosts } = await supabase
      .from('content_calendar')
      .select('id, platform, format, status')
      .eq('scheduled_date', todayStr);

    // If Sunday evening cron (or no posts planned this week), generate weekly plan
    if (isCron && dayOfWeek === 0) {
      return generateWeeklyPlan(supabase);
    }

    // If no post for today, generate one on the fly
    if (!todayPosts || todayPosts.length === 0) {
      console.log('[Content] No posts for today — generating one now');
      return generateDailyPost(supabase, todayStr, dayOfWeek);
    }

    // If posts exist but none are published yet, auto-publish them
    const unpublished = todayPosts.filter((p: any) => p.status === 'draft' || p.status === 'approved');
    if (unpublished.length > 0 && isCron) {
      console.log(`[Content] ${unpublished.length} unpublished posts for today — auto-publishing`);
      let published = 0;
      for (const post of unpublished) {
        // Fetch full post data for visual generation
        const { data: fullPost } = await supabase.from('content_calendar').select('*').eq('id', post.id).single();
        if (!fullPost) continue;

        if (!fullPost.visual_url) {
          const visualDesc = fullPost.visual_description || fullPost.hook || fullPost.caption;
          if (visualDesc) {
            const visualUrl = await generateVisual(visualDesc, fullPost.format || 'post');
            if (visualUrl) {
              await supabase.from('content_calendar').update({
                visual_url: visualUrl, status: 'published',
                published_at: new Date().toISOString(), updated_at: new Date().toISOString(),
              }).eq('id', post.id);

              // Publish to Instagram if applicable
              if (fullPost.platform === 'instagram') {
                const igResult = await publishToInstagram({ ...fullPost, visual_url: visualUrl }, supabase);
                if (igResult.success && igResult.permalink) {
                  await supabase.from('content_calendar').update({ instagram_permalink: igResult.permalink }).eq('id', post.id);
                } else if (igResult.error) {
                  console.warn(`[Content] Instagram publish failed for post ${post.id}: ${igResult.error}`);
                }
              }

              published++;
            }
          }
        } else {
          // Already has visual, just publish
          await supabase.from('content_calendar').update({
            status: 'published', published_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          }).eq('id', post.id);

          // Publish to Instagram if applicable
          if (fullPost.platform === 'instagram') {
            const igResult = await publishToInstagram(fullPost, supabase);
            if (igResult.success && igResult.permalink) {
              await supabase.from('content_calendar').update({ instagram_permalink: igResult.permalink }).eq('id', post.id);
            } else if (igResult.error) {
              console.warn(`[Content] Instagram publish failed for post ${post.id}: ${igResult.error}`);
            }
          }

          published++;
        }
      }
      console.log(`[Content] Auto-published ${published} posts`);
    }

    // Return today's content
    return NextResponse.json({
      ok: true,
      today: todayPosts,
      message: `${todayPosts.length} post(s) for today`,
    });
  } catch (error: any) {
    console.error('[Content] GET error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// ──────────────────────────────────────
// POST: Manual actions
// ──────────────────────────────────────
export async function POST(request: NextRequest) {
  const { authorized } = await verifyAuth(request);
  if (!authorized) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, error: 'ANTHROPIC_API_KEY non configurée' }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();

  try {
    const body = await request.json().catch(() => ({}));

    switch (body.action) {
      case 'generate_weekly':
        return generateWeeklyPlan(supabase);

      case 'generate_post': {
        const todayStr = new Date().toISOString().split('T')[0];
        const dayOfWeek = new Date().getDay();
        return generateDailyPost(supabase, todayStr, dayOfWeek, body.platform, body.pillar, body.draftOnly);
      }

      case 'generate_week': {
        return generateWeekWithVisuals(supabase, body.publishAll === true);
      }

      case 'approve': {
        if (!body.postId) return NextResponse.json({ ok: false, error: 'postId required' }, { status: 400 });
        const { error } = await supabase
          .from('content_calendar')
          .update({ status: 'approved', updated_at: new Date().toISOString() })
          .eq('id', body.postId);
        if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
      }

      case 'publish': {
        if (!body.postId) return NextResponse.json({ ok: false, error: 'postId required' }, { status: 400 });
        const { error } = await supabase
          .from('content_calendar')
          .update({ status: 'published', published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', body.postId);
        if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
      }

      case 'skip': {
        if (!body.postId) return NextResponse.json({ ok: false, error: 'postId required' }, { status: 400 });
        const { error } = await supabase
          .from('content_calendar')
          .update({ status: 'skipped', updated_at: new Date().toISOString() })
          .eq('id', body.postId);
        if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
      }

      case 'execute_publication': {
        // Publish all approved OR draft posts that are due today or earlier (direct publish, no manual approval needed)
        const todayDate = new Date().toISOString().split('T')[0];
        const { data: readyPosts } = await supabase
          .from('content_calendar')
          .select('*')
          .in('status', ['approved', 'draft'])
          .lte('scheduled_date', todayDate)
          .is('visual_url', null);

        // Also get approved posts with visuals that aren't published yet
        const { data: approvedWithVisuals } = await supabase
          .from('content_calendar')
          .select('*')
          .in('status', ['approved', 'draft'])
          .lte('scheduled_date', todayDate)
          .not('visual_url', 'is', null);

        let publishedCount = 0;
        const publishedPosts: Array<{ platform: string; format: string; hook: string; instagram_permalink?: string; publication_error?: string }> = [];

        // Publish posts that already have visuals
        for (const post of approvedWithVisuals || []) {
          const updateData: Record<string, any> = {
            status: 'published',
            published_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          // Publish to Instagram if applicable
          let igPermalink: string | undefined;
          let pubError: string | undefined;
          if (post.platform === 'instagram' && post.visual_url) {
            const igResult = await publishToInstagram(post, supabase);
            if (igResult.success) {
              igPermalink = igResult.permalink;
              if (igResult.permalink) {
                updateData.instagram_permalink = igResult.permalink;
              }
            } else {
              pubError = igResult.error;
              console.warn(`[Content] Instagram publish failed for post ${post.id}: ${igResult.error}`);
            }
          }

          await supabase.from('content_calendar').update(updateData).eq('id', post.id);
          publishedCount++;
          publishedPosts.push({
            platform: post.platform,
            format: post.format,
            hook: post.hook || '',
            instagram_permalink: igPermalink,
            publication_error: pubError,
          });
        }

        // Generate visuals and publish for posts without visuals
        for (const post of readyPosts || []) {
          const visualDesc = post.visual_description || post.hook || post.caption;
          if (visualDesc) {
            const visualUrl = await generateVisual(visualDesc, post.format || 'post');
            if (visualUrl) {
              const updateData: Record<string, any> = {
                visual_url: visualUrl,
                status: 'published',
                published_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };

              // Publish to Instagram if applicable
              let igPermalink: string | undefined;
              let pubError: string | undefined;
              if (post.platform === 'instagram') {
                const igResult = await publishToInstagram({ ...post, visual_url: visualUrl }, supabase);
                if (igResult.success) {
                  igPermalink = igResult.permalink;
                  if (igResult.permalink) {
                    updateData.instagram_permalink = igResult.permalink;
                  }
                } else {
                  pubError = igResult.error;
                  console.warn(`[Content] Instagram publish failed for post ${post.id}: ${igResult.error}`);
                }
              }

              await supabase.from('content_calendar').update(updateData).eq('id', post.id);
              publishedCount++;
              publishedPosts.push({
                platform: post.platform,
                format: post.format,
                hook: post.hook || '',
                instagram_permalink: igPermalink,
                publication_error: pubError,
              });
            }
          }
        }

        // If no posts existed at all, generate + publish one on the fly
        if (publishedCount === 0 && (!readyPosts || readyPosts.length === 0) && (!approvedWithVisuals || approvedWithVisuals.length === 0)) {
          console.log('[Content] No posts to publish — generating a fresh one now');
          const dayOfWeek = new Date().getDay();
          return generateDailyPost(supabase, todayDate, dayOfWeek);
        }

        const nowISO = new Date().toISOString();
        await supabase.from('agent_logs').insert({
          agent: 'content',
          action: 'execute_publication',
          data: {
            total: publishedCount,
            success: publishedCount,
            failed: 0,
            published: publishedPosts,
          },
          created_at: nowISO,
        });

        // Also report to CEO
        await supabase.from('agent_logs').insert({
          agent: 'content',
          action: 'report_to_ceo',
          data: {
            phase: 'completed',
            message: `Contenu: ${publishedCount} publications exécutées`,
          },
          created_at: nowISO,
        });

        return NextResponse.json({ ok: true, published: publishedCount, posts: publishedPosts });
      }

      case 'stats': {
        const { count: totalPosts } = await supabase.from('content_calendar').select('id', { count: 'exact', head: true });
        const { count: published } = await supabase.from('content_calendar').select('id', { count: 'exact', head: true }).eq('status', 'published');
        const { count: drafts } = await supabase.from('content_calendar').select('id', { count: 'exact', head: true }).eq('status', 'draft');
        const { count: approved } = await supabase.from('content_calendar').select('id', { count: 'exact', head: true }).eq('status', 'approved');

        const { data: byPlatform } = await supabase
          .from('content_calendar')
          .select('platform')
          .eq('status', 'published');

        const platforms = { instagram: 0, tiktok: 0, linkedin: 0 };
        for (const p of byPlatform || []) platforms[p.platform as keyof typeof platforms]++;

        return NextResponse.json({
          ok: true,
          stats: { total: totalPosts || 0, published: published || 0, drafts: drafts || 0, approved: approved || 0, byPlatform: platforms },
        });
      }

      case 'update_post': {
        if (!body.postId) return NextResponse.json({ ok: false, error: 'postId required' }, { status: 400 });
        const updates: Record<string, any> = {};
        if (body.hook !== undefined) updates.hook = body.hook;
        if (body.caption !== undefined) updates.caption = body.caption;
        if (body.visual_description !== undefined) updates.visual_description = body.visual_description;
        if (body.platform !== undefined) updates.platform = body.platform;
        if (body.format !== undefined) updates.format = body.format;
        if (body.hashtags !== undefined) updates.hashtags = body.hashtags;
        if (Object.keys(updates).length === 0) return NextResponse.json({ ok: false, error: 'No fields to update' }, { status: 400 });
        updates.updated_at = new Date().toISOString();
        const { error } = await supabase.from('content_calendar').update(updates).eq('id', body.postId);
        if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        const { data: updated } = await supabase.from('content_calendar').select('*').eq('id', body.postId).single();
        return NextResponse.json({ ok: true, post: updated });
      }

      case 'revise_post': {
        if (!body.postId || !body.instructions) return NextResponse.json({ ok: false, error: 'postId and instructions required' }, { status: 400 });
        const { data: currentPost } = await supabase.from('content_calendar').select('*').eq('id', body.postId).single();
        if (!currentPost) return NextResponse.json({ ok: false, error: 'Post not found' }, { status: 404 });

        const reviseRaw = await callClaude({
          system: `Tu es un expert en contenu social media pour KeiroAI. L'utilisateur veut modifier un post existant.
Applique ses instructions et retourne le JSON complet mis à jour.
Champs obligatoires : platform, format, pillar, hook, caption, hashtags, visual_description
Retourne UNIQUEMENT du JSON valide, sans markdown.`,
          message: `Post actuel :
${JSON.stringify({ platform: currentPost.platform, format: currentPost.format, pillar: currentPost.pillar, hook: currentPost.hook, caption: currentPost.caption, hashtags: currentPost.hashtags, visual_description: currentPost.visual_description }, null, 2)}

Instructions de modification : ${body.instructions}`,
          maxTokens: 2000,
        });

        const cleanRevise = reviseRaw.replace(/```[\w]*\s*/g, '').trim();
        const reviseMatch = cleanRevise.match(/\{[\s\S]*\}/);
        if (!reviseMatch) return NextResponse.json({ ok: false, error: 'Failed to parse revision' }, { status: 500 });
        const revised = JSON.parse(reviseMatch[0]);

        const reviseUpdates: Record<string, any> = { updated_at: new Date().toISOString() };
        if (revised.hook) reviseUpdates.hook = revised.hook;
        if (revised.caption) reviseUpdates.caption = revised.caption;
        if (revised.visual_description) reviseUpdates.visual_description = revised.visual_description;
        if (revised.platform) reviseUpdates.platform = revised.platform;
        if (revised.format) reviseUpdates.format = revised.format;
        if (revised.hashtags) reviseUpdates.hashtags = revised.hashtags;

        await supabase.from('content_calendar').update(reviseUpdates).eq('id', body.postId);
        const { data: updatedPost } = await supabase.from('content_calendar').select('*').eq('id', body.postId).single();
        return NextResponse.json({ ok: true, post: updatedPost });
      }

      case 'generate_visual': {
        if (!body.postId) return NextResponse.json({ ok: false, error: 'postId required' }, { status: 400 });
        const { data: postForVisual } = await supabase.from('content_calendar').select('*').eq('id', body.postId).single();
        if (!postForVisual) return NextResponse.json({ ok: false, error: 'Post not found' }, { status: 404 });
        const desc = postForVisual.visual_description || postForVisual.hook || postForVisual.caption;
        if (!desc) return NextResponse.json({ ok: false, error: 'No visual description' }, { status: 400 });
        const url = await generateVisual(desc, postForVisual.format || 'post');
        if (!url) return NextResponse.json({ ok: false, error: 'Visual generation failed' }, { status: 500 });
        await supabase.from('content_calendar').update({ visual_url: url, updated_at: new Date().toISOString() }).eq('id', body.postId);
        return NextResponse.json({ ok: true, visual_url: url });
      }

      case 'calendar': {
        const startDate = body.startDate || new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
        const endDate = body.endDate || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];

        const { data: posts } = await supabase
          .from('content_calendar')
          .select('*')
          .gte('scheduled_date', startDate)
          .lte('scheduled_date', endDate)
          .order('scheduled_date', { ascending: true });

        return NextResponse.json({ ok: true, posts: posts || [] });
      }

      default:
        return NextResponse.json({ ok: false, error: `Action inconnue: ${body.action}` }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[Content] POST error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// ──────────────────────────────────────
// Generate weekly content plan
// ──────────────────────────────────────
async function generateWeeklyPlan(supabase: any) {
  const now = new Date();
  const nowISO = now.toISOString();

  // Get last 10 published posts for context (avoid repetition)
  const { data: recentPosts } = await supabase
    .from('content_calendar')
    .select('platform, format, pillar, hook, caption, scheduled_date')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(10);

  const existingPlanned = recentPosts?.map((p: any) => `${p.scheduled_date} ${p.platform} ${p.pillar}: ${p.hook || p.caption?.substring(0, 50)}`).join('\n') || '';

  // Get already planned for this week
  const mondayDate = new Date(now);
  mondayDate.setDate(mondayDate.getDate() - mondayDate.getDay() + 1);
  const sundayDate = new Date(mondayDate);
  sundayDate.setDate(sundayDate.getDate() + 6);

  const { data: thisWeek } = await supabase
    .from('content_calendar')
    .select('scheduled_date, platform')
    .gte('scheduled_date', mondayDate.toISOString().split('T')[0])
    .lte('scheduled_date', sundayDate.toISOString().split('T')[0]);

  if (thisWeek && thisWeek.length >= 7) {
    return NextResponse.json({ ok: true, message: 'Weekly plan already exists', postsPlanned: thisWeek.length });
  }

  const prompt = getWeeklyPlanPrompt({ existingPlanned });

  // The elite system prompt already contains all visual rules, timing, and brand guidelines
  const enhancedSystemPrompt = getContentSystemPrompt();

  let rawText: string;
  try {
    rawText = await callClaude({
      system: enhancedSystemPrompt,
      message: prompt,
      maxTokens: 4000,
    });
  } catch (claudeError: any) {
    console.error('[Content] Claude API error for weekly plan:', claudeError.message);
    await supabase.from('agent_logs').insert({
      agent: 'content', action: 'weekly_plan_failed',
      data: { error: claudeError.message, phase: 'claude_call' },
      status: 'error', error_message: claudeError.message, created_at: nowISO,
    });
    return NextResponse.json({ ok: false, error: `Claude error: ${claudeError.message}` }, { status: 502 });
  }

  let weekPlan: any[];
  try {
    const cleanText = rawText.replace(/```[\w]*\s*/g, '');
    const jsonMatch = cleanText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      weekPlan = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('No JSON array found in response');
    }
  } catch (parseError) {
    console.error('[Content] Parse error:', parseError);
    await supabase.from('agent_logs').insert({
      agent: 'content', action: 'weekly_plan_failed',
      data: { raw: rawText.substring(0, 500), error: String(parseError) },
      status: 'error', error_message: String(parseError), created_at: nowISO,
    });
    return NextResponse.json({ ok: false, error: 'Failed to parse weekly plan' }, { status: 500 });
  }

  // Map day names to dates
  const dayMap: Record<string, number> = { lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 0 };

  let inserted = 0;
  for (const post of weekPlan) {
    const dayNum = dayMap[(post.day || '').toLowerCase()] ?? null;
    let scheduledDate = mondayDate.toISOString().split('T')[0];

    if (dayNum !== null) {
      const postDate = new Date(mondayDate);
      const offset = dayNum === 0 ? 6 : dayNum - 1;
      postDate.setDate(postDate.getDate() + offset);
      scheduledDate = postDate.toISOString().split('T')[0];
    }

    // Parse optimal time
    let scheduledTime = '12:00';
    if (post.best_time) {
      const timeMatch = post.best_time.match(/(\d{1,2})[h:](\d{2})?/);
      if (timeMatch) {
        scheduledTime = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2] || '00'}`;
      }
    }

    const { error: insertError } = await supabase.from('content_calendar').insert({
      platform: post.platform || 'instagram',
      format: post.format || 'post',
      pillar: post.pillar || 'tips',
      hook: post.hook || null,
      caption: post.caption || '',
      hashtags: post.hashtags || [],
      visual_description: post.visual_description || post.thumbnail_description || null,
      slides: post.slides || null,
      script: post.script || null,
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime,
      status: 'approved',
      ai_generated: true,
    });

    if (!insertError) {
      inserted++;
      // Generate visual using KeiroAI Seedream (proof of product) + auto-publish
      const postVisualDesc = post.thumbnail_description || post.visual_description || post.hook;
      if (postVisualDesc) {
        const postVisualUrl = await generateVisual(postVisualDesc, post.format || 'post');
        if (postVisualUrl) {
          await supabase.from('content_calendar')
            .update({ visual_url: postVisualUrl, status: 'published', published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('scheduled_date', scheduledDate)
            .eq('platform', post.platform || 'instagram')
            .eq('status', 'approved')
            .is('visual_url', null);
        }
      }
    }
  }

  await supabase.from('agent_logs').insert({
    agent: 'content', action: 'weekly_plan_generated',
    data: { postsPlanned: inserted, weekStart: mondayDate.toISOString().split('T')[0] },
    status: 'success', created_at: nowISO,
  });

  // Report strategy to marketing agent for alignment
  const platformBreakdown: Record<string, number> = {};
  const pillarBreakdown: Record<string, number> = {};
  for (const post of weekPlan) {
    const p = post.platform || 'instagram';
    const pi = post.pillar || 'tips';
    platformBreakdown[p] = (platformBreakdown[p] || 0) + 1;
    pillarBreakdown[pi] = (pillarBreakdown[pi] || 0) + 1;
  }

  await supabase.from('agent_logs').insert({
    agent: 'content', action: 'report_to_ceo',
    data: {
      phase: 'weekly_plan',
      message: `Contenu: ${inserted} posts planifies cette semaine`,
      strategy: {
        platforms: platformBreakdown,
        pillars: pillarBreakdown,
        grid_colors: weekPlan.map((p: any) => p.grid_color).filter(Boolean),
        week_start: mondayDate.toISOString().split('T')[0],
      },
    },
    created_at: nowISO,
  });

  console.log(`[Content] Weekly plan: ${inserted} posts planned`);

  return NextResponse.json({ ok: true, postsPlanned: inserted });
}

// ──────────────────────────────────────
// Generate week with visuals + optional Instagram publishing
// ──────────────────────────────────────
async function generateWeekWithVisuals(supabase: any, publishAll: boolean) {
  const now = new Date();
  const nowISO = now.toISOString();

  console.log(`[Content] generate_week: starting (publishAll=${publishAll})`);

  // Get last 10 published posts for context
  const { data: recentPosts } = await supabase
    .from('content_calendar')
    .select('platform, format, pillar, hook, caption, scheduled_date')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(10);

  const existingPlanned = recentPosts?.map((p: any) => `${p.scheduled_date} ${p.platform} ${p.pillar}: ${p.hook || p.caption?.substring(0, 50)}`).join('\n') || '';

  // Calculate next Monday
  const mondayDate = new Date(now);
  const currentDay = mondayDate.getDay();
  const daysUntilMonday = currentDay === 0 ? 1 : (8 - currentDay);
  mondayDate.setDate(mondayDate.getDate() + daysUntilMonday);

  const prompt = getWeeklyPlanPrompt({ existingPlanned });
  const systemPrompt = getContentSystemPrompt();

  let rawText: string;
  try {
    rawText = await callClaude({
      system: systemPrompt,
      message: prompt,
      maxTokens: 4000,
    });
  } catch (claudeError: any) {
    console.error('[Content] generate_week Claude error:', claudeError.message);
    return NextResponse.json({ ok: false, error: `Claude error: ${claudeError.message}` }, { status: 502 });
  }

  let weekPlan: any[];
  try {
    const cleanText = rawText.replace(/```[\w]*\s*/g, '');
    const jsonMatch = cleanText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      weekPlan = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('No JSON array found in response');
    }
  } catch (parseError) {
    console.error('[Content] generate_week parse error:', parseError);
    return NextResponse.json({ ok: false, error: 'Failed to parse weekly plan' }, { status: 500 });
  }

  const dayMap: Record<string, number> = { lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 0 };

  const results: Array<{
    day: string;
    platform: string;
    format: string;
    hook: string;
    visual_url: string | null;
    status: string;
    instagram_permalink?: string;
    publication_error?: string;
  }> = [];

  // Process posts sequentially (Seedream rate limits)
  for (const post of weekPlan) {
    const dayNum = dayMap[(post.day || '').toLowerCase()] ?? null;
    let scheduledDate = mondayDate.toISOString().split('T')[0];

    if (dayNum !== null) {
      const postDate = new Date(mondayDate);
      const offset = dayNum === 0 ? 6 : dayNum - 1;
      postDate.setDate(postDate.getDate() + offset);
      scheduledDate = postDate.toISOString().split('T')[0];
    }

    let scheduledTime = '12:00';
    if (post.best_time) {
      const timeMatch = post.best_time.match(/(\d{1,2})[h:](\d{2})?/);
      if (timeMatch) scheduledTime = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2] || '00'}`;
    }

    const platform = post.platform || 'instagram';
    const format = post.format || 'post';

    // Insert into content_calendar
    const { data: inserted, error: insertError } = await supabase.from('content_calendar').insert({
      platform,
      format,
      pillar: post.pillar || 'tips',
      hook: post.hook || null,
      caption: post.caption || '',
      hashtags: post.hashtags || [],
      visual_description: post.visual_description || post.thumbnail_description || null,
      slides: post.slides || null,
      script: post.script || null,
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime,
      status: 'draft',
      ai_generated: true,
    }).select().single();

    if (insertError) {
      console.error(`[Content] generate_week insert error for ${post.day}:`, insertError.message);
      results.push({
        day: post.day || '?',
        platform,
        format,
        hook: post.hook || '',
        visual_url: null,
        status: 'insert_failed',
        publication_error: insertError.message,
      });
      continue;
    }

    // Generate visual with Seedream
    const visualDesc = post.thumbnail_description || post.visual_description || post.hook || post.caption;
    let visualUrl: string | null = null;
    if (visualDesc) {
      visualUrl = await generateVisual(visualDesc, format);
    }

    const postResult: typeof results[number] = {
      day: post.day || '?',
      platform,
      format,
      hook: post.hook || '',
      visual_url: visualUrl,
      status: visualUrl ? 'visual_ready' : 'no_visual',
    };

    if (visualUrl && inserted?.id) {
      const updateData: Record<string, any> = {
        visual_url: visualUrl,
        updated_at: new Date().toISOString(),
      };

      // Publish to Instagram if requested and platform is instagram
      if (publishAll && platform === 'instagram') {
        const igResult = await publishToInstagram(
          { format, caption: post.caption, hashtags: post.hashtags, visual_url: visualUrl },
          supabase
        );

        if (igResult.success) {
          updateData.status = 'published';
          updateData.published_at = new Date().toISOString();
          if (igResult.permalink) {
            updateData.instagram_permalink = igResult.permalink;
            postResult.instagram_permalink = igResult.permalink;
          }
          postResult.status = 'published';
          console.log(`[Content] generate_week: published ${post.day} to Instagram`);
        } else {
          updateData.status = 'approved';
          postResult.status = 'publish_failed';
          postResult.publication_error = igResult.error;
          console.warn(`[Content] generate_week: Instagram publish failed for ${post.day}: ${igResult.error}`);
        }
      } else {
        updateData.status = 'approved';
        postResult.status = 'approved';
      }

      await supabase.from('content_calendar').update(updateData).eq('id', inserted.id);
    }

    results.push(postResult);
  }

  const publishedCount = results.filter(r => r.status === 'published').length;
  const totalGenerated = results.filter(r => r.visual_url).length;

  // Log
  await supabase.from('agent_logs').insert({
    agent: 'content',
    action: 'generate_week',
    data: {
      total: results.length,
      visuals_generated: totalGenerated,
      published_to_instagram: publishedCount,
      publishAll,
      posts: results,
    },
    status: 'success',
    created_at: nowISO,
  });

  console.log(`[Content] generate_week complete: ${results.length} posts, ${totalGenerated} visuals, ${publishedCount} published to Instagram`);

  return NextResponse.json({
    ok: true,
    total: results.length,
    visuals_generated: totalGenerated,
    published_to_instagram: publishedCount,
    posts: results,
  });
}

// ──────────────────────────────────────
// Generate a single daily post
// ──────────────────────────────────────
async function generateDailyPost(supabase: any, todayStr: string, dayOfWeek: number, forcePlatform?: string, forcePillar?: string, draftOnly?: boolean) {
  const nowISO = new Date().toISOString();

  // Load shared intelligence pool (all agents' data + active directives)
  let sharedIntelligence = '';
  try {
    const ctx = await loadSharedContext(supabase, 'content');
    sharedIntelligence = formatContextForPrompt(ctx);
  } catch (e: any) {
    console.warn('[Content] Failed to load shared context:', e.message);
  }

  // Default schedule by day of week (Instagram + TikTok only, no LinkedIn)
  const defaultSchedule: Record<number, { platform: string; format: string; pillar: string }> = {
    1: { platform: 'instagram', format: 'carrousel', pillar: 'tips' },       // Monday
    2: { platform: 'tiktok', format: 'video', pillar: 'tips' },              // Tuesday
    3: { platform: 'instagram', format: 'reel', pillar: 'demo' },            // Wednesday
    4: { platform: 'instagram', format: 'post', pillar: 'tips' },            // Thursday
    5: { platform: 'instagram', format: 'post', pillar: 'social_proof' },    // Friday
    6: { platform: 'tiktok', format: 'video', pillar: 'trends' },            // Saturday
    0: { platform: 'instagram', format: 'story', pillar: 'social_proof' },   // Sunday
  };

  const schedule = defaultSchedule[dayOfWeek] || defaultSchedule[1];
  const platform = forcePlatform || schedule.platform;
  const pillar = forcePillar || schedule.pillar;

  // Get recent posts for visual coherence + strategy context
  const { data: recentGrid } = await supabase
    .from('content_calendar')
    .select('platform, format, visual_description, hook, pillar, caption')
    .eq('platform', platform)
    .in('status', ['draft', 'approved', 'published'])
    .order('scheduled_date', { ascending: false })
    .limit(9);

  const gridContext = recentGrid?.map((p: any, i: number) =>
    `Position ${i + 1}: ${p.format} | Pilier: ${p.pillar} | Hook: ${p.hook || '?'} | Visuel: ${(p.visual_description || '').substring(0, 80)}`
  ).join('\n') || 'Grille vide';

  // Detect recently used pillars to enforce rotation
  const recentPillars = recentGrid?.map((p: any) => p.pillar).filter(Boolean) || [];
  const pillarCounts: Record<string, number> = {};
  for (const rp of recentPillars) pillarCounts[rp] = (pillarCounts[rp] || 0) + 1;
  const avoidPillar = Object.entries(pillarCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

  // Detect recent CTA types to rotate them
  const recentCTAs = recentGrid?.map((p: any) => {
    const cap = (p.caption || '').toLowerCase();
    if (cap.includes('enregistre')) return 'save';
    if (cap.includes('tag')) return 'tag';
    if (cap.includes('lien en bio')) return 'link';
    if (cap.includes('commente')) return 'comment';
    return 'other';
  }).filter(Boolean) || [];

  const enhancedPrompt = `Génère 1 post ÉLITE pour aujourd'hui (${todayStr}).

${sharedIntelligence ? `━━━ INTELLIGENCE PARTAGÉE (données de TOUS les agents) ━━━\n${sharedIntelligence}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` : ''}
Plateforme : ${platform}
Format suggéré : ${schedule.format}
Pilier suggéré : ${pillar}${avoidPillar ? `\nATTENTION : Le pilier "${avoidPillar}" a été trop utilisé récemment. CHANGE de pilier si possible.` : ''}

CONTEXTE FEED (les derniers posts, du plus récent) :
${gridContext}

CTA RÉCENTS UTILISÉS : ${[...new Set(recentCTAs)].join(', ') || 'aucun'}
→ VARIE le CTA ! Si "save" a été fait, utilise "tag un ami" ou "commente" ou "lien en bio".

STRATÉGIE GLOBALE :
- Chaque post fait partie d'un ENSEMBLE cohérent. Pense au feed GLOBAL, pas juste ce post isolé.
- Le visuel doit être HARMONIEUX avec les posts précédents (alternance couleurs, pas de répétition).
- Le CTA doit être NATUREL, intégré au contenu, pas forcé. Il guide vers KeiroAI sans être publicitaire.
- Pense conversion INDIRECTE : le prospect voit le post → comprend la valeur → visite le profil → essaie KeiroAI.
- UTILISE les données du pool partagé : si l'email marche bien sur une catégorie, fais un post ciblé pour cette catégorie. Si les DMs ont du succès, renforce la visibilité Instagram.

RÈGLES :
- Plateformes autorisées : instagram, tiktok UNIQUEMENT (pas de LinkedIn)
- Tu DOIS fournir un champ "visual_description" ULTRA DÉTAILLÉ — c'est un PROMPT SEEDREAM complet EN ANGLAIS pour générer un visuel professionnel
- Exemple de bon visual_description : "Professional flat design illustration of a smartphone showing a social media marketing dashboard, deep violet (#7C3AED) gradient background, clean minimalist composition, studio lighting, 4K quality, no text no letters no words"
- AUCUN texte/lettre/mot dans les visuels (Seedream ne gère pas le texte)
- Le champ "hashtags" DOIT contenir 5-10 hashtags pertinents dont #keiroai en premier
- Le champ "caption" DOIT être complet avec emojis, sauts de ligne, et CTA final
- Pense à la MINIATURE dans la grille (carrée, lisible en petit)
- Alterne les couleurs de fond par rapport aux posts précédents

Retourne UN SEUL objet JSON valide (PAS de markdown, PAS de \`\`\`).
Champs obligatoires : platform, format, pillar, hook, caption, hashtags, visual_description, best_time, grid_color, content_angle`;

  let rawText: string;
  try {
    rawText = await callClaude({
      system: getContentSystemPrompt(),
      message: enhancedPrompt,
      maxTokens: 2000,
    });
  } catch (claudeError: any) {
    console.error('[Content] Claude API error for daily post:', claudeError.message);
    await supabase.from('agent_logs').insert({
      agent: 'content', action: 'daily_post_failed',
      data: { error: claudeError.message, phase: 'claude_call' },
      status: 'error', error_message: claudeError.message, created_at: nowISO,
    });
    return NextResponse.json({ ok: false, error: `Claude error: ${claudeError.message}` }, { status: 502 });
  }

  if (!rawText || rawText.trim().length === 0) {
    console.error('[Content] Claude returned empty response');
    await supabase.from('agent_logs').insert({
      agent: 'content', action: 'daily_post_failed',
      data: { error: 'Empty Claude response', phase: 'claude_empty' },
      status: 'error', error_message: 'Empty Claude response', created_at: nowISO,
    });
    return NextResponse.json({ ok: false, error: 'Claude returned empty response' }, { status: 502 });
  }

  let post: any;
  try {
    const cleanText2 = rawText.replace(/```[\w]*\s*/g, '').trim();
    const jsonMatch = cleanText2.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      post = JSON.parse(jsonMatch[0]);
    } else {
      // Try to salvage truncated JSON
      const partialMatch = cleanText2.match(/\{[\s\S]*/);
      if (partialMatch) {
        // Remove trailing incomplete fields and close the object
        let salvaged = partialMatch[0]
          .replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/, '') // remove last incomplete key:value
          .replace(/,\s*$/, ''); // remove trailing comma
        if (!salvaged.endsWith('}')) salvaged += '}';
        post = JSON.parse(salvaged);
        console.log('[Content] Salvaged truncated JSON for daily post');
      } else {
        throw new Error('No JSON found in response');
      }
    }
  } catch (parseError) {
    console.error('[Content] Parse error:', parseError, 'Raw:', rawText.substring(0, 300));
    await supabase.from('agent_logs').insert({
      agent: 'content', action: 'daily_post_failed',
      data: { raw: rawText.substring(0, 800), error: String(parseError) },
      status: 'error', error_message: String(parseError), created_at: nowISO,
    });
    return NextResponse.json({ ok: false, error: 'Failed to parse post' }, { status: 500 });
  }

  // Parse time
  let scheduledTime = '12:00';
  if (post.best_time) {
    const timeMatch = post.best_time.match(/(\d{1,2})[h:](\d{2})?/);
    if (timeMatch) scheduledTime = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2] || '00'}`;
  }

  const { data: inserted, error: insertError } = await supabase.from('content_calendar').insert({
    platform: post.platform || platform,
    format: post.format || schedule.format,
    pillar: post.pillar || pillar,
    hook: post.hook || null,
    caption: post.caption || '',
    hashtags: post.hashtags || [],
    visual_description: post.thumbnail_description || post.visual_description || null,
    slides: post.slides || null,
    script: post.script || null,
    scheduled_date: todayStr,
    scheduled_time: scheduledTime,
    status: draftOnly ? 'draft' : 'approved',
    ai_generated: true,
  }).select().single();

  if (insertError) {
    return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  // Generate visual using KeiroAI's own Seedream (proof of product!)
  const visualDesc = post.thumbnail_description || post.visual_description || post.hook || post.caption;
  let visualUrl: string | null = null;
  let igPermalink: string | undefined;
  let publicationError: string | undefined;

  if (visualDesc && inserted?.id) {
    visualUrl = await generateVisual(visualDesc, post.format || schedule.format);
    if (visualUrl) {
      const visualUpdate: Record<string, any> = {
        visual_url: visualUrl,
        updated_at: new Date().toISOString(),
      };
      if (!draftOnly) {
        visualUpdate.status = 'published';
        visualUpdate.published_at = new Date().toISOString();

        // Publish to Instagram if platform is instagram
        const postPlatform = post.platform || platform;
        if (postPlatform === 'instagram') {
          const igResult = await publishToInstagram(
            { format: post.format || schedule.format, caption: post.caption, hashtags: post.hashtags, visual_url: visualUrl },
            supabase
          );
          if (igResult.success) {
            igPermalink = igResult.permalink;
            if (igResult.permalink) {
              visualUpdate.instagram_permalink = igResult.permalink;
            }
            console.log(`[Content] Daily post published to Instagram${igResult.permalink ? `: ${igResult.permalink}` : ''}`);
          } else {
            publicationError = igResult.error;
            console.warn(`[Content] Instagram publish failed for daily post ${inserted.id}: ${igResult.error}`);
          }
        }
      }
      await supabase.from('content_calendar').update(visualUpdate).eq('id', inserted.id);
      console.log(`[Content] Visual generated${draftOnly ? ' (draft)' : ' + auto-published'} for post ${inserted.id}`);
    }
  }

  // Send notification to founder (post is ready/published)
  if (process.env.RESEND_API_KEY) {
    const isPublished = !!visualUrl && !draftOnly;
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'KeiroAI Content <contact@keiroai.com>',
        to: ['mrzirraro@gmail.com'],
        subject: `${isPublished ? '✅' : '📱'} Post ${isPublished ? 'publié' : 'prêt'} : ${post.platform} ${post.format} — ${post.hook || 'Nouveau contenu'}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;">
          <h2 style="color:#9333ea;">${isPublished ? '✅ Publié' : '📱 Prêt'} — ${post.platform} ${post.format}</h2>
          <p><strong>Pilier :</strong> ${post.pillar} | <strong>Heure :</strong> ${post.best_time || scheduledTime}</p>
          <p><strong>Hook :</strong> ${post.hook || 'N/A'}</p>
          <p>${post.caption || ''}</p>
          ${igPermalink ? `<p><strong>Instagram :</strong> <a href="${igPermalink}">${igPermalink}</a></p>` : ''}
          ${publicationError ? `<p style="color:#dc2626;"><strong>Erreur publication :</strong> ${publicationError}</p>` : ''}
          ${visualUrl ? `<img src="${visualUrl}" style="max-width:100%;border-radius:8px;margin:12px 0;" alt="Visuel généré par KeiroAI"/>
          <p style="color:#6b7280;font-size:12px;">Visuel généré et publié automatiquement par KeiroAI</p>` : ''}
          <p style="margin-top:16px;"><a href="https://keiroai.com/admin/agents" style="color:#9333ea;">→ Voir dans l'admin</a></p>
        </div>`,
      }),
    });
  }

  await supabase.from('agent_logs').insert({
    agent: 'content', action: 'daily_post_generated',
    data: {
      platform: post.platform,
      format: post.format,
      pillar: post.pillar,
      hook: post.hook,
      instagram_permalink: igPermalink,
      publication_error: publicationError,
    },
    status: 'success', created_at: nowISO,
  });

  console.log(`[Content] Daily post: ${post.platform} ${post.format} — ${post.hook}`);

  return NextResponse.json({
    ok: true,
    post: inserted,
    instagram_permalink: igPermalink,
    publication_error: publicationError,
  });
}
