import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getDMSystemPrompt } from '@/lib/agents/dm-prompt';

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
async function generateDM(prospect: any): Promise<{ dm_text: string; personalization_detail: string; follow_up_3d: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const prospectData = JSON.stringify({
    business_name: prospect.company,
    business_type: prospect.type || 'commerce',
    quartier: prospect.quartier || 'Paris',
    google_rating: prospect.google_rating || prospect.note_google,
    google_reviews: prospect.google_reviews,
    instagram_handle: prospect.instagram || null,
    has_website: !!prospect.website,
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
        max_tokens: 400,
        system: getDMSystemPrompt(),
        messages: [{ role: 'user', content: prospectData }],
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const rawText = data.content?.[0]?.type === 'text' ? data.content[0].text : '';
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
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

async function runDMPreparation(): Promise<NextResponse> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  console.log('[DMAgent] Preparing daily DM queue...');

  // Select top prospects with Instagram that haven't been DMed yet
  const { data: prospects, error } = await supabase
    .from('crm_prospects')
    .select('*')
    .not('instagram', 'is', null)
    .neq('instagram', 'A_VERIFIER')
    .eq('dm_status', 'none')
    .neq('temperature', 'dead')
    .not('status', 'in', '("client_pro","client_fondateurs","lost")')
    .order('score', { ascending: false })
    .limit(MAX_DM_PER_DAY);

  if (error) {
    console.error('[DMAgent] Fetch error:', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!prospects || prospects.length === 0) {
    console.log('[DMAgent] No eligible prospects for DM');
    return NextResponse.json({ ok: true, prepared: 0, message: 'Aucun prospect éligible' });
  }

  console.log(`[DMAgent] Found ${prospects.length} prospects for DM preparation`);

  let prepared = 0;
  let failed = 0;
  const preparedNames: string[] = [];

  for (const prospect of prospects) {
    const dm = await generateDM(prospect);
    if (!dm) { failed++; continue; }

    // Insert into dm_queue
    const { error: queueError } = await supabase.from('dm_queue').insert({
      prospect_id: prospect.id,
      channel: 'instagram',
      handle: prospect.instagram,
      message: dm.dm_text,
      followup_message: dm.follow_up_3d,
      personalization: dm.personalization_detail,
      priority: prospect.score || 50,
      created_at: now,
    });

    if (queueError) {
      console.warn(`[DMAgent] Queue insert error:`, queueError.message);
      failed++;
      continue;
    }

    // Update prospect dm_status
    await supabase.from('crm_prospects').update({
      dm_status: 'queued',
      dm_queued_at: now,
      dm_message: dm.dm_text,
      dm_followup_message: dm.follow_up_3d,
      updated_at: now,
    }).eq('id', prospect.id);

    prepared++;
    preparedNames.push(`${prospect.company} (${prospect.instagram})`);
    console.log(`[DMAgent] Prepared DM for ${prospect.company}`);

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
          created_at: now,
        });
        followupCount++;
      }
    }
  }

  const report = {
    prepared,
    failed,
    followups: followupCount,
    prepared_names: preparedNames,
    timestamp: now,
  };

  await supabase.from('agent_logs').insert({
    agent: 'dm_instagram',
    action: 'daily_preparation',
    data: report,
    created_at: now,
  });

  console.log(`[DMAgent] Done: ${prepared} prepared, ${failed} failed, ${followupCount} followups`);
  return NextResponse.json({ ok: true, ...report });
}
