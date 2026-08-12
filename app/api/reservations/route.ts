import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { profilPour, consignerReservation } from '@/lib/reservations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Le carnet de réservations du commerçant.
 *
 *   GET                          → ses réservations à venir, plus le vocabulaire
 *                                  de son métier pour que l'écran parle sa langue
 *   POST                         → consigne une demande (agent ou saisie manuelle)
 *   PATCH {id, statut}           → confirmer, annuler, marquer honorée ou absente
 *
 * L'agent qui consigne depuis une conversation s'authentifie par CRON_SECRET
 * et précise le client ; le commerçant, lui, par sa session.
 */

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function tableAbsente(e: any): boolean {
  return /relation .* does not exist|could not find the table/i.test(String(e?.message || ''));
}

/**
 * Le métier du commerçant, cherché là où il se trouve VRAIMENT.
 *
 * `profiles.business_type` est vide sur des comptes pourtant complets — c'est
 * le cas du compte de référence, constaté le 2026-08-12 : le carnet affichait
 * « rendez-vous » à un restaurant. Le dossier d'entreprise, lui, est renseigné
 * à l'onboarding et sert déjà de source à tous les autres agents. On le lit
 * en priorité, et le profil ne sert plus que de repli.
 */
async function typeActivite(supabase: any, userId: string): Promise<string | null> {
  try {
    const { data: dossier } = await supabase.from('business_dossiers')
      .select('business_type, business_description').eq('user_id', userId).maybeSingle();
    if (dossier?.business_type) return dossier.business_type;
    // La description suffit souvent à reconnaître le métier : « brasserie
    // traditionnelle à Lyon » n'a pas besoin d'un champ dédié.
    if (dossier?.business_description) return dossier.business_description;
  } catch { /* pas de dossier : on retombe sur le profil */ }
  try {
    const { data: prof } = await supabase.from('profiles')
      .select('business_type').eq('id', userId).maybeSingle();
    return prof?.business_type || null;
  } catch { return null; }
}

/** Session du commerçant, ou appel d'agent avec le secret et un client désigné. */
async function identifier(req: NextRequest): Promise<string | null> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) {
    const uid = req.nextUrl.searchParams.get('user_id');
    if (uid) return uid;
  }
  const { user } = await getAuthUser();
  return user?.id || null;
}

export async function GET(req: NextRequest) {
  const userId = await identifier(req);
  if (!userId) return NextResponse.json({ ok: false, error: 'Non authentifié' }, { status: 401 });

  const supabase = sb();
  try {
    const profil = profilPour(await typeActivite(supabase, userId));

    // Les passées récentes restent visibles : un gérant vérifie souvent la
    // veille pour marquer les absents.
    const depuis = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const { data, error } = await supabase.from('reservations')
      .select('*').eq('user_id', userId)
      .gte('date_prevue', depuis)
      .order('date_prevue', { ascending: true })
      .order('heure_prevue', { ascending: true })
      .limit(500);
    if (error) throw error;

    const reservations = data || [];
    const aujourdhui = new Date().toISOString().slice(0, 10);
    return NextResponse.json({
      ok: true,
      profil,
      reservations,
      compteurs: {
        a_confirmer: reservations.filter((r: any) => r.statut === 'a_confirmer').length,
        aujourdhui: reservations.filter((r: any) => r.date_prevue === aujourdhui && r.statut !== 'annulee').length,
        a_venir: reservations.filter((r: any) => r.date_prevue > aujourdhui && r.statut !== 'annulee').length,
      },
    });
  } catch (e: any) {
    if (tableAbsente(e)) {
      return NextResponse.json({
        ok: true, profil: profilPour(null), reservations: [], compteurs: { a_confirmer: 0, aujourdhui: 0, a_venir: 0 },
        installation_en_cours: true,
      });
    }
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const userId = await identifier(req);
  if (!userId) return NextResponse.json({ ok: false, error: 'Non authentifié' }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const supabase = sb();
  const { data: prof } = await supabase.from('profiles')
    .select('business_type').eq('id', userId).maybeSingle();

  const r = await consignerReservation(supabase, userId, {
    clientNom: b.client_nom, clientTelephone: b.client_telephone, clientEmail: b.client_email,
    canal: b.canal || 'manuel', conversationRef: b.conversation_ref,
    datePrevue: b.date_prevue, heurePrevue: b.heure_prevue,
    quantite: b.quantite, objet: b.objet, details: b.details,
    demandeBrute: b.demande_brute,
  }, prof?.business_type);

  if (!r.ok) return NextResponse.json({ ok: false, error: 'enregistrement impossible' }, { status: 500 });
  return NextResponse.json({ ok: true, id: r.id, manquants: r.manquants, resume: r.resume });
}

export async function PATCH(req: NextRequest) {
  const userId = await identifier(req);
  if (!userId) return NextResponse.json({ ok: false, error: 'Non authentifié' }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const statutsValides = ['a_confirmer', 'confirmee', 'annulee', 'honoree', 'absent'];
  if (!b.id || !statutsValides.includes(b.statut)) {
    return NextResponse.json({ ok: false, error: 'id et statut valides requis' }, { status: 400 });
  }

  const supabase = sb();
  const maj: Record<string, any> = { statut: b.statut, updated_at: new Date().toISOString() };
  if (typeof b.note === 'string') maj.note = b.note.slice(0, 1000);

  // Le filtre sur user_id n'est pas décoratif : la clé de service contourne
  // RLS, donc c'est lui qui empêche de modifier la réservation d'un autre.
  const { error } = await supabase.from('reservations')
    .update(maj).eq('id', b.id).eq('user_id', userId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
