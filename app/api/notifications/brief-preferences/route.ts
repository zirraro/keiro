import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/notifications/brief-preferences — Get client's CEO brief preferences
 * PUT /api/notifications/brief-preferences — Update preferences
 */
export async function GET() {
  const { user } = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const { data } = await supabase
    .from('client_brief_preferences')
    .select('*')
    .eq('user_id', user.id)
    .single();

  // Return defaults if no prefs set
  return NextResponse.json(data || {
    enabled: true,
    frequency: 'daily',
    preferred_hour: 9,
    email_enabled: true,
    inapp_enabled: true,
  });
}

export async function PUT(req: NextRequest) {
  const { user } = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const body = await req.json();
  const { enabled, frequency, preferred_hour, email_enabled, inapp_enabled } = body;

  const { data, error } = await supabase
    .from('client_brief_preferences')
    .upsert({
      user_id: user.id,
      enabled: enabled ?? true,
      frequency: frequency || 'daily',
      preferred_hour: preferred_hour ?? 9,
      email_enabled: email_enabled ?? true,
      inapp_enabled: inapp_enabled ?? true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
