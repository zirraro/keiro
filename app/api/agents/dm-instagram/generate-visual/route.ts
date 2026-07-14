import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { generateProspectVisual } from '@/app/api/agents/dm-instagram/route';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/agents/dm-instagram/generate-visual  { dm_id }
 * Génère À LA DEMANDE un visuel de prospection pertinent + personnalisé pour le
 * prospect d'un DM (founder 15/07 : « on puisse choisir de générer un visuel ou
 * pas »). Attache l'URL à la ligne dm_queue (personalization.visual_url). Le DM
 * reste envoyable sans visuel — c'est un choix du client, pas une obligation.
 */
export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const dmId = String(body.dm_id || '');
  if (!dmId) return NextResponse.json({ error: 'dm_id requis' }, { status: 400 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Charge le DM + le prospect (jointure inner scopée pour la sécurité multi-tenant).
  const { data: om } = await supabase.from('organization_members').select('org_id').eq('user_id', user.id).maybeSingle();
  const orgId = om?.org_id || null;
  let dq = supabase
    .from('dm_queue')
    .select('id, prospect_id, personalization, crm_prospects!inner(id, company, type, quartier, instagram, user_id, org_id)')
    .eq('id', dmId);
  dq = orgId ? dq.eq('crm_prospects.org_id', orgId) : dq.eq('crm_prospects.user_id', user.id);
  const { data: row } = await dq.maybeSingle();
  if (!row) return NextResponse.json({ error: 'DM introuvable' }, { status: 404 });

  const prospect = (row as any).crm_prospects;
  const url = await generateProspectVisual(prospect, null);
  if (!url) return NextResponse.json({ ok: false, error: 'Génération du visuel échouée, réessaie.' }, { status: 502 });

  // Attache le visuel dans personalization (sans écraser le reste).
  let pj: any = {};
  try { pj = typeof (row as any).personalization === 'string' ? JSON.parse((row as any).personalization) : ((row as any).personalization || {}); } catch { pj = {}; }
  pj.visual_url = url;
  await supabase.from('dm_queue').update({ personalization: JSON.stringify(pj) }).eq('id', dmId);

  return NextResponse.json({ ok: true, visual_url: url });
}
