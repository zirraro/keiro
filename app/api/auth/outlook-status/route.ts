import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * GET /api/auth/outlook-status → { connected, email }
 * DELETE /api/auth/outlook-status → wipes all outlook_* columns
 *
 * Mirrors /api/agents/email/check-connection but for Outlook so the
 * EmailConnectBanner can show both states independently.
 */
export async function GET() {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('profiles')
    .select('outlook_refresh_token, outlook_email')
    .eq('id', user.id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    connected: !!data?.outlook_refresh_token,
    email: data?.outlook_email || null,
  });
}

export async function DELETE() {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseAdmin();
  await supabase.from('profiles').update({
    outlook_refresh_token: null,
    outlook_access_token: null,
    outlook_token_expires_at: null,
    outlook_email: null,
    outlook_last_poll_at: null,
  }).eq('id', user.id);

  return NextResponse.json({ ok: true, connected: false });
}
