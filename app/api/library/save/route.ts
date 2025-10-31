import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';

type SaveLibraryItemRequest = {
  type: 'generation' | 'upload';
  title: string;
  image_url: string;
  thumbnail_url?: string;
  news_title?: string;
  news_url?: string;
  business_type?: string;
  metadata?: Record<string, any>;
};

export async function POST(req: NextRequest) {
  try {
    const body: SaveLibraryItemRequest = await req.json();

    // Validation
    if (!body.type || !body.title || !body.image_url) {
      return NextResponse.json(
        { ok: false, error: 'Missing required fields: type, title, image_url' },
        { status: 400 }
      );
    }

    if (!['generation', 'upload'].includes(body.type)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid type. Must be "generation" or "upload"' },
        { status: 400 }
      );
    }

    // Connexion Supabase
    const supabase = supabaseServer();

    // Insérer l'item dans la base de données
    const { data, error } = await supabase
      .from('library_items')
      .insert({
        type: body.type,
        title: body.title,
        image_url: body.image_url,
        thumbnail_url: body.thumbnail_url || null,
        news_title: body.news_title || null,
        news_url: body.news_url || null,
        business_type: body.business_type || null,
        metadata: body.metadata || {},
        user_id: null, // Null pour l'instant, sera rempli quand l'auth sera activée
      })
      .select()
      .single();

    if (error) {
      console.error('[Library Save] Supabase error:', error);
      return NextResponse.json(
        { ok: false, error: `Database error: ${error.message}` },
        { status: 500 }
      );
    }

    console.log('[Library Save] Item saved successfully:', data.id);

    return NextResponse.json({
      ok: true,
      item: data,
    });
  } catch (e: any) {
    console.error('[Library Save] Unexpected error:', e);
    return NextResponse.json(
      { ok: false, error: e.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST to save items.' },
    { status: 405, headers: { Allow: 'POST' } }
  );
}
