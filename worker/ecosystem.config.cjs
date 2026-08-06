/**
 * PM2 ecosystem config for KeiroAI worker.
 *
 * Usage:
 *   pm2 start worker/ecosystem.config.cjs
 *   pm2 logs keiro-worker
 *   pm2 monit
 */
// ── Pourquoi le secret n'est plus écrit ici ──
//
// CRON_SECRET était en clair dans ce fichier, versionné. Il ouvre TOUS les
// endpoints cron : quiconque lit le dépôt peut déclencher les publications,
// les envois d'emails et les débits de crédits de n'importe quel client.
//
// Il est lu depuis .env.local, qui vit sur le VPS et n'est pas versionné —
// la même valeur y était déjà, donc rien ne change à l'exécution.
//
// On échoue bruyamment s'il manque : un worker qui démarre sans secret
// tournerait en se faisant refuser chaque appel, et les crons s'arrêteraient
// sans que rien ne le signale. C'est exactement le genre de panne muette qui
// nous a déjà coûté des semaines.
const fs = require('fs');
const path = require('path');

function lireSecret() {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET;
  const env = path.join(__dirname, '..', '.env.local');
  try {
    const ligne = fs.readFileSync(env, 'utf8').match(/^CRON_SECRET=(.*)$/m);
    if (ligne) return ligne[1].trim().replace(/^["']|["']$/g, '');
  } catch { /* fichier absent : on tombe dans l'erreur ci-dessous */ }
  throw new Error(
    "CRON_SECRET introuvable (ni dans l'environnement, ni dans .env.local). " +
    'Le worker ne démarre pas : sans secret, tous ses appels seraient refusés en silence.',
  );
}

module.exports = {
  apps: [
    {
      name: 'keiro-worker',
      script: './worker/scheduler.mjs',
      interpreter: 'node',
      env: {
        KEIRO_URL: 'http://localhost:3000',
        CRON_SECRET: lireSecret(),
        TZ: 'Europe/Paris',
        LOG_LEVEL: 'normal',
      },
      // Auto-restart on crash
      autorestart: true,
      max_restarts: 50,
      restart_delay: 10000, // 10s between restarts
      // Log management
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/worker-error.log',
      out_file: './logs/worker-out.log',
      merge_logs: true,
      max_size: '50M',     // Rotate at 50MB
      retain: 5,           // Keep 5 log files
      // Memory guard
      max_memory_restart: '256M',
    },
  ],
};
