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
 * ── Sur le rythme : deux cadences, pas une ──
 *
 * Cadence décidée par le fondateur (2026-08-05) : « on analyse chaque semaine
 * et on ajuste chaque mois — ça fait pluri-analyses et facteurs pour optimiser
 * la pertinence sur les horaires par exemple, mais aussi le contenu ».
 *
 * C'est la bonne séparation, et pour une raison statistique : une semaine de
 * publication d'un commerce local, c'est une dizaine de posts. Décider sur dix
 * observations revient à suivre le bruit — un post qui perce un mardi ferait
 * basculer toute la stratégie. Quatre relevés hebdomadaires donnent en
 * revanche une base solide, et permettent de distinguer une tendance d'un
 * accident.
 *
 *   RELEVÉ (hebdomadaire) — on mesure et on archive. Aucun appel modèle, donc
 *   gratuit. C'est la matière première.
 *
 *   AJUSTEMENT (mensuel) — Ami lit les quatre relevés, décide, et donne ses
 *   ordres. Un seul appel modèle par client et par mois.
 *
 * ── Sur le coût ──
 *
 * Cette séparation divise la dépense par rapport à une décision fréquente :
 * les mesures ne coûtent rien, seule la décision est payante. Et un client
 * dont rien n'a bougé est sauté même le jour de l'ajustement.
 */

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** Fenêtre du relevé hebdomadaire : la semaine écoulée, comparée à la précédente. */
const FENETRE_RELEVE_JOURS = 7;

/** Fenêtre de l'ajustement mensuel : le mois écoulé, comparé au précédent. */
const FENETRE_AJUSTEMENT_JOURS = 30;

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

/**
 * RELEVÉ hebdomadaire — on mesure, on archive, on ne décide pas.
 *
 * Aucun appel modèle : c'est ce qui rend la fréquence hebdomadaire gratuite, et
 * donc tenable. Les quatre relevés du mois nourriront l'ajustement.
 */
async function releverClient(supabase: any, client: any) {
  const userId = client.id;
  const resultats = await collecterResultats(supabase, userId, FENETRE_RELEVE_JOURS);

  await supabase.from('agent_logs').insert({
    agent: 'amit', action: 'ami_releve', status: 'ok', user_id: userId,
    data: { resultats, fenetre_jours: FENETRE_RELEVE_JOURS },
    created_at: new Date().toISOString(),
  });

  const observations = resultats.canaux.reduce(
    (s, c) => s + Math.max(0, ...Object.values(c.metriques).map(m => m.echantillon)), 0,
  );
  return { userId, statut: 'releve', observations, canaux_actifs: resultats.canaux.filter(c => c.actif).length };
}

/**
 * Les relevés hebdomadaires du mois, en texte.
 *
 * C'est ce qui donne à Ami la profondeur que demande le fondateur : elle ne
 * voit pas un instantané mais une trajectoire sur quatre semaines, ce qui lui
 * permet de distinguer une progression réelle d'un bon jour isolé.
 */
async function relevesDuMois(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from('agent_logs')
    .select('data, created_at')
    .eq('agent', 'amit')
    .eq('action', 'ami_releve')
    .eq('user_id', userId)
    .gte('created_at', new Date(Date.now() - 35 * 86400000).toISOString())
    .order('created_at', { ascending: true })
    .limit(10);

  if (!data?.length) return 'Aucun relevé hebdomadaire disponible : décide sur la seule fenêtre mensuelle.';

  return (data as any[]).map((r) => {
    const semaine = new Date(r.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    const lignes: string[] = [];
    for (const c of r.data?.resultats?.canaux || []) {
      if (!c.actif) continue;
      const chiffres = Object.entries(c.metriques)
        .filter(([, m]: any) => m.valeur !== null)
        .map(([nom, m]: any) => `${nom}=${m.valeur}(n=${m.echantillon})`)
        .join(' ');
      if (chiffres) lignes.push(`    ${c.canal} : ${chiffres}`);
    }
    return `  Semaine du ${semaine}\n${lignes.join('\n') || '    aucune activité'}`;
  }).join('\n');
}

/**
 * AJUSTEMENT mensuel — Ami lit les relevés, décide, ordonne.
 */
async function traiterClient(supabase: any, client: any) {
  const userId = client.id;

  // ── 1. Juger le passé avant de décider du futur ──────────────────────────
  const resultats = await collecterResultats(supabase, userId, FENETRE_AJUSTEMENT_JOURS);
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

  const messageAnalyse = getAmiStrategyPrompt({
    business,
    relevé: [
      resultatsEnTexte(resultats),
      '',
      'TRAJECTOIRE — relevés hebdomadaires du mois écoulé',
      await relevesDuMois(supabase, userId),
    ].join('\n'),
    historique: await historiqueOrdres(supabase, userId),
    verdicts: verdicts.length
      ? verdicts.map(v => `- ${v.agent}/${v.type} sur ${v.metrique} : ${v.avant} → ${v.apres} — ${v.verdict}, ${v.action} (${v.commentaire})`).join('\n')
      : '',
    directivesClient,
  });

  // Le budget de sortie est PARTAGÉ avec le raisonnement : à 3000 tokens, la
  // réflexion consommait la place et le JSON sortait tronqué en plein milieu.
  // 8000 laissent de quoi raisonner ET conclure ; le cycle ne tourne au plus
  // que deux fois par jour et par client, la dépense reste marginale.
  let reponse = await callGemini({
    system: getAmiStrategySystemPrompt(),
    message: messageAnalyse,
    maxTokens: 8000,
    thinking: true,
  });
  let plan = parserJson(reponse);

  // Rattrapage : sans raisonnement, tout le budget passe dans la réponse. On
  // préfère une décision un peu moins fouillée à un cycle perdu.
  if (!plan) {
    reponse = await callGemini({
      system: getAmiStrategySystemPrompt(),
      message: messageAnalyse,
      maxTokens: 8000,
      thinking: false,
    });
    plan = parserJson(reponse);
  }

  if (!plan) {
    await supabase.from('agent_logs').insert({
      agent: 'amit', action: 'ami_cycle', status: 'error', user_id: userId,
      data: { erreur: 'réponse non parsable même sans raisonnement', extrait: reponse.slice(-1200) },
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
      fenetre_jours: FENETRE_AJUSTEMENT_JOURS,
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

  // `mode=releve` mesure et archive (hebdomadaire, gratuit) ;
  // `mode=ajustement` décide et ordonne (mensuel, un appel modèle par client).
  const mode = req.nextUrl.searchParams.get('mode') === 'ajustement' ? 'ajustement' : 'releve';

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
      // Le relevé est gratuit : on le prend systématiquement, même si peu de
      // choses ont bougé — une semaine calme est elle-même une information.
      if (mode === 'releve') { resultats.push(await releverClient(supabase, client)); continue; }

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
    mode,
    clients_examines: resultats.length,
    releves: resultats.filter(r => r.statut === 'releve').length,
    ajustements: resultats.filter(r => r.statut === 'ok').length,
    sautes: resultats.filter(r => r.statut === 'saute').length,
    ordres_donnes: resultats.reduce((s, r) => s + (r.ordres || 0), 0),
    resultats,
  });
}
