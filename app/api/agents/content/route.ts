import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { getAuthUser } from '@/lib/auth-server';
import { getContentSystemPrompt, getWeeklyPlanPrompt } from '@/lib/agents/content-prompt';
import { publishImageToInstagram, publishStoryToInstagram, publishCarouselToInstagram } from '@/lib/meta';
import { publishTikTokVideoViaFileUpload, initTikTokPhotoUpload, refreshTikTokToken } from '@/lib/tiktok';
import { createT2VTask, checkT2VTask } from '@/lib/kling';
import { publishReelToInstagram } from '@/lib/meta';
// Ken Burns + FFmpeg removed — doesn't work on Vercel serverless
// Video pipeline now uses Seedance T2V / Kling T2V
import { completeDirective, loadContextWithAvatar } from '@/lib/agents/shared-context';
import { escalateAgentError } from '@/lib/agents/error-escalation';
import { decomposePromptIntoScenes, calculateSegments } from '@/lib/video-scenes';
import { createVideoJob } from '@/lib/video-jobs-db';
import { diagnosePublishFailure, sendPublishAlert } from '@/lib/agents/publish-diagnostics';
import { saveLearning, saveAgentFeedback } from '@/lib/agents/learning';
import { sendPublishNotification } from '@/lib/agents/publish-notification';

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
export const maxDuration = 300;

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
const NO_TEXT_SUFFIX = '\nCRITICAL: Absolutely NO text, NO letters, NO words, NO numbers, NO writing, NO signs, NO labels, NO watermarks, NO logos, NO digits, NO characters, NO typography anywhere in the image. The image must contain ZERO readable text or number-like shapes. Pure photographic visual only. If there would be a sign or screen in the scene, make it blank or blurred.';

const SEEDREAM_STYLE_GUIDE = `You are an elite prompt engineer for Seedream (text-to-image AI).
Your goal: create premium, brand-consistent visuals for KeiroAI (AI marketing tool for local businesses).

BRAND VISUAL IDENTITY:
- Primary color: deep violet — innovation, premium tech
- Secondary: soft purple, deep black, warm white
- Accent: amber for energy
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
- Smartphones, phones, tablets, screens, devices, mockups, UI screenshots (unless explicitly requested)
- Hex color codes (like #7C3AED) — use color names instead (deep violet, soft purple, amber)
- Aspect ratios or technical specs (like 9:16, 1:1, 4K) — describe the feeling not the format
- Cluttered compositions with too many elements
- Stock photo aesthetic (generic, lifeless)
- Low contrast or muddy colors

PREFERRED SUBJECTS (vary creatively):
- Real-life scenes: merchants working, cooking, arranging flowers, styling hair, serving customers
- Conceptual illustrations: abstract shapes, isometric scenes, geometric compositions
- Objects: artisan products, food, flowers, storefronts, workshops, tools of the trade
- People: stylized characters, silhouettes, creative portraits (NOT behind screens)
- Environments: cozy shops, vibrant markets, modern boutiques, sunny terraces

Output ONLY the optimized English prompt — pure visual description, no technical jargon. Nothing else.`;

/**
 * Cache a temporary Seedream URL to Supabase Storage for permanent access.
 */
async function cacheImageToStorage(tempUrl: string, postId: string): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    const imgResponse = await fetch(tempUrl);
    if (!imgResponse.ok) {
      console.error('[Content] Failed to download image for caching:', imgResponse.status);
      return null;
    }
    const buffer = await imgResponse.arrayBuffer();
    if (buffer.byteLength === 0) return null;

    const contentType = imgResponse.headers.get('content-type') || 'image/png';
    const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png';
    const fileName = `content/${postId}-${Date.now()}.${ext}`;

    const blob = new Blob([buffer], { type: contentType });
    const { error: uploadError } = await supabase.storage
      .from('generated-images')
      .upload(fileName, blob, { contentType, upsert: false });

    if (uploadError) {
      console.error('[Content] Storage upload error:', uploadError.message);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('generated-images')
      .getPublicUrl(fileName);

    console.log('[Content] Image cached to storage:', publicUrl?.substring(0, 80));
    return publicUrl || null;
  } catch (error: any) {
    console.error('[Content] Image caching failed:', error.message);
    return null;
  }
}

async function generateVisual(visualDescription: string, format: string): Promise<string | null> {
  try {
    // Optimize the visual description into an elite Seedream prompt
    const optimizedText = await callClaude({
      system: SEEDREAM_STYLE_GUIDE,
      message: `Create a premium visual prompt for a ${format} post.\n\nVisual brief: ${visualDescription}\n\nFormat context: ${format === 'carrousel' || format === 'post' ? 'Square format, must look great as Instagram grid thumbnail' : format === 'reel' || format === 'video' || format === 'story' ? 'Vertical mobile format, bold and eye-catching' : 'Horizontal wide format, professional LinkedIn style'}\n\nIMPORTANT: Do NOT include any hex color codes, aspect ratios, numbers, or technical specifications in the prompt. Describe colors by name only (e.g. "deep violet" not "#7C3AED"). The output must be a PURE VISUAL DESCRIPTION with zero technical jargon.`,
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
        negative_prompt: 'text, words, letters, numbers, writing, typography, signs, labels, captions, watermarks, logos, headlines, slogans, brand names, price tags, menus, screens with text, readable characters, digits',
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
    const tempUrl = seedreamData.data?.[0]?.url || null;

    if (!tempUrl) {
      console.warn('[Content] Seedream returned no image URL');
      return null;
    }

    // Cache to Supabase Storage for permanent URL (Seedream URLs expire in ~1h)
    const postId = `post-${Date.now()}`;
    const permanentUrl = await cacheImageToStorage(tempUrl, postId);
    if (permanentUrl) {
      console.log('[Content] Visual generated + cached to permanent storage');
      return permanentUrl;
    }

    // Fallback to temp URL if caching fails
    console.warn('[Content] Cache failed, using temporary Seedream URL');
    return tempUrl;
  } catch (e: any) {
    console.error('[Content] Visual generation error:', e.message);
    return null;
  }
}

// ──────────────────────────────────────
// Publish to Instagram via Graph API
// ──────────────────────────────────────
/**
 * Check if an image/video URL has already been published to Instagram recently.
 * Prevents duplicate publications of the same visual.
 */
async function checkDuplicatePublication(
  supabase: any,
  visualUrl: string | undefined,
  videoUrl: string | undefined,
  platform: string = 'instagram',
  daysBack: number = 7
): Promise<{ isDuplicate: boolean; existingPostId?: string; existingPermalink?: string }> {
  if (!visualUrl && !videoUrl) return { isDuplicate: false };

  const since = new Date(Date.now() - daysBack * 86400000).toISOString().split('T')[0];

  // Check content_calendar for same visual_url or video_url published recently
  const conditions: string[] = [];
  if (visualUrl) conditions.push(`visual_url.eq.${visualUrl}`);
  if (videoUrl) conditions.push(`video_url.eq.${videoUrl}`);

  const { data: existing } = await supabase
    .from('content_calendar')
    .select('id, instagram_permalink, visual_url, video_url, published_at')
    .eq('status', 'published')
    .eq('platform', platform)
    .gte('scheduled_date', since)
    .or(conditions.join(','))
    .limit(1);

  if (existing && existing.length > 0) {
    console.warn(`[Content] DUPLICATE DETECTED: visual already published as post ${existing[0].id} on ${existing[0].published_at}`);
    return {
      isDuplicate: true,
      existingPostId: existing[0].id,
      existingPermalink: existing[0].instagram_permalink,
    };
  }

  return { isDuplicate: false };
}

async function publishToInstagram(
  post: { id?: string; format?: string; caption?: string; hashtags?: string[]; visual_url?: string; video_url?: string },
  supabase: any
): Promise<{ success: boolean; permalink?: string; error?: string }> {
  try {
    // ── Dedup check: prevent publishing the same image twice ──
    const dupCheck = await checkDuplicatePublication(supabase, post.visual_url, post.video_url, 'instagram');
    if (dupCheck.isDuplicate) {
      console.warn(`[Content] Skipping duplicate Instagram publication. Already published as ${dupCheck.existingPostId}`);
      return {
        success: false,
        error: `Duplicate: cette image a déjà été publiée (post ${dupCheck.existingPostId}${dupCheck.existingPermalink ? `, ${dupCheck.existingPermalink}` : ''})`,
      };
    }

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

    if (!post.visual_url && !post.video_url) {
      return { success: false, error: 'No visual_url or video_url available for publishing' };
    }

    // Build caption with hashtags — visually clean formatting
    const hashtagsArr = Array.isArray(post.hashtags) ? post.hashtags : [];
    const rawCaption = (post.caption || '').trim();
    // Ensure caption ends with proper spacing before hashtags
    const captionNeedsSeparator = rawCaption.length > 0 && !rawCaption.endsWith('\n');
    const hashtagLine = hashtagsArr.length > 0 ? hashtagsArr.map(h => h.startsWith('#') ? h : `#${h}`).join(' ') : '';
    const fullCaption = rawCaption + (hashtagLine ? (captionNeedsSeparator ? '\n\n・・・\n\n' : '\n\n') + hashtagLine : '');

    const format = (post.format || 'post').toLowerCase();

    console.log(`[Content] Publishing to Instagram as ${format} (ig_user: ${igUserId})...`);

    let result: { id: string; permalink?: string };

    if (format === 'reel' || format === 'video') {
      // Reels/video: publish as Instagram Reel (video required)
      if (post.video_url) {
        console.log('[Content] Publishing Instagram REEL with video');
        result = await publishReelToInstagram(igUserId, pageAccessToken, post.video_url, fullCaption);
      } else if (post.visual_url) {
        // No video available — fallback to image post
        console.log('[Content] Reel requested but no video — falling back to image post');
        result = await publishImageToInstagram(igUserId, pageAccessToken, post.visual_url, fullCaption);
      } else {
        return { success: false, error: 'No video_url for Reel publishing' };
      }
    } else if (format === 'story') {
      // Stories don't have captions via Graph API
      const storyResult = await publishStoryToInstagram(igUserId, pageAccessToken, post.visual_url!);
      result = { id: storyResult.id };
    } else if (format === 'carrousel') {
      console.log('[Content] Carousel detected — publishing as single image (multi-image carousel not yet supported)');
      result = await publishImageToInstagram(igUserId, pageAccessToken, post.visual_url!, fullCaption);
    } else {
      // post or any other format → single image publish
      result = await publishImageToInstagram(igUserId, pageAccessToken, post.visual_url!, fullCaption);
    }

    console.log(`[Content] Instagram publish success — media id: ${result.id}${result.permalink ? `, permalink: ${result.permalink}` : ''}`);

    return { success: true, permalink: result.permalink };
  } catch (error: any) {
    console.error('[Content] Instagram publish error:', error.message || error);
    return { success: false, error: error.message || 'Unknown Instagram publishing error' };
  }
}

// ──────────────────────────────────────
// Seedance T2V API constants (same as /api/seedream/t2v)
// ──────────────────────────────────────
const SEEDANCE_API_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks';

/**
 * Extract video URL from Seedance task status response (mirrors checkSeedanceTaskStatus in t2v route).
 */
function extractSeedanceVideoUrl(data: any): string | null {
  if (data.content && typeof data.content === 'object' && !Array.isArray(data.content)) {
    if (data.content.video_url) return typeof data.content.video_url === 'string' ? data.content.video_url : data.content.video_url.url || null;
  }
  if (data.content && Array.isArray(data.content)) {
    for (const item of data.content) {
      if (item.type === 'video_url' && item.video_url?.url) return item.video_url.url;
      if (item.type === 'video' && item.url) return item.url;
      if (item.video_url) return typeof item.video_url === 'string' ? item.video_url : item.video_url.url;
    }
  }
  return data.output?.video_url || data.output?.url || data.result?.video_url || data.result?.url || data.video_url || data.url || data.data?.video_url || null;
}

// ──────────────────────────────────────
// Generate TikTok/short video via Seedance T2V (+ Kling T2V fallback)
// Returns permanent Supabase Storage URL or null
// ──────────────────────────────────────
async function generateTikTokVideo(visualDescription: string): Promise<string | null> {
  try {
    // Optimize prompt for viral video generation
    const optimizedPrompt = await callClaude({
      system: `Tu es le meilleur créateur de vidéos virales pour les réseaux sociaux. Tu convertis des briefs marketing en prompts vidéo EXCEPTIONNELS pour Seedance AI.

RÈGLES POUR UN PROMPT VIDÉO VIRAL :
- Décris une SCÈNE UNIQUE avec du MOUVEMENT captivant (pas statique)
- Inclus des MOUVEMENTS DE CAMÉRA (dolly in, pan, tracking shot, drone aerial)
- Lumière cinématique : golden hour, néons, rétro-éclairage dramatique
- Émotions fortes : surprise, satisfaction, émerveillement
- Style : ultra réaliste 4K cinématique, profondeur de champ
- JAMAIS de texte, lettres, mots, logos dans la vidéo
- Max 200 caractères, EN ANGLAIS uniquement
- Le prompt doit donner une vidéo qui ARRÊTE le scroll

Output UNIQUEMENT le prompt vidéo, rien d'autre.`,
      message: `Create a 10s vertical video prompt from this brief: ${visualDescription}`,
      maxTokens: 200,
    });

    const videoPrompt = (optimizedPrompt || visualDescription).substring(0, 250);
    console.log(`[Content] Generating video: "${videoPrompt.substring(0, 80)}..."`);

    const apiKey = process.env.SEEDREAM_API_KEY || SEEDREAM_API_KEY;

    // ═══ PROVIDER ORDER: Kling primary, Seedance fallback ═══
    // To swap on 2026-03-24: move Seedance block above Kling block

    // --- Try Kling T2V first (primary) ---
    try {
      console.log('[Content] Trying Kling T2V (primary)...');
      const klingTaskId = await createT2VTask({
        prompt: videoPrompt,
        duration: '10',
        aspect_ratio: '9:16',
      });
      console.log(`[Content] Kling T2V task created: ${klingTaskId}`);

      const maxWait = 180_000;
      const pollInterval = 8_000;
      const start = Date.now();

      while (Date.now() - start < maxWait) {
        await new Promise(r => setTimeout(r, pollInterval));
        const result = await checkT2VTask(klingTaskId);
        if (result.status === 'completed' && result.videoUrl) {
          console.log(`[Content] Kling T2V completed: ${result.videoUrl.substring(0, 80)}...`);
          const cachedUrl = await cacheVideoToStorage(result.videoUrl, `tiktok-${Date.now()}`);
          return cachedUrl || result.videoUrl;
        }
        if (result.status === 'failed') {
          console.error(`[Content] Kling T2V failed: ${result.error}`);
          break;
        }
        console.log(`[Content] Kling T2V polling... status: ${result.status}`);
      }
    } catch (klingErr: any) {
      console.warn('[Content] Kling T2V failed:', klingErr.message);
    }

    // --- Fallback to Seedance T2V ---
    try {
      console.log('[Content] Kling failed — falling back to Seedance T2V...');
      const formattedPrompt = `${videoPrompt} --camerafixed false --duration 10`;
      const seedanceRes = await fetch(SEEDANCE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'seedance-1-5-pro-251215',
          content: [{ type: 'text', text: formattedPrompt }],
        }),
      });

      if (!seedanceRes.ok) {
        const errText = await seedanceRes.text().catch(() => '');
        throw new Error(`Seedance HTTP ${seedanceRes.status}: ${errText.substring(0, 200)}`);
      }

      const seedanceData = await seedanceRes.json();
      const taskId = seedanceData.id || seedanceData.task_id || seedanceData.data?.id || seedanceData.data?.task_id;
      if (!taskId) throw new Error('Seedance returned no task ID');

      console.log(`[Content] Seedance fallback task created: ${taskId}`);

      const maxWait = 240_000;
      const pollInterval = 10_000;
      const start = Date.now();

      while (Date.now() - start < maxWait) {
        await new Promise(r => setTimeout(r, pollInterval));
        const statusRes = await fetch(`${SEEDANCE_API_URL}/${taskId}`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        if (!statusRes.ok) { console.warn(`[Content] Seedance status error: ${statusRes.status}`); continue; }

        const statusData = await statusRes.json();
        const status = statusData.status || statusData.data?.status || statusData.state || statusData.data?.state;

        if (status === 'succeeded' || status === 'completed' || status === 'success' || status === 'done') {
          const videoUrl = extractSeedanceVideoUrl(statusData);
          if (videoUrl) {
            console.log(`[Content] Seedance T2V completed: ${videoUrl.substring(0, 80)}...`);
            const cachedUrl = await cacheVideoToStorage(videoUrl, `tiktok-${Date.now()}`);
            return cachedUrl || videoUrl;
          }
          console.warn('[Content] Seedance completed but no video URL');
          break;
        }
        if (status === 'failed' || status === 'error' || status === 'cancelled') {
          console.error(`[Content] Seedance T2V failed: ${statusData.error || status}`);
          break;
        }
        console.log(`[Content] Seedance polling... status: ${status}`);
      }
    } catch (seedanceErr: any) {
      console.warn('[Content] Seedance T2V also failed:', seedanceErr.message);
    }

    console.error('[Content] Both Kling and Seedance T2V failed');
    return null;
  } catch (e: any) {
    console.error('[Content] Video generation error:', e.message);
    return null;
  }
}

/**
 * Cache a video file to Supabase Storage for permanent URL.
 */
async function cacheVideoToStorage(tempUrl: string, videoId: string): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    const videoResponse = await fetch(tempUrl);
    if (!videoResponse.ok) return null;
    const buffer = await videoResponse.arrayBuffer();
    if (buffer.byteLength === 0) return null;
    const contentType = videoResponse.headers.get('content-type') || 'video/mp4';
    const fileName = `content/videos/${videoId}.mp4`;
    const blob = new Blob([buffer], { type: contentType });
    const { error: uploadError } = await supabase.storage
      .from('generated-images').upload(fileName, blob, { contentType, upsert: false });
    if (uploadError) {
      console.error('[Content] Video cache upload error:', uploadError.message);
      return null;
    }
    const { data: { publicUrl } } = supabase.storage.from('generated-images').getPublicUrl(fileName);
    console.log('[Content] Video cached to permanent storage');
    return publicUrl || null;
  } catch (e: any) {
    console.error('[Content] Video caching failed:', e.message);
    return null;
  }
}

// ──────────────────────────────────────
// Create an async long video job (30s+) via the video-long pipeline
// Returns the job ID — the video-poll cron will advance and publish
// ──────────────────────────────────────
async function createAsyncLongVideo(
  visualDescription: string,
  caption: string,
  duration: number = 30,
  aspectRatio: string = '9:16',
  postId: string,
): Promise<{ jobId: string | null; coverUrl: string | null }> {
  try {
    console.log(`[Content] === ASYNC LONG VIDEO PIPELINE (${duration}s) ===`);

    // Step 1: Generate cover image via Seedream
    const imageUrl = await generateVisual(visualDescription, 'video');
    console.log(`[Content] Cover image: ${imageUrl ? imageUrl.substring(0, 80) : 'failed'}`);

    // Step 2: Create elite cinematic video brief via Claude
    // This brief will be decomposed into multiple scenes by decomposePromptIntoScenes
    const videoPromptRaw = await callClaude({
      system: `Tu es un directeur de photographie primé qui crée des vidéos virales pour TikTok. Tu transformes un brief marketing en une DESCRIPTION CINÉMATIQUE détaillée qui servira de base pour une vidéo de ${duration} secondes découpée en plusieurs segments.

OBJECTIF : Créer une vidéo qui semble être UN SEUL PLAN CONTINU filmé dans un même lieu, avec une progression narrative fluide.

RÈGLES ABSOLUES :
- Décris UN SEUL LIEU/DÉCOR précis et détaillé (type de mur, matériaux, lumière exacte, palette de couleurs)
- Le lieu doit être VISUELLEMENT RICHE : textures, objets décoratifs, profondeur
- Inclus une PROGRESSION NARRATIVE : révélation → action → détail → conclusion
- Précise la LUMIÈRE exacte : "golden hour amber light streaming through tall windows" pas juste "belle lumière"
- Précise la PALETTE : "warm honey tones, deep mahogany wood, soft cream accents"
- JAMAIS de texte, lettres, mots, logos, panneaux dans la vidéo
- JAMAIS de visages en gros plan (l'IA fait des visages artificiels) — mains, silhouettes, plans larges
- EN ANGLAIS uniquement
- 200-350 caractères

Le prompt doit contenir assez de détails visuels pour qu'un directeur photo puisse en tirer ${Math.ceil(duration / 10)} plans différents dans le MÊME décor.

Output UNIQUEMENT le prompt vidéo, rien d'autre.`,
      message: `Brief marketing: ${visualDescription}\nCaption: ${caption}\nDurée: ${duration}s (sera découpé en ${Math.ceil(duration / 10)} segments de 10s)\nFormat: vertical 9:16 TikTok`,
      maxTokens: 400,
    });

    const videoPrompt = (videoPromptRaw || visualDescription).substring(0, 400);
    console.log(`[Content] Video prompt (${duration}s): "${videoPrompt.substring(0, 100)}..."`);

    // Step 3: Decompose into scenes via Claude
    const scenes = await decomposePromptIntoScenes(videoPrompt, duration, {
      aspectRatio,
      renderStyle: 'photorealistic',
      tone: 'professional',
      visualStyle: 'cinematic',
    });

    console.log(`[Content] Decomposed into ${scenes.length} scenes for ${duration}s`);

    // Step 4: Build job segments
    const jobSegments = scenes.map((scene) => ({
      index: scene.index,
      duration: scene.duration,
      prompt: scene.prompt,
      type: scene.type,
      taskId: null as string | null,
      videoUrl: null as string | null,
      status: 'pending' as 'pending' | 'generating' | 'completed' | 'failed',
      provider: null as ('s' | 'k' | null),
    }));

    // Step 5: Start generating segment 0 via Kling T2V (primary)
    let firstTaskId: string | null = null;
    let firstProvider: 's' | 'k' = 'k';

    // Try Kling T2V first
    try {
      console.log('[Content] Starting segment 0 via Kling T2V...');
      const klingTaskId = await createT2VTask({
        prompt: scenes[0].prompt,
        duration: String(scenes[0].duration >= 10 ? 10 : 5),
        aspect_ratio: aspectRatio,
      });
      firstTaskId = klingTaskId;
      firstProvider = 'k';
      console.log(`[Content] Segment 0 started: Kling taskId=${klingTaskId}`);
    } catch (klingErr: any) {
      console.warn('[Content] Kling T2V failed for segment 0:', klingErr.message);

      // Fallback: Seedance T2V
      try {
        const apiKey = process.env.SEEDREAM_API_KEY || SEEDREAM_API_KEY;
        const segDuration = scenes[0].duration >= 10 ? 10 : 5;
        const formattedPrompt = `${scenes[0].prompt.substring(0, 200)} --camerafixed false --ratio ${aspectRatio} --duration ${segDuration}`;
        const SEEDANCE_T2V_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks';
        const seedanceRes = await fetch(SEEDANCE_T2V_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: 'seedance-1-5-pro-251215', content: [{ type: 'text', text: formattedPrompt }] }),
        });
        if (!seedanceRes.ok) throw new Error(`Seedance HTTP ${seedanceRes.status}`);
        const seedanceData = await seedanceRes.json();
        const taskId = seedanceData.id || seedanceData.task_id || seedanceData.data?.id || seedanceData.data?.task_id;
        if (!taskId) throw new Error('Seedance returned no task ID');
        firstTaskId = `seedream_${taskId}`;
        firstProvider = 's';
        console.log(`[Content] Segment 0 started: Seedance taskId=${firstTaskId}`);
      } catch (seedanceErr: any) {
        console.error('[Content] Both Kling and Seedance failed for segment 0:', seedanceErr.message);
        return { jobId: null, coverUrl: imageUrl };
      }
    }

    // Step 6: Create the video job in DB
    jobSegments[0].taskId = firstTaskId;
    jobSegments[0].status = 'generating';
    jobSegments[0].provider = firstProvider;

    const supabase = getSupabaseAdmin();
    // Use a system user ID for cron-created jobs
    const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
    const job = await createVideoJob(supabase, {
      user_id: SYSTEM_USER_ID,
      status: 'generating',
      total_segments: jobSegments.length,
      completed_segments: 0,
      current_segment_task_id: firstTaskId!,
      segments: jobSegments,
      prompt: videoPrompt,
      duration,
      aspect_ratio: aspectRatio,
    });

    if (!job) {
      console.error('[Content] Failed to create video job via RPC');
      return { jobId: null, coverUrl: imageUrl };
    }

    console.log(`[Content] Video job created: ${job.id} (${scenes.length} segments, ${duration}s)`);

    // Step 7: Link job to content_calendar post
    await supabase.from('content_calendar').update({
      video_job_id: job.id,
      visual_url: imageUrl,
      status: 'video_generating',
      updated_at: new Date().toISOString(),
    }).eq('id', postId);

    return { jobId: job.id, coverUrl: imageUrl };
  } catch (e: any) {
    console.error('[Content] Async long video creation error:', e.message);
    return { jobId: null, coverUrl: null };
  }
}

// ──────────────────────────────────────
// Generate video via Seedance T2V (+ Kling T2V fallback) for Reels & TikTok
// Pipeline: cover image (Seedream) → elite video prompt → Seedance T2V → cache
// ──────────────────────────────────────
async function generateVideoWithNarration(
  visualDescription: string,
  caption: string,
  format: string = 'reel',
  duration: number = 5
): Promise<{ videoUrl: string | null; coverUrl: string | null }> {
  try {
    console.log(`[Content] === VIDEO PIPELINE (Seedance T2V + Kling fallback) ===`);

    // Step 1: Generate the cover image via Seedream
    console.log('[Content] Step 1: Generating Seedream cover image...');
    const imageUrl = await generateVisual(visualDescription, format);
    if (!imageUrl) {
      console.error('[Content] Image generation failed — aborting video pipeline');
      return { videoUrl: null, coverUrl: null };
    }
    console.log('[Content] Cover image generated:', imageUrl.substring(0, 80));

    // Step 2: Create an elite viral video prompt via Claude Haiku
    console.log('[Content] Step 2: Creating elite video prompt...');
    const videoPromptRaw = await callClaude({
      system: `Tu es le meilleur créateur de vidéos virales pour les réseaux sociaux. Tu convertis des briefs marketing en prompts vidéo EXCEPTIONNELS pour Seedance AI.

RÈGLES POUR UN PROMPT VIDÉO VIRAL :
- Décris une SCÈNE UNIQUE avec du MOUVEMENT captivant (pas statique)
- Inclus des MOUVEMENTS DE CAMÉRA (dolly in, pan, tracking shot, drone aerial)
- Lumière cinématique : golden hour, néons, rétro-éclairage dramatique
- Émotions fortes : surprise, satisfaction, émerveillement
- Style : ultra réaliste 4K cinématique, profondeur de champ
- JAMAIS de texte, lettres, mots, logos dans la vidéo
- Max 200 caractères, EN ANGLAIS uniquement
- Le prompt doit donner une vidéo qui ARRÊTE le scroll

Output UNIQUEMENT le prompt vidéo, rien d'autre.`,
      message: `Brief marketing: ${visualDescription}\nCaption: ${caption}`,
      maxTokens: 200,
    });

    const videoPrompt = (videoPromptRaw || visualDescription).substring(0, 250);
    console.log(`[Content] Video prompt: "${videoPrompt.substring(0, 100)}..."`);

    // ═══ PROVIDER ORDER: Kling primary, Seedance fallback ═══
    // To swap on 2026-03-24: move Seedance block above Kling block

    // Step 3: Try Kling T2V first (primary)
    console.log('[Content] Step 3: Calling Kling T2V API (primary)...');
    let videoUrl: string | null = null;
    const apiKey = process.env.SEEDREAM_API_KEY || SEEDREAM_API_KEY;

    try {
      // Kling supports '5' and '10' second durations
      const klingDuration = duration >= 10 ? '10' : '5';
      const klingTaskId = await createT2VTask({
        prompt: videoPrompt,
        duration: klingDuration,
        aspect_ratio: '9:16',
      });
      console.log(`[Content] Kling T2V task created: ${klingTaskId} (${klingDuration}s)`);

      const maxWaitK = 180_000;
      const pollIntervalK = 8_000;
      const startK = Date.now();

      while (Date.now() - startK < maxWaitK) {
        await new Promise(r => setTimeout(r, pollIntervalK));
        const result = await checkT2VTask(klingTaskId);
        if (result.status === 'completed' && result.videoUrl) {
          videoUrl = result.videoUrl;
          console.log(`[Content] Kling T2V completed: ${videoUrl.substring(0, 80)}...`);
          break;
        }
        if (result.status === 'failed') {
          console.error(`[Content] Kling T2V failed: ${result.error}`);
          break;
        }
        console.log(`[Content] Kling T2V polling... status: ${result.status}`);
      }

      if (!videoUrl && Date.now() - startK >= maxWaitK) {
        console.error('[Content] Kling T2V timeout after 3 minutes');
      }
    } catch (klingErr: any) {
      console.warn('[Content] Kling T2V failed:', klingErr.message);
    }

    // Step 4: If Kling failed, fallback to Seedance T2V
    if (!videoUrl) {
      console.log('[Content] Kling failed — falling back to Seedance T2V...');
      try {
        const seedanceDur = Math.min(duration, 10); // Seedance max ~10s per segment
        const formattedPrompt = `${videoPrompt} --camerafixed false --duration ${seedanceDur}`;
        const seedanceRes = await fetch(SEEDANCE_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'seedance-1-5-pro-251215',
            content: [{ type: 'text', text: formattedPrompt }],
          }),
        });

        if (!seedanceRes.ok) {
          const errText = await seedanceRes.text().catch(() => '');
          throw new Error(`Seedance HTTP ${seedanceRes.status}: ${errText.substring(0, 200)}`);
        }

        const seedanceData = await seedanceRes.json();
        const taskId = seedanceData.id || seedanceData.task_id || seedanceData.data?.id || seedanceData.data?.task_id;
        if (!taskId) throw new Error('Seedance returned no task ID');

        console.log(`[Content] Seedance fallback task created: ${taskId}`);

        const maxWaitS = 240_000;
        const pollIntervalS = 10_000;
        const startS = Date.now();

        while (Date.now() - startS < maxWaitS) {
          await new Promise(r => setTimeout(r, pollIntervalS));
          const statusRes = await fetch(`${SEEDANCE_API_URL}/${taskId}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${apiKey}` },
          });
          if (!statusRes.ok) { console.warn(`[Content] Seedance status error: ${statusRes.status}`); continue; }

          const statusData = await statusRes.json();
          const status = statusData.status || statusData.data?.status || statusData.state || statusData.data?.state;

          if (status === 'succeeded' || status === 'completed' || status === 'success' || status === 'done') {
            videoUrl = extractSeedanceVideoUrl(statusData);
            if (videoUrl) {
              console.log(`[Content] Seedance T2V completed: ${videoUrl.substring(0, 80)}...`);
            } else {
              console.warn('[Content] Seedance completed but no video URL');
            }
            break;
          }
          if (status === 'failed' || status === 'error' || status === 'cancelled') {
            console.error(`[Content] Seedance T2V failed: ${statusData.error || status}`);
            break;
          }
          console.log(`[Content] Seedance polling... status: ${status}`);
        }
      } catch (seedanceErr: any) {
        console.warn('[Content] Seedance T2V also failed:', seedanceErr.message);
      }
    }

    // Step 5: Cache the video to Supabase Storage for permanent URL
    if (videoUrl) {
      const videoId = `reel-${Date.now()}`;
      const cachedUrl = await cacheVideoToStorage(videoUrl, videoId);
      const finalUrl = cachedUrl || videoUrl;
      console.log(`[Content] === VIDEO PIPELINE COMPLETE: ${finalUrl.substring(0, 80)} ===`);
      return { videoUrl: finalUrl, coverUrl: imageUrl };
    }

    // Video generation failed entirely — return cover image anyway
    console.warn('[Content] Video generation failed (both Seedance + Kling) — returning cover only');
    return { videoUrl: null, coverUrl: imageUrl };
  } catch (e: any) {
    console.error('[Content] Video pipeline error:', e.message);
    return { videoUrl: null, coverUrl: null };
  }
}

// ──────────────────────────────────────
// Publish to TikTok (ALWAYS as video — photo API not supported)
// ──────────────────────────────────────
async function publishToTikTok(
  post: { format?: string; caption?: string; hashtags?: string[]; visual_url?: string; video_url?: string },
  supabase: any
): Promise<{ success: boolean; publish_id?: string; error?: string; unaudited?: boolean }> {
  try {
    // Get admin's TikTok tokens
    const { data: adminProfile, error: profileError } = await supabase
      .from('profiles')
      .select('tiktok_access_token, tiktok_refresh_token, tiktok_token_expiry, tiktok_user_id')
      .eq('is_admin', true)
      .single();

    if (profileError || !adminProfile) {
      console.error('[Content] No admin profile for TikTok publishing');
      return { success: false, error: 'No admin profile found' };
    }

    let accessToken = adminProfile.tiktok_access_token;
    const refreshToken = adminProfile.tiktok_refresh_token;

    if (!accessToken || !refreshToken) {
      return { success: false, error: 'TikTok tokens not configured for admin' };
    }

    // Refresh token if expired
    const tokenExpiry = adminProfile.tiktok_token_expiry ? new Date(adminProfile.tiktok_token_expiry) : null;
    if (!tokenExpiry || tokenExpiry <= new Date()) {
      console.log('[Content] TikTok token expired, refreshing...');
      try {
        const clientKey = process.env.TIKTOK_CLIENT_KEY || process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY;
        if (!clientKey) return { success: false, error: 'TIKTOK_CLIENT_KEY not configured' };
        const refreshed = await refreshTikTokToken(refreshToken, clientKey);
        accessToken = refreshed.access_token;
        // Update tokens in DB
        await supabase.from('profiles').update({
          tiktok_access_token: refreshed.access_token,
          tiktok_refresh_token: refreshed.refresh_token,
          tiktok_token_expiry: new Date(Date.now() + (refreshed.expires_in || 86400) * 1000).toISOString(),
        }).eq('is_admin', true);
        console.log('[Content] TikTok token refreshed successfully');
      } catch (refreshError: any) {
        console.error('[Content] TikTok token refresh failed:', refreshError.message);
        return { success: false, error: `Token refresh failed: ${refreshError.message}` };
      }
    }

    const hashtagsArr = Array.isArray(post.hashtags) ? post.hashtags : [];
    const rawCaptionTT = (post.caption || '').trim();
    const hashtagLineTT = hashtagsArr.length > 0 ? hashtagsArr.map((h: string) => h.startsWith('#') ? h : `#${h}`).join(' ') : '';
    const fullCaption = rawCaptionTT + (hashtagLineTT ? '\n\n' + hashtagLineTT : '');

    // TikTok: publish as VIDEO or PHOTO depending on content
    // Priority: 1) existing video_url → video, 2) image with photo-friendly format → photo, 3) generate video
    let videoUrl = post.video_url;
    const visualUrl = post.visual_url;
    const format = (post.format || '').toLowerCase();

    // Decide: photo or video?
    // Video formats always get video; photo/carousel/static formats can use photo
    const isVideoFormat = format.includes('reel') || format.includes('vidéo') || format.includes('video');
    const hasVideo = !!videoUrl;
    const hasImage = !!visualUrl;

    // Vary between photo and video: if no video exists and format isn't video-specific, publish as photo
    if (!hasVideo && hasImage && !isVideoFormat) {
      console.log(`[Content] TikTok: publishing as PHOTO (format: ${format}, has image: ${hasImage})`);
      try {
        const result = await initTikTokPhotoUpload(
          accessToken,
          [visualUrl],
          fullCaption.substring(0, 2200),
        );
        console.log(`[Content] TikTok PHOTO published: ${result.publish_id}`);
        return { success: true, publish_id: result.publish_id };
      } catch (photoErr: any) {
        console.warn('[Content] TikTok photo publish failed, falling back to video:', photoErr.message);
        // Fall through to video generation
      }
    }

    // Video path
    if (!videoUrl) {
      const visualDesc = (post as any).visual_description || post.caption || 'Professional marketing content for local business';
      console.log('[Content] TikTok: no video_url — generating via Seedance/Kling T2V...');
      videoUrl = await generateTikTokVideo(visualDesc) || undefined;
    }

    if (!videoUrl) {
      // Last resort: try photo if we have an image
      if (hasImage) {
        console.log('[Content] TikTok: video generation failed, attempting photo as last resort');
        try {
          const result = await initTikTokPhotoUpload(accessToken, [visualUrl!], fullCaption.substring(0, 2200));
          return { success: true, publish_id: result.publish_id };
        } catch (e: any) {
          return { success: false, error: `Both video and photo failed: ${e.message}` };
        }
      }
      return { success: false, error: 'No video or image available for TikTok publishing' };
    }

    console.log(`[Content] Publishing TikTok VIDEO: ${videoUrl.substring(0, 60)}...`);
    const result = await publishTikTokVideoViaFileUpload(
      accessToken,
      videoUrl,
      fullCaption.substring(0, 2200),
      { privacy_level: 'PUBLIC_TO_EVERYONE' }
    );
    console.log(`[Content] TikTok video published: ${result.publish_id}`);
    return { success: true, publish_id: result.publish_id };
  } catch (error: any) {
    const msg = error.message || 'Unknown TikTok publishing error';
    console.error('[Content] TikTok publish error:', msg);

    // Detect unaudited app — don't retry, just flag clearly
    if (msg.includes('unaudited_client')) {
      return {
        success: false,
        error: 'TikTok Content Posting API non audité. Soumettez App Review sur developers.tiktok.com pour activer la publication.',
        unaudited: true,
      };
    }

    return { success: false, error: msg };
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

  const orgId = request.nextUrl.searchParams.get('org_id') || null;
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

    // Check slot param for midday/evening content
    const slot = request.nextUrl.searchParams.get('slot');

    // If no post for today, generate one on the fly
    if (!todayPosts || todayPosts.length === 0) {
      console.log('[Content] No posts for today — generating one now');
      return generateDailyPost(supabase, todayStr, dayOfWeek, undefined, undefined, undefined, orgId);
    }

    // Auto-publish: only 1 post per slot to spread publications throughout the day
    // Each content slot (morning, midday, evening) publishes max 1 post, avoiding 3 at once
    // Publish mode: 'auto' = publish immediately, 'notify' = send email notification first (draft→notify→approve→publish)
    // Read publish_mode from URL param (cron) or from stored admin preference
    let publishMode = request.nextUrl.searchParams.get('publish_mode') || 'auto';
    if (publishMode === 'auto') {
      // Check if admin has set notify preference in agent_logs config
      const { data: modeConfig } = await supabase
        .from('agent_logs')
        .select('data')
        .eq('agent', 'content')
        .eq('action', 'publish_mode_config')
        .order('created_at', { ascending: false })
        .limit(1);
      if (modeConfig?.[0]?.data?.publish_mode === 'notify') {
        publishMode = 'notify';
      }
    }
    const unpublished = todayPosts.filter((p: any) => p.status === 'draft' || p.status === 'approved');
    const maxPublishPerSlot = slot === 'tiktok' ? 2 : 1; // TikTok slot can do 2 (video + photo)
    if (unpublished.length > 0 && isCron) {
      console.log(`[Content] ${unpublished.length} unpublished posts for today — mode=${publishMode}, max ${maxPublishPerSlot} for slot: ${slot || 'default'}`);
      let published = 0;
      let notified = 0;
      for (const post of unpublished.slice(0, maxPublishPerSlot)) {
        try {
          // If notify mode and post is draft (not yet approved), send notification instead of publishing
          if (publishMode === 'notify' && post.status === 'draft') {
            const { data: fullPostForNotify } = await supabase.from('content_calendar').select('*').eq('id', post.id).single();
            if (fullPostForNotify) {
              // Generate visual if missing (so notification has the preview)
              if (!fullPostForNotify.visual_url) {
                const desc = fullPostForNotify.visual_description || fullPostForNotify.hook || fullPostForNotify.caption;
                if (desc) {
                  const url = await generateVisual(desc, fullPostForNotify.format || 'post');
                  if (url) {
                    const cached = await cacheImageToStorage(url, post.id);
                    fullPostForNotify.visual_url = cached || url;
                    await supabase.from('content_calendar').update({ visual_url: fullPostForNotify.visual_url, updated_at: new Date().toISOString() }).eq('id', post.id);
                  }
                }
              }
              const sent = await sendPublishNotification(fullPostForNotify, supabase);
              if (sent) {
                await supabase.from('content_calendar').update({ status: 'pending_approval', updated_at: new Date().toISOString() }).eq('id', post.id);
                notified++;
                console.log(`[Content] Notification sent for post ${post.id} — awaiting approval`);
              }
            }
            continue;
          }
          const { data: fullPost } = await supabase.from('content_calendar').select('*').eq('id', post.id).single();
          if (!fullPost) continue;

          let visualUrl = fullPost.visual_url;

          // Generate visual if missing
          if (!visualUrl) {
            const visualDesc = fullPost.visual_description || fullPost.hook || fullPost.caption;
            if (!visualDesc) {
              console.warn(`[Content] Post ${post.id} has no visual and no description — skipping`);
              continue;
            }
            visualUrl = await generateVisual(visualDesc, fullPost.format || 'post');
            if (!visualUrl) {
              console.warn(`[Content] Visual generation failed for post ${post.id} — skipping`);
              continue;
            }
            const cachedUrl = await cacheImageToStorage(visualUrl, post.id);
            if (cachedUrl) visualUrl = cachedUrl;
            await supabase.from('content_calendar').update({ visual_url: visualUrl, updated_at: new Date().toISOString() }).eq('id', post.id);
          }

          // For reel/video formats: generate video if not already done
          const postFormat = (fullPost.format || 'post').toLowerCase();
          let videoUrl = fullPost.video_url || null;
          if ((postFormat === 'reel' || postFormat === 'video') && !videoUrl) {
            console.log(`[Content] Auto-publish: ${postFormat} needs video — generating...`);
            const desc = fullPost.visual_description || fullPost.hook || fullPost.caption;
            if (desc) {
              const vidResult = await generateVideoWithNarration(desc, fullPost.caption || desc, postFormat, 5);
              videoUrl = vidResult.videoUrl;
              if (vidResult.coverUrl && !visualUrl) visualUrl = vidResult.coverUrl;
            }
            if (!videoUrl && visualUrl) {
              console.log(`[Content] Video failed for post ${post.id} — downgrading to image post`);
              await supabase.from('content_calendar').update({ format: 'post' }).eq('id', post.id);
            }
          }

          // Publish to platform
          const postWithMedia = { ...fullPost, visual_url: visualUrl, video_url: videoUrl };
          const updateFields: Record<string, any> = { updated_at: new Date().toISOString() };
          if (videoUrl) updateFields.video_url = videoUrl;
          let platformSuccess = false;

          if (fullPost.platform === 'instagram') {
            const igResult = await publishToInstagram(postWithMedia, supabase);
            if (igResult.success && igResult.permalink) {
              updateFields.instagram_permalink = igResult.permalink;
              platformSuccess = true;
              console.log(`[Content] Instagram published for post ${post.id}: ${igResult.permalink}`);
            } else {
              console.error(`[Content] Instagram publish FAILED for post ${post.id}: ${igResult.error}`);
              escalateAgentError({ agent: 'content', action: 'publish_instagram', error: igResult.error || 'Unknown IG error', platform: 'instagram', postId: post.id, context: `Hook: ${fullPost.hook?.substring(0, 80)}` }).catch(() => {});
            }
          } else if (fullPost.platform === 'tiktok') {
            const ttResult = await publishToTikTok(postWithMedia, supabase);
            if (ttResult.success && ttResult.publish_id) {
              updateFields.tiktok_publish_id = ttResult.publish_id;
              platformSuccess = true;
              console.log(`[Content] TikTok published for post ${post.id}: ${ttResult.publish_id}`);
            } else {
              console.error(`[Content] TikTok publish FAILED for post ${post.id}: ${ttResult.error}`);
              escalateAgentError({ agent: 'content', action: 'publish_tiktok', error: ttResult.error || 'Unknown TT error', platform: 'tiktok', postId: post.id, context: `Hook: ${fullPost.hook?.substring(0, 80)}` }).catch(() => {});
            }
          } else if (fullPost.platform === 'linkedin') {
            // LinkedIn: publier via l'API LinkedIn
            try {
              const liCaption = (fullPost.caption || fullPost.hook || '') + (fullPost.hashtags ? '\n\n' + fullPost.hashtags : '');
              const liBody: any = {
                caption: liCaption,
                mediaType: visualUrl ? 'image' : 'text',
                mediaUrl: visualUrl || undefined,
                _scheduledPublish: true,
                _userId: '',
              };
              const cronSecret = process.env.CRON_SECRET;
              const liRes = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://keiroai.com'}/api/library/linkedin/publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cronSecret}` },
                body: JSON.stringify(liBody),
              });
              if (liRes.ok) {
                const liData = await liRes.json();
                if (liData.postUrn || liData.id) {
                  updateFields.linkedin_post_id = liData.postUrn || liData.id;
                  platformSuccess = true;
                  console.log(`[Content] LinkedIn published for post ${post.id}: ${liData.postUrn || liData.id}`);
                } else {
                  console.error(`[Content] LinkedIn publish no URN for post ${post.id}`);
                }
              } else {
                const liErr = await liRes.text().catch(() => '');
                console.error(`[Content] LinkedIn publish FAILED ${liRes.status}: ${liErr.substring(0, 200)}`);
                escalateAgentError({ agent: 'content', action: 'publish_linkedin', error: `HTTP ${liRes.status}: ${liErr.substring(0, 200)}`, platform: 'linkedin', postId: post.id }).catch(() => {});
              }
            } catch (liErr: any) {
              console.error(`[Content] LinkedIn publish error for post ${post.id}: ${liErr.message}`);
            }
          } else {
            // Plateforme inconnue — ne PAS marquer comme published
            console.warn(`[Content] Unknown platform ${fullPost.platform} for post ${post.id}`);
            platformSuccess = false;
          }

          if (platformSuccess) {
            updateFields.status = 'published';
            updateFields.published_at = new Date().toISOString();
            published++;
          } else if (!updateFields.status) {
            updateFields.status = 'approved'; // Remettre en approved si pas publie
          }

          await supabase.from('content_calendar').update(updateFields).eq('id', post.id);
        } catch (err) {
          console.error(`[Content] Auto-publish error for post ${post.id}:`, err);
        }
      }
      console.log(`[Content] Auto-published ${published}/${Math.min(unpublished.length, maxPublishPerSlot)} posts${notified > 0 ? `, notified ${notified}` : ''}`);
    }

    // If Sunday evening cron (or no posts planned this week), generate weekly plan
    // Moved AFTER auto-publish so Sunday posts still get published
    if (isCron && dayOfWeek === 0) {
      return generateWeeklyPlan(supabase, undefined, undefined, orgId);
    }

    // AFTER auto-publish: generate new posts for midday/evening/tiktok slots
    // Re-query to get updated counts (some may have been published above)
    const { data: updatedPosts } = await supabase
      .from('content_calendar')
      .select('id, platform, format, status')
      .eq('scheduled_date', todayStr);
    const postCount = updatedPosts?.length || todayPosts.length;

    if (slot === 'morning' && postCount < 1) {
      console.log('[Content] Morning slot — generating 1st post for today');
      return generateDailyPost(supabase, todayStr, dayOfWeek, undefined, '__morning__', undefined, orgId);
    }

    if (slot === 'midday' && postCount < 2) {
      console.log('[Content] Midday slot — generating 2nd post for today');
      return generateDailyPost(supabase, todayStr, dayOfWeek, undefined, '__midday__', undefined, orgId);
    }

    if (slot === 'evening' && postCount < 3) {
      console.log('[Content] Evening slot — generating 3rd post for today');
      return generateDailyPost(supabase, todayStr, dayOfWeek, undefined, '__evening__', undefined, orgId);
    }

    const hasTiktokToday = (updatedPosts || todayPosts).some((p: any) => p.platform === 'tiktok');
    if (slot === 'tiktok' && !hasTiktokToday) {
      console.log('[Content] TikTok slot — generating daily TikTok video');
      return generateDailyPost(supabase, todayStr, dayOfWeek, undefined, '__tiktok__', undefined, orgId);
    }

    // LinkedIn: 2 posts per day
    const linkedinPostsToday = (updatedPosts || todayPosts).filter((p: any) => p.platform === 'linkedin').length;
    if (slot === 'linkedin_1' && linkedinPostsToday < 1) {
      console.log('[Content] LinkedIn slot 1 — generating 1st LinkedIn post');
      return generateDailyPost(supabase, todayStr, dayOfWeek, undefined, '__linkedin_1__', undefined, orgId);
    }
    if (slot === 'linkedin_2' && linkedinPostsToday < 2) {
      console.log('[Content] LinkedIn slot 2 — generating 2nd LinkedIn post');
      return generateDailyPost(supabase, todayStr, dayOfWeek, undefined, '__linkedin_2__', undefined, orgId);
    }

    // Return today's content — flag as warning if 0 posts
    return NextResponse.json({
      ok: true,
      today: updatedPosts || todayPosts,
      message: `${postCount} post(s) for today`,
      warning: postCount === 0 ? 'No posts planned or generated for today' : undefined,
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
    const orgId = body?.org_id || null;

    switch (body.action) {
      case 'set_publish_mode': {
        const mode = body.publish_mode === 'notify' ? 'notify' : 'auto';
        await supabase.from('agent_logs').insert({
          agent: 'content',
          action: 'publish_mode_config',
          status: 'success',
          data: { publish_mode: mode },
        });
        return NextResponse.json({ ok: true, publish_mode: mode });
      }

      case 'generate_weekly':
        return generateWeeklyPlan(supabase, body.platform, body.draftOnly, orgId);

      case 'generate_post': {
        const todayStr = new Date().toISOString().split('T')[0];
        const dayOfWeek = new Date().getDay();
        return generateDailyPost(supabase, todayStr, dayOfWeek, body.platform, body.pillar, body.draftOnly, orgId);
      }

      case 'generate_week': {
        return generateWeekWithVisuals(supabase, body.publishAll === true, orgId);
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
        const { data: pubPost } = await supabase.from('content_calendar').select('*').eq('id', body.postId).single();
        if (!pubPost) return NextResponse.json({ ok: false, error: 'Post not found' }, { status: 404 });

        // Allow targeting a specific platform (body.platform) or default to post's platform
        const targetPlatform = body.platform || pubPost.platform || 'instagram';

        const pubUpdate: Record<string, any> = {
          updated_at: new Date().toISOString(),
        };

        // Only mark as published if not already published (allows cross-posting)
        if (pubPost.status !== 'published') {
          pubUpdate.status = 'published';
          pubUpdate.published_at = new Date().toISOString();
        }

        let pubPermalink: string | undefined;
        let pubPublishId: string | undefined;
        const errors: string[] = [];

        // Publish to target platform
        if ((targetPlatform === 'instagram' || targetPlatform === 'all') && pubPost.visual_url) {
          const igResult = await publishToInstagram(pubPost, supabase);
          if (igResult.success && igResult.permalink) {
            pubUpdate.instagram_permalink = igResult.permalink;
            pubPermalink = igResult.permalink;
          } else if (igResult.error) {
            errors.push(`Instagram: ${igResult.error}`);
            console.warn(`[Content] Instagram publish failed for post ${body.postId}: ${igResult.error}`);
          }
        }

        if ((targetPlatform === 'tiktok' || targetPlatform === 'all') && pubPost.visual_url) {
          const ttResult = await publishToTikTok(pubPost, supabase);
          if (ttResult.success && ttResult.publish_id) {
            pubUpdate.tiktok_publish_id = ttResult.publish_id;
            pubPublishId = ttResult.publish_id;
          } else if (ttResult.error) {
            errors.push(`TikTok: ${ttResult.error}`);
            console.warn(`[Content] TikTok publish failed for post ${body.postId}: ${ttResult.error}`);
          }
        }

        const { error } = await supabase.from('content_calendar').update(pubUpdate).eq('id', body.postId);
        if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        return NextResponse.json({
          ok: errors.length === 0,
          instagram_permalink: pubPermalink,
          tiktok_publish_id: pubPublishId,
          errors: errors.length > 0 ? errors : undefined,
        });
      }

      case 'republish_single': {
        // Re-publish a SINGLE post by ID — regenerate image if expired, then publish to Instagram
        if (!body.postId) return NextResponse.json({ ok: false, error: 'postId required' }, { status: 400 });
        const { data: singlePost } = await supabase.from('content_calendar').select('*').eq('id', body.postId).single();
        if (!singlePost) return NextResponse.json({ ok: false, error: 'Post not found' }, { status: 404 });

        let singleVisualUrl = singlePost.visual_url;

        // Check if image URL is still valid
        if (singleVisualUrl) {
          try {
            const headRes = await fetch(singleVisualUrl, { method: 'HEAD' });
            if (!headRes.ok) {
              console.log(`[Content] Image expired for post ${singlePost.id}, regenerating...`);
              singleVisualUrl = null;
            }
          } catch {
            singleVisualUrl = null;
          }
        }

        // Regenerate image if missing/expired
        if (!singleVisualUrl && singlePost.visual_description) {
          singleVisualUrl = await generateVisual(singlePost.visual_description, singlePost.format || 'post');
          if (singleVisualUrl) {
            // Cache to permanent Supabase Storage immediately
            const cachedUrl = await cacheImageToStorage(singleVisualUrl, singlePost.id);
            if (cachedUrl) singleVisualUrl = cachedUrl;
            await supabase.from('content_calendar').update({
              visual_url: singleVisualUrl, updated_at: new Date().toISOString(),
            }).eq('id', singlePost.id);
          }
        }

        if (!singleVisualUrl) {
          return NextResponse.json({ ok: false, error: 'Impossible de générer l\'image' }, { status: 500 });
        }

        // Publish to Instagram
        if (singlePost.platform === 'instagram') {
          const igResult = await publishToInstagram({ ...singlePost, visual_url: singleVisualUrl }, supabase);
          if (igResult.success) {
            await supabase.from('content_calendar').update({
              instagram_permalink: igResult.permalink,
              visual_url: singleVisualUrl,
              status: 'published',
              published_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq('id', singlePost.id);
            return NextResponse.json({ ok: true, permalink: igResult.permalink, visual_url: singleVisualUrl });
          } else {
            return NextResponse.json({ ok: false, error: igResult.error || 'Publication Instagram échouée' }, { status: 500 });
          }
        }

        // Publish to TikTok
        if (singlePost.platform === 'tiktok') {
          const ttResult = await publishToTikTok({ ...singlePost, visual_url: singleVisualUrl }, supabase);
          if (ttResult.success) {
            await supabase.from('content_calendar').update({
              tiktok_publish_id: ttResult.publish_id,
              visual_url: singleVisualUrl,
              status: 'published',
              published_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq('id', singlePost.id);
            return NextResponse.json({ ok: true, tiktok_publish_id: ttResult.publish_id, visual_url: singleVisualUrl });
          } else {
            return NextResponse.json({ ok: false, error: ttResult.error || 'Publication TikTok échouée' }, { status: 500 });
          }
        }

        // For other platforms, just update status
        await supabase.from('content_calendar').update({
          visual_url: singleVisualUrl,
          status: 'published',
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', singlePost.id);
        return NextResponse.json({ ok: true, visual_url: singleVisualUrl });
      }

      case 'regenerate_image': {
        // Regenerate image only (no publishing) — used to fix broken images
        if (!body.postId) return NextResponse.json({ ok: false, error: 'postId required' }, { status: 400 });
        const { data: regenPost } = await supabase.from('content_calendar').select('*').eq('id', body.postId).single();
        if (!regenPost) return NextResponse.json({ ok: false, error: 'Post not found' }, { status: 404 });
        if (!regenPost.visual_description) return NextResponse.json({ ok: false, error: 'Pas de description visuelle' }, { status: 400 });

        const newVisualUrl = await generateVisual(regenPost.visual_description, regenPost.format || 'post');
        if (!newVisualUrl) return NextResponse.json({ ok: false, error: 'Échec génération image' }, { status: 500 });

        await supabase.from('content_calendar').update({
          visual_url: newVisualUrl, updated_at: new Date().toISOString(),
        }).eq('id', regenPost.id);

        return NextResponse.json({ ok: true, visual_url: newVisualUrl });
      }

      case 'publish_single': {
        // Publish a single approved post immediately
        if (!body.postId) return NextResponse.json({ ok: false, error: 'postId required' }, { status: 400 });
        const { data: psPost } = await supabase.from('content_calendar').select('*').eq('id', body.postId).single();
        if (!psPost) return NextResponse.json({ ok: false, error: 'Post not found' }, { status: 404 });

        // Update status to approved if pending
        if (psPost.status === 'pending_approval' || psPost.status === 'draft') {
          await supabase.from('content_calendar').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', body.postId);
        }

        // Delegate to republish_single logic
        const psResult = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || `https://${process.env.VERCEL_URL}`}/api/agents/content`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'republish_single', postId: body.postId }),
        }).then(r => r.json()).catch(() => ({ ok: false }));

        return NextResponse.json(psResult);
      }

      case 'regenerate_visual': {
        // Regenerate visual with a NEW description + send new notification email
        if (!body.postId) return NextResponse.json({ ok: false, error: 'postId required' }, { status: 400 });
        const { data: rvPost } = await supabase.from('content_calendar').select('*').eq('id', body.postId).single();
        if (!rvPost) return NextResponse.json({ ok: false, error: 'Post not found' }, { status: 404 });

        // Generate a new visual (different seed = different result)
        const rvDesc = rvPost.visual_description || rvPost.hook || rvPost.caption;
        if (!rvDesc) return NextResponse.json({ ok: false, error: 'No visual description' }, { status: 400 });

        const rvNewUrl = await generateVisual(rvDesc, rvPost.format || 'post');
        if (!rvNewUrl) return NextResponse.json({ ok: false, error: 'Visual generation failed' }, { status: 500 });

        const rvCached = await cacheImageToStorage(rvNewUrl, `regen-${body.postId}`);
        const rvFinalUrl = rvCached || rvNewUrl;

        await supabase.from('content_calendar').update({
          visual_url: rvFinalUrl,
          status: 'pending_approval',
          updated_at: new Date().toISOString(),
        }).eq('id', body.postId);

        // Send new notification email with the regenerated visual
        try {
          const { sendPublishNotification } = await import('@/lib/agents/publish-notification');
          const { data: updatedPost } = await supabase.from('content_calendar').select('*').eq('id', body.postId).single();
          if (updatedPost) {
            await sendPublishNotification(updatedPost, supabase);
          }
        } catch (notifErr) {
          console.warn('[Content] Failed to send regenerate notification:', notifErr);
        }

        return NextResponse.json({ ok: true, visual_url: rvFinalUrl });
      }

      case 'fix_broken_images': {
        // Batch fix broken images — check all recent posts with visual_url containing bytepluses.com (temp URLs)
        // and regenerate/re-cache them to Supabase Storage
        const { data: allPosts } = await supabase
          .from('content_calendar')
          .select('id, visual_url, visual_description, format')
          .not('visual_url', 'is', null)
          .order('created_at', { ascending: false })
          .limit(50);

        let fixedCount = 0;
        let failedCount = 0;
        const fixResults: Array<{ id: string; status: string }> = [];

        for (const p of (allPosts || [])) {
          if (!p.visual_url) continue;

          // Check if URL is a Supabase Storage URL (already permanent) — skip
          if (p.visual_url.includes('supabase.co/storage')) continue;

          // Check if URL is accessible
          try {
            const headRes = await fetch(p.visual_url, { method: 'HEAD' });
            if (headRes.ok) {
              // URL works — try to cache to permanent storage
              const permanentUrl = await cacheImageToStorage(p.visual_url, `fix-${p.id}`);
              if (permanentUrl) {
                await supabase.from('content_calendar').update({ visual_url: permanentUrl, updated_at: new Date().toISOString() }).eq('id', p.id);
                fixResults.push({ id: p.id, status: 'cached' });
                fixedCount++;
                continue;
              }
            }
          } catch { /* URL broken */ }

          // URL expired — regenerate from description
          if (p.visual_description) {
            const newUrl = await generateVisual(p.visual_description, p.format || 'post');
            if (newUrl) {
              await supabase.from('content_calendar').update({ visual_url: newUrl, updated_at: new Date().toISOString() }).eq('id', p.id);
              fixResults.push({ id: p.id, status: 'regenerated' });
              fixedCount++;
            } else {
              fixResults.push({ id: p.id, status: 'failed' });
              failedCount++;
            }
          } else {
            fixResults.push({ id: p.id, status: 'no_description' });
            failedCount++;
          }
        }

        return NextResponse.json({ ok: true, fixed: fixedCount, failed: failedCount, results: fixResults });
      }

      case 'republish': {
        // Re-publish posts marked "published" but not actually on Instagram (no permalink)
        // Also regenerates image if the URL is expired/broken
        const { data: fakePubs } = await supabase
          .from('content_calendar')
          .select('*')
          .eq('status', 'published')
          .is('instagram_permalink', null)
          .eq('platform', 'instagram')
          .order('scheduled_date', { ascending: false })
          .limit(body.limit || 10);

        if (!fakePubs || fakePubs.length === 0) {
          return NextResponse.json({ ok: true, message: 'Aucun post à republier', republished: 0 });
        }

        let republished = 0;
        const republishResults: Array<{ id: string; hook: string; success: boolean; error?: string; permalink?: string }> = [];

        for (const post of fakePubs) {
          let visualUrl = post.visual_url;

          // Check if image URL is still valid (Seedream URLs expire)
          if (visualUrl) {
            try {
              const headRes = await fetch(visualUrl, { method: 'HEAD' });
              if (!headRes.ok) {
                console.log(`[Content] Image expired for post ${post.id}, regenerating...`);
                visualUrl = null;
              }
            } catch {
              visualUrl = null;
            }
          }

          // Regenerate image if missing/expired
          if (!visualUrl && post.visual_description) {
            visualUrl = await generateVisual(post.visual_description, post.format || 'post');
            if (visualUrl) {
              await supabase.from('content_calendar').update({
                visual_url: visualUrl, updated_at: new Date().toISOString(),
              }).eq('id', post.id);
            }
          }

          if (!visualUrl) {
            republishResults.push({ id: post.id, hook: post.hook || '?', success: false, error: 'No image available' });
            continue;
          }

          // Publish to Instagram
          const igResult = await publishToInstagram({ ...post, visual_url: visualUrl }, supabase);
          if (igResult.success) {
            await supabase.from('content_calendar').update({
              instagram_permalink: igResult.permalink,
              visual_url: visualUrl,
              published_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq('id', post.id);
            republished++;
            republishResults.push({ id: post.id, hook: post.hook || '?', success: true, permalink: igResult.permalink });
          } else {
            republishResults.push({ id: post.id, hook: post.hook || '?', success: false, error: igResult.error });
          }
        }

        return NextResponse.json({ ok: true, republished, total: fakePubs.length, results: republishResults });
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
        // ── Pre-publication Instagram token diagnostic ──
        // Verify token validity before wasting API calls on publish attempts
        const { data: adminProfile } = await supabase
          .from('profiles')
          .select('instagram_business_account_id, facebook_page_access_token')
          .eq('is_admin', true)
          .limit(1)
          .single();

        let igTokenValid = false;
        if (!adminProfile?.instagram_business_account_id || !adminProfile?.facebook_page_access_token) {
          console.error('[Content] execute_publication: Instagram tokens missing from admin profile');
          await supabase.from('agent_logs').insert({
            agent: 'diagnostic',
            action: 'instagram_health_check',
            status: 'error',
            data: {
              check: 'pre_publish_token',
              severity: 'critical',
              detail: 'Instagram tokens missing from admin profile. Skipping Instagram publications.',
              triggered_by: 'execute_publication',
            },
            created_at: new Date().toISOString(),
          });
        } else {
          try {
            const { graphGET: graphGETCheck } = await import('@/lib/meta');
            await graphGETCheck<{ id: string }>(
              `/${adminProfile.instagram_business_account_id}`,
              adminProfile.facebook_page_access_token,
              { fields: 'id' }
            );
            igTokenValid = true;
            console.log('[Content] execute_publication: Instagram token verified OK');
          } catch (tokenErr: any) {
            const errDetail = (tokenErr.message || '').substring(0, 300);
            console.error('[Content] execute_publication: Instagram token INVALID:', errDetail);
            const tokenDiag = diagnosePublishFailure('Instagram', errDetail);
            await sendPublishAlert(
              tokenDiag,
              'Pre-publication token check failed — all Instagram posts will be skipped',
              supabase
            );
            await supabase.from('agent_logs').insert({
              agent: 'diagnostic',
              action: 'instagram_health_check',
              status: 'error',
              data: {
                check: 'pre_publish_token',
                severity: 'critical',
                detail: `Token validation failed: ${errDetail}`,
                diagnostic_reason: tokenDiag.reason,
                triggered_by: 'execute_publication',
              },
              created_at: new Date().toISOString(),
            });
          }
        }

        // Publish approved/draft posts that are due today or earlier
        const todayDate = new Date().toISOString().split('T')[0];
        const { data: readyPosts } = await supabase
          .from('content_calendar')
          .select('*')
          .in('status', ['approved', 'draft'])
          .lte('scheduled_date', todayDate)
          .is('visual_url', null);

        // Also get approved posts with visuals that aren't published yet + retry failed posts
        const { data: approvedWithVisuals } = await supabase
          .from('content_calendar')
          .select('*')
          .in('status', ['approved', 'draft', 'publish_failed'])
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

          // For reel/video formats: generate video with narration if not already done
          const pFormat = (post.format || 'post').toLowerCase();
          let videoUrl = post.video_url || null;
          if ((pFormat === 'reel' || pFormat === 'video') && !videoUrl && !post.video_job_id) {
            const desc = post.visual_description || post.hook || post.caption;
            if (desc) {
              if (post.platform === 'tiktok') {
                // TikTok: async 30s pipeline — video-poll cron will publish
                console.log(`[Content] execute_pub: TikTok needs 30s video — starting async pipeline`);
                const asyncResult = await createAsyncLongVideo(desc, post.caption || desc, 30, '9:16', post.id);
                if (asyncResult.jobId) {
                  console.log(`[Content] execute_pub: async job ${asyncResult.jobId} started for TikTok post ${post.id}`);
                  // Skip publishing — video-poll cron will handle it
                  publishedPosts.push({ platform: post.platform, format: post.format, hook: post.hook || '', publication_error: 'async_video_generating' });
                  continue;
                }
                // Fallback to sync 10s if async fails
                console.warn('[Content] execute_pub: async failed, fallback to sync 10s');
                const vr = await generateVideoWithNarration(desc, post.caption || desc, pFormat, 10);
                videoUrl = vr.videoUrl;
                if (videoUrl) updateData.video_url = videoUrl;
              } else {
                // Instagram: sync 5s video
                console.log(`[Content] execute_pub: Instagram reel needs 5s video — generating...`);
                const vr = await generateVideoWithNarration(desc, post.caption || desc, pFormat, 5);
                videoUrl = vr.videoUrl;
                if (videoUrl) updateData.video_url = videoUrl;
              }
            }
          }

          // Publish to platform
          let igPermalink: string | undefined;
          let ttPublishId: string | undefined;
          let pubError: string | undefined;
          const postWithVideo = { ...post, video_url: videoUrl };

          if (post.platform === 'instagram' && (post.visual_url || videoUrl)) {
            if (!igTokenValid) {
              // Skip Instagram publication — token is invalid
              pubError = 'Instagram token invalid (pre-publish check failed). Skipped.';
              console.warn(`[Content] Skipping Instagram post ${post.id}: token invalid`);
              updateData.status = 'publish_failed';
              updateData.publish_error = pubError;
              updateData.publish_diagnostic = { platform: 'Instagram', reason: 'token_invalid_pre_check', severity: 'critical', detail: pubError, timestamp: new Date().toISOString() };
              delete updateData.published_at;
            } else {
              const igResult = await publishToInstagram(postWithVideo, supabase);
              if (igResult.success) {
                igPermalink = igResult.permalink;
                if (igResult.permalink) updateData.instagram_permalink = igResult.permalink;
              } else {
                pubError = igResult.error;
                console.warn(`[Content] Instagram publish failed for post ${post.id}: ${igResult.error}`);
                const diag = diagnosePublishFailure('Instagram', igResult.error || '');
                updateData.status = 'publish_failed';
                updateData.publish_error = igResult.error || 'Unknown Instagram error';
                updateData.publish_diagnostic = { platform: 'Instagram', reason: diag.reason, severity: diag.severity, detail: diag.detail, timestamp: new Date().toISOString() };
                delete updateData.published_at;
                await sendPublishAlert(diag, `Post ${post.id} — ${post.hook || post.caption?.substring(0, 60) || 'N/A'}`, supabase);
              }
            }
          } else if (post.platform === 'tiktok' && (post.visual_url || videoUrl)) {
            const ttResult = await publishToTikTok(postWithVideo, supabase);
            if (ttResult.success) {
              ttPublishId = ttResult.publish_id;
              if (ttResult.publish_id) updateData.tiktok_publish_id = ttResult.publish_id;
            } else {
              pubError = ttResult.error;
              console.warn(`[Content] TikTok publish failed for post ${post.id}: ${ttResult.error}`);
              const diag = diagnosePublishFailure('TikTok', ttResult.error || '');
              updateData.status = 'publish_failed';
              updateData.publish_error = ttResult.error || 'Unknown TikTok error';
              updateData.publish_diagnostic = { platform: 'TikTok', reason: diag.reason, severity: diag.severity, detail: diag.detail, timestamp: new Date().toISOString() };
              delete updateData.published_at;
              await sendPublishAlert(diag, `Post ${post.id} — ${post.hook || post.caption?.substring(0, 60) || 'N/A'}`, supabase);
            }
          }

          await supabase.from('content_calendar').update(updateData).eq('id', post.id);
          if (!pubError) publishedCount++;
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

              // Publish to platform
              let igPermalink2: string | undefined;
              let pubError2: string | undefined;
              if (post.platform === 'instagram') {
                if (!igTokenValid) {
                  pubError2 = 'Instagram token invalid (pre-publish check failed). Skipped.';
                  console.warn(`[Content] Skipping Instagram post ${post.id}: token invalid`);
                  updateData.status = 'publish_failed';
                  updateData.publish_error = pubError2;
                  updateData.publish_diagnostic = { platform: 'Instagram', reason: 'token_invalid_pre_check', severity: 'critical', detail: pubError2, timestamp: new Date().toISOString() };
                  delete updateData.published_at;
                } else {
                  const igResult = await publishToInstagram({ ...post, visual_url: visualUrl }, supabase);
                  if (igResult.success) {
                    igPermalink2 = igResult.permalink;
                    if (igResult.permalink) updateData.instagram_permalink = igResult.permalink;
                  } else {
                    pubError2 = igResult.error;
                    console.warn(`[Content] Instagram publish failed for post ${post.id}: ${igResult.error}`);
                    const diag = diagnosePublishFailure('Instagram', igResult.error || '');
                    updateData.status = 'publish_failed';
                    updateData.publish_error = igResult.error || 'Unknown Instagram error';
                    updateData.publish_diagnostic = { platform: 'Instagram', reason: diag.reason, severity: diag.severity, detail: diag.detail, timestamp: new Date().toISOString() };
                    delete updateData.published_at;
                    await sendPublishAlert(diag, `Post ${post.id} — ${post.hook || post.caption?.substring(0, 60) || 'N/A'}`, supabase);
                  }
                }
              } else if (post.platform === 'tiktok') {
                const ttResult = await publishToTikTok({ ...post, visual_url: visualUrl }, supabase);
                if (ttResult.success && ttResult.publish_id) {
                  updateData.tiktok_publish_id = ttResult.publish_id;
                } else {
                  pubError2 = ttResult.error;
                  console.warn(`[Content] TikTok publish failed for post ${post.id}: ${ttResult.error}`);
                  const diag = diagnosePublishFailure('TikTok', ttResult.error || '');
                  updateData.status = 'publish_failed';
                  updateData.publish_error = ttResult.error || 'Unknown TikTok error';
                  updateData.publish_diagnostic = { platform: 'TikTok', reason: diag.reason, severity: diag.severity, detail: diag.detail, timestamp: new Date().toISOString() };
                  delete updateData.published_at;
                  await sendPublishAlert(diag, `Post ${post.id} — ${post.hook || post.caption?.substring(0, 60) || 'N/A'}`, supabase);
                }
              }

              await supabase.from('content_calendar').update(updateData).eq('id', post.id);
              if (!pubError2) publishedCount++;
              publishedPosts.push({
                platform: post.platform,
                format: post.format,
                hook: post.hook || '',
                instagram_permalink: igPermalink2,
                publication_error: pubError2,
              });
            }
          }
        }

        // If no posts existed at all, generate + publish one on the fly
        if (publishedCount === 0 && (!readyPosts || readyPosts.length === 0) && (!approvedWithVisuals || approvedWithVisuals.length === 0)) {
          console.log('[Content] No posts to publish — generating a fresh one now');
          const dayOfWeek = new Date().getDay();
          return generateDailyPost(supabase, todayDate, dayOfWeek, undefined, undefined, undefined, orgId);
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
          ...(orgId ? { org_id: orgId } : {}),
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
          ...(orgId ? { org_id: orgId } : {}),
        });

        // ── Save learnings from publication ──
        try {
          if (publishedCount > 0) {
            await saveLearning(supabase, {
              agent: 'content',
              category: 'content',
              learning: `Publication: ${publishedCount} posts publiés avec succès`,
              evidence: `Published ${publishedCount} posts`,
              confidence: 25,
            }, orgId);
          }
        } catch (learnErr: any) {
          console.warn('[ContentAgent] Learning save error:', learnErr.message);
        }

        // ── Feedback to CEO ──
        try {
          const failedCount = (publishedPosts || []).filter((p: any) => p.error).length;
          await saveAgentFeedback(supabase, {
            from_agent: 'content',
            to_agent: 'ceo',
            feedback: `Publication: ${publishedCount} posts publiés. ${failedCount > 0 ? `⚠️ ${failedCount} échecs.` : 'Zéro échec.'} Pipeline contenu opérationnel.`,
            category: 'content',
          }, orgId);
        } catch (fbErr: any) {
          console.warn('[ContentAgent] Feedback save error:', (fbErr as any).message);
        }

        return NextResponse.json({ ok: true, published: publishedCount, posts: publishedPosts });
      }

      case 'fix_captions': {
        // Reformate all draft/approved/published captions to new airy UX format
        const { data: postsToFix } = await supabase
          .from('content_calendar')
          .select('id, caption, platform, hook, visual_description, status, hashtags')
          .in('status', ['draft', 'approved', 'published'])
          .not('caption', 'is', null)
          .order('created_at', { ascending: false })
          .limit(body.limit || 50);

        let fixed = 0;
        let skipped = 0;
        const fixResults: Array<{ id: string; status: string; preview?: string }> = [];

        for (const post of postsToFix || []) {
          if (!post.caption || post.caption.trim().length < 20) {
            skipped++;
            continue;
          }

          // Check if already well-formatted (has multiple section breaks)
          const sectionBreaks = (post.caption.match(/\n\n/g) || []).length;
          if (sectionBreaks >= 2 && !body.force) {
            skipped++;
            fixResults.push({ id: post.id, status: 'already_formatted' });
            continue;
          }

          try {
            // Remove hashtags from caption if they're embedded
            let cleanCaption = post.caption;
            if (post.hashtags && Array.isArray(post.hashtags)) {
              cleanCaption = cleanCaption.replace(/\n*[・.]*\n*#[\w\u00C0-\u024F]+(\s+#[\w\u00C0-\u024F]+)*/g, '').trim();
            }

            const newCaption = await callClaude({
              system: `Tu reformates des captions de réseaux sociaux pour qu'elles soient VISUELLEMENT AGRÉABLES sur mobile.

RÈGLES :
1. Hook punch sur la première ligne (5-10 mots) avec 1 emoji
2. Ligne vide (\\n\\n) après le hook
3. Corps : 2-4 lignes courtes avec emoji en début de ligne comme bullet points
4. Ligne vide (\\n\\n)
5. CTA clair sur sa propre ligne
6. NE PAS inclure de hashtags
7. Max 3-5 emojis total
8. La caption DOIT rester cohérente avec le hook et le visuel
9. Garde le MÊME MESSAGE que l'original, reformate juste la mise en page
10. Max 800 chars Instagram, 500 chars TikTok
11. JAMAIS de pavé — chaque section séparée par \\n\\n

Output UNIQUEMENT la nouvelle caption.`,
              message: `Plateforme: ${post.platform || 'instagram'}
Hook: ${post.hook || 'N/A'}
Description visuelle: ${(post.visual_description || '').substring(0, 200)}
Caption originale à reformater:
${cleanCaption}`,
              maxTokens: 800,
            });

            if (newCaption && newCaption.trim().length > 20) {
              // Remove any hashtags Claude might have added
              const finalCaption = newCaption.replace(/\n*[・.]*\n*#[\w\u00C0-\u024F]+(\s+#[\w\u00C0-\u024F]+)*/g, '').trim();

              await supabase
                .from('content_calendar')
                .update({ caption: finalCaption, updated_at: new Date().toISOString() })
                .eq('id', post.id);

              fixed++;
              fixResults.push({ id: post.id, status: 'fixed', preview: finalCaption.substring(0, 80) });
            }
          } catch (err: any) {
            fixResults.push({ id: post.id, status: 'error', preview: err.message });
          }
        }

        return NextResponse.json({
          ok: true,
          total: postsToFix?.length || 0,
          fixed,
          skipped,
          results: fixResults,
        });
      }

      case 'stats': {
        const [
          { count: totalPosts },
          { count: published },
          { count: drafts },
          { count: approved },
          { count: failed },
        ] = await Promise.all([
          supabase.from('content_calendar').select('id', { count: 'exact', head: true }),
          supabase.from('content_calendar').select('id', { count: 'exact', head: true }).eq('status', 'published'),
          supabase.from('content_calendar').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
          supabase.from('content_calendar').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
          supabase.from('content_calendar').select('id', { count: 'exact', head: true }).eq('status', 'publish_failed'),
        ]);

        const { data: byPlatform } = await supabase
          .from('content_calendar')
          .select('platform')
          .eq('status', 'published');

        const platforms = { instagram: 0, tiktok: 0, linkedin: 0 };
        for (const p of byPlatform || []) platforms[p.platform as keyof typeof platforms]++;

        return NextResponse.json({
          ok: true,
          stats: { total: totalPosts || 0, published: published || 0, drafts: drafts || 0, approved: approved || 0, failed: failed || 0, byPlatform: platforms },
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

      case 'delete_post': {
        if (!body.postId) return NextResponse.json({ ok: false, error: 'postId required' }, { status: 400 });
        const { error: delErr } = await supabase.from('content_calendar').delete().eq('id', body.postId);
        if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
        return NextResponse.json({ ok: true });
      }

      case 'reset_to_draft': {
        if (!body.postId) return NextResponse.json({ ok: false, error: 'postId required' }, { status: 400 });
        await supabase.from('content_calendar').update({
          status: 'draft',
          published_at: null,
          publish_error: null,
          publish_diagnostic: null,
          updated_at: new Date().toISOString(),
        }).eq('id', body.postId);
        return NextResponse.json({ ok: true });
      }

      case 'modify_post': {
        if (!body.postId) return NextResponse.json({ ok: false, error: 'postId required' }, { status: 400 });
        const { data: postToModify } = await supabase.from('content_calendar').select('*').eq('id', body.postId).single();
        if (!postToModify) return NextResponse.json({ ok: false, error: 'Post not found' }, { status: 404 });

        const modifyInstruction = body.instruction || 'Améliore ce post pour le rendre plus engageant et percutant.';
        const currentCaption = postToModify.caption || '';
        const currentHook = postToModify.hook || '';

        const modifiedText = await callClaude({
          system: `Tu es un expert en contenu social media pour des commerces locaux. On te donne un post existant et une instruction de modification. Retourne un JSON avec { "hook": "...", "caption": "...", "visual_description": "..." }. Le hook doit être accrocheur (max 10 mots). La caption doit être aérée, engageante, avec des emojis stratégiques. La visual_description décrit le visuel idéal.`,
          message: `POST ACTUEL:
Hook: ${currentHook}
Caption: ${currentCaption}
Plateforme: ${postToModify.platform}
Format: ${postToModify.format}

INSTRUCTION: ${modifyInstruction}

Retourne UNIQUEMENT le JSON.`,
          maxTokens: 1500,
        });

        try {
          const cleaned = modifiedText.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleaned);
          const updateFields: Record<string, any> = { updated_at: new Date().toISOString(), status: 'draft' };
          if (parsed.hook) updateFields.hook = parsed.hook;
          if (parsed.caption) updateFields.caption = parsed.caption;
          if (parsed.visual_description) updateFields.visual_description = parsed.visual_description;
          await supabase.from('content_calendar').update(updateFields).eq('id', body.postId);
          return NextResponse.json({ ok: true, modified: updateFields });
        } catch {
          return NextResponse.json({ ok: false, error: 'Failed to parse modified content' }, { status: 500 });
        }
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
async function generateWeeklyPlan(supabase: any, filterPlatform?: string, draftOnly?: boolean, orgId: string | null = null) {
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
      maxTokens: 8000,
    });
  } catch (claudeError: any) {
    console.error('[Content] Claude API error for weekly plan:', claudeError.message);
    await supabase.from('agent_logs').insert({
      agent: 'content', action: 'weekly_plan_failed',
      data: { error: claudeError.message, phase: 'claude_call' },
      status: 'error', error_message: claudeError.message, created_at: nowISO,
      ...(orgId ? { org_id: orgId } : {}),
    });
    return NextResponse.json({ ok: false, error: `Claude error: ${claudeError.message}` }, { status: 502 });
  }

  let weekPlan: any[];
  try {
    const cleanText = rawText.replace(/```[\w]*\s*/g, '').trim();
    const jsonMatch = cleanText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      weekPlan = JSON.parse(jsonMatch[0]);
    } else {
      // Try to salvage truncated JSON array
      const partialMatch = cleanText.match(/\[[\s\S]*/);
      if (partialMatch) {
        let salvaged = partialMatch[0]
          .replace(/,\s*\{[^}]*$/, '') // remove last incomplete object
          .replace(/,\s*$/, '');
        if (!salvaged.endsWith(']')) salvaged += ']';
        weekPlan = JSON.parse(salvaged);
        console.log('[Content] Salvaged truncated weekly plan JSON');
      } else {
        throw new Error('No JSON array found in response');
      }
    }
  } catch (parseError) {
    console.error('[Content] Parse error:', parseError, 'Raw:', rawText.substring(0, 300));
    await supabase.from('agent_logs').insert({
      agent: 'content', action: 'weekly_plan_failed',
      data: { raw: rawText.substring(0, 500), error: String(parseError) },
      status: 'error', error_message: String(parseError), created_at: nowISO,
      ...(orgId ? { org_id: orgId } : {}),
    });
    return NextResponse.json({ ok: false, error: 'Failed to parse weekly plan' }, { status: 500 });
  }

  // Map day names to dates
  const dayMap: Record<string, number> = { lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 0 };

  // Get admin user id for content ownership
  const { data: contentOwner } = await supabase.from('profiles').select('id').eq('is_admin', true).limit(1).maybeSingle();
  const contentUserId = contentOwner?.id || null;

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

    // Sanitize values to match DB check constraints
    const VALID_PLATFORMS = ['instagram', 'tiktok', 'linkedin'];
    const VALID_FORMATS = ['carrousel', 'reel', 'story', 'post', 'video', 'text'];
    const VALID_PILLARS = ['tips', 'demo', 'social_proof', 'trends'];
    const PILLAR_MAP: Record<string, string> = { giving_value: 'tips', educational: 'tips', cta: 'demo', behind_the_scenes: 'demo', pain_point: 'tips' };
    const rawPlatform = ((filterPlatform && filterPlatform !== 'all' ? filterPlatform : null) || post.platform || 'instagram').toLowerCase();
    const rawFormat = (post.format || 'post').toLowerCase().replace('carousel', 'carrousel');
    const postPlatform = VALID_PLATFORMS.includes(rawPlatform) ? rawPlatform : 'instagram';
    const postFormat = VALID_FORMATS.includes(rawFormat) ? rawFormat : 'post';
    const rawPillar = (post.pillar || 'tips').toLowerCase();
    const postPillar = VALID_PILLARS.includes(rawPillar) ? rawPillar : (PILLAR_MAP[rawPillar] || 'tips');

    const { error: insertError } = await supabase.from('content_calendar').insert({
      platform: postPlatform,
      format: postFormat,
      pillar: postPillar,
      hook: post.hook || null,
      caption: post.caption || '',
      hashtags: post.hashtags || [],
      visual_description: post.visual_description || post.thumbnail_description || null,
      slides: post.slides || null,
      script: post.script || null,
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime,
      status: draftOnly ? 'draft' : 'approved',
      ai_generated: true,
      ...(contentUserId ? { user_id: contentUserId } : {}),
    });

    if (insertError) {
      console.error(`[Content] DB insert error for post ${post.day}/${postPlatform}:`, insertError.message);
    } else {
      inserted++;
      // Generate visual using KeiroAI Seedream (proof of product) + auto-publish if not draft
      if (!draftOnly) {
        const postVisualDesc = post.thumbnail_description || post.visual_description || post.hook;
        if (postVisualDesc) {
          const postVisualUrl = await generateVisual(postVisualDesc, post.format || 'post');
          if (postVisualUrl) {
            await supabase.from('content_calendar')
              .update({ visual_url: postVisualUrl, status: 'approved', updated_at: new Date().toISOString() })
              .eq('scheduled_date', scheduledDate)
              .eq('platform', postPlatform)
              .eq('status', 'approved')
              .is('visual_url', null);
          }
        }
      }
    }
  }

  const planStatus = inserted > 0 ? 'success' : 'error';
  await supabase.from('agent_logs').insert({
    agent: 'content', action: 'weekly_plan_generated',
    data: { postsPlanned: inserted, totalAttempted: weekPlan.length, weekStart: mondayDate.toISOString().split('T')[0] },
    status: planStatus, error_message: inserted === 0 ? `0/${weekPlan.length} posts inserted — all DB inserts failed` : undefined,
    created_at: nowISO,
    ...(orgId ? { org_id: orgId } : {}),
  });

  // ── Save learnings from weekly plan ──
  try {
    if (inserted > 0) {
      await saveLearning(supabase, {
        agent: 'content',
        category: 'content',
        learning: `Plan hebdo généré: ${inserted}/${weekPlan.length} posts planifiés (semaine du ${mondayDate.toISOString().split('T')[0]})`,
        evidence: `weekly_plan: ${inserted} inserted out of ${weekPlan.length} attempted`,
        confidence: 20,
      }, orgId);
    }
  } catch (learnErr: any) {
    console.warn('[ContentAgent] Learning save error:', learnErr.message);
  }

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
    ...(orgId ? { org_id: orgId } : {}),
  });

  console.log(`[Content] Weekly plan: ${inserted}/${weekPlan.length} posts planned`);

  if (inserted === 0) {
    return NextResponse.json({ ok: false, error: `Weekly plan generated ${weekPlan.length} posts from AI but all DB inserts failed`, postsPlanned: 0 }, { status: 500 });
  }

  return NextResponse.json({ ok: true, postsPlanned: inserted });
}

// ──────────────────────────────────────
// Generate week with visuals + optional Instagram publishing
// ──────────────────────────────────────
async function generateWeekWithVisuals(supabase: any, publishAll: boolean, orgId: string | null = null) {
  const now = new Date();
  const nowISO = now.toISOString();

  console.log(`[Content] generate_week: starting (publishAll=${publishAll})`);

  // Get last 10 published posts for context (including visual_description for dedup)
  const { data: recentPosts } = await supabase
    .from('content_calendar')
    .select('platform, format, pillar, hook, caption, visual_description, scheduled_date')
    .in('status', ['draft', 'approved', 'published'])
    .order('scheduled_date', { ascending: false })
    .limit(10);

  const existingPlanned = recentPosts?.map((p: any) => `${p.scheduled_date} ${p.platform} ${p.pillar}: ${p.hook || p.caption?.substring(0, 50)}`).join('\n') || '';

  // Extract recent visuals for anti-duplication
  const recentVisualDescs = recentPosts?.map((p: any) => (p.visual_description || '').substring(0, 100)).filter((v: string) => v.length > 10) || [];
  const visualDedupContext = recentVisualDescs.length > 0
    ? `\nVISUELS RÉCENTS (INTERDIT de réutiliser ces concepts/scènes/couleurs) :\n${recentVisualDescs.map((v: string, i: number) => `${i + 1}. ${v}`).join('\n')}\n→ Chaque visual_description de la semaine doit être UNIQUE et DIFFÉRENT de tous ces visuels ET différent des autres posts de la semaine.\n→ VARIE les couleurs dominantes : max 1 post violet sur 5, alterne ambre/bleu/vert/corail/noir/blanc.\n→ VARIE les cibles prospects : restaurant, coiffeur, boutique, coach, fleuriste, freelance... pas le même 2 fois de suite.\n`
    : '';

  // Calculate next Monday
  const mondayDate = new Date(now);
  const currentDay = mondayDate.getDay();
  const daysUntilMonday = currentDay === 0 ? 1 : (8 - currentDay);
  mondayDate.setDate(mondayDate.getDate() + daysUntilMonday);

  const prompt = getWeeklyPlanPrompt({ existingPlanned }) + visualDedupContext;
  const systemPrompt = getContentSystemPrompt();

  let rawText: string;
  try {
    rawText = await callClaude({
      system: systemPrompt,
      message: prompt,
      maxTokens: 8000,
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

    // Generate visual with Seedream (with dedup check on visual_description)
    const visualDesc = post.thumbnail_description || post.visual_description || post.hook || post.caption;
    let visualUrl: string | null = null;
    if (visualDesc) {
      // Check if a very similar visual_description was already used recently
      const { data: similarPosts } = await supabase
        .from('content_calendar')
        .select('id, visual_description')
        .eq('platform', platform)
        .in('status', ['draft', 'approved', 'published'])
        .not('visual_url', 'is', null)
        .gte('scheduled_date', new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0])
        .neq('id', inserted?.id || '');

      const isDuplicateDesc = (similarPosts || []).some((p: any) => {
        if (!p.visual_description) return false;
        const existing = p.visual_description.toLowerCase().trim();
        const current = visualDesc.toLowerCase().trim();
        // Exact match or >80% overlap (first 100 chars)
        return existing === current || existing.substring(0, 100) === current.substring(0, 100);
      });

      if (isDuplicateDesc) {
        console.warn(`[Content] Skipping visual generation — duplicate visual_description detected for ${post.day}`);
        results.push({
          day: post.day || '?', platform, format,
          hook: post.hook || '', visual_url: null,
          status: 'skipped_duplicate_visual',
        });
        continue;
      }

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
    ...(orgId ? { org_id: orgId } : {}),
  });

  // ── Save learnings from content generation ──
  try {
    if (results.length > 0) {
      await saveLearning(supabase, {
        agent: 'content',
        category: 'content',
        learning: `Contenu généré: ${results.length} posts (${totalGenerated} visuels). ${publishedCount} publiés sur Instagram`,
        evidence: `generate_week: ${results.length} total, ${totalGenerated} visuals, ${publishedCount} published`,
        confidence: 20,
      }, orgId);
    }
  } catch (learnErr: any) {
    console.warn('[ContentAgent] Learning save error:', learnErr.message);
  }

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
async function generateDailyPost(supabase: any, todayStr: string, dayOfWeek: number, forcePlatform?: string, forcePillar?: string, draftOnly?: boolean, orgId: string | null = null) {
  const nowISO = new Date().toISOString();

  // Load shared intelligence pool (all agents' data + active directives)
  let sharedIntelligence = '';
  try {
    const { prompt: ctxPrompt } = await loadContextWithAvatar(supabase, 'content', orgId || undefined);
    sharedIntelligence = ctxPrompt;
  } catch (e: any) {
    console.warn('[Content] Failed to load shared context:', e.message);
  }

  // 4x/day content strategy: 3 Instagram (morning/midday/evening) + 1 TikTok (tiktok slot)
  // DB pillar constraint: tips, demo, social_proof, trends
  // Morning & Midday = IMAGE posts (fast, reliable, always published)
  // Evening = reel (video pipeline, may take longer but has time budget)
  // TikTok = video via async pipeline
  const morningSchedule: Record<number, { platform: string; format: string; pillar: string }> = {
    1: { platform: 'instagram', format: 'post', pillar: 'tips' },                  // Mon AM: tips post
    2: { platform: 'instagram', format: 'post', pillar: 'demo' },                  // Tue AM: démo post
    3: { platform: 'instagram', format: 'post', pillar: 'social_proof' },          // Wed AM: témoignage post
    4: { platform: 'instagram', format: 'post', pillar: 'trends' },                // Thu AM: tendances post
    5: { platform: 'instagram', format: 'post', pillar: 'tips' },                  // Fri AM: tips post
    6: { platform: 'instagram', format: 'post', pillar: 'demo' },                  // Sat AM: démo post
    0: { platform: 'instagram', format: 'post', pillar: 'social_proof' },          // Sun AM: résultats post
  };
  const middaySchedule: Record<number, { platform: string; format: string; pillar: string }> = {
    1: { platform: 'instagram', format: 'post', pillar: 'demo' },                  // Mon MID: démo post
    2: { platform: 'instagram', format: 'post', pillar: 'social_proof' },          // Tue MID: témoignage post
    3: { platform: 'instagram', format: 'post', pillar: 'tips' },                  // Wed MID: tips post
    4: { platform: 'instagram', format: 'post', pillar: 'demo' },                  // Thu MID: démo post
    5: { platform: 'instagram', format: 'post', pillar: 'social_proof' },          // Fri MID: social proof post
    6: { platform: 'instagram', format: 'post', pillar: 'trends' },                // Sat MID: tendances post
    0: { platform: 'instagram', format: 'post', pillar: 'tips' },                  // Sun MID: tips post
  };
  const eveningSchedule: Record<number, { platform: string; format: string; pillar: string }> = {
    1: { platform: 'instagram', format: 'reel', pillar: 'social_proof' },           // Mon EVE: témoignage reel
    2: { platform: 'instagram', format: 'reel', pillar: 'trends' },                // Tue EVE: tendances reel
    3: { platform: 'instagram', format: 'reel', pillar: 'demo' },                  // Wed EVE: démo reel
    4: { platform: 'instagram', format: 'reel', pillar: 'social_proof' },           // Thu EVE: témoignage reel
    5: { platform: 'instagram', format: 'reel', pillar: 'trends' },                // Fri EVE: tendances reel
    6: { platform: 'instagram', format: 'reel', pillar: 'tips' },                  // Sat EVE: tips reel
    0: { platform: 'instagram', format: 'reel', pillar: 'demo' },                  // Sun EVE: démo reel
  };
  // TikTok slot: 1 video per day (published at 21h30 Paris via tiktok_publish cron)
  const tiktokSchedule: Record<number, { platform: string; format: string; pillar: string }> = {
    1: { platform: 'tiktok', format: 'video', pillar: 'tips' },
    2: { platform: 'tiktok', format: 'video', pillar: 'demo' },
    3: { platform: 'tiktok', format: 'video', pillar: 'social_proof' },
    4: { platform: 'tiktok', format: 'video', pillar: 'trends' },
    5: { platform: 'tiktok', format: 'video', pillar: 'tips' },
    6: { platform: 'tiktok', format: 'video', pillar: 'demo' },
    0: { platform: 'tiktok', format: 'video', pillar: 'social_proof' },
  };
  // LinkedIn slot: 2 posts per day (linkedin_1 and linkedin_2) — professional content
  const linkedinSchedule1: Record<number, { platform: string; format: string; pillar: string }> = {
    1: { platform: 'linkedin', format: 'text', pillar: 'tips' },
    2: { platform: 'linkedin', format: 'post', pillar: 'demo' },
    3: { platform: 'linkedin', format: 'text', pillar: 'social_proof' },
    4: { platform: 'linkedin', format: 'post', pillar: 'trends' },
    5: { platform: 'linkedin', format: 'text', pillar: 'tips' },
    6: { platform: 'linkedin', format: 'post', pillar: 'demo' },
    0: { platform: 'linkedin', format: 'text', pillar: 'social_proof' },
  };
  const linkedinSchedule2: Record<number, { platform: string; format: string; pillar: string }> = {
    1: { platform: 'linkedin', format: 'post', pillar: 'social_proof' },
    2: { platform: 'linkedin', format: 'text', pillar: 'trends' },
    3: { platform: 'linkedin', format: 'post', pillar: 'demo' },
    4: { platform: 'linkedin', format: 'text', pillar: 'tips' },
    5: { platform: 'linkedin', format: 'post', pillar: 'social_proof' },
    6: { platform: 'linkedin', format: 'text', pillar: 'trends' },
    0: { platform: 'linkedin', format: 'post', pillar: 'tips' },
  };

  // Determine which slot we're in
  const slotType = forcePillar === '__midday__' ? 'midday' : forcePillar === '__evening__' ? 'evening' : forcePillar === '__tiktok__' ? 'tiktok' : forcePillar === '__linkedin_1__' ? 'linkedin_1' : forcePillar === '__linkedin_2__' ? 'linkedin_2' : 'morning';
  const activeSchedule = slotType === 'tiktok' ? tiktokSchedule : slotType === 'evening' ? eveningSchedule : slotType === 'midday' ? middaySchedule : slotType === 'linkedin_1' ? linkedinSchedule1 : slotType === 'linkedin_2' ? linkedinSchedule2 : morningSchedule;
  const schedule = activeSchedule[dayOfWeek] || morningSchedule[1];
  const platform = (forcePlatform && forcePlatform !== 'all') ? forcePlatform : schedule.platform;
  const rawForcePillar = (slotType !== 'morning' ? undefined : forcePillar);
  const pillar = (rawForcePillar && !rawForcePillar.startsWith('__')) ? rawForcePillar : schedule.pillar;

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

  // ── ANTI-DUPLICATE: Extract recent visual descriptions to prevent repetition ──
  const recentVisuals = recentGrid?.map((p: any) => (p.visual_description || '').substring(0, 120)).filter((v: string) => v.length > 10) || [];

  // ── COLOR ROTATION: Detect dominant colors to force variety ──
  const recentColors: string[] = [];
  for (const p of (recentGrid || []).slice(0, 5)) {
    const desc = ((p as any).visual_description || '').toLowerCase();
    if (desc.includes('violet') || desc.includes('purple')) recentColors.push('violet');
    else if (desc.includes('amber') || desc.includes('gold') || desc.includes('warm')) recentColors.push('ambre');
    else if (desc.includes('blue') || desc.includes('navy') || desc.includes('bleu')) recentColors.push('bleu');
    else if (desc.includes('green') || desc.includes('emerald') || desc.includes('sage')) recentColors.push('vert');
    else if (desc.includes('coral') || desc.includes('terracotta') || desc.includes('pink') || desc.includes('rose')) recentColors.push('corail');
    else if (desc.includes('black') || desc.includes('dark') || desc.includes('noir')) recentColors.push('noir');
    else if (desc.includes('white') || desc.includes('cream') || desc.includes('light')) recentColors.push('blanc');
    else recentColors.push('autre');
  }
  const lastColor = recentColors[0] || 'aucun';
  const violetCount = recentColors.filter(c => c === 'violet').length;
  const colorWarning = violetCount >= 2
    ? `⚠️ TROP DE VIOLET (${violetCount}/5 derniers posts) ! Utilise une AUTRE couleur dominante : ambre, bleu nuit, vert sauge, corail, noir profond, blanc crème.`
    : lastColor !== 'aucun' ? `La dernière couleur dominante était "${lastColor}". Choisis une couleur DIFFÉRENTE.` : '';

  // ── TARGET ROTATION: Detect recent prospect targets ──
  const TARGET_TYPES = ['restaurant', 'coiffeur', 'boutique', 'coach', 'fleuriste', 'caviste', 'boulanger', 'freelance', 'artisan', 'commerçant'];
  const recentTargets: string[] = [];
  for (const p of (recentGrid || []).slice(0, 5)) {
    const text = `${(p as any).caption || ''} ${(p as any).hook || ''}`.toLowerCase();
    for (const t of TARGET_TYPES) {
      if (text.includes(t)) { recentTargets.push(t); break; }
    }
  }
  const avoidTarget = recentTargets[0] || '';
  const targetWarning = avoidTarget ? `Le dernier post ciblait "${avoidTarget}". Cible un AUTRE type de commerce cette fois (${TARGET_TYPES.filter(t => t !== avoidTarget).slice(0, 4).join(', ')}...).` : '';

  const enhancedPrompt = `Génère 1 post ÉLITE pour aujourd'hui (${todayStr}).

${sharedIntelligence ? `━━━ INTELLIGENCE PARTAGÉE (données de TOUS les agents) ━━━\n${sharedIntelligence}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` : ''}
Plateforme : ${platform}
Format suggéré : ${schedule.format}
Pilier suggéré : ${pillar}${avoidPillar ? `\nATTENTION : Le pilier "${avoidPillar}" a été trop utilisé récemment. CHANGE de pilier si possible.` : ''}

CONTEXTE FEED (les derniers posts, du plus récent) :
${gridContext}

━━━ ANTI-DUPLICATION VISUELLE (CRITIQUE) ━━━
Les visual_description des derniers posts sont :
${recentVisuals.map((v: string, i: number) => `${i + 1}. ${v}`).join('\n') || '(aucun post récent)'}
→ Ton visual_description DOIT être COMPLÈTEMENT DIFFÉRENT de TOUS ces visuels.
→ Change le SUJET, le STYLE, la COULEUR DOMINANTE et la COMPOSITION.
→ INTERDIT de réutiliser la même scène ou le même concept même avec des mots différents.
${colorWarning ? `\n${colorWarning}` : ''}
${targetWarning ? `\n${targetWarning}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CTA RÉCENTS UTILISÉS : ${[...new Set(recentCTAs)].join(', ') || 'aucun'}
→ VARIE le CTA ! Si "save" a été fait, utilise "tag un ami" ou "commente" ou "lien en bio".

PILIER "${pillar}" — GUIDE :
${pillar === 'giving_value' ? '- Donne un vrai conseil applicable IMMÉDIATEMENT. Pas de fluff. Le lecteur doit se dire "ah je vais tester ça tout de suite". Ex: "3 erreurs qui tuent ton engagement Instagram" avec les solutions.' : ''}
${pillar === 'cta' ? '- CTA DIRECT mais pas agressif. Montre la transformation : avant/après. "Teste gratuitement", "Lien en bio", "15 crédits offerts". Le CTA est le point central du post.' : ''}
${pillar === 'social_proof' ? '- Montre des RÉSULTATS concrets. Chiffres, avant/après, témoignages (même simulés de manière crédible pour des types de commerces). Ex: "Ce restaurant a multiplié x3 ses réservations via Instagram".' : ''}
${pillar === 'educational' ? '- Enseigne quelque chose de NOUVEAU. Format tutoriel. "Comment...", "Pourquoi...", "Le guide pour...". Le lecteur apprend ET découvre que KeiroAI peut l\'aider.' : ''}
${pillar === 'trends' ? '- Commente une TENDANCE actuelle (IA, réseaux sociaux, marketing digital). Positionne KeiroAI comme expert qui suit l\'actu. Donne ton avis pro.' : ''}
${pillar === 'behind_the_scenes' ? '- Montre les COULISSES : comment KeiroAI fonctionne, le process de création, les updates. Humanise la marque. Crée de la proximité.' : ''}
${pillar === 'pain_point' ? '- Identifie un PROBLÈME que la cible vit au quotidien, puis montre la solution. Ex: "Tu passes 3h/jour sur tes posts ? Voici comment passer à 10min".' : ''}
${pillar === 'demo' ? '- DÉMONTRE le produit en action. Avant/après visuel. Montre la puissance de Seedream/KeiroAI. Le post EST la preuve.' : ''}

STRATÉGIE GLOBALE :
- Chaque post fait partie d'un ENSEMBLE cohérent. Pense au feed GLOBAL, pas juste ce post isolé.
- Le visuel doit être HARMONIEUX avec les posts précédents (alternance couleurs, pas de répétition).
- Le CTA doit être NATUREL, intégré au contenu, pas forcé. Il guide vers KeiroAI sans être publicitaire.
- Pense conversion INDIRECTE : le prospect voit le post → comprend la valeur → visite le profil → essaie KeiroAI.
- UTILISE les données du pool partagé : si l'email marche bien sur une catégorie, fais un post ciblé pour cette catégorie. Si les DMs ont du succès, renforce la visibilité Instagram.
- Ce post est le ${ slotType === 'linkedin_1' ? 'POST LINKEDIN MATIN (1er du jour)' : slotType === 'linkedin_2' ? 'POST LINKEDIN APRES-MIDI (2e du jour)' : slotType === 'evening' ? 'POST SOIR (3e du jour)' : slotType === 'midday' ? 'POST MIDI (2e du jour)' : 'POST MATIN (1er du jour)' } — assure-toi qu'il soit DIFFÉRENT des posts des autres créneaux de la journée.

RÈGLES :
- Plateformes autorisées : instagram, tiktok, linkedin
- Tu DOIS fournir un champ "visual_description" ULTRA DÉTAILLÉ — c'est un PROMPT SEEDREAM complet EN ANGLAIS pour générer un visuel professionnel
- INTERDIT : téléphone, smartphone, écran, mockup, device dans le visuel (sauf 1 post sur 10 max)
- Exemples de BONS visual_description :
  * "Isometric 3D scene of a cozy French bakery with fresh croissants on display, warm golden lighting, deep violet accents, miniature people walking by, clean render, no text no letters"
  * "Cinematic photo of a florist arranging a vibrant bouquet in a sunlit workshop, shallow depth of field, warm amber tones with violet shadows, editorial style, no text"
  * "Bold flat design composition with abstract geometric shapes in violet and amber, a stylized chef hat as central element, asymmetric layout, studio lighting, no text no letters no words"
  * "3D clay render of a small boutique storefront with pastel colors, soft rounded objects, warm lighting, miniature scene, premium feel, no text"
- AUCUN texte/lettre/mot dans les visuels (Seedream ne gère pas le texte)
- Le champ "hashtags" DOIT contenir 5-10 hashtags pertinents dont #keiroai en premier (NE PAS les mettre dans caption)
- Pense à la MINIATURE dans la grille (carrée, lisible en petit)
- Alterne les couleurs de fond par rapport aux posts précédents

CAPTION — FORMAT UX VISUEL (ULTRA IMPORTANT) :
- La caption DOIT être AÉRÉE avec des sauts de ligne (\\n)
- Structure obligatoire :
  Ligne 1 : Hook punch (5-10 mots max) 🔥
  \\n
  Ligne 2-4 : Valeur (1 idée par ligne, emoji en début de ligne)
  \\n
  Ligne finale : CTA clair
- NE PAS inclure les hashtags dans le caption (ils sont dans le champ "hashtags")
- Max 800 chars Instagram, 500 chars TikTok
- JAMAIS de pavé de texte — chaque section séparée par une ligne vide

COHÉRENCE VISUEL ↔ CAPTION (CRITIQUE) :
- Le visual_description et le caption doivent parler du MÊME SUJET
- Si le hook parle d'un "restaurant qui a doublé ses réservations", le visuel DOIT montrer un restaurant
- Le prospect doit voir l'image ET lire la caption comme une seule histoire cohérente
- Le visuel ILLUSTRE le message, le message DÉCRIT ce que le visuel évoque

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
      ...(orgId ? { org_id: orgId } : {}),
    });
    return NextResponse.json({ ok: false, error: `Claude error: ${claudeError.message}` }, { status: 502 });
  }

  if (!rawText || rawText.trim().length === 0) {
    console.error('[Content] Claude returned empty response');
    await supabase.from('agent_logs').insert({
      agent: 'content', action: 'daily_post_failed',
      data: { error: 'Empty Claude response', phase: 'claude_empty' },
      status: 'error', error_message: 'Empty Claude response', created_at: nowISO,
      ...(orgId ? { org_id: orgId } : {}),
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
      ...(orgId ? { org_id: orgId } : {}),
    });
    return NextResponse.json({ ok: false, error: 'Failed to parse post' }, { status: 500 });
  }

  // Parse time
  let scheduledTime = '12:00';
  if (post.best_time) {
    const timeMatch = post.best_time.match(/(\d{1,2})[h:](\d{2})?/);
    if (timeMatch) scheduledTime = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2] || '00'}`;
  }

  // Sanitize values to match DB check constraints
  const VALID_PLATFORMS_D = ['instagram', 'tiktok', 'linkedin'];
  const VALID_FORMATS_D = ['carrousel', 'reel', 'story', 'post', 'video', 'text'];
  const VALID_PILLARS_D = ['tips', 'demo', 'social_proof', 'trends'];
  const PILLAR_MAP_D: Record<string, string> = { giving_value: 'tips', educational: 'tips', cta: 'demo', behind_the_scenes: 'demo', pain_point: 'tips' };
  const rawPlatformD = (post.platform || platform).toLowerCase();
  const rawFormatD = (post.format || schedule.format).toLowerCase().replace('carousel', 'carrousel');
  const safePlatform = VALID_PLATFORMS_D.includes(rawPlatformD) ? rawPlatformD : platform;
  const safeFormat = VALID_FORMATS_D.includes(rawFormatD) ? rawFormatD : schedule.format;
  const rawPillarD = (post.pillar || pillar || 'tips').toLowerCase();
  const safePillar = VALID_PILLARS_D.includes(rawPillarD) ? rawPillarD : (PILLAR_MAP_D[rawPillarD] || 'tips');

  const { data: inserted, error: insertError } = await supabase.from('content_calendar').insert({
    platform: safePlatform,
    format: safeFormat,
    pillar: safePillar,
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

  // Generate visual or video using KeiroAI's own tech (proof of product!)
  const visualDesc = post.thumbnail_description || post.visual_description || post.hook || post.caption;
  const postPlatform = post.platform || platform;
  const postFormat = post.format || schedule.format;
  // Any reel/video format (TikTok or Instagram) gets the full video+narration pipeline
  const needsVideo = postFormat === 'video' || postFormat === 'reel';

  let visualUrl: string | null = null;
  let videoUrl: string | null = null;
  let igPermalink: string | undefined;
  let tiktokPublishId: string | undefined;
  let publicationError: string | undefined;

  if (visualDesc && inserted?.id) {
    if (needsVideo && postPlatform === 'tiktok') {
      // TikTok: async long video pipeline (30s) — video-poll cron will advance & publish
      console.log(`[Content] TikTok video — starting async 30s pipeline for post ${inserted.id}`);
      const asyncResult = await createAsyncLongVideo(
        visualDesc,
        post.caption || visualDesc,
        30, // 30s TikTok video
        '9:16',
        inserted.id,
      );
      if (asyncResult.jobId) {
        console.log(`[Content] TikTok async job started: ${asyncResult.jobId} — video-poll cron will handle the rest`);
        visualUrl = asyncResult.coverUrl;

        // Log and return — don't publish now, video-poll cron will do it
        await supabase.from('agent_logs').insert({
          agent: 'content', action: 'tiktok_long_video_started',
          data: {
            postId: inserted.id,
            jobId: asyncResult.jobId,
            duration: 30,
            platform: 'tiktok',
            hook: post.hook,
          },
          status: 'success', created_at: nowISO,
          ...(orgId ? { org_id: orgId } : {}),
        });

        // Notify founder
        if (process.env.RESEND_API_KEY) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'KeiroAI Content <contact@keiroai.com>',
              to: ['contact@keiroai.com'],
              subject: `🎬 Vidéo TikTok 30s en cours — ${post.hook || 'Nouveau contenu'}`,
              html: `<div style="font-family:Arial,sans-serif;max-width:600px;">
                <h2 style="color:#0c1a3a;">🎬 Vidéo TikTok 30s en génération</h2>
                <p>Job ID: <code>${asyncResult.jobId}</code></p>
                <p><strong>Hook :</strong> ${post.hook || 'N/A'}</p>
                <p>La vidéo sera publiée automatiquement quand elle sera prête (via le cron video-poll).</p>
                ${asyncResult.coverUrl ? `<img src="${asyncResult.coverUrl}" style="max-width:100%;border-radius:8px;margin:12px 0;" alt="Cover"/>` : ''}
                <p><a href="https://keiroai.com/admin/agents" style="color:#0c1a3a;">→ Voir dans l'admin</a></p>
              </div>`,
            }),
          });
        }

        return NextResponse.json({
          ok: true,
          post: inserted,
          async_video: true,
          video_job_id: asyncResult.jobId,
        });
      } else {
        // Async failed — fallback to synchronous 10s video
        console.warn('[Content] Async long video failed — falling back to sync 10s');
        const videoResult = await generateVideoWithNarration(visualDesc, post.caption || visualDesc, postFormat, 10);
        videoUrl = videoResult.videoUrl;
        visualUrl = videoResult.coverUrl || asyncResult.coverUrl;
      }
    } else if (needsVideo) {
      // Instagram Reels: synchronous 5s video (fast generation)
      console.log(`[Content] ${postPlatform} reel — generating 5s video via Kling/Seedance T2V`);
      const videoResult = await generateVideoWithNarration(
        visualDesc,
        post.caption || visualDesc,
        postFormat,
        5
      );
      videoUrl = videoResult.videoUrl;
      visualUrl = videoResult.coverUrl;

      // If video failed but we have a cover image, downgrade to image post
      if (!videoUrl && visualUrl) {
        console.log('[Content] Video generation failed — publishing as image post instead of reel');
        // Update format in DB so auto-publish won't try reel again
        await supabase.from('content_calendar').update({ format: 'post', updated_at: new Date().toISOString() }).eq('id', inserted.id);
      }
    } else {
      // Image-based post (Instagram post, carousel, story)
      visualUrl = await generateVisual(visualDesc, postFormat);
    }

    const hasMedia = visualUrl || videoUrl;
    if (hasMedia) {
      const visualUpdate: Record<string, any> = {
        visual_url: visualUrl || videoUrl,
        updated_at: new Date().toISOString(),
      };
      if (videoUrl) {
        visualUpdate.video_url = videoUrl;
      }
      if (!draftOnly) {
        visualUpdate.status = 'published';
        visualUpdate.published_at = new Date().toISOString();

        if (postPlatform === 'instagram') {
          const igResult = await publishToInstagram(
            { format: postFormat, caption: post.caption, hashtags: post.hashtags, visual_url: visualUrl || undefined, video_url: videoUrl || undefined },
            supabase
          );
          if (igResult.success) {
            igPermalink = igResult.permalink;
            if (igResult.permalink) visualUpdate.instagram_permalink = igResult.permalink;
            console.log(`[Content] Daily post published to Instagram${igResult.permalink ? `: ${igResult.permalink}` : ''}`);
          } else {
            publicationError = igResult.error;
            console.warn(`[Content] Instagram publish failed for daily post ${inserted.id}: ${igResult.error}`);
          }
        } else if (postPlatform === 'tiktok') {
          const ttResult = await publishToTikTok(
            { format: postFormat, caption: post.caption, hashtags: post.hashtags, visual_url: visualUrl || undefined, video_url: videoUrl || undefined },
            supabase
          );
          if (ttResult.success) {
            tiktokPublishId = ttResult.publish_id;
            if (ttResult.publish_id) visualUpdate.tiktok_publish_id = ttResult.publish_id;
            console.log(`[Content] Daily post published to TikTok: ${ttResult.publish_id}`);
          } else {
            publicationError = ttResult.error;
            console.warn(`[Content] TikTok publish failed for daily post ${inserted.id}: ${ttResult.error}`);
          }
        }
      }
      await supabase.from('content_calendar').update(visualUpdate).eq('id', inserted.id);
      console.log(`[Content] Media generated${draftOnly ? ' (draft)' : ' + auto-published'} for post ${inserted.id}`);
    }
  }

  // Send notification to founder (post is ready/published)
  if (process.env.RESEND_API_KEY) {
    const isPublished = (!!visualUrl || !!videoUrl) && !draftOnly;
    const publishLink = igPermalink || (tiktokPublishId ? `TikTok publish_id: ${tiktokPublishId}` : '');
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'KeiroAI Content <contact@keiroai.com>',
        to: ['contact@keiroai.com'],
        subject: `${isPublished ? '✅' : '📱'} Post ${isPublished ? 'publié' : 'prêt'} : ${postPlatform} ${postFormat} — ${post.hook || 'Nouveau contenu'}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;">
          <h2 style="color:#0c1a3a;">${isPublished ? '✅ Publié' : '📱 Prêt'} — ${postPlatform} ${postFormat}</h2>
          <p><strong>Pilier :</strong> ${post.pillar} | <strong>Heure :</strong> ${post.best_time || scheduledTime}</p>
          <p><strong>Hook :</strong> ${post.hook || 'N/A'}</p>
          <p>${post.caption || ''}</p>
          ${igPermalink ? `<p><strong>Instagram :</strong> <a href="${igPermalink}">${igPermalink}</a></p>` : ''}
          ${tiktokPublishId ? `<p><strong>TikTok :</strong> publish_id: ${tiktokPublishId}</p>` : ''}
          ${publicationError ? `<p style="color:#dc2626;"><strong>Erreur publication :</strong> ${publicationError}</p>` : ''}
          ${visualUrl ? `<img src="${visualUrl}" style="max-width:100%;border-radius:8px;margin:12px 0;" alt="Visuel généré par KeiroAI"/>
          <p style="color:#6b7280;font-size:12px;">Visuel généré et publié automatiquement par KeiroAI</p>` : ''}
          <p style="margin-top:16px;"><a href="https://keiroai.com/admin/agents" style="color:#0c1a3a;">→ Voir dans l'admin</a></p>
        </div>`,
      }),
    });
  }

  await supabase.from('agent_logs').insert({
    agent: 'content', action: 'daily_post_generated',
    data: {
      platform: postPlatform,
      format: postFormat,
      pillar: post.pillar,
      hook: post.hook,
      instagram_permalink: igPermalink,
      tiktok_publish_id: tiktokPublishId,
      publication_error: publicationError,
      has_video: !!videoUrl,
    },
    status: 'success', created_at: nowISO,
    ...(orgId ? { org_id: orgId } : {}),
  });

  // ── Save learnings from daily post generation ──
  try {
    await saveLearning(supabase, {
      agent: 'content',
      category: 'content',
      learning: `Post quotidien généré: ${postPlatform} ${postFormat}, pilier=${post.pillar}${publicationError ? ' (erreur publication)' : ''}`,
      evidence: `daily_post: platform=${postPlatform}, format=${postFormat}, pillar=${post.pillar}, ig=${!!igPermalink}, tiktok=${!!tiktokPublishId}, error=${!!publicationError}`,
      confidence: 20,
    }, orgId);
  } catch (learnErr: any) {
    console.warn('[ContentAgent] Learning save error:', learnErr.message);
  }

  console.log(`[Content] Daily post: ${postPlatform} ${postFormat} — ${post.hook}`);

  return NextResponse.json({
    ok: true,
    post: inserted,
    instagram_permalink: igPermalink,
    tiktok_publish_id: tiktokPublishId,
    publication_error: publicationError,
  });
}
