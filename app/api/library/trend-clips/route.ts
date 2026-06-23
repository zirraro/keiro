import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Banque de clips TREND / inspiration.
 *
 * 2026-06-23 — Founder : "branche une banque de clips trend, avec option
 * dans le Studio pour ajouter/mettre un exemple de clip source pour
 * s'inspirer, et pareil dans les dossiers de Léna."
 *
 * Stockage = `my_videos` avec source_type='trend_inspiration' (même table que
 * la bibliothèque → visible dans /library ET réutilisable par Léna pour le
 * montage dual-reel "tendance + le nôtre"). Pas de nouvelle table : les clips
 * trend SONT des vidéos de la bibliothèque, juste marquées.
 *
 *   GET  /api/library/trend-clips         → liste les clips d'inspiration
 *   POST /api/library/trend-clips         → ajoute un clip (videoUrl + titre)
 *   DELETE /api/library/trend-clips?id=…  → retire un clip de la banque
 */

const TREND_SOURCE = 'trend_inspiration';

async function getAccessTokenFromCookies(): Promise<string | null> {
  const cookieStore = await cookies();
  for (const cookie of cookieStore.getAll()) {
    if (cookie.name.startsWith('sb-') && cookie.name.endsWith('-auth-token')) {
      try {
        let v = cookie.value;
        if (v.startsWith('base64-')) v = Buffer.from(v.substring(7), 'base64').toString('utf-8');
        const parsed = JSON.parse(v);
        const token = parsed.access_token || (Array.isArray(parsed) ? parsed[0] : null);
        if (token) return token;
      } catch { /* try next */ }
    }
  }
  return cookieStore.get('sb-access-token')?.value || null;
}

async function getUser(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  let token = await getAccessTokenFromCookies();
  if (!token) {
    const h = req.headers.get('authorization');
    if (h?.startsWith('Bearer ')) token = h.substring(7);
  }
  let user = null;
  if (token) {
    const { data } = await supabase.auth.getUser(token);
    user = data?.user || null;
  }
  return { user, supabase };
}

export async function GET(req: NextRequest) {
  try {
    const { user, supabase } = await getUser(req);
    if (!user) return NextResponse.json({ ok: false, error: 'Auth requise' }, { status: 401 });
    const { data, error } = await supabase
      .from('my_videos')
      .select('id, title, video_url, thumbnail_url, created_at, source_type')
      .eq('user_id', user.id)
      .eq('source_type', TREND_SOURCE)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, clips: data || [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const videoUrl = String(body.videoUrl || '').trim();
    const title = String(body.title || 'Clip d\'inspiration').trim().slice(0, 200);
    if (!videoUrl || !/^https?:\/\//.test(videoUrl)) {
      return NextResponse.json({ ok: false, error: 'videoUrl (http(s)) requis' }, { status: 400 });
    }
    const { user, supabase } = await getUser(req);
    if (!user) return NextResponse.json({ ok: false, error: 'Auth requise' }, { status: 401 });
    const { data, error } = await supabase
      .from('my_videos')
      .insert({
        user_id: user.id,
        video_url: videoUrl,
        title: title.startsWith('🔥') ? title : `🔥 ${title}`,
        thumbnail_url: body.thumbnailUrl || null,
        source_type: TREND_SOURCE,
        ai_model: 'inspiration',
      })
      .select('id, title, video_url, thumbnail_url, created_at, source_type')
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, clip: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ ok: false, error: 'id requis' }, { status: 400 });
    const { user, supabase } = await getUser(req);
    if (!user) return NextResponse.json({ ok: false, error: 'Auth requise' }, { status: 401 });
    const { error } = await supabase
      .from('my_videos')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('source_type', TREND_SOURCE);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Erreur serveur' }, { status: 500 });
  }
}
