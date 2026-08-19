/**
 * La configuration pm2, enfin versionnée.
 *
 * ── Pourquoi ce fichier existe ──
 *
 * Le 19 août, le worker était arrêté avec une entrée pm2 orpheline. J'ai fait
 * `pm2 delete` puis `pm2 start worker/scheduler.mjs` — et le worker est passé
 * d'« arrêté » à « crashe en boucle » : `FATAL: CRON_SECRET env var is
 * required`. L'entrée supprimée portait la configuration d'environnement.
 *
 * Le fondateur, à raison : « attention à ce que tu supprimes, vérifie bien tes
 * actions ». Mais la vraie leçon est plus large que ma maladresse : cette
 * configuration ne vivait QUE dans /root/.pm2/dump.pm2, sur le serveur, hors
 * du dépôt. Une seule commande la détruisait sans trace, et rien nulle part ne
 * permettait de la reconstituer — il a fallu lancer le worker à la main pour
 * découvrir ce qui lui manquait.
 *
 * Désormais : `pm2 start ecosystem.config.js` remonte tout, à l'identique, y
 * compris après une perte totale du serveur.
 *
 * ── Le piège du --env-file ──
 *
 * Le worker est un .mjs lancé par node directement, pas par Next : il ne
 * charge PAS .env.local tout seul. Sans le drapeau ci-dessous il démarre,
 * échoue sur CRON_SECRET, et pm2 le relance en boucle — 283 redémarrages
 * comptés avant qu'on regarde. C'est la ligne la plus importante du fichier.
 */

module.exports = {
  apps: [
    {
      name: 'keiro-app',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: '/opt/keiro',
      instances: 2,
      exec_mode: 'cluster',
      time: true,
      max_memory_restart: '1200M',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'keiro-worker',
      script: 'worker/scheduler.mjs',
      cwd: '/opt/keiro',
      instances: 1,
      exec_mode: 'fork',
      time: true,
      // SANS ceci, le worker meurt au démarrage. Voir l'en-tête.
      node_args: '--env-file=/opt/keiro/.env.local',
      max_memory_restart: '800M',
      // Un worker qui redémarre en boucle est pire qu'un worker arrêté : il
      // masque la panne derrière un statut « online » intermittent. On espace
      // les tentatives pour que l'échec devienne visible.
      restart_delay: 10_000,
      env: { NODE_ENV: 'production' },
    },
  ],
};
