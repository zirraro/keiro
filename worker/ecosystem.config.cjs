/**
 * PM2 ecosystem config for KeiroAI worker.
 *
 * Usage:
 *   pm2 start worker/ecosystem.config.cjs
 *   pm2 logs keiro-worker
 *   pm2 monit
 */
module.exports = {
  apps: [
    {
      name: 'keiro-worker',
      script: './worker/scheduler.mjs',
      interpreter: 'node',
      env: {
        KEIRO_URL: 'https://keiroai.com',
        CRON_SECRET: '09876543211234567890Oz@',
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
