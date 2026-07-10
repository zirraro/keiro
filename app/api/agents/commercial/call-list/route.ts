import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

/**
 * LÉO — PROSPECTION TÉLÉPHONIQUE (founder 10/07).
 * GET /api/agents/commercial/call-list?sector=&city=&limit=
 * Léo analyse les fiches et empile les prospects À APPELER (qui ont un tel,
 * dans un statut qui justifie un appel), priorisés (chaud > tiède, score),
 * avec l'ACTION RECOMMANDÉE + un rappel des infos de la fiche.
 */

// Statuts qui justifient un appel (on saute clients/perdus/dead).
const CALLABLE_STATUS: Record<string, { action: string; priority: number }> = {
  identifie:  { action: '1er appel — présenter KeiroAI, qualifier le besoin', priority: 2 },
  contacte:   { action: 'Relance tél — a été contacté (email/DM), pas encore de réponse', priority: 3 },
  relance_1:  { action: 'Relance tél #1 — accrocher de vive voix', priority: 3 },
  relance_2:  { action: 'Relance tél #2 — dernière relance douce', priority: 2 },
  relance_3:  { action: 'Relance tél finale — proposer un créneau démo ou clore', priority: 2 },
  repondu:    { action: 'RAPPELER VITE — a répondu, closer / caler une démo', priority: 5 },
  demo:       { action: 'Suivi post-démo — répondre aux objections, closer', priority: 5 },
  sprint:     { action: 'Closing — prospect chaud en sprint, finaliser', priority: 6 },
};

const TEMP_WEIGHT: Record<string, number> = { hot: 3, warm: 2, cold: 1, dead: 0 };

export async function GET(req: NextRequest) {
  try {
    const { user, error } = await getAuthUser();
    if (error || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { searchParams } = new URL(req.url);
    const sector = (searchParams.get('sector') || '').trim();
    const city = (searchParams.get('city') || '').trim();
    const limit = Math.min(100, parseInt(searchParams.get('limit') || '40', 10));

    let q = supabase
      .from('crm_prospects')
      .select('id, first_name, last_name, company, phone, email, instagram, website, city, business_type, status, temperature, score, notes, ai_summary, last_contacted_at, created_at')
      .eq('user_id', user.id)
      .not('phone', 'is', null)
      .neq('phone', '')
      .in('status', Object.keys(CALLABLE_STATUS))
      .limit(500);
    if (sector) q = q.ilike('business_type', `%${sector}%`);
    if (city) q = q.ilike('city', `%${city}%`);

    const { data, error: qErr } = await q;
    if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });

    const rows = (data || []).map((p: any) => {
      const cfg = CALLABLE_STATUS[p.status] || { action: 'Appeler', priority: 1 };
      const rank = cfg.priority * 10 + (TEMP_WEIGHT[p.temperature] ?? 1) * 3 + Math.min(9, Math.round((p.score || 0) / 11));
      const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || p.company || 'Prospect';
      return {
        id: p.id, name, company: p.company || null, phone: p.phone,
        city: p.city || null, business_type: p.business_type || null,
        status: p.status, temperature: p.temperature || 'cold', score: p.score || 0,
        recommended_action: cfg.action,
        fiche: {
          email: p.email || null, instagram: p.instagram || null, website: p.website || null,
          notes: (p.notes || '').slice(0, 400) || null,
          summary: (p.ai_summary || '').slice(0, 400) || null,
          last_contact: p.last_contacted_at || null,
        },
        _rank: rank,
      };
    }).sort((a, b) => b._rank - a._rank).slice(0, limit);

    return NextResponse.json({ ok: true, count: rows.length, callList: rows.map(({ _rank, ...r }) => r) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'server_error' }, { status: 500 });
  }
}
