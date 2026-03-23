import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min max

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_KEY = process.env.OPENAI_API_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
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
 * Generate embeddings for all agent_knowledge entries that don't have one yet.
 * Auth: CRON_SECRET header required.
 * Query params: ?batch=50 (default 50, max 200)
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!OPENAI_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
  }

  const supabase = getSupabase();
  const batchSize = Math.min(parseInt(new URL(req.url).searchParams.get('batch') || '50'), 200);

  // Get entries without embeddings
  const { data: entries, error } = await supabase
    .from('agent_knowledge')
    .select('id, content')
    .is('embedding', null)
    .order('confidence', { ascending: false }) // Highest confidence first
    .limit(batchSize);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!entries || entries.length === 0) {
    return NextResponse.json({ ok: true, message: 'All entries already have embeddings', processed: 0 });
  }

  let processed = 0;
  let failed = 0;

  // Process in batches of 10 to avoid rate limits
  for (let i = 0; i < entries.length; i += 10) {
    const batch = entries.slice(i, i + 10);

    // Generate embeddings in parallel (10 at a time)
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

    // Small delay between batches to respect rate limits
    if (i + 10 < entries.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Count remaining
  const { count: remaining } = await supabase
    .from('agent_knowledge')
    .select('id', { count: 'exact', head: true })
    .is('embedding', null);

  return NextResponse.json({
    ok: true,
    processed,
    failed,
    remaining: remaining || 0,
    message: remaining && remaining > 0
      ? `${processed} embeddings generes. ${remaining} restants — relancez le backfill.`
      : `Termine ! Tous les ${processed} embeddings sont generes.`,
  });
}

/**
 * GET /api/agents/knowledge-backfill
 * Check status: how many entries have/don't have embeddings.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
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

  return NextResponse.json({
    ok: true,
    total: total || 0,
    withEmbedding: withEmbedding || 0,
    withoutEmbedding: withoutEmbedding || 0,
    progress: total ? `${Math.round(((withEmbedding || 0) / total) * 100)}%` : '0%',
  });
}
