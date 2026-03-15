import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { getAuthUser } from '@/lib/auth-server';
import { getContentSystemPrompt, getWeeklyPlanPrompt } from '@/lib/agents/content-prompt';
import { publishImageToInstagram, publishStoryToInstagram, publishCarouselToInstagram } from '@/lib/meta';
import { publishTikTokVideoViaFileUpload, refreshTikTokToken } from '@/lib/tiktok';
import { createT2VTask, checkT2VTask } from '@/lib/kling';
import { publishReelToInstagram } from '@/lib/meta';
import { convertImageToVideoKenBurns, mergeVideoWithAudio } from '@/lib/video-converter';
import { generateNarrationSuggestions } from '@/lib/audio/condense-text';
import { generateAudioWithElevenLabs, DEFAULT_VOICE_ID } from '@/lib/audio/elevenlabs-tts';
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
- Hex color codes (like #7C3AED) — use color names instead (deep violet, soft purple, amber)
- Aspect ratios or technical specs (like 9:16, 1:1, 4K) — describe the feeling not the format
- Cluttered compositions with too many elements
- Stock photo aesthetic (generic, lifeless)
- Low contrast or muddy colors

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
async function publishToInstagram(
  post: { format?: string; caption?: string; hashtags?: string[]; visual_url?: string; video_url?: string },
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

    if (!post.visual_url && !post.video_url) {
      return { success: false, error: 'No visual_url or video_url available for publishing' };
    }

    // Build caption with hashtags
    const hashtagsArr = Array.isArray(post.hashtags) ? post.hashtags : [];
    const fullCaption = (post.caption || '') + (hashtagsArr.length > 0 ? '\n\n' + hashtagsArr.join(' ') : '');

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
// Generate TikTok video via Kling T2V (5s, 9:16 vertical)
// Returns permanent Supabase Storage URL or null
// ──────────────────────────────────────
async function generateTikTokVideo(visualDescription: string): Promise<string | null> {
  try {
    // Optimize prompt for video generation
    const optimizedPrompt = await callClaude({
      system: `You are an expert at writing video generation prompts for Kling AI.
Convert the user's visual brief into a cinematic 5-second video prompt.
Rules:
- Max 200 characters
- Describe MOTION and CAMERA movement (pan, zoom, dolly, tracking shot)
- Focus on ONE dynamic visual scene
- NO text, NO logos, NO UI elements
- Professional quality, 4K cinematic look
- Output ONLY the prompt, nothing else`,
      message: `Create a 5s vertical video prompt from this brief: ${visualDescription}`,
      maxTokens: 200,
    });

    const videoPrompt = (optimizedPrompt || visualDescription).substring(0, 250);
    console.log(`[Content] Generating TikTok video via Kling T2V: "${videoPrompt.substring(0, 80)}..."`);

    // Create Kling T2V task (5s, 9:16 vertical for TikTok)
    const taskId = await createT2VTask({
      prompt: videoPrompt,
      duration: '5',
      aspect_ratio: '9:16',
    });

    console.log(`[Content] Kling T2V task created: ${taskId}`);

    // Poll for completion (max 3 minutes)
    const maxWait = 180_000;
    const pollInterval = 8_000;
    const start = Date.now();

    while (Date.now() - start < maxWait) {
      await new Promise(r => setTimeout(r, pollInterval));

      const result = await checkT2VTask(taskId);

      if (result.status === 'completed' && result.videoUrl) {
        console.log(`[Content] Kling T2V completed: ${result.videoUrl.substring(0, 80)}...`);

        // Cache video to Supabase Storage for permanent URL
        const cachedUrl = await cacheVideoToStorage(result.videoUrl, `tiktok-${Date.now()}`);
        return cachedUrl || result.videoUrl;
      }

      if (result.status === 'failed') {
        console.error(`[Content] Kling T2V failed: ${result.error}`);
        return null;
      }

      console.log(`[Content] Kling T2V polling... status: ${result.status}`);
    }

    console.error('[Content] Kling T2V timeout after 3 minutes');
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
// Generate a 30s video with Ken Burns + narration (for Reels & TikTok)
// Pipeline: image → Ken Burns video → narration text → TTS → merge audio+video
// ──────────────────────────────────────
async function generateVideoWithNarration(
  visualDescription: string,
  caption: string,
  format: string = 'reel',
  duration: number = 30
): Promise<{ videoUrl: string | null; coverUrl: string | null }> {
  try {
    console.log(`[Content] === VIDEO+NARRATION PIPELINE (${duration}s) ===`);

    // Step 1: Generate the cover image via Seedream
    console.log('[Content] Step 1: Generating Seedream image...');
    const imageUrl = await generateVisual(visualDescription, format);
    if (!imageUrl) {
      console.error('[Content] Image generation failed — aborting video pipeline');
      return { videoUrl: null, coverUrl: null };
    }
    console.log('[Content] Image generated:', imageUrl.substring(0, 80));

    // Step 2: Download image and create Ken Burns video
    console.log(`[Content] Step 2: Creating ${duration}s Ken Burns video...`);
    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok) {
      console.error('[Content] Failed to download image for Ken Burns');
      return { videoUrl: null, coverUrl: imageUrl };
    }
    const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());

    const videoBuffer = await convertImageToVideoKenBurns(imgBuffer, {
      width: 1080,
      height: 1920,
      duration,
      fps: 30,
    });
    console.log(`[Content] Ken Burns video: ${(videoBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);

    // Step 3: Generate narration text
    console.log('[Content] Step 3: Generating narration text...');
    const targetWords = Math.floor(duration * 2.5); // ~2.5 words/sec for natural speech
    const narrationContext = `${caption}\n\nVisuel: ${visualDescription}`;
    let narrationText: string;

    try {
      const suggestions = await generateNarrationSuggestions(narrationContext, targetWords);
      // Pick catchy style for social media
      narrationText = suggestions.catchy || suggestions.informative || suggestions.storytelling;
      console.log('[Content] Narration text:', narrationText.substring(0, 100));
    } catch (narErr: any) {
      console.warn('[Content] Narration generation failed:', narErr.message);
      // Fallback: use the caption as narration
      narrationText = caption.replace(/#\w+/g, '').replace(/\n+/g, '. ').trim().substring(0, 300);
      console.log('[Content] Using caption as fallback narration');
    }

    // Step 4: Generate TTS audio
    console.log('[Content] Step 4: Generating TTS audio...');
    let audioUrl: string;
    try {
      // Use Daniel voice (posé, professional) — good for all content types
      audioUrl = await generateAudioWithElevenLabs(narrationText, DEFAULT_VOICE_ID);
      console.log('[Content] Audio generated:', audioUrl.substring(0, 80));
    } catch (ttsErr: any) {
      console.warn('[Content] TTS failed:', ttsErr.message);
      // If TTS fails, still return the silent video — it's better than nothing
      const videoId = `reel-silent-${Date.now()}`;
      const cachedUrl = await cacheVideoBufferToStorage(videoBuffer, videoId);
      return { videoUrl: cachedUrl, coverUrl: imageUrl };
    }

    // Step 5: Merge audio + video
    console.log('[Content] Step 5: Merging audio + video...');
    let mergedBuffer: Buffer;
    try {
      // Download the audio file
      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) throw new Error('Failed to download audio');
      const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
      mergedBuffer = await mergeVideoWithAudio(videoBuffer, audioBuffer);
      console.log(`[Content] Merged video: ${(mergedBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
    } catch (mergeErr: any) {
      console.warn('[Content] Audio merge failed:', mergeErr.message, '— using silent video');
      mergedBuffer = videoBuffer;
    }

    // Step 6: Upload final video to Supabase Storage
    console.log('[Content] Step 6: Uploading to Supabase Storage...');
    const videoId = `reel-${Date.now()}`;
    const finalUrl = await cacheVideoBufferToStorage(mergedBuffer, videoId);

    if (!finalUrl) {
      console.error('[Content] Failed to cache video to storage');
      return { videoUrl: null, coverUrl: imageUrl };
    }

    console.log(`[Content] === VIDEO PIPELINE COMPLETE: ${finalUrl.substring(0, 80)} ===`);
    return { videoUrl: finalUrl, coverUrl: imageUrl };
  } catch (e: any) {
    console.error('[Content] Video+narration pipeline error:', e.message);
    return { videoUrl: null, coverUrl: null };
  }
}

/**
 * Cache a video Buffer directly to Supabase Storage.
 */
async function cacheVideoBufferToStorage(buffer: Buffer, videoId: string): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    const fileName = `content/videos/${videoId}.mp4`;
    const blob = new Blob([new Uint8Array(buffer)], { type: 'video/mp4' });
    const { error: uploadError } = await supabase.storage
      .from('generated-images').upload(fileName, blob, { contentType: 'video/mp4', upsert: false });
    if (uploadError) {
      console.error('[Content] Video buffer cache error:', uploadError.message);
      return null;
    }
    const { data: { publicUrl } } = supabase.storage.from('generated-images').getPublicUrl(fileName);
    console.log('[Content] Video buffer cached to storage');
    return publicUrl || null;
  } catch (e: any) {
    console.error('[Content] Video buffer caching failed:', e.message);
    return null;
  }
}

// ──────────────────────────────────────
// Publish to TikTok (ALWAYS as video — photo API not supported)
// ──────────────────────────────────────
async function publishToTikTok(
  post: { format?: string; caption?: string; hashtags?: string[]; visual_url?: string; video_url?: string },
  supabase: any
): Promise<{ success: boolean; publish_id?: string; error?: string }> {
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
    const fullCaption = (post.caption || '') + (hashtagsArr.length > 0 ? '\n\n' + hashtagsArr.join(' ') : '');

    // TikTok: ALWAYS publish as video (photo API not supported/audited)
    // If we have a video_url, use it directly. Otherwise generate video from image.
    let videoUrl = post.video_url;

    if (!videoUrl && post.visual_url) {
      console.log('[Content] TikTok: no video_url — generating video from image...');
      const result = await generateVideoWithNarration(
        post.visual_url,
        post.caption || 'Découvrez KeiroAI',
        'video',
        30
      );
      videoUrl = result.videoUrl || undefined;
    }

    if (!videoUrl) {
      return { success: false, error: 'No video available for TikTok publishing' };
    }

    console.log(`[Content] Publishing TikTok VIDEO: ${videoUrl.substring(0, 60)}...`);
    const result = await publishTikTokVideoViaFileUpload(
      accessToken,
      videoUrl,
      fullCaption.substring(0, 150),
      { privacy_level: 'SELF_ONLY' }
    );
    console.log(`[Content] TikTok video published: ${result.publish_id}`);
    return { success: true, publish_id: result.publish_id };
  } catch (error: any) {
    console.error('[Content] TikTok publish error:', error.message || error);
    return { success: false, error: error.message || 'Unknown TikTok publishing error' };
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

    // Check slot param for midday/evening content
    const slot = request.nextUrl.searchParams.get('slot');

    // If no post for today, generate one on the fly
    if (!todayPosts || todayPosts.length === 0) {
      console.log('[Content] No posts for today — generating one now');
      return generateDailyPost(supabase, todayStr, dayOfWeek);
    }

    // Midday slot: generate 2nd post if < 2 exist
    if (slot === 'midday' && todayPosts.length < 2) {
      console.log('[Content] Midday slot — generating 2nd post for today');
      return generateDailyPost(supabase, todayStr, dayOfWeek, undefined, '__midday__');
    }

    // Evening slot: generate 3rd post if < 3 exist
    if (slot === 'evening' && todayPosts.length < 3) {
      console.log('[Content] Evening slot — generating 3rd post for today');
      return generateDailyPost(supabase, todayStr, dayOfWeek, undefined, '__evening__');
    }

    // If posts exist but none are published yet, auto-publish them
    const unpublished = todayPosts.filter((p: any) => p.status === 'draft' || p.status === 'approved');
    if (unpublished.length > 0 && isCron) {
      console.log(`[Content] ${unpublished.length} unpublished posts for today — auto-publishing`);
      let published = 0;
      for (const post of unpublished) {
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
          // Cache to permanent storage
          const cachedUrl = await cacheImageToStorage(visualUrl, post.id);
          if (cachedUrl) visualUrl = cachedUrl;
          await supabase.from('content_calendar').update({ visual_url: visualUrl, updated_at: new Date().toISOString() }).eq('id', post.id);
        }

        // For reel/video formats: generate video+narration if not already done
        const postFormat = (fullPost.format || 'post').toLowerCase();
        let videoUrl = fullPost.video_url || null;
        if ((postFormat === 'reel' || postFormat === 'video') && !videoUrl) {
          console.log(`[Content] Auto-publish: ${postFormat} needs video — generating...`);
          const desc = fullPost.visual_description || fullPost.hook || fullPost.caption;
          if (desc) {
            const vidResult = await generateVideoWithNarration(desc, fullPost.caption || desc, postFormat, 30);
            videoUrl = vidResult.videoUrl;
            if (vidResult.coverUrl && !visualUrl) visualUrl = vidResult.coverUrl;
          }
        }

        // Publish to platform FIRST, then mark as published
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
          }
        } else if (fullPost.platform === 'tiktok') {
          const ttResult = await publishToTikTok(postWithMedia, supabase);
          if (ttResult.success && ttResult.publish_id) {
            updateFields.tiktok_publish_id = ttResult.publish_id;
            platformSuccess = true;
            console.log(`[Content] TikTok published for post ${post.id}: ${ttResult.publish_id}`);
          } else {
            console.error(`[Content] TikTok publish FAILED for post ${post.id}: ${ttResult.error}`);
          }
        } else {
          // LinkedIn or other — mark published without external API
          platformSuccess = true;
        }

        // ONLY mark as published if platform publish succeeded
        if (platformSuccess) {
          updateFields.status = 'published';
          updateFields.published_at = new Date().toISOString();
          published++;
        } else {
          // Leave as approved so it can be retried
          updateFields.status = 'approved';
        }

        await supabase.from('content_calendar').update(updateFields).eq('id', post.id);
      }
      console.log(`[Content] Auto-published ${published}/${unpublished.length} posts`);
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
        return generateWeeklyPlan(supabase, body.platform, body.draftOnly);

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

          // For reel/video formats: generate video with narration if not already done
          const pFormat = (post.format || 'post').toLowerCase();
          let videoUrl = post.video_url || null;
          if ((pFormat === 'reel' || pFormat === 'video') && !videoUrl) {
            console.log(`[Content] execute_pub: ${pFormat} needs video — generating...`);
            const desc = post.visual_description || post.hook || post.caption;
            if (desc) {
              const vr = await generateVideoWithNarration(desc, post.caption || desc, pFormat, 30);
              videoUrl = vr.videoUrl;
              if (videoUrl) updateData.video_url = videoUrl;
            }
          }

          // Publish to platform
          let igPermalink: string | undefined;
          let ttPublishId: string | undefined;
          let pubError: string | undefined;
          const postWithVideo = { ...post, video_url: videoUrl };

          if (post.platform === 'instagram' && (post.visual_url || videoUrl)) {
            const igResult = await publishToInstagram(postWithVideo, supabase);
            if (igResult.success) {
              igPermalink = igResult.permalink;
              if (igResult.permalink) updateData.instagram_permalink = igResult.permalink;
            } else {
              pubError = igResult.error;
              console.warn(`[Content] Instagram publish failed for post ${post.id}: ${igResult.error}`);
            }
          } else if (post.platform === 'tiktok' && (post.visual_url || videoUrl)) {
            const ttResult = await publishToTikTok(postWithVideo, supabase);
            if (ttResult.success) {
              ttPublishId = ttResult.publish_id;
              if (ttResult.publish_id) updateData.tiktok_publish_id = ttResult.publish_id;
            } else {
              pubError = ttResult.error;
              console.warn(`[Content] TikTok publish failed for post ${post.id}: ${ttResult.error}`);
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

              // Publish to platform
              let igPermalink2: string | undefined;
              let pubError2: string | undefined;
              if (post.platform === 'instagram') {
                const igResult = await publishToInstagram({ ...post, visual_url: visualUrl }, supabase);
                if (igResult.success) {
                  igPermalink2 = igResult.permalink;
                  if (igResult.permalink) updateData.instagram_permalink = igResult.permalink;
                } else {
                  pubError2 = igResult.error;
                  console.warn(`[Content] Instagram publish failed for post ${post.id}: ${igResult.error}`);
                }
              } else if (post.platform === 'tiktok') {
                const ttResult = await publishToTikTok({ ...post, visual_url: visualUrl }, supabase);
                if (ttResult.success && ttResult.publish_id) {
                  updateData.tiktok_publish_id = ttResult.publish_id;
                } else {
                  pubError2 = ttResult.error;
                  console.warn(`[Content] TikTok publish failed for post ${post.id}: ${ttResult.error}`);
                }
              }

              await supabase.from('content_calendar').update(updateData).eq('id', post.id);
              publishedCount++;
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
async function generateWeeklyPlan(supabase: any, filterPlatform?: string, draftOnly?: boolean) {
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

    const postPlatform = filterPlatform || post.platform || 'instagram';
    const { error: insertError } = await supabase.from('content_calendar').insert({
      platform: postPlatform,
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
      status: draftOnly ? 'draft' : 'approved',
      ai_generated: true,
    });

    if (!insertError) {
      inserted++;
      // Generate visual using KeiroAI Seedream (proof of product) + auto-publish if not draft
      if (!draftOnly) {
        const postVisualDesc = post.thumbnail_description || post.visual_description || post.hook;
        if (postVisualDesc) {
          const postVisualUrl = await generateVisual(postVisualDesc, post.format || 'post');
          if (postVisualUrl) {
            await supabase.from('content_calendar')
              .update({ visual_url: postVisualUrl, status: 'published', published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
              .eq('scheduled_date', scheduledDate)
              .eq('platform', postPlatform)
              .eq('status', 'approved')
              .is('visual_url', null);
          }
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

  // 3x/day content strategy: morning + midday + evening
  // Each slot has a different marketing pillar to maximize variety and engagement
  // Pillars: giving_value (tips/how-to), cta (direct conversion), social_proof (testimonials/results),
  //          educational (teach something), trends (news/tendances), behind_the_scenes (BTS/process),
  //          pain_point (identify problem → solution), demo (product showcase)
  // Content strategy: alternates Instagram (Reels + posts) and TikTok (videos)
  // Reels & TikTok videos get full video+narration pipeline (30s Ken Burns + voiceover)
  const morningSchedule: Record<number, { platform: string; format: string; pillar: string }> = {
    1: { platform: 'instagram', format: 'reel', pillar: 'giving_value' },          // Mon AM: tips reel
    2: { platform: 'tiktok', format: 'video', pillar: 'educational' },             // Tue AM: tuto vidéo
    3: { platform: 'instagram', format: 'reel', pillar: 'demo' },                  // Wed AM: démo reel
    4: { platform: 'tiktok', format: 'video', pillar: 'pain_point' },              // Thu AM: problème→solution
    5: { platform: 'instagram', format: 'reel', pillar: 'trends' },                // Fri AM: tendances reel
    6: { platform: 'tiktok', format: 'video', pillar: 'behind_the_scenes' },       // Sat AM: BTS vidéo
    0: { platform: 'instagram', format: 'reel', pillar: 'social_proof' },          // Sun AM: résultats reel
  };
  const middaySchedule: Record<number, { platform: string; format: string; pillar: string }> = {
    1: { platform: 'tiktok', format: 'video', pillar: 'behind_the_scenes' },       // Mon MID: BTS vidéo
    2: { platform: 'instagram', format: 'reel', pillar: 'social_proof' },          // Tue MID: témoignage reel
    3: { platform: 'tiktok', format: 'video', pillar: 'giving_value' },            // Wed MID: tips vidéo
    4: { platform: 'instagram', format: 'reel', pillar: 'cta' },                   // Thu MID: CTA reel
    5: { platform: 'tiktok', format: 'video', pillar: 'giving_value' },            // Fri MID: tips vidéo
    6: { platform: 'instagram', format: 'reel', pillar: 'demo' },                  // Sat MID: démo reel
    0: { platform: 'tiktok', format: 'video', pillar: 'educational' },             // Sun MID: tuto vidéo
  };
  const eveningSchedule: Record<number, { platform: string; format: string; pillar: string }> = {
    1: { platform: 'instagram', format: 'reel', pillar: 'demo' },                  // Mon EVE: démo reel
    2: { platform: 'tiktok', format: 'video', pillar: 'cta' },                     // Tue EVE: CTA vidéo
    3: { platform: 'instagram', format: 'post', pillar: 'social_proof' },           // Wed EVE: témoignage post
    4: { platform: 'tiktok', format: 'video', pillar: 'trends' },                  // Thu EVE: tendances
    5: { platform: 'instagram', format: 'story', pillar: 'behind_the_scenes' },    // Fri EVE: coulisses story
    6: { platform: 'instagram', format: 'reel', pillar: 'pain_point' },             // Sat EVE: problème→solution
    0: { platform: 'instagram', format: 'reel', pillar: 'cta' },                   // Sun EVE: CTA reel
  };

  // Determine which slot we're in (morning by default, midday or evening if specified)
  const slotType = forcePillar === '__midday__' ? 'midday' : forcePillar === '__evening__' ? 'evening' : 'morning';
  const activeSchedule = slotType === 'evening' ? eveningSchedule : slotType === 'midday' ? middaySchedule : morningSchedule;
  const schedule = activeSchedule[dayOfWeek] || morningSchedule[1];
  const platform = forcePlatform || schedule.platform;
  const pillar = (slotType !== 'morning' ? undefined : forcePillar) || schedule.pillar;

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
- Ce post est le ${ slotType === 'evening' ? 'POST SOIR (3e du jour)' : slotType === 'midday' ? 'POST MIDI (2e du jour)' : 'POST MATIN (1er du jour)' } — assure-toi qu'il soit DIFFÉRENT des posts des autres créneaux de la journée.

RÈGLES :
- Plateformes autorisées : instagram, tiktok UNIQUEMENT (pas de LinkedIn)
- Tu DOIS fournir un champ "visual_description" ULTRA DÉTAILLÉ — c'est un PROMPT SEEDREAM complet EN ANGLAIS pour générer un visuel professionnel
- Exemple de bon visual_description : "Professional flat design illustration of a smartphone showing a social media marketing dashboard, deep violet gradient background, clean minimalist composition, studio lighting, sharp details, no text no letters no words"
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
    if (needsVideo) {
      // Full video pipeline: image → Ken Burns → narration → TTS → merge
      console.log(`[Content] ${postPlatform} ${postFormat} — generating video with narration (30s)`);
      const videoResult = await generateVideoWithNarration(
        visualDesc,
        post.caption || visualDesc,
        postFormat,
        30
      );
      videoUrl = videoResult.videoUrl;
      visualUrl = videoResult.coverUrl; // Cover image for preview
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
        to: ['mrzirraro@gmail.com'],
        subject: `${isPublished ? '✅' : '📱'} Post ${isPublished ? 'publié' : 'prêt'} : ${postPlatform} ${postFormat} — ${post.hook || 'Nouveau contenu'}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;">
          <h2 style="color:#9333ea;">${isPublished ? '✅ Publié' : '📱 Prêt'} — ${postPlatform} ${postFormat}</h2>
          <p><strong>Pilier :</strong> ${post.pillar} | <strong>Heure :</strong> ${post.best_time || scheduledTime}</p>
          <p><strong>Hook :</strong> ${post.hook || 'N/A'}</p>
          <p>${post.caption || ''}</p>
          ${igPermalink ? `<p><strong>Instagram :</strong> <a href="${igPermalink}">${igPermalink}</a></p>` : ''}
          ${tiktokPublishId ? `<p><strong>TikTok :</strong> publish_id: ${tiktokPublishId}</p>` : ''}
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
  });

  console.log(`[Content] Daily post: ${postPlatform} ${postFormat} — ${post.hook}`);

  return NextResponse.json({
    ok: true,
    post: inserted,
    instagram_permalink: igPermalink,
    tiktok_publish_id: tiktokPublishId,
    publication_error: publicationError,
  });
}
