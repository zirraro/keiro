import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type'); // Filtrer par type: 'generation' ou 'upload'
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Connexion Supabase
    const supabase = supabaseServer();

    // Construire la requête
    let query = supabase
      .from('library_items')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Filtrer par type si spécifié
    if (type && ['generation', 'upload'].includes(type)) {
      query = query.eq('type', type);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[Library List] Supabase error:', error);
      return NextResponse.json(
        { ok: false, error: `Database error: ${error.message}` },
        { status: 500 }
      );
    }

    console.log(`[Library List] Found ${data?.length || 0} items (total: ${count})`);

    return NextResponse.json({
      ok: true,
      items: data || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (e: any) {
    console.error('[Library List] Unexpected error:', e);
    return NextResponse.json(
      { ok: false, error: e.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}

export async function POST() {
  return NextResponse.json(
    { error: 'Method not allowed. Use GET to list items.' },
    { status: 405, headers: { Allow: 'GET' } }
  );
}
