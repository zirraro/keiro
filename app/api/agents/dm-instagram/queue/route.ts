import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';

/**
 * GET /api/agents/dm-instagram/queue?limit=200&offset=0
 * DM en attente que le client prévisualise + envoie à la main.
 *
 * IMPORTANT (fix 14/07) : on filtre par une JOINTURE INNER sur crm_prospects
 * (scopée user_id/org_id) au lieu de charger d'abord 1000 prospects puis d'en
 * garder 500 — cette troncature masquait les DM des prospects hors des 500
 * premiers (le founder voyait « rien » alors que 261 DM existaient).
 */
export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Scope multi-tenant : org si le user en fait partie, sinon ses propres fiches.
  const { data: om } = await supabase.from('organization_members').select('org_id').eq('user_id', user.id).maybeSingle();
  const orgId = om?.org_id || null;

  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '200');
  const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0');

  // Jointure inner : les DM dont le prospect appartient au client. Priorise les
  // handles déjà vérifiés (le bouton Envoyer n'ouvre jamais un profil inactif).
  let q = supabase
    .from('dm_queue')
    .select('id, prospect_id, handle, message, channel, priority, created_at, verified_exists, verified_at, personalization, crm_prospects!inner(company, user_id, org_id)', { count: 'exact' })
    .eq('status', 'pending')
    .eq('channel', 'instagram');
  q = orgId ? q.eq('crm_prospects.org_id', orgId) : q.eq('crm_prospects.user_id', user.id);
  q = q
    .order('verified_exists', { ascending: false, nullsFirst: false })
    .order('priority', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data: queue, count: totalPending, error: qErr } = await q;
  if (qErr) {
    console.warn('[dm-queue] query error:', qErr.message);
    return NextResponse.json({ ok: true, queue: [], total: 0 });
  }

  const result = (queue || []).map(({ personalization, crm_prospects, ...dm }: any) => {
    // visual_url + détail de perso sont DANS le JSON personalization → on les
    // remonte au top-level pour l'affichage carte.
    let visual_url: string | null = null;
    let personalization_detail: string | null = null;
    try {
      const pj = typeof personalization === 'string' ? JSON.parse(personalization) : personalization;
      if (pj && typeof pj === 'object') {
        visual_url = pj.visual_url || null;
        personalization_detail = pj.detail || null;
      }
    } catch { /* personalization malformé → ignoré */ }
    return {
      ...dm,
      company: (crm_prospects as any)?.company || null,
      visual_url,
      personalization_detail,
    };
  });

  return NextResponse.json({ ok: true, queue: result, total: totalPending ?? result.length });
}
