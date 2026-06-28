import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const maxDuration = 120;

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function requireAdmin() {
  const { user, error } = await getAuthUser();
  if (error || !user) return { denied: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }), user: null };
  const { data: p } = await admin().from('profiles').select('is_admin').eq('id', user.id).single();
  if (p?.is_admin !== true) return { denied: NextResponse.json({ error: 'Accès refusé' }, { status: 403 }), user: null };
  return { denied: null, user };
}

/**
 * POST /api/admin/meta-data-deletion
 *
 * Conformité Meta/RGPD : Meta envoie périodiquement la liste des "app-scoped IDs"
 * d'utilisateurs ayant demandé la suppression (ou retiré l'app). On efface TOUS
 * leurs enregistrements. C'est une obligation LÉGALE qui PRIME sur la doctrine
 * "ne jamais supprimer un prospect" (laquelle ne concerne que le workflow CRM).
 *
 * Body: { ids: string[] }  // les IDs téléchargés depuis App Dashboard → Advanced → Download User Identifiers
 *       { dryRun?: boolean } // true = ne supprime rien, renvoie juste ce qui matcherait
 */
export async function POST(req: NextRequest) {
  // Admin connecté OU CRON_SECRET (pour lancer la purge côté serveur).
  const cronOk = !!process.env.CRON_SECRET && req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  if (!cronOk) {
    const { denied } = await requireAdmin();
    if (denied) return denied;
  }

  const body = await req.json().catch(() => ({}));
  const idsRaw: string[] = Array.isArray(body?.ids) ? body.ids : String(body?.ids || '').split(/[\s,;\n]+/);
  const ids = Array.from(new Set(idsRaw.map(s => String(s).trim()).filter(Boolean))).slice(0, 5000);
  const dryRun = body?.dryRun === true;
  if (!ids.length) return NextResponse.json({ error: 'Aucun ID fourni' }, { status: 400 });

  const sb = admin();
  const report: Record<string, number> = { prospects: 0, activities: 0, agent_logs: 0 };

  // 1) Prospects dont l'identifiant IG/FB scoped == un ID supprimé (DM entrants).
  const { data: matchedProspects } = await sb.from('crm_prospects').select('id, instagram').in('instagram', ids);
  const prospectIds = (matchedProspects || []).map((p: any) => p.id);

  if (!dryRun && prospectIds.length) {
    // Activités liées d'abord (FK), puis les prospects.
    const { count: actCount } = await sb.from('crm_activities').delete({ count: 'exact' }).in('prospect_id', prospectIds);
    report.activities = actCount || 0;
    const { count: pCount } = await sb.from('crm_prospects').delete({ count: 'exact' }).in('id', prospectIds);
    report.prospects = pCount || 0;
  } else {
    report.prospects = prospectIds.length;
  }

  // 2) Logs d'agents contenant ces IDs (sender_id des DM/commentaires).
  if (!dryRun) {
    for (const id of ids) {
      const { count } = await sb.from('agent_logs').delete({ count: 'exact' }).or(`data->>sender_id.eq.${id},data->>recipient_id.eq.${id}`);
      report.agent_logs += count || 0;
    }
  }

  // Trace de conformité (preuve qu'on a traité la demande).
  await sb.from('agent_logs').insert({
    agent: 'ops', action: 'meta_data_deletion', status: 'ok',
    data: { ids_count: ids.length, dryRun, report, at: new Date().toISOString() },
    created_at: new Date().toISOString(),
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true, dryRun, ids_received: ids.length, report });
}
