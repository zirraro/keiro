import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { genererCode, calculerCommissions, releve, PALIERS } from '@/lib/apporteurs';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Pilotage du programme apporteur d'affaires.
 *
 * Réservé à l'administration : ces données disent qui apporte des clients et
 * combien on lui doit. Le contrôle passe par CRON_SECRET, comme le reste de
 * l'outillage interne — pas de session à ouvrir depuis un téléphone pour
 * consulter un relevé.
 *
 *   GET                      → la liste des apporteurs, avec leurs chiffres
 *   GET ?id=<uuid>           → le relevé détaillé d'un apporteur
 *   POST {nom, email, taux}  → crée un apporteur et son code
 *   POST {action:'calculer'} → calcule les commissions du mois (rejouable)
 *   POST {action:'payer', apporteur_id} → solde ce qui est dû
 */

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function autorise(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get('authorization') === `Bearer ${secret}`;
}

/**
 * Les tables n'existent pas encore ? On le dit clairement plutôt que de
 * renvoyer une erreur de base illisible. La migration s'applique au prochain
 * déploiement (voir scripts/migrer.mjs).
 */
function tableAbsente(erreur: any): boolean {
  return /relation .* does not exist|could not find the table/i.test(String(erreur?.message || ''));
}

export async function GET(req: NextRequest) {
  if (!autorise(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const supabase = sb();
  const id = req.nextUrl.searchParams.get('id');

  try {
    if (id) {
      const r = await releve(supabase, id);
      if (!r) return NextResponse.json({ ok: false, error: 'apporteur inconnu' }, { status: 404 });
      return NextResponse.json({ ok: true, ...r });
    }

    const { data: apporteurs, error } = await supabase
      .from('apporteurs').select('*').order('created_at', { ascending: false });
    if (error) throw error;

    const { data: clients } = await supabase.from('apporteur_clients').select('apporteur_id');
    const { data: commissions } = await supabase
      .from('apporteur_commissions').select('apporteur_id, montant_eur, statut');

    const lignes = (apporteurs || []).map((a: any) => {
      const sesClients = (clients || []).filter((c: any) => c.apporteur_id === a.id).length;
      const ses = (commissions || []).filter((c: any) => c.apporteur_id === a.id);
      const du = ses.filter((c: any) => c.statut === 'du').reduce((s: number, c: any) => s + Number(c.montant_eur), 0);
      const paye = ses.filter((c: any) => c.statut === 'paye').reduce((s: number, c: any) => s + Number(c.montant_eur), 0);
      return {
        ...a,
        clients_apportes: sesClients,
        du_eur: Math.round(du * 100) / 100,
        paye_eur: Math.round(paye * 100) / 100,
        lien: `https://keiroai.com/?ref=${a.code}`,
      };
    });

    return NextResponse.json({ ok: true, apporteurs: lignes, paliers: PALIERS });
  } catch (e: any) {
    if (tableAbsente(e)) {
      return NextResponse.json({
        ok: false,
        error: 'tables_absentes',
        message: "Le programme apporteur n'est pas encore installé en base. La migration 20260811_apporteurs.sql s'applique au prochain déploiement.",
      }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!autorise(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const supabase = sb();
  const body = await req.json().catch(() => ({}));

  try {
    if (body.action === 'calculer') {
      return NextResponse.json({ ok: true, ...(await calculerCommissions(supabase)) });
    }

    if (body.action === 'payer') {
      if (!body.apporteur_id) return NextResponse.json({ ok: false, error: 'apporteur_id requis' }, { status: 400 });
      const { data, error } = await supabase
        .from('apporteur_commissions')
        .update({ statut: 'paye', paye_le: new Date().toISOString() })
        .eq('apporteur_id', body.apporteur_id).eq('statut', 'du')
        .select('montant_eur');
      if (error) throw error;
      const total = (data || []).reduce((s: number, c: any) => s + Number(c.montant_eur), 0);
      return NextResponse.json({ ok: true, lignes_soldees: data?.length || 0, montant_eur: Math.round(total * 100) / 100 });
    }

    if (!body.nom) return NextResponse.json({ ok: false, error: 'nom requis' }, { status: 400 });

    // Le taux et la durée sont figés ici, à la création : changer la grille
    // plus tard ne doit pas modifier ce qu'on doit à quelqu'un déjà engagé.
    const code = String(body.code || genererCode(body.nom)).toUpperCase();
    const { data, error } = await supabase.from('apporteurs').insert({
      nom: body.nom,
      email: body.email || null,
      code,
      taux: Number(body.taux) > 0 ? Number(body.taux) : 0.20,
      duree_mois: Number(body.duree_mois) > 0 ? Number(body.duree_mois) : 12,
      notes: body.notes || null,
    }).select().single();
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      apporteur: data,
      lien: `https://keiroai.com/?ref=${code}`,
      conditions: `${Math.round(data.taux * 100)} % pendant ${data.duree_mois} mois, versés au fil des mensualités du client, plus ${PALIERS.map(p => `${p.prime} € au ${p.seuil}ᵉ client actif à ${p.moisActifMinimum} mois`).join(' et ')}.`,
    });
  } catch (e: any) {
    if (tableAbsente(e)) {
      return NextResponse.json({
        ok: false, error: 'tables_absentes',
        message: "Le programme apporteur n'est pas encore installé en base.",
      }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
