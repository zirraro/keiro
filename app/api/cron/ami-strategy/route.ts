import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { callGemini } from '@/lib/agents/gemini';
import { collecterResultats, resultatsEnTexte } from '@/lib/agents/ami-results';
import {
  appliquerOrdres, evaluerOrdresPasses, historiqueOrdres,
  ECHANTILLON_MINIMUM, type OrdreAmi,
} from '@/lib/agents/ami-orders';
import { getAmiStrategySystemPrompt, getAmiStrategyPrompt } from '@/lib/agents/ami-strategy-prompt';
import { directiveBlockFor } from '@/lib/agents/typed-directives';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * AMI — cycle de pilotage marketing, client par client.
 *
 * La boucle complète, dans l'ordre :
 *   1. juger les ordres précédents arrivés à échéance (et retirer les inutiles)
 *   2. relever les résultats réels de tous les canaux
 *   3. décider — ou constater qu'il n'y a pas de quoi décider
 *   4. écrire les ordres, que les agents liront dès leur prochaine exécution
 *
 * ── Sur le rythme ──
 *
 * Le fondateur demande « une adaptation à rythme soutenu ». Soutenu ne veut pas
 * dire permanent : un cycle qui repasse sur des données inchangées ne peut rien
 * apprendre de neuf, il ne fait que consommer des crédits et produire du
 * changement pour le changement. On tourne donc deux fois par jour, mais on
 * saute tout client dont rien n'a bougé depuis le dernier cycle. Le rythme est
 * dicté par l'arrivée des résultats, pas par l'horloge.
 *
 * ── Sur le coût ──
 *
 * Un appel modèle par client et par cycle utile, jamais plus. Le saut sur
 * données inchangées est ce qui rend la fréquence tenable ; sans lui, la
 * facture doublerait pour zéro information supplémentaire.
 */

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** Fenêtre d'observation. Assez large pour lisser, assez courte pour réagir. */
const FENETRE_JOURS = 14;

/** En deçà, on ne relance pas de cycle : rien de neuf à juger. */
const MIN_NOUVEAUTES = 3;

/**
 * Y a-t-il matière à un nouveau cycle ?
 *
 * On compare l'activité depuis le dernier passage d'Ami. Sans ce filtre, un
 * client en vacances verrait sa stratégie « ajustée » deux fois par jour sur
 * des chiffres figés — exactement le genre d'agitation qui décrédibilise une
 * direction.
 */
async function matiereANouveauCycle(supabase: any, userId: string): Promise<{ oui: boolean; raison: string }> {
  const { data: dernier } = await supabase
    .from('agent_logs')
    .select('created_at')
    .eq('agent', 'amit')
    .eq('action', 'ami_cycle')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!dernier) return { oui: true, raison: 'premier cycle' };

  const depuis = (dernier as any).created_at;
  const { count: posts } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('published_at', depuis);

  const { count: prospects } = await supabase
    .from('crm_prospects')
    .select('id', { count: 'exact', head: true })
    .eq('created_by', userId)
    .gte('updated_at', depuis);

  const total = (posts || 0) + (prospects || 0);
  return total >= MIN_NOUVEAUTES
    ? { oui: true, raison: `${total} éléments nouveaux depuis le dernier cycle` }
    : { oui: false, raison: `seulement ${total} éléments nouveaux — rien à réanalyser` };
}

/** Extrait le JSON d'une réponse modèle, tolérant aux backticks. */
function parserJson(brut: string): any | null {
  const nettoye = brut.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(nettoye); } catch { /* on tente le sauvetage */ }
  const m = nettoye.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

async function traiterClient(supabase: any, client: any) {
  const userId = client.id;

  // ── 1. Juger le passé avant de décider du futur ──────────────────────────
  const resultats = await collecterResultats(supabase, userId, FENETRE_JOURS);
  const verdicts = await evaluerOrdresPasses(supabase, userId, resultats);

  // ── 2. Y a-t-il de quoi décider ? ────────────────────────────────────────
  const observations = resultats.canaux.reduce(
    (s, c) => s + Math.max(0, ...Object.values(c.metriques).map(m => m.echantillon)), 0,
  );
  if (observations < ECHANTILLON_MINIMUM) {
    await supabase.from('agent_logs').insert({
      agent: 'amit', action: 'ami_cycle', status: 'ok', user_id: userId,
      data: {
        decision: 'aucune',
        raison: `échantillon global insuffisant (${observations} observations, minimum ${ECHANTILLON_MINIMUM})`,
        verdicts, resultats,
      },
      created_at: new Date().toISOString(),
    });
    return { userId, statut: 'echantillon_insuffisant', observations, ordres: 0, verdicts: verdicts.length };
  }

  // ── 3. Décider ───────────────────────────────────────────────────────────
  const business = [
    `Nom : ${client.company_name || client.first_name || 'commerce'}`,
    client.business_type ? `Activité : ${client.business_type}` : null,
    client.city ? `Ville : ${client.city}` : null,
    `Plan : ${client.subscription_plan}`,
  ].filter(Boolean).join('\n');

  const directivesClient = (
    await Promise.all(['content', 'dm', 'email', 'commercial'].map(a => directiveBlockFor(supabase, userId, a)))
  ).filter(Boolean).join('\n');

  const reponse = await callGemini({
    system: getAmiStrategySystemPrompt(),
    message: getAmiStrategyPrompt({
      business,
      relevé: resultatsEnTexte(resultats),
      historique: await historiqueOrdres(supabase, userId),
      verdicts: verdicts.length
        ? verdicts.map(v => `- ${v.agent}/${v.type} sur ${v.metrique} : ${v.avant} → ${v.apres} — ${v.verdict}, ${v.action} (${v.commentaire})`).join('\n')
        : '',
      directivesClient,
    }),
    maxTokens: 3000,
    thinking: true,
  });

  const plan = parserJson(reponse);
  if (!plan) {
    await supabase.from('agent_logs').insert({
      agent: 'amit', action: 'ami_cycle', status: 'error', user_id: userId,
      data: { erreur: 'réponse non parsable', extrait: reponse.slice(0, 400) },
      created_at: new Date().toISOString(),
    });
    return { userId, statut: 'reponse_illisible', ordres: 0, verdicts: verdicts.length };
  }

  // ── 4. Appliquer ─────────────────────────────────────────────────────────
  const ordres: OrdreAmi[] = (plan.ordres || []).slice(0, 3).map((o: any) => ({
    agent: o.agent,
    type: o.type,
    value: o.value,
    justification: String(o.justification || '').slice(0, 400),
    metrique: String(o.metrique || ''),
    valeurAvant: typeof o.valeur_avant === 'number' ? o.valeur_avant : null,
    canal: String(o.canal || ''),
    effetAttendu: String(o.effet_attendu || '').slice(0, 300),
  }));

  const { appliques, refuses } = await appliquerOrdres(supabase, userId, ordres);

  await supabase.from('agent_logs').insert({
    agent: 'amit', action: 'ami_cycle', status: 'ok', user_id: userId,
    data: {
      diagnostic: plan.diagnostic,
      message_au_commercant: plan.message_au_commercant,
      a_surveiller: plan.a_surveiller,
      ordres_appliques: appliques,
      ordres_refuses: refuses,
      verdicts,
      fenetre_jours: FENETRE_JOURS,
    },
    created_at: new Date().toISOString(),
  });

  return {
    userId, statut: 'ok',
    ordres: appliques.length, refuses: refuses.length, verdicts: verdicts.length,
    constat: plan.diagnostic?.constat_principal,
  };
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ ok: false, error: 'GEMINI_API_KEY absente' }, { status: 500 });
  }

  const supabase = sb();
  const cible = req.nextUrl.searchParams.get('user_id');
  const forcer = req.nextUrl.searchParams.get('force') === '1';

  let requete = supabase
    .from('profiles')
    .select('id, email, company_name, first_name, business_type, city, subscription_plan, is_admin')
    .neq('subscription_plan', 'free')
    .not('subscription_plan', 'is', null)
    .limit(500);
  if (cible) requete = requete.eq('id', cible);

  const { data: clients, error } = await requete;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const resultats: any[] = [];
  for (const client of clients || []) {
    if (client.is_admin && !cible) continue;
    try {
      if (!forcer) {
        const { oui, raison } = await matiereANouveauCycle(supabase, client.id);
        if (!oui) { resultats.push({ userId: client.id, statut: 'saute', raison }); continue; }
      }
      resultats.push(await traiterClient(supabase, client));
    } catch (e: any) {
      // Un client qui échoue ne doit jamais interrompre la tournée des autres.
      resultats.push({ userId: client.id, statut: 'erreur', erreur: String(e?.message || e).slice(0, 200) });
    }
  }

  return NextResponse.json({
    ok: true,
    clients_examines: resultats.length,
    cycles_joues: resultats.filter(r => r.statut === 'ok').length,
    sautes: resultats.filter(r => r.statut === 'saute').length,
    ordres_donnes: resultats.reduce((s, r) => s + (r.ordres || 0), 0),
    resultats,
  });
}
