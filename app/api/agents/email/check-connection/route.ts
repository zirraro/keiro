import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';

/**
 * GET /api/agents/email/check-connection
 * Check if client has Gmail/SMTP connected for email sending.
 */
export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: profile } = await supabase
    .from('profiles')
    .select('gmail_refresh_token, gmail_email, smtp_host, smtp_from_email')
    .eq('id', user.id)
    .single();

  return NextResponse.json({
    ok: true,
    gmail_connected: !!profile?.gmail_refresh_token,
    gmail_email: profile?.gmail_email || null,
    smtp_connected: !!profile?.smtp_host,
    smtp_email: profile?.smtp_from_email || null,
    provider: profile?.gmail_refresh_token ? 'gmail' : profile?.smtp_host ? 'smtp' : 'keiroai',
  });
}
