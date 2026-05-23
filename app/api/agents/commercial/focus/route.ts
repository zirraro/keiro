import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/**
 * Persistent Léo focus — stored in profiles.gmaps_focus (JSONB).
 * Used by the gmaps cron to prepend the client's sector + city as a
 * custom query so each cron pass targets the right niche.
 */
export async function GET(_req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const supabase = sb();
  const { data } = await supabase
    .from('profiles')
    .select('gmaps_focus')
    .eq('id', user.id)
    .maybeSingle();
  return NextResponse.json({ ok: true, focus: data?.gmaps_focus || null });
}

export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch {}
  const sector = (body?.sector || '').toString().slice(0, 80).trim();
  const city = (body?.city || '').toString().slice(0, 80).trim();
  const focus = { sector, city, updated_at: new Date().toISOString() };
  const supabase = sb();
  const { error: upErr } = await supabase
    .from('profiles')
    .update({ gmaps_focus: focus })
    .eq('id', user.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, focus });
}
