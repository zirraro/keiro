import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getInstagramProfileSnapshot } from '@/lib/agents/ig-profile-snapshot';
import { instagramDmDeepLink } from '@/lib/agents/dm-verify';

export const runtime = 'nodejs';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * GET /api/agents/dm-instagram/preflight?handle=X
 * GET /api/agents/dm-instagram/preflight?dm_id=X
 *
 * Called by the workspace UI right before the user clicks "Envoyer" on a
 * prepared DM. Returns:
 *   - status: 'ready' | 'invalid_handle' | 'likely_blocked' | 'no_creds'
 *   - snapshot: fresh business_discovery data (bio, website, followers, recent posts)
 *   - dm_deeplink: ig.me/m/{handle} URL to open in IG
 *   - warning: optional user-friendly string when something is off
 *
 * Purpose: no friction at send time. The client knows BEFORE they tap
 * whether the handle is still valid and gets a fresh profile snapshot
 * so the DM references real current content.
 */
export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const url = new URL(req.url);
  let handle = url.searchParams.get('handle') || '';
  const dmId = url.searchParams.get('dm_id');

  // Resolve handle from dm_queue when the UI passes dm_id (safer for
  // authorisation — we match the owning user via prospect → user_id).
  if (!handle && dmId) {
    const { data: dm } = await supabase
      .from('dm_queue')
      .select('id, handle, prospect_id')
      .eq('id', dmId)
      .maybeSingle();
    if (!dm) return NextResponse.json({ error: 'DM introuvable' }, { status: 404 });

    const { data: prospect } = await supabase
      .from('crm_prospects')
      .select('id, user_id')
      .eq('id', dm.prospect_id)
      .maybeSingle();
    if (!prospect || prospect.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    handle = dm.handle || '';
  }

  if (!handle) {
    return NextResponse.json({ error: 'handle ou dm_id requis' }, { status: 400 });
  }

  // Use the client's own IG credentials for business_discovery. Fall back
  // to the admin only when the client isn't connected — because the
  // lookup is read-only and the result is the same regardless of looker.
  const { data: clientProfile } = await supabase
    .from('profiles')
    .select('instagram_business_account_id, facebook_page_access_token')
    .eq('id', user.id)
    .maybeSingle();

  let igId = clientProfile?.instagram_business_account_id as string | null | undefined;
  let token = clientProfile?.facebook_page_access_token as string | null | undefined;

  if (!igId || !token) {
    const { data: admin } = await supabase
      .from('profiles')
      .select('instagram_business_account_id, facebook_page_access_token')
      .eq('is_admin', true)
      .not('instagram_business_account_id', 'is', null)
      .not('facebook_page_access_token', 'is', null)
      .limit(1)
      .maybeSingle();
    igId = admin?.instagram_business_account_id;
    token = admin?.facebook_page_access_token;
  }

  if (!igId || !token) {
    return NextResponse.json({
      ok: true,
      status: 'no_creds',
      handle,
      warning: 'Pas de compte IG Business connecté — impossible de pré-vérifier.',
      dm_deeplink: instagramDmDeepLink(handle),
    });
  }

  const snapshot = await getInstagramProfileSnapshot(handle, igId, token);

  if (!snapshot.exists) {
    return NextResponse.json({
      ok: true,
      status: 'invalid_handle',
      handle,
      snapshot,
      warning: 'Compte introuvable ou privé — DM impossible. Retire ce prospect du canal DM.',
    });
  }

  if (!snapshot.canLikelyReceiveDm) {
    return NextResponse.json({
      ok: true,
      status: 'likely_blocked',
      handle,
      snapshot,
      dm_deeplink: instagramDmDeepLink(handle),
      warning: 'Compte peu actif (peu de followers ou peu de posts) — le DM risque de rester sans réponse.',
    });
  }

  return NextResponse.json({
    ok: true,
    status: 'ready',
    handle,
    snapshot,
    dm_deeplink: instagramDmDeepLink(handle),
  });
}
