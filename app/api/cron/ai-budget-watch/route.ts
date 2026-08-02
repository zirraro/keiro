import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendBrevoCompat } from '@/lib/email/brevo-compat';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Surveillance horaire du budget IA.
 *
 * Demande du fondateur (2026-08-01) : « j'ai mis 37 USD consommés en 24h, il
 * faut maîtriser le budget et identifier les sources de consommation […] je
 * dois être alerté rapidement pour prendre des décisions », et surtout :
 * « SANS COUPER LES FLUX ».
 *
 * Le contrôle quotidien existant (daily-cost-check) projette la marge à fin de
 * mois. C'est utile, mais trop lent : une boucle qui s'emballe à 2h du matin
 * vide le crédit avant le rapport du lendemain. Celui-ci tourne toutes les
 * heures et regarde ce qui vient de se passer.
 *
 * Ce module N'ARRÊTE RIEN. Il alerte. Couper un agent automatiquement
 * paraîtrait prudent, mais un faux positif arrêterait la production de tous les
 * clients un dimanche matin — le remède serait pire que le mal. La décision de
 * couper reste humaine ; notre travail est de la rendre possible à temps.
 *
 * Trois signaux, du plus urgent au moins urgent :
 *
 *   1. RAFALE — la dernière heure dépasse le plafond horaire. C'est le signal
 *      qui aurait vu les 37 USD partir. Alerte immédiate.
 *   2. JOURNÉE — les 24 dernières heures dépassent le budget quotidien.
 *   3. DÉRIVE — un agent consomme plus de 3× sa moyenne des 7 jours. Utile
 *      quand le total reste normal mais qu'un agent part en boucle.
 *
 * Pour éviter de harceler : une même alerte n'est pas renvoyée avant 4 heures.
 */

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** Plafonds, en euros. Ajustables sans redéploiement via l'environnement. */
const PLAFOND_HORAIRE = Number(process.env.AI_BUDGET_HOURLY_EUR || 3);
const PLAFOND_JOURNALIER = Number(process.env.AI_BUDGET_DAILY_EUR || 25);
const FACTEUR_DERIVE = Number(process.env.AI_BUDGET_DRIFT_FACTOR || 3);
const SILENCE_HEURES = 4;

const DESTINATAIRE = process.env.ADMIN_ALERT_EMAIL || 'contact@keiroai.com';

interface Ligne { provider: string | null; agent: string | null; cost_eur: number | null; kind: string | null; metadata: any; created_at: string }

/** Somme paginée : PostgREST plafonne à 1 000 lignes, une somme tronquée ment. */
async function lireEvenements(supabase: any, depuis: string): Promise<Ligne[]> {
  const PAS = 1000;
  let de = 0;
  const tout: Ligne[] = [];
  for (;;) {
    const { data, error } = await supabase
      .from('api_cost_events')
      .select('provider, agent, cost_eur, kind, metadata, created_at')
      .gte('created_at', depuis)
      .order('created_at')
      .range(de, de + PAS - 1);
    if (error || !data) break;
    tout.push(...data);
    if (data.length < PAS) break;
    de += PAS;
    if (de > 50000) break; // garde-fou : au-delà, l'alerte part de toute façon
  }
  return tout;
}

const somme = (rows: Ligne[]) => rows.reduce((s, r) => s + (Number(r.cost_eur) || 0), 0);

function grouper(rows: Ligne[], cle: 'provider' | 'agent'): Array<[string, number, number]> {
  const m: Record<string, { c: number; n: number }> = {};
  for (const r of rows) {
    const k = (r[cle] as string) || 'inconnu';
    m[k] = m[k] || { c: 0, n: 0 };
    m[k].c += Number(r.cost_eur) || 0;
    m[k].n++;
  }
  return Object.entries(m).map(([k, v]) => [k, v.c, v.n] as [string, number, number]).sort((a, b) => b[1] - a[1]);
}

/** Une alerte déjà envoyée récemment n'est pas renvoyée. */
async function dejaAlerte(supabase: any, cle: string): Promise<boolean> {
  const depuis = new Date(Date.now() - SILENCE_HEURES * 3600_000).toISOString();
  const { data } = await supabase
    .from('agent_logs')
    .select('id')
    .eq('agent', 'ops')
    .eq('action', `budget_alert_${cle}`)
    .gte('created_at', depuis)
    .limit(1);
  return !!(data && data.length);
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = sb();
  const maintenant = Date.now();
  const il1h = new Date(maintenant - 3600_000).toISOString();
  const il24h = new Date(maintenant - 24 * 3600_000).toISOString();
  const il7j = new Date(maintenant - 7 * 24 * 3600_000).toISOString();

  const sur7j = await lireEvenements(supabase, il7j);
  const sur24h = sur7j.filter(r => r.created_at >= il24h);
  const sur1h = sur7j.filter(r => r.created_at >= il1h);

  const coutHeure = somme(sur1h);
  const coutJour = somme(sur24h);

  const alertes: Array<{ cle: string; titre: string; corps: string }> = [];

  // ── 1. Rafale sur la dernière heure ──
  if (coutHeure > PLAFOND_HORAIRE) {
    const parAgent = grouper(sur1h, 'agent').slice(0, 5);
    const parFournisseur = grouper(sur1h, 'provider');
    alertes.push({
      cle: 'rafale',
      titre: `🔥 Rafale IA : ${coutHeure.toFixed(2)}€ en 1 heure (plafond ${PLAFOND_HORAIRE}€)`,
      corps: [
        `Dépense de la dernière heure : <b>${coutHeure.toFixed(2)}€</b> — plafond ${PLAFOND_HORAIRE}€.`,
        `Au rythme actuel : ${(coutHeure * 24).toFixed(0)}€/jour, ${(coutHeure * 720).toFixed(0)}€/mois.`,
        '',
        '<b>Qui consomme :</b>',
        ...parAgent.map(([a, c, n]) => `&nbsp;&nbsp;• ${a} — ${c.toFixed(2)}€ (${n} appels)`),
        '',
        '<b>Par fournisseur :</b>',
        ...parFournisseur.map(([p, c, n]) => `&nbsp;&nbsp;• ${p} — ${c.toFixed(2)}€ (${n} appels)`),
      ].join('<br>'),
    });
  }

  // ── 2. Journée au-dessus du budget ──
  if (coutJour > PLAFOND_JOURNALIER) {
    const parAgent = grouper(sur24h, 'agent').slice(0, 6);
    alertes.push({
      cle: 'journee',
      titre: `💸 Budget IA dépassé : ${coutJour.toFixed(2)}€ sur 24h (budget ${PLAFOND_JOURNALIER}€)`,
      corps: [
        `Dépense sur 24 heures : <b>${coutJour.toFixed(2)}€</b> — budget ${PLAFOND_JOURNALIER}€.`,
        `Projection mensuelle : ${(coutJour * 30).toFixed(0)}€.`,
        '',
        '<b>Qui consomme :</b>',
        ...parAgent.map(([a, c, n]) => `&nbsp;&nbsp;• ${a} — ${c.toFixed(2)}€ (${n} appels)`),
      ].join('<br>'),
    });
  }

  // ── 3. Dérive d'un agent par rapport à sa moyenne ──
  const moyenneJourParAgent: Record<string, number> = {};
  for (const [a, c] of grouper(sur7j, 'agent')) moyenneJourParAgent[a] = c / 7;
  const derives = grouper(sur24h, 'agent')
    .filter(([a, c]) => {
      const moy = moyenneJourParAgent[a] || 0;
      return moy > 0.5 && c > moy * FACTEUR_DERIVE;
    })
    .slice(0, 4);
  if (derives.length) {
    alertes.push({
      cle: 'derive',
      titre: `📈 Dérive de consommation : ${derives.map(d => d[0]).join(', ')}`,
      corps: [
        `Ces agents consomment plus de ${FACTEUR_DERIVE}× leur moyenne des 7 derniers jours :`,
        '',
        ...derives.map(([a, c, n]) =>
          `&nbsp;&nbsp;• <b>${a}</b> — ${c.toFixed(2)}€ sur 24h contre ${(moyenneJourParAgent[a] || 0).toFixed(2)}€/jour habituellement (${n} appels)`),
        '',
        'Une boucle ou une relance en rafale est le cas le plus fréquent.',
      ].join('<br>'),
    });
  }

  // ── Envoi ──
  const envoyees: string[] = [];
  for (const a of alertes) {
    if (await dejaAlerte(supabase, a.cle)) continue;
    try {
      await sendBrevoCompat({
        to: [{ email: DESTINATAIRE }],
        subject: a.titre,
        htmlContent: [
          `<div style="font-family:system-ui,sans-serif;max-width:640px">`,
          `<h2 style="margin:0 0 12px">${a.titre}</h2>`,
          `<div style="color:#333;line-height:1.7">${a.corps}</div>`,
          `<p style="margin-top:20px;color:#666;font-size:13px">`,
          `Aucun agent n'a été arrêté — les flux tournent toujours. Cette alerte`,
          ` sert à décider, pas à subir.<br>`,
          `Plafonds réglables : AI_BUDGET_HOURLY_EUR (${PLAFOND_HORAIRE}€),`,
          ` AI_BUDGET_DAILY_EUR (${PLAFOND_JOURNALIER}€).`,
          `</p></div>`,
        ].join(''),
      });
      await supabase.from('agent_logs').insert({
        agent: 'ops',
        action: `budget_alert_${a.cle}`,
        status: 'success',
        data: { titre: a.titre, cout_heure: coutHeure, cout_jour: coutJour },
      });
      envoyees.push(a.cle);
    } catch (e: any) {
      console.error('[budget-watch] envoi échoué:', e?.message);
    }
  }

  return NextResponse.json({
    ok: true,
    cout_1h: Math.round(coutHeure * 100) / 100,
    cout_24h: Math.round(coutJour * 100) / 100,
    plafond_horaire: PLAFOND_HORAIRE,
    plafond_journalier: PLAFOND_JOURNALIER,
    alertes_declenchees: alertes.map(a => a.cle),
    alertes_envoyees: envoyees,
    top_agents_24h: grouper(sur24h, 'agent').slice(0, 8).map(([a, c, n]) => ({ agent: a, eur: Math.round(c * 100) / 100, appels: n })),
    par_fournisseur_24h: grouper(sur24h, 'provider').map(([p, c, n]) => ({ fournisseur: p, eur: Math.round(c * 100) / 100, appels: n })),
  });
}
