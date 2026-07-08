import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTeamPresence } from '@/lib/agents/team-presence';

export const runtime = 'nodejs';

/**
 * Présence d'équipe VÉRIDIQUE pour le client connecté (design §13.1).
 * Renvoie { presence: { [agentId]: { state, label, lastAction, lastAt } } }.
 * Consommé par la page /assistant pour afficher l'état réel de chaque agent.
 */
const ROSTER = [
  'content', 'dm_instagram', 'email', 'commercial', 'gmaps', 'seo',
  'onboarding', 'retention', 'marketing', 'ops', 'rh', 'comptable', 'whatsapp', 'ceo',
];

export async function GET(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Auth : token depuis Authorization ou cookie (même approche que /stats).
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '') || req.cookies.get('sb-access-token')?.value;
    if (!token) return NextResponse.json({ ok: false, presence: {} }, { status: 200 });
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ ok: false, presence: {} }, { status: 200 });

    const presence = await getTeamPresence(supabase, user.id, ROSTER);
    return NextResponse.json({ ok: true, presence });
  } catch (e: any) {
    // Best-effort : jamais bloquant pour l'UI.
    return NextResponse.json({ ok: false, presence: {} }, { status: 200 });
  }
}
