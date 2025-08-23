import { NextResponse } from 'next/server';
import { supabaseServer } from '../../lib/supabase/server';

export async function POST() {
  const sb = supabaseServer();
  await sb.auth.signOut();
  return NextResponse.redirect(new URL('/', process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'));
}
