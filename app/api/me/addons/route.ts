import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { createClient } from '@supabase/supabase-js';
import { hasStellaAddon } from '@/lib/agents/client-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Add-ons actifs de l'utilisateur (founder 05/07). Pour l'instant : Stella
 * (WhatsApp). Lu depuis org_agent_configs, posé par le webhook Stripe.
 */
export async function GET() {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ ok: false, whatsapp: false }, { status: 200 });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const whatsapp = await hasStellaAddon(supabase, user.id);
  return NextResponse.json({ ok: true, whatsapp });
}
