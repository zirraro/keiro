import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min max

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_KEY = process.env.OPENAI_API_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

async function verifyAuth(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  try {
    const { user, error } = await getAuthUser();
    if (error || !user) return false;
    const supabase = getSupabase();
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
    return profile?.is_admin === true;
  } catch { return false; }
}

async function getEmbedding(text: string): Promise<number[] | null> {
  if (!OPENAI_KEY) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-ada-002', input: text.substring(0, 8000) }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.[0]?.embedding || null;
  } catch { return null; }
}

/**
 * POST /api/agents/knowledge-backfill
 * Generate embeddings for agent_knowledge entries without one.
 * Auth: CRON_SECRET or admin user.
 * Query params: ?batch=200 (default 200, max 200)
 */
export async function POST(req: NextRequest) {
  if (!(await verifyAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!OPENAI_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
  }

  const supabase = getSupabase();
  const batchSize = Math.min(parseInt(new URL(req.url).searchParams.get('batch') || '200'), 200);

  const startTime = Date.now();
  const MAX_DURATION_MS = 270_000; // Stop at 4.5 min to leave buffer

  // Get entries without embeddings
  const { data: entries, error } = await supabase
    .from('agent_knowledge')
    .select('id, content')
    .is('embedding', null)
    .order('confidence', { ascending: false })
    .limit(batchSize);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!entries || entries.length === 0) {
    return NextResponse.json({ ok: true, message: 'All entries already have embeddings', processed: 0, remaining: 0 });
  }

  let processed = 0;
  let failed = 0;

  // Process in sub-batches of 10 parallel
  for (let i = 0; i < entries.length; i += 10) {
    if (Date.now() - startTime > MAX_DURATION_MS) {
      console.log(`[Backfill] Stopping at ${processed} — approaching timeout`);
      break;
    }

    const batch = entries.slice(i, i + 10);

    const results = await Promise.allSettled(
      batch.map(async (entry) => {
        const embedding = await getEmbedding(entry.content);
        if (embedding) {
          await supabase
            .from('agent_knowledge')
            .update({ embedding, updated_at: new Date().toISOString() })
            .eq('id', entry.id);
          return true;
        }
        return false;
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) processed++;
      else failed++;
    }

    if (i + 10 < entries.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Count remaining
  const { count: remaining } = await supabase
    .from('agent_knowledge')
    .select('id', { count: 'exact', head: true })
    .is('embedding', null);

  const duration = Date.now() - startTime;

  return NextResponse.json({
    ok: true,
    processed,
    failed,
    remaining: remaining || 0,
    duration_ms: duration,
    message: remaining && remaining > 0
      ? `${processed} embeddings generes en ${Math.round(duration / 1000)}s. ${remaining} restants — relancez le backfill.`
      : `Termine ! ${processed} embeddings generes. Total 100% embedded.`,
  });
}

/**
 * GET /api/agents/knowledge-backfill
 * Check status: how many entries have/don't have embeddings.
 * Auth: CRON_SECRET or admin user.
 */
export async function GET(req: NextRequest) {
  if (!(await verifyAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();

  const [
    { count: total },
    { count: withEmbedding },
    { count: withoutEmbedding },
  ] = await Promise.all([
    supabase.from('agent_knowledge').select('id', { count: 'exact', head: true }),
    supabase.from('agent_knowledge').select('id', { count: 'exact', head: true }).not('embedding', 'is', null),
    supabase.from('agent_knowledge').select('id', { count: 'exact', head: true }).is('embedding', null),
  ]);

  // Per-agent breakdown
  const { data: agentCounts } = await supabase
    .from('agent_knowledge')
    .select('agent')
    .is('embedding', null);

  const byAgent: Record<string, number> = {};
  for (const row of agentCounts || []) {
    const a = row.agent || 'shared';
    byAgent[a] = (byAgent[a] || 0) + 1;
  }

  return NextResponse.json({
    ok: true,
    total: total || 0,
    withEmbedding: withEmbedding || 0,
    withoutEmbedding: withoutEmbedding || 0,
    progress: total ? `${Math.round(((withEmbedding || 0) / total) * 100)}%` : '0%',
    byAgent: Object.keys(byAgent).length > 0 ? byAgent : undefined,
  });
}
