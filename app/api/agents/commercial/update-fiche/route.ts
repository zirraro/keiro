import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

/**
 * LÉO — ÉDITION FICHE CRM INLINE (founder 12/07). Depuis l'onglet prospection,
 * le commercial modifie une fiche SANS ouvrir le CRM entier : ajoute un
 * commentaire et/ou change le statut/température, pendant qu'il enchaîne les
 * appels.
 *
 * CLÉ : le commentaire est APPENDÉ dans `crm_prospects.notes` (+ loggé en
 * activité) → tous les agents le lisent (Hugo pour des relances propres, Léna,
 * onboarding…). C'est le canal de contexte partagé cross-agents.
 *
 * Règle CRM : on ne SUPPRIME jamais (dead/perdu seulement) et on ne rétrograde
 * pas un client signé.
 *
 * POST { prospectId, comment?, status?, temperature? }
 */
// Valeurs canoniques du CHECK crm_prospects_status_check (migration 20260304).
const ALLOWED_STATUS = new Set(['identifie', 'contacte', 'repondu', 'demo', 'sprint', 'client', 'perdu']);
const ALLOWED_TEMP = new Set(['hot', 'warm', 'cold', 'dead']);

export async function POST(req: NextRequest) {
  try {
    const { user, error } = await getAuthUser();
    if (error || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const prospectId = String(body.prospectId || '');
    const comment = String(body.comment || '').trim().slice(0, 800);
    const status = body.status ? String(body.status) : null;
    const temperature = body.temperature ? String(body.temperature) : null;
    if (!prospectId) return NextResponse.json({ error: 'prospectId requis' }, { status: 400 });
    if (status && !ALLOWED_STATUS.has(status)) return NextResponse.json({ error: 'statut invalide' }, { status: 400 });
    if (temperature && !ALLOWED_TEMP.has(temperature)) return NextResponse.json({ error: 'température invalide' }, { status: 400 });
    if (!comment && !status && !temperature) return NextResponse.json({ error: 'rien à mettre à jour' }, { status: 400 });

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Sécurité multi-tenant : la fiche doit appartenir au client.
    const { data: prospect } = await supabase
      .from('crm_prospects').select('id, user_id, org_id, status, notes').eq('id', prospectId).maybeSingle();
    // Ownership org-aware : le membre d'une org peut éditer les fiches de son org.
    const { data: om } = await supabase.from('organization_members').select('org_id').eq('user_id', user.id).maybeSingle();
    const ownsIt = !!prospect && (prospect.user_id === user.id || (!!prospect.org_id && prospect.org_id === om?.org_id));
    if (!ownsIt) {
      return NextResponse.json({ error: 'prospect introuvable' }, { status: 404 });
    }

    const now = new Date().toISOString();
    const update: Record<string, any> = { updated_at: now };

    // Commentaire → APPEND dans notes (horodaté) pour que TOUS les agents le lisent.
    if (comment) {
      const stamp = new Date().toISOString().slice(0, 10);
      const prev = (prospect.notes || '').trim();
      update.notes = (prev ? `${prev}\n` : '') + `[${stamp}] ${comment}`;
      update.last_contacted_at = now;
    }
    if (status && prospect.status !== 'client') update.status = status;
    if (temperature) update.temperature = temperature;

    await supabase.from('crm_prospects').update(update).eq('id', prospectId);

    // Trace dans le fil d'activité (lu par la stratégie/relance).
    if (comment) {
      await supabase.from('crm_activities').insert({
        prospect_id: prospectId, user_id: user.id, type: 'note_commercial',
        description: `📝 ${comment}`, date_activite: now, created_at: now,
      }).then(() => {}, () => {});
    }

    return NextResponse.json({ ok: true, notes: update.notes ?? prospect.notes, status: update.status, temperature: update.temperature });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'server_error' }, { status: 500 });
  }
}
