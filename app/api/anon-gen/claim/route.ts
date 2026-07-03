import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getIp, hashIp, anonTag } from '@/lib/anon-ip';

export const runtime = 'nodejs';

/**
 * POST /api/anon-gen/claim
 *
 * Called right after a visitor creates an account: attaches the visuals they
 * generated while logged out (stored with user_id=null + tag `anon:<ipHash>`)
 * to their new library (founder 03/07: "on lui propose de récupérer son visuel
 * gratuit avec la création du compte").
 *
 * Matching: same hashed IP + still unclaimed (user_id null) + recent (<48h) so
 * we never hand a stranger's visual to another user behind the same NAT.
 * Returns { ok, claimed }.
 */
export async function POST(req: NextRequest) {
  const { user, error: authErr } = await getAuthUser();
  if (authErr || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const tag = anonTag(hashIp(getIp(req)));
  const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();

  try {
    // Find unclaimed anon rows for this IP (recent only).
    const { data: rows } = await supabase
      .from('saved_images')
      .select('id')
      .is('user_id', null)
      .contains('tags', [tag])
      .gte('created_at', since)
      .limit(10);

    if (!rows || rows.length === 0) return NextResponse.json({ ok: true, claimed: 0 });

    const ids = rows.map(r => r.id);
    // Attach to the new user + strip the anon tag.
    const { error } = await supabase
      .from('saved_images')
      .update({ user_id: user.id, tags: [], updated_at: new Date().toISOString() })
      .in('id', ids);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, claimed: ids.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'claim failed' }, { status: 500 });
  }
}
