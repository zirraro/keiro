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

async function generateVisual(visualDescription: string, format: string): Promise<string | null> {
  try {
    // Optimize the visual description into a Seedream-friendly prompt
    const optimizedText = await callGemini({
      system: 'Tu es un expert en prompt engineering pour la génération d\'images IA. Transforme la description en un prompt visuel détaillé en anglais pour Seedream (text-to-image). Décris précisément : composition, couleurs, style, éclairage, ambiance. Pas de texte dans l\'image. Réponse = juste le prompt, rien d\'autre.',
      message: `Description du visuel pour un post ${format} de KeiroAI (app de création de contenu IA pour commerces) :\n\n${visualDescription}`,
      maxTokens: 300,
    });

    const imagePrompt = (optimizedText || visualDescription) + NO_TEXT_SUFFIX;

    // Determine aspect ratio based on format
    let width = 1024;
    let height = 1024;
    if (format === 'story' || format === 'reel' || format === 'video') {
      width = 720; height = 1280; // 9:16
    } else if (format === 'text') {
      width = 1280; height = 720; // 16:9 for LinkedIn
    }
    // carrousel, post = 1:1 (1024x1024)

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
      console.error('[Content] Seedream HTTP error:', seedreamRes.status);
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
      return generateDailyPost(supabase, todayStr, dayOfWeek);
    }

    // Return today's content
    return NextResponse.json({
      ok: true,
      today: todayPosts,
      message: `${todayPosts.length} post(s) planned for today`,
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

  const enhancedSystemPrompt = getContentSystemPrompt() + `

RÈGLES VISUELLES CRITIQUES — COHÉRENCE DU FEED :

Tu dois penser à l'APPARENCE GLOBALE du feed Instagram quand quelqu'un visite le profil @keiroai :
1. HARMONIE DES COULEURS : Alterne les dominantes (violet KeiroAI, blanc épuré, fond sombre, tons chauds). Le feed doit avoir un rythme visuel.
2. MINIATURES GRID : Chaque post sera vu en miniature carrée dans la grille. Le visuel doit être LISIBLE même en petit :
   - Carrousels : la slide de couverture doit avoir un GROS TITRE lisible + couleur de fond forte
   - Reels/Vidéos : décris la miniature idéale (frame d'accroche, texte overlay visible en petit)
   - Posts image : composition centrée, pas trop de détails, message clair en miniature
3. PATTERN DE GRILLE : Pense en lignes de 3 (grille Instagram). Propose une alternance :
   - Ligne : [Carrousel fond violet] [Reel miniature sombre] [Post fond blanc]
   - Évite 3 posts similaires côte à côte
4. Pour chaque post, ajoute un champ "thumbnail_description" qui décrit EXACTEMENT ce que la miniature montrera dans la grille
5. Pour TikTok : la miniature vidéo doit avoir un texte overlay accrocheur visible en petit dans le feed TikTok

HEURES DE PUBLICATION OPTIMALES :
- Instagram : Mardi 11h, Mercredi 18h, Jeudi 12h, Vendredi 17h, Samedi 10h
- TikTok : Mardi 20h, Samedi 21h
- LinkedIn : Jeudi 8h30
Adapte les heures au jour prévu.`;

  const rawText = await callGemini({
    system: enhancedSystemPrompt,
    message: prompt,
    maxTokens: 4000,
  });

  let weekPlan: any[];
  try {
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
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

  // Default schedule by day of week
  const defaultSchedule: Record<number, { platform: string; format: string; pillar: string }> = {
    1: { platform: 'instagram', format: 'carrousel', pillar: 'tips' },       // Monday
    2: { platform: 'tiktok', format: 'video', pillar: 'tips' },              // Tuesday
    3: { platform: 'instagram', format: 'reel', pillar: 'demo' },            // Wednesday
    4: { platform: 'linkedin', format: 'text', pillar: 'tips' },             // Thursday
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

IMPORTANT — COHÉRENCE VISUELLE :
- Pense à ce que la MINIATURE va donner dans la grille Instagram (carrée, petite)
- Pour un carrousel : la COVER SLIDE doit être un gros titre lisible + fond coloré distinct des posts précédents
- Pour un reel/vidéo : décris la frame d'accroche (miniature) avec texte overlay bien visible
- Pour un post image : composition épurée, message central lisible en miniature
- Pour TikTok : miniature avec texte overlay accrocheur, contrasté
- Vérifie que ça ne ressemble PAS aux posts juste avant dans la grille
- Alterne les couleurs de fond : violet, blanc, noir, tons chauds

Retourne UN SEUL objet JSON (pas de markdown).`;

  const rawText = await callGemini({
    system: getContentSystemPrompt() + `\n\nRÈGLE VISUELLE : Pour chaque post, ajoute "thumbnail_description" décrivant exactement la miniature dans la grille (couleur de fond, texte visible, composition). Pense TOUJOURS à comment ça s'intègre visuellement dans le feed.`,
    message: enhancedPrompt,
    maxTokens: 1500,
  });

  let post: any;
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      post = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('No JSON found');
    }
  } catch (parseError) {
    console.error('[Content] Parse error:', parseError);
    await supabase.from('agent_logs').insert({
      agent: 'content', action: 'daily_post_failed',
      data: { raw: rawText.substring(0, 500), error: String(parseError) },
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
