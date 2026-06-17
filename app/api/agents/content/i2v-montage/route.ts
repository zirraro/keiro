import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { chooseMontagePlan, runI2vMontage, MontagePlan } from '@/lib/visuals/i2v-montage';
import { assessReelQuality } from '@/lib/visuals/reel-qc';

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

  // QC-only mode: assess an existing reel video without regenerating it.
  // Body: { qcOnly: true, videoUrl, businessType?, subject? }
  if (body.qcOnly && body.videoUrl) {
    const qc = await assessReelQuality(body.videoUrl, { businessType: body.businessType, subject: body.subject });
    return NextResponse.json({ ok: !!qc, qc });
  }

  const postId: string = body.postId;
  if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 });

  const supabase = sb();
  const { data: post } = await supabase.from('content_calendar')
    .select('id, user_id, platform, caption, hook, visual_description, pillar')
    .eq('id', postId).single();
  if (!post) return NextResponse.json({ error: 'post not found' }, { status: 404 });

  // Business context for coherent real-image queries + scene briefs.
  let businessType = '', mainProducts = '', company = '';
  let clientBaseImage = ''; // founder: prefer the client's REAL photo as base
  try {
    const { data: d } = await supabase.from('business_dossiers')
      .select('company_name, business_type, main_products, uploaded_files, logo_url').eq('user_id', post.user_id).maybeSingle();
    if (d) {
      businessType = d.business_type || ''; mainProducts = d.main_products || ''; company = d.company_name || '';
      // 1) Client's own uploaded business photo = most personalized + natural.
      const files: any[] = Array.isArray(d.uploaded_files) ? d.uploaded_files : [];
      const img = files.find(f => /^image\//i.test(f?.type || '') || /\.(jpe?g|png|webp)$/i.test(f?.url || ''));
      if (img?.url) clientBaseImage = img.url;
    }
  } catch { /* best-effort */ }
  // 2) Else: leave clientBaseImage empty → runI2vMontage grounds in an
  //    internet-inspired photo PRECISE to this business (Pixabay query built
  //    from the company/products below), never a generic stock cliché.

  const plan: MontagePlan = body.durationSec
    ? (body.durationSec <= 14
        // Forced short reel → single real-image i2v clip (≤10s Seedance cap).
        ? { kind: 'montage', durationSec: body.durationSec, sceneCount: 1, perClipSec: Math.min(10, body.durationSec), reason: 'forced single' }
        : { kind: 'montage', durationSec: body.durationSec, sceneCount: Math.max(2, Math.round(body.durationSec / 10)), perClipSec: 10, reason: 'forced montage' })
    : chooseMontagePlan({ pillar: post.pillar, topicLength: (post.caption || '').length, format: 'reel', seed: (post.id || '').split('').reduce((a: number, c: string) => (a * 31 + c.charCodeAt(0)) | 0, 0) });

  // Only the AUTO path may skip (single-beat handled by the normal reel flow);
  // a forced single is intentional and proceeds as a 1-scene i2v.
  if (plan.kind === 'single' && !body.durationSec) {
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
          pixabay_query: { type: 'string', description: 'ONE very concrete, photographable subject in 2-3 English keywords PRECISE to THIS specific business — derive it from the real activity/products, not a generic category (e.g. a sushi place → "sushi chef counter" not "restaurant"; a tattoo studio → "tattoo artist ink" not "shop"; a yoga studio → "yoga studio class" not "sport"). It must return a COHERENT set of real photos of the SAME kind of place AND visually scream THIS business on a muted feed. Never abstract concepts.' },
          scenes: { type: 'array', items: { type: 'string' }, minItems: plan.sceneCount, maxItems: plan.sceneCount,
            description: `${plan.sceneCount} English i2v MOTION prompts forming ONE cinematic STORY ARC in the SAME place — a real little narrative, not random clips. Order them as a story: (1) wide ESTABLISHING shot setting the place, then BUILD into closer detail, a human gesture/action, the product/result, and a CLOSING beat that lands the feeling. Each prompt = a CAMERA MOVE + subtle natural action that fits ANY photo of "${'${pixabay_query}'}" (e.g. "slow cinematic push-in, soft morning light", "gentle pan revealing the counter", "rack focus onto the hands at work", "slow pull-back closing on the finished product"). Each beat should flow into the next so a crossfade feels natural (end on a calm/open frame). Realistic, natural, NO on-screen text, no beat that contradicts another. ${plan.sceneCount === 1 ? 'For this single beat: the one strongest, most cinematic shot of the subject.' : ''}` },
        }, required: ['pixabay_query', 'scenes'], additionalProperties: false,
      } as any }],
      tool_choice: { type: 'tool', name: 'montage' },
      messages: [{ role: 'user', content: `Build a ${plan.durationSec}s COHERENT cinematic reel for ${company || businessType || 'a local business'} as a REAL STORY (${plan.sceneCount} scene${plan.sceneCount > 1 ? 's' : ''}).\nSubject/brief: "${String(subject).slice(0, 400)}"\nProducts: ${mainProducts}\n\n${clientBaseImage ? 'NOTE: scene 1 animates the CLIENT\'S OWN real photo (already chosen). Write camera-motion prompts generic enough to flow naturally from that real image — do not assume a specific stock subject.\n' : ''}CRITICAL:\n- pixabay_query must be PRECISE to ${company || businessType || 'this business'} (products: ${mainProducts || 'n/a'}) — the exact activity, not a generic category. The visual link must be unmistakable.\n- The ${plan.sceneCount} clips must read as ONE continuous scene in the SAME real place AND progress like a tiny story (establishing → build → action → reveal → close), so stitched + crossfaded clips feel directed, not random.\n- Camera-motion prompts must work on any photo of that subject. Natural, realistic, cinematic. No text.` }],
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
    baseImageUrl: clientBaseImage || undefined, // client photo → else business-precise stock
  });

  if (!finalUrl) {
    return NextResponse.json({ ok: false, error: 'montage_failed', plan, pixabayQuery, sceneCount: scenes.length });
  }

  // Persist the montage video.
  await supabase.from('content_calendar').update({ video_url: finalUrl, format: 'reel', updated_at: new Date().toISOString() }).eq('id', post.id);

  // ── QUALITY CONTROL GATE (founder: standard QC) ──
  // Score the finished reel on continuity / business coherence / realism. Below
  // threshold → HOLD it (draft) instead of publishing a weak reel. Stored on the
  // post so it's visible + auditable. QC null (infra hiccup) → publish anyway.
  const qc = await assessReelQuality(finalUrl, { businessType: businessType || post.pillar, subject });
  if (qc) {
    await supabase.from('content_calendar').update({
      qa_quality_score: qc.score,
      qa_severity: qc.pass ? 'ok' : 'low',
      qa_notes: qc.summary,
      qa_findings: qc as any,
      updated_at: new Date().toISOString(),
    }).eq('id', post.id);
  }
  if (qc && !qc.pass) {
    // Hold for review — do NOT publish a sub-bar reel.
    await supabase.from('content_calendar').update({ status: 'draft' }).eq('id', post.id);
    return NextResponse.json({ ok: true, qc, published: false, held: true, reason: 'qc_below_threshold', plan, sceneCount: scenes.length, pixabayQuery, video_url: finalUrl });
  }

  // Passed QC (or QC unavailable) → publish via the standard publish action.
  let published = false;
  try {
    const pubRes = await fetch(`${internalBase}/api/agents/content?user_id=${post.user_id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', authorization: `Bearer ${cronSecret}` },
      body: JSON.stringify({ action: 'publish', postId: post.id }),
    });
    const pubJson = await pubRes.json().catch(() => null);
    published = !!pubJson?.ok;
  } catch { /* surfaced below */ }

  return NextResponse.json({ ok: true, qc, plan, sceneCount: scenes.length, pixabayQuery, video_url: finalUrl, published });
}
