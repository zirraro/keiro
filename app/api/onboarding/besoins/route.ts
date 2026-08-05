import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { besoinsPour } from '@/lib/agents/onboarding-needs';
import { enregistrerInfo, prochaineQuestion, clesRenseignees } from '@/lib/agents/clara-hub';
import { loadBusinessDossier } from '@/lib/agents/client-context';
import { getVisibleAgents } from '@/lib/agents/client-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Ce qu'il reste à demander à CE client, et par où Clara redistribue.
 *
 * GET  → la liste des informations manquantes, adaptée à son métier et aux
 *        agents dont il dispose, chacune avec son « à quoi ça sert ».
 * POST → enregistre une information et la route vers les agents concernés,
 *        qu'elle vienne du formulaire, de Clara ou d'un chat d'agent.
 *
 * Le paramètre `source` du POST porte l'origine : le client peut déposer une
 * information n'importe où, elle finit toujours au même endroit et repart vers
 * les bons agents. C'est la demande du fondateur — Clara redistribue, et un
 * agent qui apprend quelque chose le remonte à Clara.
 */

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function utilisateur(req: NextRequest): Promise<string | null> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) {
    return req.nextUrl.searchParams.get('user_id');
  }
  const { user } = await getAuthUser();
  return user?.id ?? null;
}

export async function GET(req: NextRequest) {
  const userId = await utilisateur(req);
  if (!userId) return NextResponse.json({ ok: false, error: 'Non authentifié' }, { status: 401 });

  const supabase = sb();
  const { data: profil } = await supabase
    .from('profiles').select('subscription_plan, is_admin, business_type').eq('id', userId).maybeSingle();

  const dossier = await loadBusinessDossier(supabase, userId);
  const agentsActifs = getVisibleAgents((profil as any)?.subscription_plan || 'free', (profil as any)?.is_admin)
    .map((a: any) => a.id);

  const metier = dossier?.business_type || (profil as any)?.business_type || null;
  const renseigne = clesRenseignees(dossier);
  const besoins = besoinsPour({ businessType: metier, agentsActifs, dejaRenseigne: renseigne });
  const suivante = await prochaineQuestion(supabase, userId, agentsActifs);

  return NextResponse.json({
    ok: true,
    metier,
    renseignes: renseigne.length,
    restants: besoins.length,
    // Le décompte par priorité permet à l'interface de montrer une progression
    // honnête : « il te reste 3 informations essentielles » est plus motivant
    // et plus juste que « 24 champs à remplir ».
    par_priorite: {
      essentiel: besoins.filter(b => b.priorite === 'essentiel').length,
      important: besoins.filter(b => b.priorite === 'important').length,
      optionnel: besoins.filter(b => b.priorite === 'optionnel').length,
    },
    besoins: besoins.map(b => ({
      cle: b.cle, question: b.question, a_quoi_ca_sert: b.aQuoiCaSert,
      priorite: b.priorite, type: b.type, exemple: b.exemple, options: b.options,
      agents: b.agents,
    })),
    prochaine: suivante ? { cle: suivante.besoin.cle, formulation: suivante.formulation } : null,
  });
}

export async function POST(req: NextRequest) {
  const userId = await utilisateur(req);
  if (!userId) return NextResponse.json({ ok: false, error: 'Non authentifié' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const infos = Array.isArray(body?.infos) ? body.infos : [body];
  const source = String(body?.source || 'clara');

  const supabase = sb();
  const resultats = [];
  for (const info of infos) {
    if (!info?.cle) continue;
    resultats.push(await enregistrerInfo(supabase, userId, {
      cle: String(info.cle), valeur: String(info.valeur ?? ''), source, brut: info.brut,
    }));
  }

  // Les agents avertis sont renvoyés pour que l'interface puisse le dire au
  // client : « c'est noté, Léna et le chatbot en tiendront compte ». C'est ce
  // qui rend la redistribution visible au lieu de rester un détail technique.
  const avertis = [...new Set(resultats.flatMap(r => r.agentsAvertis))];
  return NextResponse.json({
    ok: true,
    enregistres: resultats.filter(r => r.enregistre).length,
    agents_avertis: avertis,
    details: resultats,
  });
}
