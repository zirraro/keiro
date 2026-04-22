import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { analyzeImageForAgent } from '@/lib/agents/visual-analyzer';

export const runtime = 'nodejs';
export const maxDuration = 600;

/**
 * POST /api/admin/backfill-uploads?user_id=<uuid>
 *
 * Re-indexes legacy agent_files rows into agent_uploads with full
 * ai_analysis + folder classification. Useful after the "universal
 * classification" fix when clients already had files in their workspace
 * that had been saved pre-fix (no ai_analysis, no folder, invisible to
 * the content pipeline).
 *
 * Idempotent: skips files that already have a matching agent_uploads row.
 * Auth: CRON_SECRET bearer.
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const userId = req.nextUrl.searchParams.get('user_id');

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Find all agent_files (optionally scoped to one user) that don't already
  // have an agent_uploads row sharing the same file_url.
  let query = sb.from('agent_files').select('user_id, agent_id, file_name, file_type, file_url, created_at').order('created_at', { ascending: false });
  if (userId) query = query.eq('user_id', userId);
  const { data: agentFiles } = await query.limit(500);

  const { data: existing } = await sb
    .from('agent_uploads')
    .select('file_url')
    .limit(5000);
  const alreadyIndexed = new Set((existing || []).map((r: any) => r.file_url));

  const candidates = (agentFiles || []).filter(f => !alreadyIndexed.has(f.file_url));
  const imageExts = new Set(['jpg', 'jpeg', 'png']);
  const folderByExt: Record<string, string> = {
    pdf: 'documents', docx: 'documents', doc: 'documents', txt: 'documents',
    xlsx: 'data', xls: 'data', csv: 'data',
    pptx: 'decks', ppt: 'decks',
    mp4: 'videos', mov: 'videos', webm: 'videos', avi: 'videos',
    mp3: 'audio', wav: 'audio', m4a: 'audio',
  };

  const results: Array<{ file_url: string; status: 'indexed' | 'failed'; folder?: string; content_type?: string }> = [];
  const now = new Date().toISOString();

  for (const f of candidates) {
    try {
      // Load business_type for image analysis context
      const { data: dossier } = await sb
        .from('business_dossiers')
        .select('business_type')
        .eq('user_id', f.user_id)
        .maybeSingle();

      let analysis: any = null;
      let folder = 'other';

      if (imageExts.has(f.file_type)) {
        analysis = await analyzeImageForAgent(
          f.file_url,
          f.agent_id,
          dossier?.business_type || null,
        );
        if (analysis) {
          const folderMap: Record<string, string> = {
            product: 'products', dish: 'products',
            space: 'venue', ambiance: 'venue',
            team: 'team', behind_scenes: 'team',
            customer: 'social_proof',
            logo: 'brand', document: 'brand',
          };
          folder = analysis.content_type ? folderMap[analysis.content_type] || 'other' : 'other';
        }
      } else if (folderByExt[f.file_type]) {
        folder = folderByExt[f.file_type];
        analysis = {
          content_type: ['mp4', 'mov', 'webm', 'avi'].includes(f.file_type) ? 'video'
            : ['xlsx', 'xls', 'csv'].includes(f.file_type) ? 'data'
            : ['pptx', 'ppt'].includes(f.file_type) ? 'deck'
            : ['mp3', 'wav', 'm4a'].includes(f.file_type) ? 'audio'
            : 'document',
          summary: `Backfilled file ${f.file_name}`,
          relevant_agents: ['content'],
          post_angle: null,
        };
      }

      if (analysis) {
        const insertBase = {
          user_id: f.user_id,
          agent_id: f.agent_id,
          file_url: f.file_url,
          file_type: `image/${f.file_type}`,
          file_name: f.file_name,
          caption: null,
          ai_analysis: analysis,
          analyzed_at: now,
          created_at: f.created_at,
        };
        const { error: withFolderErr } = await sb
          .from('agent_uploads')
          .insert({ ...insertBase, folder });
        if (withFolderErr?.message?.includes('folder')) {
          await sb.from('agent_uploads').insert(insertBase);
        }
        results.push({ file_url: f.file_url, status: 'indexed', folder, content_type: analysis.content_type });
      } else {
        results.push({ file_url: f.file_url, status: 'failed' });
      }
    } catch (err: any) {
      console.error('[backfill-uploads]', f.file_url, err?.message);
      results.push({ file_url: f.file_url, status: 'failed' });
    }
  }

  return NextResponse.json({
    ok: true,
    total_candidates: candidates.length,
    indexed: results.filter(r => r.status === 'indexed').length,
    failed: results.filter(r => r.status === 'failed').length,
    results,
  });
}
