import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * « Est-ce que tout roule côté worker et crons ? » — la réponse quotidienne.
 *
 * ── Pourquoi cette route ne peut PAS être appelée par le worker ──
 *
 * C'est tout l'enjeu, et c'est ce qui a manqué le 19 août. Le worker était
 * arrêté depuis un moment : il porte TOUS les crons — publications, DM,
 * génération, relances — donc les clients ne recevaient plus rien. Aucun
 * signal n'est remonté, pour une raison mécanique : le contrôle censé
 * surveiller le worker tournait DANS le worker. Un processus mort ne signale
 * pas sa propre mort.
 *
 * Le fondateur : « d'où l'intérêt d'avoir un fallback ou 2 ».
 *
 * D'où l'architecture : cette route est déclenchée depuis GitHub Actions
 * (.github/workflows/sante-quotidienne.yml), qui ne tourne ni sur le VPS ni
 * dans le worker. Si le VPS entier tombe, l'appel échoue et GitHub le marque
 * en rouge — la panne devient visible au lieu d'être silencieuse.
 *
 * Le worker reste un second déclencheur : deux chemins valent mieux qu'un, et
 * l'envoi est protégé contre le doublon quotidien plus bas.
 *
 * ── Ce qu'on regarde ──
 *
 * Le battement (worker/scheduler.mjs) écrit une ligne par minute travaillée.
 * Sa FRAÎCHEUR est le seul indicateur fiable : un battement de moins de 5 min
 * prouve que le worker tourne à l'instant. Au-delà de 15 min, il est mort ou
 * bloqué, et c'est une urgence — pas un avertissement.
 *
 * On compte aussi les crons des 24 h et leurs échecs, pour distinguer « le
 * worker tourne mais les tâches échouent » de « plus rien ne tourne ». Les deux
 * demandent des gestes différents.
 */

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const supabase = sb();
  const maintenant = Date.now();
  const il24h = new Date(maintenant - 24 * 3600_000).toISOString();

  // ── Le worker respire-t-il ? ──
  const { data: battements } = await supabase
    .from('agent_logs').select('created_at')
    .eq('action', 'worker_battement')
    .order('created_at', { ascending: false }).limit(1);

  const dernier = battements?.[0]?.created_at ? new Date(battements[0].created_at).getTime() : null;
  const minutes = dernier ? Math.round((maintenant - dernier) / 60_000) : null;

  // Jamais de battement = worker mort OU version trop ancienne pour en écrire.
  // On ne tranche pas à sa place : on dit ce qu'on observe.
  const vivant = minutes !== null && minutes <= 15;

  // ── Les tâches passent-elles ? ──
  const { data: taches } = await supabase
    .from('agent_logs').select('status')
    .gte('created_at', il24h).limit(2000);

  const total = taches?.length ?? 0;
  const echecs = (taches ?? []).filter((t: any) => t.status === 'error').length;

  // ── Un fournisseur bloque-t-il la production ? ──
  const { data: fournisseurs } = await supabase
    .from('agent_logs').select('error_message')
    .eq('action', 'fournisseur_indisponible')
    .gte('created_at', il24h).limit(1);

  const etat = {
    worker: vivant ? 'vivant' : minutes === null ? 'AUCUN BATTEMENT' : `MUET DEPUIS ${minutes} MIN`,
    dernier_battement_min: minutes,
    taches_24h: total,
    echecs_24h: echecs,
    fournisseur: fournisseurs?.[0]?.error_message ?? null,
  };

  const alerte = !vivant || !!fournisseurs?.length;

  // ── Le mail : une fois par jour, ou tout de suite si ça ne tourne plus ──
  //
  // Règle du fondateur : une alerte qui répète une décision déjà prise est du
  // bruit. Le bilan quotidien part une fois ; l'urgence, elle, ne se throttle
  // pas — un worker mort coûte des publications à chaque heure de retard.
  try {
    const { data: dejaEnvoye } = await supabase
      .from('agent_logs').select('id')
      .eq('action', 'sante_worker_envoyee')
      .gte('created_at', new Date(maintenant - 20 * 3600_000).toISOString()).limit(1);

    if (!dejaEnvoye?.length || alerte) {
      const { sendEmailWithFallback } = await import('@/lib/email/send-with-fallback');
      await sendEmailWithFallback({
        to: 'contact@keiroai.com',
        subject: alerte
          ? `🔴 KeiroAI — ${!vivant ? 'le worker ne tourne plus' : 'fournisseur bloqué'}`
          : `✅ KeiroAI — worker et crons OK (${total} tâches / 24 h)`,
        html: `
<h2 style="font-family:system-ui">${alerte ? 'Quelque chose ne tourne pas' : 'Tout roule'}</h2>
<table style="font-family:system-ui;border-collapse:collapse">
  <tr><td style="padding:6px 14px 6px 0">Worker</td><td><strong>${etat.worker}</strong></td></tr>
  <tr><td style="padding:6px 14px 6px 0">Dernier battement</td><td>${minutes === null ? 'jamais' : `il y a ${minutes} min`}</td></tr>
  <tr><td style="padding:6px 14px 6px 0">Tâches sur 24 h</td><td>${total}</td></tr>
  <tr><td style="padding:6px 14px 6px 0">Échecs sur 24 h</td><td>${echecs}${total ? ` (${Math.round(echecs / total * 100)} %)` : ''}</td></tr>
  ${etat.fournisseur ? `<tr><td style="padding:6px 14px 6px 0">Fournisseur</td><td style="color:#c00"><strong>${etat.fournisseur}</strong></td></tr>` : ''}
</table>
${!vivant ? `<p style="font-family:system-ui;color:#c00"><strong>Le worker ne bat plus.</strong> Il porte tous les crons : publications, DM, génération, relances. Tant qu'il est arrêté, les clients ne reçoivent rien — et rien d'autre ne le signalera.</p>
<p style="font-family:system-ui">Sur le VPS : <code>pm2 list</code>, puis <code>pm2 restart keiro-worker</code>. Si l'entrée est absente ou en erreur, la relancer AVEC son environnement :<br>
<code>pm2 start worker/scheduler.mjs --name keiro-worker --time --node-args='--env-file=/opt/keiro/.env.local'</code><br>
Sans <code>--env-file</code>, il démarre puis meurt sur <code>CRON_SECRET env var is required</code>.</p>` : ''}
<p style="font-family:system-ui;color:#888;font-size:12px">Contrôle déclenché depuis GitHub Actions, hors du VPS : si le serveur tombe entièrement, l'appel échoue et l'exécution passe au rouge.</p>`,
      });

      await supabase.from('agent_logs').insert({
        agent: 'ops', action: 'sante_worker_envoyee',
        status: alerte ? 'warning' : 'ok',
        data: etat, created_at: new Date().toISOString(),
      });
    }
  } catch (e: any) {
    console.warn('[Santé worker] mail non envoyé :', e?.message);
  }

  return NextResponse.json({ ok: true, alerte, etat });
}
