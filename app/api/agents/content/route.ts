import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getContentSystemPrompt, getWeeklyPlanPrompt } from '@/lib/agents/content-prompt';
import { callGemini } from '@/lib/agents/gemini';

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
    const optimizedText = await callGemini({
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
      console.log('[Content] ✓ Visual generated successfully');
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
// GET: Cron — generate daily post OR weekly plan
// ──────────────────────────────────────
export async function GET(request: NextRequest) {
  const { authorized, isCron } = await verifyAuth(request);
  if (!authorized) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ ok: false, error: 'GEMINI_API_KEY non configurée' }, { status: 500 });
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
              published++;
            }
          }
        } else {
          await supabase.from('content_calendar').update({
            status: 'published', published_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          }).eq('id', post.id);
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

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ ok: false, error: 'GEMINI_API_KEY non configurée' }, { status: 500 });
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
        return generateDailyPost(supabase, todayStr, dayOfWeek, body.platform, body.pillar);
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
        const publishedPosts: Array<{ platform: string; format: string; hook: string }> = [];

        // Publish posts that already have visuals
        for (const post of approvedWithVisuals || []) {
          await supabase.from('content_calendar')
            .update({ status: 'published', published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', post.id);
          publishedCount++;
          publishedPosts.push({ platform: post.platform, format: post.format, hook: post.hook || '' });
        }

        // Generate visuals and publish for posts without visuals
        for (const post of readyPosts || []) {
          const visualDesc = post.visual_description || post.hook || post.caption;
          if (visualDesc) {
            const visualUrl = await generateVisual(visualDesc, post.format || 'post');
            if (visualUrl) {
              await supabase.from('content_calendar')
                .update({
                  visual_url: visualUrl,
                  status: 'published',
                  published_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .eq('id', post.id);
              publishedCount++;
              publishedPosts.push({ platform: post.platform, format: post.format, hook: post.hook || '' });
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

        const reviseRaw = await callGemini({
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
    rawText = await callGemini({
      system: enhancedSystemPrompt,
      message: prompt,
      maxTokens: 4000,
    });
  } catch (geminiError: any) {
    console.error('[Content] Gemini API error for weekly plan:', geminiError.message);
    await supabase.from('agent_logs').insert({
      agent: 'content', action: 'weekly_plan_failed',
      data: { error: geminiError.message, phase: 'gemini_call' },
      status: 'error', error_message: geminiError.message, created_at: nowISO,
    });
    return NextResponse.json({ ok: false, error: `Gemini error: ${geminiError.message}` }, { status: 502 });
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

  console.log(`[Content] Weekly plan: ${inserted} posts planned`);

  return NextResponse.json({ ok: true, postsPlanned: inserted });
}

// ──────────────────────────────────────
// Generate a single daily post
// ──────────────────────────────────────
async function generateDailyPost(supabase: any, todayStr: string, dayOfWeek: number, forcePlatform?: string, forcePillar?: string) {
  const nowISO = new Date().toISOString();

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

  // Get recent posts for visual coherence context
  const { data: recentGrid } = await supabase
    .from('content_calendar')
    .select('platform, format, visual_description, hook, pillar')
    .eq('platform', 'instagram')
    .in('status', ['draft', 'approved', 'published'])
    .order('scheduled_date', { ascending: false })
    .limit(6);

  const gridContext = recentGrid?.map((p: any, i: number) => `Position ${i + 1}: ${p.format} — ${p.visual_description || p.hook || 'pas de description'}`).join('\n') || 'Grille vide';

  const enhancedPrompt = `Génère 1 post pour aujourd'hui (${todayStr}).

Plateforme : ${platform}
Format suggéré : ${schedule.format}
Pilier : ${pillar}

CONTEXTE GRILLE INSTAGRAM (les 6 derniers posts, du plus récent) :
${gridContext}

IMPORTANT — RÈGLES :
- Plateformes autorisées : instagram, tiktok UNIQUEMENT (pas de LinkedIn)
- Tu DOIS fournir un champ "visual_description" détaillé pour la génération d'image IA (Seedream)
- La description visuelle doit être un PROMPT IMAGE complet, pas une simple description textuelle
- Pense à la MINIATURE dans la grille Instagram (carrée, lisible en petit)
- Pour un carrousel : la COVER SLIDE = gros titre lisible + fond coloré
- Pour un reel/vidéo : frame d'accroche avec texte overlay bien visible
- Pour un post image : composition épurée, message central lisible
- Pour TikTok : miniature accrocheuse, contrastée
- Alterne les couleurs de fond : violet, blanc, noir, tons chauds

Retourne UN SEUL objet JSON valide (PAS de markdown, PAS de \`\`\`).
Champs obligatoires : platform, format, pillar, hook, caption, hashtags, visual_description, best_time`;

  let rawText: string;
  try {
    rawText = await callGemini({
      system: getContentSystemPrompt(),
      message: enhancedPrompt,
      maxTokens: 2000,
    });
  } catch (geminiError: any) {
    console.error('[Content] Gemini API error for daily post:', geminiError.message);
    await supabase.from('agent_logs').insert({
      agent: 'content', action: 'daily_post_failed',
      data: { error: geminiError.message, phase: 'gemini_call' },
      status: 'error', error_message: geminiError.message, created_at: nowISO,
    });
    return NextResponse.json({ ok: false, error: `Gemini error: ${geminiError.message}` }, { status: 502 });
  }

  if (!rawText || rawText.trim().length === 0) {
    console.error('[Content] Gemini returned empty response');
    await supabase.from('agent_logs').insert({
      agent: 'content', action: 'daily_post_failed',
      data: { error: 'Empty Gemini response', phase: 'gemini_empty' },
      status: 'error', error_message: 'Empty Gemini response', created_at: nowISO,
    });
    return NextResponse.json({ ok: false, error: 'Gemini returned empty response' }, { status: 502 });
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
    status: 'approved',
    ai_generated: true,
  }).select().single();

  if (insertError) {
    return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  // Generate visual using KeiroAI's own Seedream (proof of product!)
  const visualDesc = post.thumbnail_description || post.visual_description || post.hook || post.caption;
  let visualUrl: string | null = null;
  if (visualDesc && inserted?.id) {
    visualUrl = await generateVisual(visualDesc, post.format || schedule.format);
    if (visualUrl) {
      await supabase
        .from('content_calendar')
        .update({ visual_url: visualUrl, status: 'published', published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', inserted.id);
      console.log(`[Content] Visual generated + auto-published for post ${inserted.id}`);
    }
  }

  // Send notification to founder (post is ready/published)
  if (process.env.RESEND_API_KEY) {
    const isPublished = !!visualUrl;
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
          ${visualUrl ? `<img src="${visualUrl}" style="max-width:100%;border-radius:8px;margin:12px 0;" alt="Visuel généré par KeiroAI"/>
          <p style="color:#6b7280;font-size:12px;">Visuel généré et publié automatiquement par KeiroAI</p>` : ''}
          <p style="margin-top:16px;"><a href="https://keiroai.com/admin/agents" style="color:#9333ea;">→ Voir dans l'admin</a></p>
        </div>`,
      }),
    });
  }

  await supabase.from('agent_logs').insert({
    agent: 'content', action: 'daily_post_generated',
    data: { platform: post.platform, format: post.format, pillar: post.pillar, hook: post.hook },
    status: 'success', created_at: nowISO,
  });

  console.log(`[Content] Daily post: ${post.platform} ${post.format} — ${post.hook}`);

  return NextResponse.json({ ok: true, post: inserted });
}
