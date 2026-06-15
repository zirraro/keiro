import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { chooseMontagePlan, runI2vMontage, MontagePlan } from '@/lib/visuals/i2v-montage';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/agents/content/i2v-montage  (CRON only)
 * Body: { postId }  — runs a real-image i2v montage for an existing reel post,
 * then publishes it via the standard 'publish' action.
 *
 * ISOLATED from the video-poll cron (which publishes all reels) — invoking this
 * cannot break the working reel flow. Runs the montage inline (VPS has no
 * serverless timeout). This is the "real Pixabay image → i2v → stitch → 30/45/
 * 60s cinematic reel" pipeline the founder approved.
 */
function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const postId: string = body.postId;
  if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 });

  const supabase = sb();
  const { data: post } = await supabase.from('content_calendar')
    .select('id, user_id, platform, caption, hook, visual_description, pillar')
    .eq('id', postId).single();
  if (!post) return NextResponse.json({ error: 'post not found' }, { status: 404 });

  // Business context for coherent real-image queries + scene briefs.
  let businessType = '', mainProducts = '', company = '';
  try {
    const { data: d } = await supabase.from('business_dossiers')
      .select('company_name, business_type, main_products').eq('user_id', post.user_id).maybeSingle();
    if (d) { businessType = d.business_type || ''; mainProducts = d.main_products || ''; company = d.company_name || ''; }
  } catch { /* best-effort */ }

  const plan: MontagePlan = body.durationSec
    ? { kind: 'montage', durationSec: body.durationSec, sceneCount: Math.max(2, Math.round(body.durationSec / 9)), perClipSec: 9, reason: 'forced' }
    : chooseMontagePlan({ pillar: post.pillar, topicLength: (post.caption || '').length, format: 'reel', seed: (post.id || '').split('').reduce((a: number, c: string) => (a * 31 + c.charCodeAt(0)) | 0, 0) });

  if (plan.kind === 'single') {
    return NextResponse.json({ ok: true, skipped: 'plan=single', plan });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing' }, { status: 500 });

  // Ask Claude for N cinematic scene beats of the SAME subject + a Pixabay query.
  const subject = post.visual_description || post.hook || post.caption || `${businessType} ${mainProducts}`;
  let scenes: string[] = [];
  let pixabayQuery = (businessType || mainProducts || 'commerce').split(/\s+/).slice(0, 3).join(' ');
  try {
    const r = await new Anthropic({ apiKey }).messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 600,
      tools: [{ name: 'montage', description: 'cinematic montage plan', input_schema: {
        type: 'object',
        properties: {
          pixabay_query: { type: 'string', description: '2-4 English keywords to find REAL stock photos of this subject (the shop/product/scene)' },
          scenes: { type: 'array', items: { type: 'string' }, minItems: plan.sceneCount, maxItems: plan.sceneCount,
            description: `${plan.sceneCount} short English i2v motion prompts — distinct beats of the SAME ${businessType || 'business'} scene, cinematic, real and natural (camera move + subtle action), NO text in video` },
        }, required: ['pixabay_query', 'scenes'], additionalProperties: false,
      } as any }],
      tool_choice: { type: 'tool', name: 'montage' },
      messages: [{ role: 'user', content: `Build a ${plan.durationSec}s cinematic reel for ${company || businessType || 'a local business'}.\nSubject/brief: "${String(subject).slice(0, 400)}"\nProducts: ${mainProducts}\n\nReturn ${plan.sceneCount} distinct scene motion-prompts (same place/subject, different angle/beat) + a Pixabay query for real base photos.` }],
    });
    const tu = r.content.find((b: any) => b.type === 'tool_use') as any;
    if (tu?.input?.scenes?.length) scenes = tu.input.scenes;
    if (tu?.input?.pixabay_query) pixabayQuery = tu.input.pixabay_query;
  } catch { /* fallback below */ }

  if (scenes.length === 0) {
    scenes = Array.from({ length: plan.sceneCount }, (_, i) =>
      `${subject}. Cinematic real-life shot, scene ${i + 1}: subtle camera move, natural light, authentic moment, no text.`);
  }

  const internalBase = process.env.INTERNAL_API_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
  const finalUrl = await runI2vMontage({
    scenes, pixabayQuery, perClipSec: plan.perClipSec, postId: post.id,
    internalBase, cronSecret, userId: post.user_id,
    hookTopic: post.hook || post.caption || subject, hookLang: 'fr',
  });

  if (!finalUrl) {
    return NextResponse.json({ ok: false, error: 'montage_failed', plan, pixabayQuery, sceneCount: scenes.length });
  }

  // Persist the montage video, then publish via the standard publish action.
  await supabase.from('content_calendar').update({ video_url: finalUrl, format: 'reel', updated_at: new Date().toISOString() }).eq('id', post.id);
  let published = false;
  try {
    const pubRes = await fetch(`${internalBase}/api/agents/content?user_id=${post.user_id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', authorization: `Bearer ${cronSecret}` },
      body: JSON.stringify({ action: 'publish', postId: post.id }),
    });
    const pubJson = await pubRes.json().catch(() => null);
    published = !!pubJson?.ok;
  } catch { /* surfaced below */ }

  return NextResponse.json({ ok: true, plan, sceneCount: scenes.length, pixabayQuery, video_url: finalUrl, published });
}
