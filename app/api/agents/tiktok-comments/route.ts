import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getTikTokCommentPrompt } from '@/lib/agents/tiktok-comment-prompt';
import { isGoodTimeToContact, verifyProspectData } from '@/lib/agents/business-timing';
import { getSequenceForProspect } from '@/lib/agents/scoring';
import { generateAIResponse } from '@/lib/ai-client';

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
  if (!process.env.GOOGLE_GEMINI_API_KEY) return null;

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
    const aiResponse = await generateAIResponse({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: getTikTokCommentPrompt(),
      messages: [{ role: 'user', content: context }],
    });

    const rawText = aiResponse.text;
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

async function runTikTokCommentPreparation(): Promise<NextResponse> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  console.log('[TikTokAgent] Preparing comments...');

  // Select prospects with TikTok handles
  const { data: prospects } = await supabase
    .from('crm_prospects')
    .select('*')
    .not('tiktok_handle', 'is', null)
    .neq('temperature', 'dead')
    .not('status', 'in', '("client","perdu","sprint")')
    .order('score', { ascending: false })
    .limit(15); // Fetch more to account for timing filter

  if (!prospects || prospects.length === 0) {
    console.log('[TikTokAgent] No TikTok prospects found');
    return NextResponse.json({ ok: true, prepared: 0, message: 'Aucun prospect TikTok' });
  }

  let prepared = 0;
  let skippedTiming = 0;
  let skippedVerification = 0;
  const preparedComments: Array<{ name: string; type: string; comment: string }> = [];
  const byBusinessType: Record<string, { count: number; handles: string[] }> = {};

  for (const prospect of prospects) {
    if (prepared >= 5) break;

    const category = getSequenceForProspect(prospect);

    // Smart timing: check if now is good for TikTok DM to this business type
    if (!isGoodTimeToContact(category, 'dm_tiktok')) {
      skippedTiming++;
      continue;
    }

    // Verify prospect data
    const verification = verifyProspectData(prospect);
    if (!verification.valid) {
      skippedVerification++;
      continue;
    }

    const result = await generateComment(prospect);
    if (!result) continue;

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
      created_at: now,
    });

    prepared++;
    preparedComments.push({ name: prospect.company, type: category, comment: result.comment });

    if (!byBusinessType[category]) byBusinessType[category] = { count: 0, handles: [] };
    byBusinessType[category].count++;
    byBusinessType[category].handles.push(prospect.tiktok_handle);

    await new Promise(r => setTimeout(r, 300));
  }

  const report = {
    prepared,
    skipped_timing: skippedTiming,
    skipped_verification: skippedVerification,
    by_business_type: byBusinessType,
    comments: preparedComments,
    timestamp: now,
  };

  await supabase.from('agent_logs').insert({
    agent: 'tiktok_comments',
    action: 'comments_prepared',
    data: report,
    created_at: now,
  });

  console.log(`[TikTokAgent] ${prepared} comments prepared, ${skippedTiming} skipped(timing), ${skippedVerification} skipped(verif)`);
  return NextResponse.json({ ok: true, ...report });
}
