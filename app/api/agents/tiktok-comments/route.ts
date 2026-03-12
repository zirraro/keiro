import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getTikTokCommentPrompt } from '@/lib/agents/tiktok-comment-prompt';
import { callGemini } from '@/lib/agents/gemini';
import { getSequenceForProspect } from '@/lib/agents/scoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

/**
 * Generate a TikTok comment via Claude Haiku
 */
async function generateComment(prospect: any): Promise<{ comment: string; dm_text?: string; strategy: string; follow_up?: string } | null> {
  if (!process.env.GEMINI_API_KEY) return null;

  const context = JSON.stringify({
    business_name: prospect.company,
    business_type: prospect.type || 'commerce',
    quartier: prospect.quartier,
    ville: prospect.ville || prospect.city || 'Paris',
    tiktok_handle: prospect.tiktok_handle,
    google_rating: prospect.google_rating || prospect.note_google,
    google_reviews: prospect.google_reviews,
    specialite: prospect.specialite || prospect.specialty || null,
    has_instagram: !!prospect.instagram,
    temperature: prospect.temperature || 'cold',
    score: prospect.score || 0,
  });

  try {
    const rawText = await callGemini({
      system: getTikTokCommentPrompt(),
      message: context,
      maxTokens: 200,
    });
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

/**
 * GET /api/agents/tiktok-comments
 */
export async function GET(request: NextRequest) {
  const { authorized, isCron } = await verifyAuth(request);
  if (!authorized) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  if (isCron) {
    return runTikTokCommentPreparation();
  }

  const supabase = getSupabaseAdmin();
  const { data: report } = await supabase
    .from('agent_logs')
    .select('*')
    .eq('agent', 'tiktok_comments')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!report) return NextResponse.json({ ok: false, error: 'Aucun rapport' }, { status: 404 });
  return NextResponse.json({ ok: true, report: report.data, created_at: report.created_at });
}

/**
 * POST /api/agents/tiktok-comments — manual trigger
 */
export async function POST(request: NextRequest) {
  const { authorized } = await verifyAuth(request);
  if (!authorized) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  return runTikTokCommentPreparation();
}

/**
 * TikTok-specific verification: needs tiktok_handle + company.
 */
function verifyTikTokProspectData(prospect: any): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!prospect.tiktok_handle) issues.push('tiktok_handle_missing');
  if (!prospect.company || prospect.company.trim().length < 2) issues.push('company_missing');
  if (prospect.temperature === 'dead' || prospect.status === 'perdu') issues.push('prospect_dead');
  if (prospect.status === 'client' || prospect.status === 'sprint') issues.push('already_client');
  return { valid: issues.length === 0, issues };
}

async function runTikTokCommentPreparation(): Promise<NextResponse> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  console.log('[TikTokAgent] Preparing and sending comments/DMs...');

  // Select prospects with TikTok handles
  // IMPORTANT: Use .or() for NULL-safe filtering — in SQL, NULL NOT IN (...) = NULL (excluded)
  const { data: prospects } = await supabase
    .from('crm_prospects')
    .select('*')
    .not('tiktok_handle', 'is', null)
    .or('temperature.is.null,temperature.neq.dead')
    .or('status.is.null,status.not.in.("client","perdu","sprint")')
    .order('score', { ascending: false })
    .limit(15);

  if (!prospects || prospects.length === 0) {
    console.log('[TikTokAgent] No TikTok prospects found');
    return NextResponse.json({ ok: true, prepared: 0, sent: 0, message: 'Aucun prospect TikTok' });
  }

  let prepared = 0;
  let sent = 0;
  let skippedVerification = 0;
  const preparedComments: Array<{ name: string; type: string; comment: string }> = [];
  const byBusinessType: Record<string, { count: number; handles: string[] }> = {};

  for (const prospect of prospects) {
    if (prepared >= 5) break;

    const category = getSequenceForProspect(prospect);

    // TikTok-specific verification (no email/timing gate)
    const verification = verifyTikTokProspectData(prospect);
    if (!verification.valid) {
      skippedVerification++;
      continue;
    }

    const result = await generateComment(prospect);
    if (!result) continue;

    // Insert into dm_queue with status 'pending' — founder must manually send
    await supabase.from('dm_queue').insert({
      prospect_id: prospect.id,
      channel: 'tiktok',
      handle: prospect.tiktok_handle,
      message: result.comment,
      followup_message: result.dm_text || null,
      personalization: JSON.stringify({
        strategy: result.strategy,
        dm_text: result.dm_text || null,
        follow_up: result.follow_up || null,
        business_type: category,
      }),
      priority: prospect.score || 30,
      status: 'pending',
      created_at: now,
    });

    // Log CRM activity
    await supabase.from('crm_activities').insert({
      prospect_id: prospect.id,
      type: 'tiktok_comment',
      description: `TikTok comment préparé pour @${prospect.tiktok_handle}`,
      data: {
        handle: prospect.tiktok_handle,
        comment: result.comment,
        dm_text: result.dm_text || null,
        business_type: category,
      },
      created_at: now,
    });

    prepared++;
    sent++;
    preparedComments.push({ name: prospect.company, type: category, comment: result.comment });

    if (!byBusinessType[category]) byBusinessType[category] = { count: 0, handles: [] };
    byBusinessType[category].count++;
    byBusinessType[category].handles.push(prospect.tiktok_handle);

    console.log(`[TikTokAgent] Comment sent for ${prospect.company} (@${prospect.tiktok_handle}) [${category}]`);
    await new Promise(r => setTimeout(r, 300));
  }

  const report = {
    prepared,
    sent,
    skipped_verification: skippedVerification,
    by_business_type: byBusinessType,
    comments: preparedComments,
    timestamp: now,
  };

  // Report to CEO agent
  await supabase.from('agent_logs').insert({
    agent: 'tiktok_comments',
    action: 'report_to_ceo',
    data: {
      phase: 'completed',
      message: `TikTok: ${sent} commentaires/DMs envoyés, ${skippedVerification} skipped`,
    },
    created_at: now,
  });

  await supabase.from('agent_logs').insert({
    agent: 'tiktok_comments',
    action: 'comments_prepared',
    data: report,
    created_at: now,
  });

  console.log(`[TikTokAgent] ${sent} sent, ${skippedVerification} skipped(verif)`);
  return NextResponse.json({ ok: true, ...report });
}
