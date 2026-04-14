import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { verifyInstagramHandle } from '@/lib/agents/dm-verify';

export const runtime = 'nodejs';

/**
 * POST /api/agents/dm-instagram/verify-handle
 * Body: { dm_id?: string, handle?: string }
 *
 * Live-check whether an Instagram handle is reachable for a DM. Used by the
 * workspace DM queue to detect whether the "Envoyer DM" button should open
 * the profile (handle reachable) or show a warning (handle inactive / not a
 * business account / page introuvable).
 *
 * We deliberately do NOT auto-send via /me/messages — even when the permission
 * is granted, an automated send from a server right after the click is more
 * likely to be flagged as bot behavior. The button's role is only to copy the
 * message + open the profile so the user pastes it themselves.
 */
export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const dmId: string | undefined = body?.dm_id;
  const inputHandle: string | undefined = body?.handle;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Resolve handle: either from dm_queue row (preferred) or directly from payload
  let dmRow: any = null;
  let handle = inputHandle;
  if (dmId) {
    const { data } = await supabase
      .from('dm_queue')
      .select('id, handle, personalization, verified_at, verified_exists, verification_attempts')
      .eq('id', dmId)
      .single();
    dmRow = data;
    if (!dmRow) return NextResponse.json({ ok: false, error: 'DM introuvable' }, { status: 404 });
    handle = dmRow.handle || handle;
  }
  if (!handle) return NextResponse.json({ ok: false, error: 'handle requis' }, { status: 400 });

  // Short-circuit when the row is already verified AND the verification is
  // fresh (< 24h). business_discovery results change slowly.
  if (dmRow?.verified_at && dmRow.verified_exists) {
    const ageMs = Date.now() - new Date(dmRow.verified_at).getTime();
    if (ageMs < 24 * 3600_000) {
      let cachedIgId: string | null = null;
      try {
        const p = dmRow.personalization ? JSON.parse(dmRow.personalization) : {};
        cachedIgId = p?.verified_ig_id || null;
      } catch {}
      return NextResponse.json({
        ok: true,
        exists: true,
        cached: true,
        ig_id: cachedIgId,
        handle,
      });
    }
  }

  // Need a live check. Use the admin Page token for business_discovery —
  // graph.instagram.com does not expose this field, only graph.facebook.com.
  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('instagram_business_account_id, facebook_page_access_token')
    .eq('is_admin', true)
    .not('facebook_page_access_token', 'is', null)
    .not('instagram_business_account_id', 'is', null)
    .limit(1)
    .maybeSingle();

  if (!adminProfile?.instagram_business_account_id || !adminProfile.facebook_page_access_token) {
    return NextResponse.json({
      ok: true,
      exists: null, // unknown — we can't verify without admin creds
      cached: false,
      reason: 'admin_not_connected',
      message: 'Impossible de verifier — admin Instagram non connecte',
      handle,
    });
  }

  const result = await verifyInstagramHandle(
    handle,
    adminProfile.instagram_business_account_id,
    adminProfile.facebook_page_access_token,
  );

  // Persist the verification result so the next click on the same DM
  // short-circuits without another API call.
  if (dmRow) {
    let perso = {};
    try { perso = dmRow.personalization ? JSON.parse(dmRow.personalization) : {}; } catch {}
    if (result.exists && result.igId) {
      (perso as any).verified_ig_id = result.igId;
      (perso as any).verified_media_ids = result.mediaIds || [];
    }
    await supabase.from('dm_queue').update({
      verified_at: new Date().toISOString(),
      verified_exists: result.exists,
      verification_attempts: (dmRow.verification_attempts || 0) + 1,
      personalization: JSON.stringify(perso),
      ...(result.exists ? {} : { error_message: ('Live check failed: ' + (result.rawError || 'unknown')).substring(0, 200) }),
    }).eq('id', dmRow.id);
  }

  return NextResponse.json({
    ok: true,
    exists: result.exists,
    cached: false,
    ig_id: result.igId || null,
    reason: result.rawError || null,
    handle,
  });
}
