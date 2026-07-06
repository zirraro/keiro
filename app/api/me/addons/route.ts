import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { createClient } from '@supabase/supabase-js';
import { getUnlockedAddonAgents } from '@/lib/agents/client-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Add-ons actifs de l'utilisateur (founder 05-06/07). Renvoie la liste des
 * agents débloqués par add-on (Stella=whatsapp, Louis=comptable, …), lue depuis
 * org_agent_configs (posée par le webhook Stripe).
 */
export async function GET() {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ ok: false, unlockedAgents: [] }, { status: 200 });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const unlockedAgents = await getUnlockedAddonAgents(supabase, user.id);
  return NextResponse.json({ ok: true, unlockedAgents, whatsapp: unlockedAgents.includes('whatsapp') });
}
