import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';

/**
 * POST /api/agents/disconnect-network
 * Disconnect a social network (clear tokens from profile).
 */
export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

  const { network } = await req.json();
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const updates: Record<string, null> = {};
  switch (network) {
    case 'instagram':
      updates.instagram_access_token = null;
      updates.instagram_business_account_id = null;
      break;
    case 'tiktok':
      updates.tiktok_access_token = null;
      updates.tiktok_refresh_token = null;
      break;
    case 'linkedin':
      updates.linkedin_access_token = null;
      break;
    case 'google':
      updates.google_business_refresh_token = null;
      updates.google_business_location_id = null;
      break;
    default:
      return NextResponse.json({ error: 'Network inconnu' }, { status: 400 });
  }

  await supabase.from('profiles').update(updates).eq('id', user.id);
  return NextResponse.json({ ok: true, disconnected: network });
}
