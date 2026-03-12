import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getDMSystemPrompt } from '@/lib/agents/dm-prompt';
import { callGemini } from '@/lib/agents/gemini';
import { getSequenceForProspect } from '@/lib/agents/scoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

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

const MAX_DM_PER_DAY = 10;

/**
 * Generate personalized DM via Claude Haiku
 */
async function generateDM(prospect: any): Promise<{ dm_text: string; personalization_detail: string; follow_up_3d: string; follow_up_7d?: string; response_interested?: string; response_skeptical?: string; tone_notes?: string } | null> {
  if (!process.env.GEMINI_API_KEY) return null;

  const prospectData = JSON.stringify({
    business_name: prospect.company,
    business_type: prospect.type || 'commerce',
    quartier: prospect.quartier || 'Paris',
    ville: prospect.ville || prospect.city || 'Paris',
    google_rating: prospect.google_rating || prospect.note_google,
    google_reviews: prospect.google_reviews,
    instagram_handle: prospect.instagram || null,
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
  });

  try {
    const rawText = await callGemini({
      system: getDMSystemPrompt(),
      message: prospectData,
      maxTokens: 400,
    });
    const cleanText = rawText.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/gi, '');
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]);
  } catch (e: any) {
    console.error(`[DMAgent] Claude error for ${prospect.company}:`, e.message);
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
    return runDMPreparation();
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
 */
export async function POST(request: NextRequest) {
  const { authorized } = await verifyAuth(request);
  if (!authorized) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  return runDMPreparation();
}

/**
 * DM-specific verification: unlike email, DMs only need Instagram handle + company + type.
 */
function verifyDMProspectData(prospect: any): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (!prospect.instagram || prospect.instagram === 'A_VERIFIER') {
    issues.push('instagram_missing');
  }
  if (!prospect.company || prospect.company.trim().length < 2) {
    issues.push('company_missing');
  }
  if (prospect.temperature === 'dead' || prospect.status === 'perdu') {
    issues.push('prospect_dead');
  }
  if (prospect.status === 'client' || prospect.status === 'sprint') {
    issues.push('already_client');
  }
  // type is NOT required for DMs — getSequenceForProspect() defaults to 'pme'

  return { valid: issues.length === 0, issues };
}

async function runDMPreparation(): Promise<NextResponse> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  console.log('[DMAgent] Preparing and sending daily DMs...');

  // Select prospects with Instagram that haven't been DMed yet
  const { data: allWithIG, error } = await supabase
    .from('crm_prospects')
    .select('*')
    .not('instagram', 'is', null)
    .neq('instagram', '')
    .neq('instagram', 'A_VERIFIER')
    .order('score', { ascending: false })
    .limit(200);

  if (error) {
    console.error('[DMAgent] Fetch error:', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Filter in JS for reliability
  const prospects = (allWithIG || []).filter(p => {
    const dmOk = !p.dm_status || p.dm_status === 'none';
    const tempOk = !p.temperature || p.temperature !== 'dead';
    const statusOk = !p.status || !['client', 'client_pro', 'client_fondateurs', 'lost', 'perdu', 'sprint'].includes(p.status);
    return dmOk && tempOk && statusOk;
  }).slice(0, MAX_DM_PER_DAY * 3);

  if (!prospects || prospects.length === 0) {
    // Diagnostic
    const { count: totalIG } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).not('instagram', 'is', null).neq('instagram', '').neq('instagram', 'A_VERIFIER');
    const { count: totalCRM } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true });
    console.log(`[DMAgent] No eligible prospects. CRM: ${totalCRM} total, ${totalIG} with Instagram, all filtered by dm_status/temperature/status`);
    return NextResponse.json({ ok: true, prepared: 0, sent: 0, message: `Aucun prospect éligible. ${totalIG} avec Instagram sur ${totalCRM} total.` });
  }

  console.log(`[DMAgent] Found ${prospects.length} eligible prospects`);

  let prepared = 0;
  let sent = 0;
  let failed = 0;
  let skippedVerification = 0;
  const preparedNames: string[] = [];
  const byBusinessType: Record<string, { count: number; handles: string[] }> = {};

  for (const prospect of prospects) {
    if (prepared >= MAX_DM_PER_DAY) break;

    const category = getSequenceForProspect(prospect);

    // DM-specific verification (no email requirement, no timing gate)
    const verification = verifyDMProspectData(prospect);
    if (!verification.valid) {
      skippedVerification++;
      console.log(`[DMAgent] Skipped ${prospect.company}: ${verification.issues.join(', ')}`);
      continue;
    }

    const dm = await generateDM(prospect);
    if (!dm) { failed++; continue; }

    // Insert into dm_queue with status 'pending' — founder must manually send via Instagram
    const { error: queueError } = await supabase.from('dm_queue').insert({
      prospect_id: prospect.id,
      channel: 'instagram',
      handle: prospect.instagram,
      message: dm.dm_text,
      followup_message: dm.follow_up_3d,
      personalization: JSON.stringify({
        detail: dm.personalization_detail,
        follow_up_7d: dm.follow_up_7d || null,
        response_interested: dm.response_interested || null,
        response_skeptical: dm.response_skeptical || null,
        tone_notes: dm.tone_notes || null,
        business_type: category,
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

    // Update prospect dm_status to 'queued' — will be set to 'sent' when founder confirms
    const followupDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    await supabase.from('crm_prospects').update({
      dm_status: 'queued',
      dm_queued_at: now,
      dm_message: dm.dm_text,
      dm_followup_message: dm.follow_up_3d,
      dm_followup_date: followupDate,
      updated_at: now,
    }).eq('id', prospect.id);

    // Log CRM activity
    await supabase.from('crm_activities').insert({
      prospect_id: prospect.id,
      type: 'dm_instagram',
      description: `DM Instagram préparé pour @${prospect.instagram}`,
      data: {
        handle: prospect.instagram,
        message_preview: dm.dm_text.substring(0, 100),
        business_type: category,
        followup_date: followupDate,
      },
      created_at: now,
    });

    prepared++;
    sent++;
    preparedNames.push(`${prospect.company} (@${prospect.instagram})`);

    if (!byBusinessType[category]) byBusinessType[category] = { count: 0, handles: [] };
    byBusinessType[category].count++;
    byBusinessType[category].handles.push(prospect.instagram);

    console.log(`[DMAgent] DM sent to ${prospect.company} (@${prospect.instagram}) [${category}]`);
    await new Promise(r => setTimeout(r, 300));
  }

  // Also check for followups
  const { data: followups } = await supabase
    .from('crm_prospects')
    .select('*')
    .eq('dm_status', 'sent')
    .lte('dm_followup_date', new Date().toISOString().split('T')[0])
    .lt('dm_followup_count', 1);

  let followupCount = 0;
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
    agent: 'dm_instagram',
    action: 'report_to_ceo',
    data: {
      phase: 'completed',
      message: `DM Instagram: ${sent} envoyés, ${failed} échoués, ${followupCount} relances`,
    },
    created_at: now,
  });

  await supabase.from('agent_logs').insert({
    agent: 'dm_instagram',
    action: 'daily_preparation',
    data: report,
    created_at: now,
  });

  console.log(`[DMAgent] Done: ${sent} sent, ${failed} failed, ${skippedVerification} skipped(verif), ${followupCount} followups`);
  return NextResponse.json({ ok: true, ...report });
}
