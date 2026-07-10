import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { chooseMontagePlan, runI2vMontage, runKenBurnsMontage, finalizeReel, MontagePlan } from '@/lib/visuals/i2v-montage';
import { searchPixabayImages } from '@/lib/stock/pixabay';
import { generateJadeImage, generateJadeImageFromReference } from '@/lib/visuals/jade-prompter';
import { assessReelQuality } from '@/lib/visuals/reel-qc';
import { curateCoherentPhotos } from '@/lib/visuals/photo-curator';

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

  // Dual-reel mode: compose TWO owned clips (A = hook/format court, B = notre
  // reel) avec une transition "recoupe", + musique. Body: { dual, clipA, clipB,
  // postId?, hookSec?, hookTopic?, bakeAudio? }. (Founder 2026-06-23)
  if (body.dual && body.clipA && body.clipB) {
    const { dualReelMontage } = await import('@/lib/visuals/i2v-montage');
    const dpId = body.postId || `dual-${Date.now()}`;
    const composed = await dualReelMontage({ clipA: body.clipA, clipB: body.clipB, postId: dpId, hookSec: body.hookSec });
    if (!composed) return NextResponse.json({ ok: false, error: 'dual_compose_failed' }, { status: 200 });
    let finalUrl = composed;
    try {
      const fin = await finalizeReel([composed], { postId: dpId, durationSec: 30, hookTopic: body.hookTopic, hookLang: 'fr', bakeAudio: body.bakeAudio !== false });
      if (fin) finalUrl = fin;
    } catch { /* keep silent composed on finalize failure */ }
    if (body.postId) {
      await sb().from('content_calendar').update({ video_url: finalUrl, engagement_data: { visual_provenance: 'dual', is_aigc: true }, updated_at: new Date().toISOString() }).eq('id', body.postId);
    }
    return NextResponse.json({ ok: true, url: finalUrl });
  }

  const postId: string = body.postId;
  if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 });

  const supabase = sb();
  const { data: post } = await supabase.from('content_calendar')
    .select('id, user_id, platform, caption, hook, visual_description, pillar')
    .eq('id', postId).single();
  if (!post) return NextResponse.json({ error: 'post not found' }, { status: 404 });

  // Business context + the client's REAL assets (founder mix: footage client →
  // Ken Burns sur vraies photos → i2v seulement si pertinent).
  let businessType = '', mainProducts = '', company = '';
  const clientPhotos: string[] = [];
  const clientVideos: string[] = [];
  try {
    const { data: d } = await supabase.from('business_dossiers')
      .select('company_name, business_type, main_products, uploaded_files, logo_url').eq('user_id', post.user_id).maybeSingle();
    if (d) {
      businessType = d.business_type || ''; mainProducts = d.main_products || ''; company = d.company_name || '';
      const files: any[] = Array.isArray(d.uploaded_files) ? d.uploaded_files : [];
      for (const f of files) {
        const u = String(f?.url || '');
        if (!u) continue;
        if (/^video\//i.test(f?.type || '') || /\.(mp4|mov|webm|m4v)$/i.test(u)) clientVideos.push(u);
        else if (/^image\//i.test(f?.type || '') || /\.(jpe?g|png|webp)$/i.test(u)) clientPhotos.push(u);
      }
    }
  } catch { /* best-effort */ }
  const clientBaseImage = clientPhotos[0] || '';

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
  const hookTopic = post.hook || post.caption || subject;

  // ── MIX INTELLIGENT + GÉNÉRATION SCRIPTÉE (founder 2026-06-18) ──
  // QC proved BOTH i2v-of-stock (hallucinates) AND Ken-Burns-of-MANY-stock-photos
  // (incoherent "3 univers sans rapport") fail. The reliable path: ONE coherent
  // image + multi-move Ken Burns on the SAME image → continuity can't break.
  // Priority:
  //   1. Client VIDEO footage → stitch (best, fully real).
  //   2. Client PHOTOS → Ken Burns on their real images (never hallucinate them).
  //   3. DEFAULT → GENERATE one business-precise photorealistic hero image
  //      (Seedream élite, anti-AI) → multi-move Ken Burns on it.
  //   4. i2v / multi-stock behind explicit flags.
  const sceneN = Math.min(3, Math.max(1, plan.sceneCount)); // fewer cuts = coherent
  const perClip = Math.max(6, Math.round(plan.durationSec / sceneN));
  // Capture non-null values — TS loses `post` narrowing inside the closure below.
  const pId: string = post.id;
  const pUserId: string = (post.user_id || '') as string;
  const cs: string = cronSecret;
  // TikTok PREPARE mode (founder): deliver the reel SILENT (no baked music) so a
  // trending TikTok sound is added in-app (top reach factor the API can't do),
  // then hold as DRAFT (don't auto-publish). bakeAudio=false drives the silence.
  const prepareMode = body.prepareMode === true;
  const bakeAudio = !prepareMode;

  async function generateOnce(): Promise<{ url: string | null; method: string }> {
    if (clientVideos.length > 0) {
      return { method: 'client_footage', url: await finalizeReel(clientVideos.slice(0, plan.sceneCount), { postId: pId, durationSec: plan.durationSec, hookTopic, hookLang: 'fr', bakeAudio }) };
    }
    if (body.useI2v === true) {
      // Cap scenes to sceneN (≤3) like the other modes — i2v is the costliest
      // path (1 Seedance job + 150s poll per scene), don't run the full plan.
      return { method: 'i2v', url: await runI2vMontage({ scenes: scenes.slice(0, sceneN), pixabayQuery, perClipSec: plan.perClipSec, postId: pId, internalBase, cronSecret: cs, userId: pUserId, hookTopic, hookLang: 'fr', baseImageUrl: clientBaseImage || undefined, bakeAudio }) };
    }
    if (body.useStock === true) {
      let stock: string[] = [];
      try {
        const qWords = pixabayQuery.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const imgs = await searchPixabayImages({ query: pixabayQuery, count: 30, orientation: 'vertical', lang: 'en' });
        const scored = imgs.map((im: any) => ({ url: im.largeImageURL, score: qWords.reduce((s, w) => s + ((im.tags || '').toLowerCase().includes(w) ? 1 : 0), 0) })).filter((x: any) => x.url && x.score > 0).sort((a: any, b: any) => b.score - a.score);
        stock = scored.length ? scored.map((x: any) => x.url) : imgs.map((i: any) => i.largeImageURL).filter(Boolean);
      } catch { /* optional */ }
      return { method: 'stock_kenburns', url: await runKenBurnsMontage({ photos: [...clientPhotos, ...stock], perClipSec: perClip, sceneCount: sceneN, postId: pId, hookTopic, hookLang: 'fr', bakeAudio }) };
    }
    if (body.realShowcase === true) {
      // VRAI COMMERCE (founder): un commerce a déjà publié SES photos → même lieu
      // = cohérent + réel. Priorité : photos client → photos Google du commerce
      // (body.placeId) → en dernier recours stock générique curé par vision.
      let photos: string[] = clientPhotos.slice(0, 4);
      const usedClientPhotos = clientPhotos.length >= 2; // real client photos dominate → no retry
      if (photos.length < 3 && body.placeId) {
        try {
          const { fetchPlaceBusinessPhotos } = await import('@/lib/places/place-photos');
          const { isUnderDailyBudget } = await import('@/lib/places/prospect-pool');
          const g = await isUnderDailyBudget(supabase);
          if (g.ok) { const res = await fetchPlaceBusinessPhotos(String(body.placeId), supabase, { count: 4 }); photos.push(...res.photos); }
        } catch { /* fall through */ }
      }
      if (photos.length < 2) {
        // Last resort: vision-curated generic stock (least coherent).
        let cands: { url: string; thumb: string; tags?: string }[] = [];
        try {
          const imgs = await searchPixabayImages({ query: pixabayQuery, count: 24, orientation: 'vertical', lang: 'en' });
          cands = imgs.map((im: any) => ({ url: im.largeImageURL, thumb: im.webformatURL || im.previewURL, tags: im.tags }));
        } catch { /* optional */ }
        photos.push(...await curateCoherentPhotos(cands, { businessType: businessType || String(subject).slice(0, 60), want: 3 }));
      }
      // Curate the business's OWN photos to the most VISUALLY CONSISTENT subset
      // (QC: a venue's Google photos mix exterior/interior/detail → continuity
      // breaks). Vision keeps the 3 that flow best together.
      if (photos.length > 3) {
        const cur = await curateCoherentPhotos(photos.map(u => ({ url: u, thumb: u })), { businessType: businessType || String(subject).slice(0, 60), want: 3 });
        if (cur.length >= 2) photos = cur;
      }
      photos = photos.slice(0, 3);
      if (!photos.length) return { method: 'real_showcase', url: null };
      const sc = Math.min(photos.length, 3);
      return { method: usedClientPhotos ? 'client_photos' : 'real_business_photos', url: await runKenBurnsMontage({ photos, perClipSec: Math.max(6, Math.round(plan.durationSec / sc)), sceneCount: sc, postId: pId, hookTopic, hookLang: 'fr', bakeAudio }) };
    }
    // DEFAULT — client photos if any, else a GENERATED coherent hero image.
    let photos: string[] = clientPhotos.slice(0, 3);
    if (photos.length === 0) {
      // Strong NO-TEXT (QC: AI gibberish on posters/signs is a rédhibitoire AI
      // tell). Force signs/posters to be blank or pure imagery.
      const heroPrompt = `${String(subject).slice(0, 360)}. Photographie documentaire ultra-réaliste prise sur le vif d'un ${company || businessType || 'commerce local'}. CRAFT PHOTO/CINÉMA : composition règle des tiers, sujet principal net au premier plan + léger bokeh d'arrière-plan (profondeur), angle flatteur à hauteur humaine, lumière MOTIVÉE et douce (fenêtre nord / golden hour), micro-détails de matière, couleurs naturelles et chaleureuses, grain subtil de vrai capteur, objectif 35mm. Cadrage vertical 9:16. PAS un rendu 3D, PAS une illustration, PAS de studio plat — une vraie photo prise par un humain. ABSOLUMENT AUCUN texte, lettre, chiffre, panneau écrit, enseigne lisible : toute affiche doit être vierge ou purement visuelle.`;
      try {
        const hero = await generateJadeImage(heroPrompt, 'story', pUserId || undefined);
        if (hero) {
          photos = [hero];
          // MULTI-PLAN (showcase): 2 coherent variations of the SAME scene via
          // i2i (low strength keeps the venue; negative blocks "different venue")
          // → real shot variety (wide + detail) instead of one monotone image.
          // Gated by body.multiPlan to protect margin on auto/volume content.
          if (body.multiPlan === true) {
            // Strict consistency anchors (QC: i2i drifted on lighting + props).
            const consist = `EXACTEMENT le même lieu, la même lumière (même température de couleur, même direction), les mêmes accessoires et le même style que l'image de référence. Ne change QUE le cadrage. Sans texte.`;
            const varBriefs = [
              `Même scène (${company || businessType || 'commerce'}), plan PLUS LARGE d'ensemble. ${consist} ${String(subject).slice(0, 130)}`,
              `Même scène (${company || businessType || 'commerce'}), GROS PLAN sur un détail/produit au premier plan. ${consist} ${String(subject).slice(0, 130)}`,
            ];
            for (const vb of varBriefs) {
              try {
                const v = await generateJadeImageFromReference(hero, vb, 'story', 0.35, pUserId || undefined);
                if (v) photos.push(v);
              } catch { /* keep what we have */ }
            }
          }
        }
      } catch { /* fall through */ }
    }
    if (photos.length === 0) return { method: 'generated', url: null };
    // ONE coherent image → a SINGLE continuous Ken Burns move (QC: multi-region
    // moves on one image make elements appear/disappear). Multiple real photos →
    // multi-segment with transitions.
    const uniq = Array.from(new Set(photos));
    const maxShots = body.multiPlan === true ? Math.min(uniq.length, 3) : sceneN;
    const sc = uniq.length === 1 ? 1 : Math.min(uniq.length, maxShots);
    const pc = sc <= 1 ? plan.durationSec : Math.max(6, Math.round(plan.durationSec / sc));
    // MIX STRATÉGIQUE (founder 09/07) : varier VRAI MOUVEMENT i2v et Ken Burns
    // pour un feed vivant, jamais monotone (les images STATIQUES = les formats
    // POST, gérés ailleurs). Sur UNE image hero cohérente, on ANIME en i2v —
    // mouvement RÉEL de caméra/sujet — dans ~60% des cas (le « waouh »), Ken
    // Burns garde la variété dans les autres. i2v du HERO (PAS du stock, qui
    // hallucinait) = mouvement réel + cohérent + zéro hallucination. Hooks trendy
    // (generateReelHook) + transitions (finalizeReel) s'appliquent dans les deux.
    // Le QC (boucle ci-dessous) rejette le rendu « IA ». forceMotion/noMotion overrident.
    const wantMotion = body.forceMotion === true || (body.noMotion !== true && Math.random() < 0.6);
    if (sc === 1 && uniq.length === 1 && wantMotion) {
      try {
        const motion = await runI2vMontage({ scenes: scenes.slice(0, 1), pixabayQuery, perClipSec: Math.min(plan.perClipSec || 8, 10), postId: pId, internalBase, cronSecret: cs, userId: pUserId, hookTopic, hookLang: 'fr', baseImageUrl: uniq[0], bakeAudio });
        if (motion) return { method: clientPhotos.length ? 'client_i2v' : 'generated_i2v', url: motion };
      } catch { /* repli Ken Burns ci-dessous */ }
    }
    return { method: clientPhotos.length ? 'client_photos' : 'generated', url: await runKenBurnsMontage({ photos: uniq, perClipSec: pc, sceneCount: sc, postId: pId, hookTopic, hookLang: 'fr', bakeAudio }) };
  }

  // RETRY for showcase quality (founder): regenerate up to 3× until QC passes;
  // keep the best attempt. Also measures margin (how many tries needed).
  let finalUrl: string | null = null;
  let method = '';
  let qc: any = null;
  let attempts = 0;
  // Cap at 2 to protect margin: a generated/multiPlan retry re-runs Seedream
  // (1 hero + 2 i2i) + a vision QC, so 2 attempts is the worst-case ceiling.
  const MAX_ATTEMPTS = 2;
  // Methods built on FIXED real assets won't improve by retrying (same photos →
  // same result) → never retry them. Only generated/stock (random) benefit.
  const NO_RETRY = new Set(['client_footage', 'client_photos', 'real_business_photos']);
  let best: { url: string; qc: any; method: string } | null = null;
  while (attempts < MAX_ATTEMPTS) {
    attempts++;
    const gen = await generateOnce();
    method = gen.method;
    if (!gen.url) continue;
    const thisQc = await assessReelQuality(gen.url, { businessType: businessType || post.pillar, subject });
    if (!best || (thisQc?.score ?? 0) > (best.qc?.score ?? 0)) best = { url: gen.url, qc: thisQc, method: gen.method };
    if (!thisQc || thisQc.pass) { finalUrl = gen.url; qc = thisQc; break; } // pass / QC down → ship
    if (NO_RETRY.has(gen.method)) { finalUrl = gen.url; qc = thisQc; break; } // fixed assets → no point retrying
  }
  if (!finalUrl && best) { finalUrl = best.url; qc = best.qc; method = best.method; }

  if (!finalUrl) {
    return NextResponse.json({ ok: false, error: 'montage_failed', method, plan, pixabayQuery, sceneCount: sceneN, attempts });
  }

  // Persist the montage video + QC + PROVENANCE (founder 2026-06-24 : AIGC
  // déclaré UNIQUEMENT si vraiment généré par IA). is_aigc=false pour du média
  // RÉEL (footage client, vraies photos Google/business, stock), true seulement
  // pour la génération IA (Seedream hero, i2v). publishToTikTok lit ce flag.
  const REAL_MEDIA_METHODS = ['client_footage', 'client_photos', 'real_business_photos', 'real_showcase', 'stock_kenburns'];
  const isAigcMethod = !REAL_MEDIA_METHODS.includes(method);
  await supabase.from('content_calendar').update({ video_url: finalUrl, format: 'reel', engagement_data: { visual_provenance: method, is_aigc: isAigcMethod }, updated_at: new Date().toISOString() }).eq('id', post.id);
  if (qc) {
    await supabase.from('content_calendar').update({
      qa_quality_score: qc.score, qa_severity: qc.pass ? 'ok' : 'low',
      qa_notes: qc.summary, qa_findings: qc as any, updated_at: new Date().toISOString(),
    }).eq('id', post.id);
  }
  if (qc && !qc.pass) {
    await supabase.from('content_calendar').update({ status: 'draft' }).eq('id', post.id);
    return NextResponse.json({ ok: true, method, qc, attempts, published: false, held: true, reason: 'qc_below_threshold', plan, sceneCount: sceneN, video_url: finalUrl });
  }

  // TikTok PREPARE mode → hold as DRAFT (silent video ready) + instruct to add a
  // trending TikTok sound in-app before posting. Do NOT auto-publish.
  if (prepareMode) {
    const moodHint = /restau|food|cafe|boulang|patiss/i.test(businessType || subject) ? 'gourmand / chaleureux' : 'doux / inspirant';
    const note = `🎵 MODE PREPARE TikTok — vidéo livrée SANS musique. Avant de publier dans l'app : ajoute un SON TENDANCE du moment (Découvrir → ambiance ${moodHint}), garde-la courte (≤12s), publie depuis l'app (reach natif). Hashtags niche only (pas de #fyp).`;
    await supabase.from('content_calendar').update({
      status: 'draft', awaiting_manual_publish_at: new Date().toISOString(),
      qa_notes: `${note}${qc?.summary ? ' | QC: ' + qc.summary : ''}`.slice(0, 480),
      updated_at: new Date().toISOString(),
    }).eq('id', post.id);
    return NextResponse.json({ ok: true, method, qc, attempts, prepareMode: true, published: false, draft: true, note, video_url: finalUrl });
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

  return NextResponse.json({ ok: true, method, qc, attempts, plan, sceneCount: sceneN, pixabayQuery, video_url: finalUrl, published });
}
