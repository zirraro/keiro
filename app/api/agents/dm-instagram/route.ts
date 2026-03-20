import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getDMSystemPrompt } from '@/lib/agents/dm-prompt';
import { callGemini } from '@/lib/agents/gemini';
import { getSequenceForProspect } from '@/lib/agents/scoring';
import { verifyCRMCoherence } from '@/lib/agents/business-timing';
import { loadSharedContext, formatContextForPrompt } from '@/lib/agents/shared-context';
import { saveLearning, saveAgentFeedback } from '@/lib/agents/learning';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey);
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

const MAX_DM_PER_DAY = 60;
const MAX_VISUALS_PER_RUN = 10;

const SEEDREAM_API_KEY = process.env.SEEDREAM_API_KEY || '341cd095-2c11-49da-82e7-dc2db23c565c';
const SEEDREAM_API_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations';

/**
 * Generate a personalized marketing visual for a prospect's business via Seedream.
 */
async function generateProspectVisual(prospect: any): Promise<string | null> {
  try {
    const businessName = prospect.company || 'commerce local';
    const businessType = prospect.type || 'commerce';
    const quartier = prospect.quartier || '';

    // Generate a visual prompt tailored to the prospect's business
    const promptMap: Record<string, string> = {
      restaurant: `Beautiful professional food photography for a French restaurant, elegant plating, warm ambient lighting, wooden table, appetizing gourmet dish, cozy restaurant interior blur background, premium quality`,
      boutique: `Stylish fashion boutique storefront display, curated products on shelves, warm inviting lighting, modern retail interior design, high-end shopping experience`,
      coiffeur: `Modern hair salon interior, professional styling station, warm lighting, sleek minimalist design, beauty and wellness atmosphere, clean aesthetic`,
      coach: `Dynamic fitness coaching session, energetic personal trainer, modern gym equipment, motivational atmosphere, active lifestyle, professional quality`,
      fleuriste: `Beautiful flower shop display, colorful fresh flower arrangements, vibrant bouquets, charming storefront, natural light, artisanal floral design`,
      caviste: `Premium wine shop interior, elegant wine bottle display, wooden shelves, warm sophisticated lighting, French wine selection, artisanal feel`,
      traiteur: `Catering service showcase, beautifully presented buffet, gourmet appetizers, professional food presentation, elegant event setting`,
      freelance: `Creative professional workspace, modern laptop setup, inspiring desk arrangement, artistic tools, productive and stylish home office`,
      boulangerie: `Fresh artisanal French bakery, golden croissants and baguettes, rustic wooden display, warm morning light, traditional craftsmanship`,
    };

    const basePrompt = promptMap[businessType] || `Professional marketing visual for a French local business, modern and inviting, warm lighting, premium quality`;
    const prompt = `${basePrompt}. ${quartier ? `Located in ${quartier}, France.` : 'French style.'} No text, no watermark, no logos, clean composition, Instagram-ready, 1:1 square format.`;

    const response = await fetch(SEEDREAM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SEEDREAM_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'seedream-4-5-251128',
        prompt,
        size: '1024x1024',
        response_format: 'url',
        seed: -1,
      }),
    });

    if (!response.ok) {
      console.warn(`[DMAgent] Seedream error for ${businessName}:`, response.status);
      return null;
    }

    const data = await response.json();
    const url = data?.data?.[0]?.url;
    if (url) {
      console.log(`[DMAgent] Visual generated for ${businessName} (${businessType})`);
      return url;
    }
    return null;
  } catch (error: any) {
    console.warn(`[DMAgent] Visual generation failed:`, error.message);
    return null;
  }
}

/**
 * Generate personalized DM via Claude Haiku
 */
async function generateDM(prospect: any, platform: 'instagram' | 'tiktok' = 'instagram'): Promise<{ dm_text: string; personalization_detail: string; follow_up_3d: string; follow_up_7d?: string; response_interested?: string; response_skeptical?: string; tone_notes?: string; pre_comments?: string[] } | null> {
  if (!process.env.GEMINI_API_KEY) return null;

  const isTikTok = platform === 'tiktok';
  const prospectData = JSON.stringify({
    business_name: prospect.company,
    business_type: prospect.type || 'commerce',
    quartier: prospect.quartier || 'Paris',
    ville: prospect.ville || prospect.city || 'Paris',
    google_rating: prospect.google_rating || prospect.note_google,
    google_reviews: prospect.google_reviews,
    instagram_handle: !isTikTok ? (prospect.instagram || null) : null,
    tiktok_handle: isTikTok ? (prospect.tiktok_handle || null) : null,
    instagram_followers: prospect.instagram_followers || null,
    instagram_posts: prospect.instagram_posts || null,
    last_post_date: prospect.last_instagram_post || null,
    bio: prospect.instagram_bio || prospect.bio || null,
    has_website: !!prospect.website,
    website: prospect.website || null,
    specialite: prospect.specialite || prospect.specialty || null,
    temperature: prospect.temperature || 'cold',
    score: prospect.score || 0,
    previous_interactions: prospect.dm_followup_count || 0,
    platform,
  });

  try {
    const rawText = await callGemini({
      system: getDMSystemPrompt(platform),
      message: prospectData,
      maxTokens: 1000,
    });
    // Strip markdown code fences: ```json ... ``` or ``` ... ```
    let cleanText = rawText.trim();
    cleanText = cleanText.replace(/^```[\w]*\s*\n?/gm, '').replace(/\n?```\s*$/gm, '');
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(`[DMAgent] No JSON found in AI response for ${prospect.company}:`, rawText.substring(0, 200));
      return null;
    }

    return JSON.parse(jsonMatch[0]);
  } catch (e: any) {
    console.error(`[DMAgent] AI error for ${prospect.company}:`, e.message);
    return null;
  }
}

/**
 * GET /api/agents/dm-instagram
 * Cron: prepare daily DM queue. Admin: return last report.
 */
export async function GET(request: NextRequest) {
  const { authorized, isCron } = await verifyAuth(request);
  if (!authorized) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  if (isCron) {
    const url = new URL(request.url);
    const platform = url.searchParams.get('platform') === 'tiktok' ? 'tiktok' as const : 'instagram' as const;
    return runDMPreparation(platform);
  }

  const supabase = getSupabaseAdmin();
  const { data: report } = await supabase
    .from('agent_logs')
    .select('*')
    .eq('agent', 'dm_instagram')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!report) return NextResponse.json({ ok: false, error: 'Aucun rapport' }, { status: 404 });
  return NextResponse.json({ ok: true, report: report.data, created_at: report.created_at });
}

/**
 * POST /api/agents/dm-instagram — manual trigger
 * Body: { platform?: 'instagram' | 'tiktok' }
 */
export async function POST(request: NextRequest) {
  const { authorized } = await verifyAuth(request);
  if (!authorized) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  let platform: 'instagram' | 'tiktok' = 'instagram';
  try {
    const body = await request.json().catch(() => ({}));
    if (body.platform === 'tiktok') platform = 'tiktok';
  } catch {}

  // Also check query param
  const url = new URL(request.url);
  if (url.searchParams.get('platform') === 'tiktok') platform = 'tiktok';

  return runDMPreparation(platform);
}

/**
 * DM-specific verification: DMs need platform handle + not dead/client.
 */
function verifyDMProspectData(prospect: any, platform: 'instagram' | 'tiktok' = 'instagram'): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (platform === 'instagram') {
    if (!prospect.instagram || prospect.instagram === 'A_VERIFIER') {
      issues.push('instagram_missing');
    }
  } else {
    if (!prospect.tiktok_handle || prospect.tiktok_handle === 'A_VERIFIER') {
      issues.push('tiktok_missing');
    }
  }
  if (prospect.temperature === 'dead' || prospect.status === 'perdu') {
    issues.push('prospect_dead');
  }
  if (prospect.status === 'client' || prospect.status === 'sprint') {
    issues.push('already_client');
  }

  return { valid: issues.length === 0, issues };
}

async function runDMPreparation(platform: 'instagram' | 'tiktok' = 'instagram'): Promise<NextResponse> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const isTikTok = platform === 'tiktok';
  const handleField = isTikTok ? 'tiktok_handle' : 'instagram';
  const channelName = isTikTok ? 'tiktok' : 'instagram';
  const agentName = isTikTok ? 'dm_tiktok' : 'dm_instagram';

  console.log(`[DMAgent] Preparing daily DMs for ${platform}...`);

  // Select prospects with handle that haven't been DMed yet
  const { data: allWithHandle, error } = await supabase
    .from('crm_prospects')
    .select('*')
    .not(handleField, 'is', null)
    .neq(handleField, '')
    .neq(handleField, 'A_VERIFIER')
    .order('score', { ascending: false })
    .limit(500);

  if (error) {
    console.error('[DMAgent] Fetch error:', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Filter in JS for reliability
  // For TikTok DMs, also check that we haven't already queued a TikTok DM for this prospect
  const prospects = (allWithHandle || []).filter(p => {
    const dmOk = isTikTok ? true : (!p.dm_status || p.dm_status === 'none'); // TikTok DMs are separate from IG dm_status
    const tempOk = !p.temperature || p.temperature !== 'dead';
    const statusOk = !p.status || !['client', 'client_pro', 'client_fondateurs', 'lost', 'perdu', 'sprint'].includes(p.status);
    return dmOk && tempOk && statusOk;
  }).slice(0, MAX_DM_PER_DAY * 3);

  if (!prospects || prospects.length === 0) {
    const { count: totalHandle } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).not(handleField, 'is', null).neq(handleField, '').neq(handleField, 'A_VERIFIER');
    const { count: totalCRM } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true });
    console.log(`[DMAgent] No eligible ${platform} prospects. CRM: ${totalCRM} total, ${totalHandle} with ${platform} handle`);
    return NextResponse.json({ ok: true, platform, prepared: 0, sent: 0, message: `Aucun prospect éligible pour DM ${platform}. ${totalHandle} avec handle sur ${totalCRM} total.` });
  }

  console.log(`[DMAgent] Found ${prospects.length} eligible prospects`);

  let prepared = 0;
  let sent = 0;
  let failed = 0;
  let skippedVerification = 0;
  const preparedNames: string[] = [];
  const byBusinessType: Record<string, { count: number; handles: string[] }> = {};

  // Pre-filter and verify all prospects first, then batch AI calls
  const eligibleProspects: Array<{ prospect: any; category: string }> = [];
  for (const prospect of prospects) {
    if (eligibleProspects.length >= MAX_DM_PER_DAY) break;

    const { fixes, issues: crmIssues } = verifyCRMCoherence(prospect);
    if (Object.keys(fixes).length > 0) {
      fixes.updated_at = now;
      await supabase.from('crm_prospects').update(fixes).eq('id', prospect.id);
      Object.assign(prospect, fixes);
      if (crmIssues.length > 0) {
        console.log(`[DMAgent] CRM fix ${prospect.company}: ${crmIssues.join(', ')}`);
      }
    }
    if (fixes.temperature === 'dead' || fixes.status === 'perdu') { skippedVerification++; continue; }

    const category = getSequenceForProspect(prospect);
    const verification = verifyDMProspectData(prospect, platform);
    if (!verification.valid) {
      skippedVerification++;
      console.log(`[DMAgent] Skipped ${prospect.company}: ${verification.issues.join(', ')}`);
      continue;
    }
    eligibleProspects.push({ prospect, category });
  }

  console.log(`[DMAgent] ${eligibleProspects.length} prospects eligible, generating DMs in parallel batches...`);

  // Generate DMs in parallel batches of 5
  const DM_BATCH_SIZE = 5;
  const dmResults: Array<{ prospect: any; category: string; dm: any }> = [];
  for (let b = 0; b < eligibleProspects.length; b += DM_BATCH_SIZE) {
    const batch = eligibleProspects.slice(b, b + DM_BATCH_SIZE);
    const batchDms = await Promise.all(batch.map(async ({ prospect, category }) => {
      const dm = await generateDM(prospect, platform);
      return { prospect, category, dm };
    }));
    dmResults.push(...batchDms);
  }

  // Generate personalized visuals for top-priority prospects (in parallel, max 10)
  const topProspects = dmResults.filter(r => r.dm).slice(0, MAX_VISUALS_PER_RUN);
  const visualUrls = new Map<string, string>();

  if (topProspects.length > 0) {
    console.log(`[DMAgent] Generating personalized visuals for ${topProspects.length} prospects...`);
    const VISUAL_BATCH_SIZE = 3;
    for (let vb = 0; vb < topProspects.length; vb += VISUAL_BATCH_SIZE) {
      const vBatch = topProspects.slice(vb, vb + VISUAL_BATCH_SIZE);
      const vResults = await Promise.all(vBatch.map(async ({ prospect }) => {
        const url = await generateProspectVisual(prospect);
        return { prospectId: prospect.id, url };
      }));
      for (const vr of vResults) {
        if (vr.url) visualUrls.set(vr.prospectId, vr.url);
      }
    }
    console.log(`[DMAgent] ${visualUrls.size}/${topProspects.length} visuals generated`);
  }

  for (const { prospect, category, dm: rawDm } of dmResults) {
    let dm = rawDm;
    if (!dm) {
      // Fallback template when AI fails — still send a DM
      const name = prospect.company || prospect.instagram || 'ton commerce';
      const quartier = prospect.quartier || 'ton quartier';
      dm = {
        dm_text: `Salut ! Je viens de tomber sur ${name}, franchement j'adore le concept. Je bosse dans le marketing digital pour les commerces du coin et honnêtement tu mérites plus de visibilité. Tu fais tes visuels toi-même ?`,
        personalization_detail: 'fallback template — AI generation failed',
        follow_up_3d: `Hey ! Je sais pas si t'as vu mon message, je voulais juste te montrer un truc sympa pour ${name}. J'ai fait un visuel gratos pour toi, tu veux que je te l'envoie ?`,
        follow_up_7d: `Dernier message promis haha. Si jamais t'as 5 min pour voir ce que ça donne pour ${name}, y'a une offre à 4,99€ pour tester 3 jours. Zéro engagement 👊`,
        response_interested: `Trop bien ! Regarde, je t'ai fait un truc vite fait. Ça m'a pris 30 sec. Si tu veux tester toi-même y'a un Sprint 3 jours à 4,99€. Tu veux que je t'envoie le lien ?`,
        response_skeptical: `Je comprends haha. Regarde, des commerces comme toi dans ${quartier} postent déjà du contenu pro tous les jours. Le truc c'est que ça prend 2 min par visuel.`,
        tone_notes: 'Template fallback — personnalisation manuelle recommandée',
      };
      console.log(`[DMAgent] Using fallback template for ${prospect.company || prospect.instagram}`);
    }

    // Insert into dm_queue with status 'pending' — founder must manually send
    const handle = isTikTok ? prospect.tiktok_handle : prospect.instagram;
    const { error: queueError } = await supabase.from('dm_queue').insert({
      prospect_id: prospect.id,
      channel: channelName,
      handle,
      message: dm.dm_text,
      followup_message: dm.follow_up_3d,
      personalization: JSON.stringify({
        detail: dm.personalization_detail,
        follow_up_7d: dm.follow_up_7d || null,
        response_interested: dm.response_interested || null,
        response_skeptical: dm.response_skeptical || null,
        tone_notes: dm.tone_notes || null,
        business_type: category,
        visual_url: visualUrls.get(prospect.id) || null,
      }),
      priority: prospect.score || 50,
      status: 'pending',
      created_at: now,
    });

    if (queueError) {
      console.warn(`[DMAgent] Queue insert error:`, queueError.message);
      failed++;
      continue;
    }

    // Update prospect: dm_status + advance CRM status
    const followupDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const dmUpdate: Record<string, any> = {
      dm_status: 'queued',
      dm_queued_at: now,
      dm_message: dm.dm_text,
      dm_followup_message: dm.follow_up_3d,
      dm_followup_date: followupDate,
      updated_at: now,
    };
    // NOTE: status 'contacte' is set only when the DM is actually SENT in Suivi & Publication
    // Do NOT advance status here — the DM is only queued, not sent yet
    await supabase.from('crm_prospects').update(dmUpdate).eq('id', prospect.id);

    // Log CRM activity
    await supabase.from('crm_activities').insert({
      prospect_id: prospect.id,
      type: isTikTok ? 'dm_tiktok' : 'dm_instagram',
      description: `DM ${platform} préparé pour @${handle}`,
      data: {
        handle,
        platform,
        message_preview: dm.dm_text.substring(0, 100),
        business_type: category,
        followup_date: followupDate,
      },
      created_at: now,
    });

    prepared++;
    sent++;
    preparedNames.push(`${prospect.company} (@${handle})`);

    if (!byBusinessType[category]) byBusinessType[category] = { count: 0, handles: [] };
    byBusinessType[category].count++;
    byBusinessType[category].handles.push(handle);

    console.log(`[DMAgent] DM ${platform} prepared for ${prospect.company} (@${handle}) [${category}]`);
    await new Promise(r => setTimeout(r, 300));
  }

  // Also check for followups (only for Instagram — TikTok DMs are one-shot copy-paste)
  let followupCount = 0;
  if (!isTikTok) {
    const { data: followups } = await supabase
      .from('crm_prospects')
      .select('*')
      .eq('dm_status', 'sent')
      .lte('dm_followup_date', new Date().toISOString().split('T')[0])
      .lt('dm_followup_count', 1);

    if (followups) {
      for (const p of followups) {
        if (p.dm_followup_message) {
          await supabase.from('dm_queue').insert({
            prospect_id: p.id,
            channel: 'instagram',
            handle: p.instagram,
          message: p.dm_followup_message,
          personalization: 'Relance J+3',
          priority: (p.score || 50) + 10,
          status: 'pending',
          created_at: now,
        });

        await supabase.from('crm_prospects').update({
          dm_followup_count: (p.dm_followup_count || 0) + 1,
          updated_at: now,
        }).eq('id', p.id);

        followupCount++;
        }
      }
    }
  } // end if !isTikTok

  const report = {
    prepared,
    sent,
    failed,
    skipped_verification: skippedVerification,
    followups: followupCount,
    by_business_type: byBusinessType,
    prepared_names: preparedNames,
    timestamp: now,
  };

  // Report to CEO agent
  await supabase.from('agent_logs').insert({
    agent: agentName,
    action: 'report_to_ceo',
    data: {
      phase: 'completed',
      platform,
      message: `DM ${platform}: ${sent} préparés, ${failed} échoués, ${followupCount} relances`,
    },
    created_at: now,
  });

  await supabase.from('agent_logs').insert({
    agent: agentName,
    action: 'daily_preparation',
    data: { ...report, platform },
    created_at: now,
  });

  console.log(`[DMAgent] ${platform} Done: ${sent} prepared, ${failed} failed, ${skippedVerification} skipped, ${followupCount} followups`);

    // ── Save learnings from DM preparation ──
    try {
      if (prepared > 0) {
        await saveLearning(supabase, {
          agent: agentName,
          category: 'dm',
          learning: `DM ${platform}: ${prepared} préparés, ${failed} échoués. Taux réussite: ${prepared > 0 ? Math.round((prepared - failed) / prepared * 100) : 0}%`,
          evidence: `${platform} run: ${prepared} prepared, ${failed} failed, ${skippedVerification} skipped verification, ${followupCount} followups`,
          confidence: 20,
        });
      }

      // Track best performing business types
      const topBizTypes = Object.entries(byBusinessType).sort((a, b) => b[1].count - a[1].count);
      if (topBizTypes.length > 0) {
        const [topType, topData] = topBizTypes[0];
        await saveLearning(supabase, {
          agent: agentName,
          category: 'dm',
          learning: `Type "${topType}" dominant pour DM ${platform}: ${topData.count} DMs préparés`,
          evidence: `Business types: ${topBizTypes.map(([t, d]) => `${t}:${d.count}`).join(', ')}`,
          confidence: 15,
        });
      }
    } catch (learnErr: any) {
      console.warn(`[DMAgent] Learning save error:`, learnErr.message);
    }

    // ── Feedback to CEO ──
    try {
      if (prepared > 0) {
        const topTypes = Object.entries(byBusinessType).sort((a, b) => b[1].count - a[1].count).slice(0, 3).map(([t, d]) => `${t}:${d.count}`).join(', ');
        await saveAgentFeedback(supabase, {
          from_agent: agentName,
          to_agent: 'ceo',
          feedback: `DM ${platform}: ${prepared} préparés, ${failed} échoués, ${followupCount} relances. ${topTypes ? `Types: ${topTypes}.` : ''} ${failed > 0 ? `⚠️ ${failed} échecs à investiguer.` : 'Pipeline DM opérationnel.'}`,
          category: 'prospection',
        });
      }
    } catch (fbErr: any) {
      console.warn(`[DMAgent] Feedback save error:`, fbErr.message);
    }

  return NextResponse.json({ ok: true, platform, ...report });
}
