import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getTikTokCommentPrompt } from '@/lib/agents/tiktok-comment-prompt';

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
async function generateComment(prospect: any): Promise<{ comment: string; strategy: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const context = JSON.stringify({
    business_name: prospect.company,
    business_type: prospect.type || 'commerce',
    quartier: prospect.quartier,
    tiktok_handle: prospect.tiktok_handle,
    google_rating: prospect.google_rating || prospect.note_google,
  });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: getTikTokCommentPrompt(),
        messages: [{ role: 'user', content: context }],
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const rawText = data.content?.[0]?.type === 'text' ? data.content[0].text : '';
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
    .order('score', { ascending: false })
    .limit(5);

  if (!prospects || prospects.length === 0) {
    console.log('[TikTokAgent] No TikTok prospects found');
    return NextResponse.json({ ok: true, prepared: 0, message: 'Aucun prospect TikTok' });
  }

  let prepared = 0;
  const preparedComments: Array<{ name: string; comment: string }> = [];

  for (const prospect of prospects) {
    const result = await generateComment(prospect);
    if (!result) continue;

    await supabase.from('dm_queue').insert({
      prospect_id: prospect.id,
      channel: 'tiktok',
      handle: prospect.tiktok_handle,
      message: result.comment,
      personalization: result.strategy,
      priority: prospect.score || 30,
      created_at: now,
    });

    prepared++;
    preparedComments.push({ name: prospect.company, comment: result.comment });

    await new Promise(r => setTimeout(r, 300));
  }

  const report = { prepared, comments: preparedComments, timestamp: now };

  await supabase.from('agent_logs').insert({
    agent: 'tiktok_comments',
    action: 'comments_prepared',
    data: report,
    created_at: now,
  });

  console.log(`[TikTokAgent] ${prepared} comments prepared`);
  return NextResponse.json({ ok: true, ...report });
}
