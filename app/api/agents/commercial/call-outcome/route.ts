import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

/**
 * LÉO — RÉSULTAT D'APPEL (founder 10/07). Le founder appelle un prospect de la
 * call-list puis enregistre le résultat → MAJ de la fiche + activité loggée. Le
 * prospect est alors pris en compte dans la stratégie/relance/onboarding.
 * Règle CRM : on ne SUPPRIME jamais → "pas intéressé" = perdu/dead.
 * POST { prospectId, outcome, note? }
 */
const OUTCOMES: Record<string, { update: Record<string, any>; activityType: string; label: string }> = {
  reached_interested:     { update: { status: 'repondu', temperature: 'hot' },  activityType: 'call_interested',    label: 'Appelé — intéressé' },
  reached_callback:       { update: { temperature: 'warm' },                    activityType: 'call_callback',      label: 'Appelé — rappeler plus tard' },
  reached_not_interested: { update: { status: 'perdu', temperature: 'dead' },   activityType: 'call_not_interested',label: 'Appelé — pas intéressé' },
  not_reached:            { update: {},                                          activityType: 'call_no_answer',     label: 'Pas joint' },
  follow_up:              { update: { temperature: 'warm' },                    activityType: 'call_followup',      label: 'À relancer' },
};

export async function POST(req: NextRequest) {
  try {
    const { user, error } = await getAuthUser();
    if (error || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const prospectId = String(body.prospectId || '');
    const outcome = String(body.outcome || '');
    const note = String(body.note || '').slice(0, 500);
    if (!prospectId || !OUTCOMES[outcome]) {
      return NextResponse.json({ error: 'prospectId + outcome valide requis' }, { status: 400 });
    }
    const cfg = OUTCOMES[outcome];
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Vérifie la propriété du prospect (sécurité multi-tenant, org-aware).
    const { data: prospect } = await supabase
      .from('crm_prospects').select('id, user_id, org_id, status').eq('id', prospectId).maybeSingle();
    const { data: om } = await supabase.from('organization_members').select('org_id').eq('user_id', user.id).maybeSingle();
    const { data: prof } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
    const ownsIt = !!prospect && (prof?.is_admin === true || prospect.user_id === user.id || (!!prospect.org_id && prospect.org_id === om?.org_id));
    if (!ownsIt) {
      return NextResponse.json({ error: 'prospect introuvable' }, { status: 404 });
    }

    const now = new Date().toISOString();
    const update: Record<string, any> = { ...cfg.update, last_contacted_at: now, updated_at: now };
    // Ne pas rétrograder un client déjà signé.
    if (prospect.status === 'client') delete update.status;
    await supabase.from('crm_prospects').update(update).eq('id', prospectId);

    // Activité loggée (fil de la fiche + pris en compte par la stratégie/relance).
    await supabase.from('crm_activities').insert({
      prospect_id: prospectId, user_id: user.id, type: cfg.activityType,
      description: `📞 ${cfg.label}${note ? ` — ${note}` : ''}`,
      date_activite: now, created_at: now,
    }).then(() => {}, () => {});

    return NextResponse.json({ ok: true, applied: cfg.label, update });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'server_error' }, { status: 500 });
  }
}
