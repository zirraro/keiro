#!/usr/bin/env node
/**
 * Back-test d'après déploiement : toutes les fonctions répondent-elles encore ?
 *
 * ── Pourquoi ──
 *
 * Fondateur, 2026-08-11 : « vérifier que quand on fait une mise à jour ça ne
 * coupe pas le site et ses fonctions pour le client, et surtout ensuite qu'on
 * a bien déployé et que toutes nos mises à jour sont bien fonctionnelles, donc
 * test workflow et back-tests systématiques » — et « il ne faut surtout pas
 * faire sauter une fonction en mettant à jour une autre ».
 *
 * La journée lui donne entièrement raison. Le déploiement ne vérifiait qu'une
 * chose : que /api/version renvoie le bon commit. C'est-à-dire qu'UNE route
 * répond. Tout le reste pouvait être mort sans que rien ne le dise :
 *
 *   · 5 août — des manifestes manquants ont rendu des routes 500 ; le client
 *     voyait sa galerie, ses vidéos et ses brouillons VIDES, rien n'alertait ;
 *   · 11 août — pm2 a lancé un script inerte au lieu de l'application ; il
 *     affichait « online », et le déploiement s'est cru réussi.
 *
 * Un déploiement n'est pas réussi parce qu'il s'est terminé. Il est réussi
 * quand les fonctions du client répondent encore.
 *
 * ── Ce qu'on vérifie, et ce qu'on ne vérifie pas ──
 *
 * On appelle le site PUBLIC, comme un client. Pas de base de données, pas de
 * secret : ce test doit pouvoir tourner de n'importe où, y compris depuis un
 * runner GitHub.
 *
 * Une route protégée doit répondre 401 — pas 500. C'est le point important :
 * un 401 prouve que la route existe, qu'elle s'est chargée et qu'elle a
 * exécuté son contrôle d'accès. Un 500 sur la même route est le symptôme
 * exact du 5 août.
 *
 * On vérifie aussi du CONTENU sur les pages qui en vivent : une page qui
 * renvoie 200 en étant vide est le pire des cas, elle passe tous les
 * contrôles d'état et ne sert rien.
 *
 * Usage : node scripts/back-test.mjs [url] [sha-attendu]
 */

const BASE = (process.argv[2] || 'https://keiroai.com').replace(/\/$/, '');
const SHA_ATTENDU = process.argv[3] || '';

/**
 * `attendu` : un code, ou une liste. Une page publique peut légitimement
 * rediriger (307) selon la connexion — on ne veut pas d'un test qui crie au
 * loup à chaque évolution de routage. Ce qu'on refuse toujours, c'est 5xx.
 */
const VERIFICATIONS = [
  // ── Les pages que voit un visiteur ──
  { chemin: '/',            attendu: [200], contient: 'Keiro', quoi: 'accueil' },
  { chemin: '/pricing',     attendu: [200], quoi: 'tarifs' },
  { chemin: '/agents',      attendu: [200], quoi: 'page agents (parcours prospect)' },
  { chemin: '/blog',        attendu: [200], contient: 'article', quoi: 'blog — liste non vide' },
  { chemin: '/generate',    attendu: [200], quoi: 'essai gratuit sans carte' },
  { chemin: '/essai',       attendu: [200, 307, 308], quoi: 'essai 7 jours' },
  { chemin: '/login',       attendu: [200], quoi: 'connexion' },
  // 308 : redirection permanente en place, constatée au premier passage du
  // back-test. Un test qui crie au loup sur un comportement voulu finit par
  // n'être plus lu — c'est la première chose qui tue une vérification.
  { chemin: '/offre',       attendu: [200, 307, 308], quoi: 'offre' },
  { chemin: '/support',     attendu: [200, 307, 308], quoi: 'support' },
  { chemin: '/robots.txt',  attendu: [200], quoi: 'robots' },
  { chemin: '/sitemap.xml', attendu: [200], quoi: 'sitemap' },

  // ── L'espace client (redirige ou s'affiche, jamais 500) ──
  { chemin: '/assistant',   attendu: [200, 307, 308], quoi: 'espace agents' },
  { chemin: '/studio',      attendu: [200, 307, 308], quoi: 'studio' },
  { chemin: '/library',     attendu: [200, 307, 308], quoi: 'bibliothèque' },
  { chemin: '/mon-compte',  attendu: [200, 307, 308], quoi: 'compte' },

  // ── Les API du client : 401 attendu, JAMAIS 500 ──
  //
  // C'est ici qu'on attrape le mode de panne du 5 août : la route se charge,
  // donc elle répond 401 ; si son manifeste manque, elle répond 500 et la
  // fonction correspondante est morte côté client.
  { chemin: '/api/me/quota-status',        attendu: [200, 401], quoi: 'quota client' },
  { chemin: '/api/me/addons',              attendu: [200, 401], quoi: 'add-ons (Stella)' },
  { chemin: '/api/me/free-trial-status',   attendu: [200, 401], quoi: 'statut essai' },
  { chemin: '/api/notifications',          attendu: [200, 401], quoi: 'notifications' },
  { chemin: '/api/library/scheduled-posts', attendu: [200, 401], quoi: 'publications programmées' },

  // ── Les crons : 401 sans clé prouve que la route vit ──
  { chemin: '/api/cron/rafraichir-planifies', attendu: [401], quoi: 'relecture de fraîcheur' },
  { chemin: '/api/cron/planning-cadence',     attendu: [401], quoi: 'remise à la cadence' },
  { chemin: '/api/cron/publish-scheduled',    attendu: [401], quoi: 'publication programmée' },
  { chemin: '/api/cron/auto-remediate',       attendu: [401], quoi: 'auto-remédiation' },

  // ── Le repère du déploiement ──
  { chemin: '/api/version', attendu: [200], quoi: 'version' },
];

async function appeler(chemin) {
  const debut = Date.now();
  try {
    const r = await fetch(`${BASE}${chemin}`, {
      redirect: 'manual',
      headers: { 'user-agent': 'keiro-backtest' },
      signal: AbortSignal.timeout(25000),
    });
    const corps = r.status < 400 ? (await r.text().catch(() => '')).slice(0, 60000) : '';
    return { code: r.status, corps, ms: Date.now() - debut };
  } catch (e) {
    return { code: 0, corps: '', ms: Date.now() - debut, erreur: e?.message || 'injoignable' };
  }
}

const echecs = [];
const lignes = [];

for (const v of VERIFICATIONS) {
  const r = await appeler(v.chemin);
  let souci = null;

  if (r.code === 0) souci = `injoignable (${r.erreur})`;
  else if (r.code >= 500) souci = `${r.code} — la route est cassée`;
  else if (!v.attendu.includes(r.code)) souci = `${r.code}, attendu ${v.attendu.join(' ou ')}`;
  else if (v.contient && r.code === 200 && !r.corps.toLowerCase().includes(v.contient.toLowerCase())) {
    // Une page qui répond 200 en étant vide passe tous les contrôles d'état
    // et ne sert rien : c'est le pire des cas, celui qu'on ne voit pas.
    souci = `200 mais « ${v.contient} » est absent — page vide ?`;
  }

  lignes.push(`${souci ? '✗' : '✓'} ${String(r.code).padStart(3)} ${String(r.ms).padStart(5)}ms  ${v.chemin.padEnd(34)} ${v.quoi}${souci ? `  ← ${souci}` : ''}`);
  if (souci) echecs.push({ ...v, souci });
}

// Le commit servi est-il celui qu'on vient de construire ?
if (SHA_ATTENDU) {
  const r = await appeler('/api/version');
  let servi = '';
  try { servi = JSON.parse(r.corps).shortSha || ''; } catch { /* corps illisible */ }
  const ok = servi.startsWith(SHA_ATTENDU.slice(0, 7));
  lignes.push(`${ok ? '✓' : '✗'} commit servi : ${servi || '(illisible)'} — attendu ${SHA_ATTENDU.slice(0, 7)}`);
  if (!ok) echecs.push({ chemin: '/api/version', quoi: 'commit servi', souci: `${servi} au lieu de ${SHA_ATTENDU.slice(0, 7)}` });
}

console.log(`\n═══ Back-test ${BASE} ═══`);
console.log(lignes.join('\n'));

if (echecs.length) {
  console.log(`\n✗ ${echecs.length} fonction(s) en défaut sur ${VERIFICATIONS.length} :`);
  for (const e of echecs) console.log(`   · ${e.quoi} (${e.chemin}) — ${e.souci}`);
  console.log('\nUne mise à jour ne doit jamais faire sauter une fonction. À corriger AVANT de passer à autre chose.');
  process.exit(1);
}

console.log(`\n✓ ${VERIFICATIONS.length} fonctions vérifiées, toutes répondent.`);
