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
    // Admin/fondateur : Léo peut aussi travailler le POOL de prospection partagé
    // (prospects sourcés sans propriétaire, user_id=null) pour son propre démarchage.
    const { data: prof } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
    const isAdmin = !!prof?.is_admin;
    const { searchParams } = new URL(req.url);
    const sector = (searchParams.get('sector') || '').trim();
    const city = (searchParams.get('city') || '').trim();
    const temperature = (searchParams.get('temperature') || '').trim();
    // `all=1` : inclure aussi les fiches SANS téléphone (session prospection Léo —
    // on veut voir tout ce qu'on a en CRM, pas seulement les appelables). Le tel:
    // ne s'affiche côté UI que si un numéro existe.
    const includeNoPhone = searchParams.get('all') === '1';
    // `ids=a,b,c` : recharger une SESSION sauvegardée par ses prospect_ids (fresh
    // depuis le CRM, aucune requête Google → coût nul). Prioritaire sur les filtres.
    const ids = (searchParams.get('ids') || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 100);
    const limit = Math.min(100, parseInt(searchParams.get('limit') || '40', 10));

    let q = supabase
      .from('crm_prospects')
      .select('id, first_name, last_name, company, phone, email, instagram, website, ville, type, status, temperature, score, notes, business_notes, last_contacted_at, created_at')
      .limit(500);
    // Scope propriétaire : le client voit SES prospects ; l'admin voit aussi le
    // pool partagé (user_id null) pour son propre démarchage.
    if (isAdmin) q = q.or(`user_id.eq.${user.id},user_id.is.null`);
    else q = q.eq('user_id', user.id);
    if (ids.length) {
      q = q.in('id', ids);
    } else {
      q = q.in('status', Object.keys(CALLABLE_STATUS));
      if (!includeNoPhone) q = q.not('phone', 'is', null).neq('phone', '');
    }
    if (sector) q = q.ilike('type', `%${sector}%`);
    if (city) q = q.ilike('ville', `%${city}%`);
    if (temperature && ['hot', 'warm', 'cold'].includes(temperature)) q = q.eq('temperature', temperature);
    // Ne pas re-proposer un prospect appelé dans les 2 derniers jours (évite qu'un
    // "à relancer" réapparaisse aussitôt). null = jamais appelé = à appeler.
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
    q = q.or(`last_contacted_at.is.null,last_contacted_at.lt.${twoDaysAgo}`);

    const { data, error: qErr } = await q;
    if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });

    const rows = (data || []).map((p: any) => {
      const cfg = CALLABLE_STATUS[p.status] || { action: 'Appeler', priority: 1 };
      const rank = cfg.priority * 10 + (TEMP_WEIGHT[p.temperature] ?? 1) * 3 + Math.min(9, Math.round((p.score || 0) / 11));
      const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || p.company || 'Prospect';
      return {
        id: p.id, name, company: p.company || null, phone: p.phone,
        city: p.ville || null, business_type: p.type || null,
        status: p.status, temperature: p.temperature || 'cold', score: p.score || 0,
        recommended_action: cfg.action,
        fiche: {
          email: p.email || null, instagram: p.instagram || null, website: p.website || null,
          notes: (p.notes || '').slice(0, 400) || null,
          summary: (p.business_notes || '').slice(0, 400) || null,
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
