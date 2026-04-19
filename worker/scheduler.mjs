#!/usr/bin/env node
/**
 * KeiroAI Agent Worker v2 — per-client scheduler
 *
 * Two scheduling modes running in parallel:
 *   1. GLOBAL batches — system-level jobs (CEO reports, ops health, trends)
 *   2. PER-CLIENT agents — each client has their own schedule from DB
 *
 * The worker fetches client schedules from /api/cron/client-schedules
 * every 15 min and fires agents at client-specific times.
 *
 * Usage:
 *   KEIRO_URL=https://keiroai.com CRON_SECRET=xxx node worker/scheduler.mjs
 */

const KEIRO_URL = process.env.KEIRO_URL || 'https://keiroai.com';
const CRON_SECRET = process.env.CRON_SECRET;
const LOG_LEVEL = process.env.LOG_LEVEL || 'normal';

if (!CRON_SECRET) {
  console.error('[Worker] FATAL: CRON_SECRET env var is required');
  process.exit(1);
}

// ──────────────────────────────────────────────────────────
// GLOBAL schedule — system-level jobs (not per-client)
// ──────────────────────────────────────────────────────────

const GLOBAL_SCHEDULE = [
  { cron: '0 5 * * *',    slot: 'ceo',              label: 'CEO Reports + Client Briefs' },
  { cron: '0 7 * * *',    slot: 'morning_batch',     label: 'Morning Batch' },
  { cron: '0 9 * * *',    slot: 'publish_scheduled', label: 'Publish Scheduled (morning)' },
  { cron: '0 10 * * *',   slot: 'midday_batch',      label: 'Midday Batch' },
  { cron: '0 13 * * *',   slot: 'publish_scheduled', label: 'Publish Scheduled (midday)' },
  { cron: '30 13 * * *',  slot: 'afternoon_batch',   label: 'Afternoon Batch' },
  { cron: '0 14 * * *',   slot: 'prospect_external', label: 'Prospect External' },
  { cron: '0 17 * * *',   slot: 'evening_batch',     label: 'Evening Batch' },
  { cron: '0 18 * * *',   slot: 'publish_scheduled', label: 'Publish Scheduled (evening)' },
  { cron: '0 20 * * *',   slot: 'ceo_daily',         label: 'CEO Daily + Ops Health' },
  { cron: '0 */6 * * *',  slot: 'video_poll',        label: 'Video Poll' },
  { cron: '0 7 * * 1',    path: '/api/agents/weekly-trends', label: 'Weekly Trends (Monday)' },
  { cron: '0 7 1 * *',    path: '/api/agents/monthly-recap', label: 'Monthly Recap (1st)' },
];

// Agent endpoint mapping (for per-client direct calls)
const AGENT_ENDPOINTS = {
  content:      { path: '/api/agents/content', method: 'GET' },
  email:        { path: '/api/agents/email/daily?slot=morning&types=restaurant,traiteur,boutique,coiffeur,fleuriste', method: 'GET' },
  commercial:   { path: '/api/agents/commercial', method: 'POST' },
  dm_instagram: { path: '/api/agents/dm-instagram?slot=morning', method: 'POST' },
  seo:          { path: '/api/agents/seo', method: 'GET' },
  gmaps:        { path: '/api/agents/gmaps', method: 'GET' },
  marketing:    { path: '/api/agents/marketing', method: 'GET' },
  ceo:          { path: '/api/agents/ceo', method: 'POST' },
};

// ──────────────────────────────────────────────────────────
// Per-client schedules — fetched from DB every 15 min
// ──────────────────────────────────────────────────────────

let clientSchedules = []; // Populated from /api/cron/client-schedules
let lastScheduleFetch = 0;

async function fetchClientSchedules() {
  try {
    const res = await fetch(`${KEIRO_URL}/api/cron/client-schedules`, {
      headers: { 'Authorization': `Bearer ${CRON_SECRET}` },
    });
    if (!res.ok) {
      log('normal', `⚠️ Failed to fetch client schedules: HTTP ${res.status}`);
      return;
    }
    const data = await res.json();
    clientSchedules = data.clients || [];
    lastScheduleFetch = Date.now();
    log('normal', `📋 Loaded schedules for ${clientSchedules.length} client(s)`);
    for (const client of clientSchedules) {
      const activeAgents = Object.entries(client.agents)
        .filter(([, v]) => v.active)
        .map(([k, v]) => `${k}(${v.schedule?.join(',') || 'default'})`);
      if (activeAgents.length > 0) {
        log('verbose', `   ${client.email}: ${activeAgents.join(' | ')}`);
      }
    }
  } catch (e) {
    log('normal', `⚠️ Client schedule fetch error: ${e.message}`);
  }
}

// ──────────────────────────────────────────────────────────
// Utilities
// ──────────────────────────────────────────────────────────

function ts() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function log(level, ...args) {
  if (level === 'verbose' && LOG_LEVEL !== 'verbose') return;
  console.log(`[${ts()}]`, ...args);
}

function nowHHMM() {
  const now = new Date();
  return `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
}

async function callEndpoint(path, method = 'GET', body = null, retries = 3) {
  const url = `${KEIRO_URL}${path}`;
  const headers = {
    'Authorization': `Bearer ${CRON_SECRET}`,
    'Content-Type': 'application/json',
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    const startMs = Date.now();
    try {
      const opts = { method, headers };
      if (body && method === 'POST') opts.body = JSON.stringify(body);

      const res = await fetch(url, opts);
      const duration = ((Date.now() - startMs) / 1000).toFixed(1);

      if (res.ok) {
        let data = {};
        try { data = await res.json(); } catch {}
        log('verbose', `  ✓ ${path} — ${duration}s`);
        return { ok: true, status: res.status, data, duration: parseFloat(duration) };
      }

      const errText = await res.text().catch(() => '');
      log('normal', `  ✗ ${path} — HTTP ${res.status} — ${errText.substring(0, 200)} (${duration}s, attempt ${attempt}/${retries})`);
      if (res.status >= 400 && res.status < 500) {
        return { ok: false, status: res.status, error: errText.substring(0, 200) };
      }
    } catch (e) {
      const duration = ((Date.now() - startMs) / 1000).toFixed(1);
      log('normal', `  ✗ ${path} — NETWORK: ${e.message} (${duration}s, attempt ${attempt}/${retries})`);
    }

    if (attempt < retries) {
      const delay = 5000 * Math.pow(3, attempt - 1);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  return { ok: false, error: `Failed after ${retries} attempts` };
}

// ──────────────────────────────────────────────────────────
// Cron parser
// ──────────────────────────────────────────────────────────

function matchesCron(cronExpr, date) {
  const [minExpr, hourExpr, domExpr, monExpr, dowExpr] = cronExpr.split(/\s+/);
  return matchField(minExpr, date.getUTCMinutes())
    && matchField(hourExpr, date.getUTCHours())
    && matchField(domExpr, date.getUTCDate())
    && matchField(monExpr, date.getUTCMonth() + 1)
    && matchField(dowExpr, date.getUTCDay());
}

function matchField(expr, value) {
  if (expr === '*') return true;
  if (expr.startsWith('*/')) return value % parseInt(expr.substring(2)) === 0;
  if (expr.includes(',')) return expr.split(',').some(v => parseInt(v) === value);
  return parseInt(expr) === value;
}

// ──────────────────────────────────────────────────────────
// Main tick — runs every 30s
// ──────────────────────────────────────────────────────────

const firedThisMinute = new Set();

async function tick() {
  const now = new Date();
  const minuteKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}-${now.getUTCMinutes()}`;

  if (firedThisMinute.has(minuteKey)) return;
  firedThisMinute.add(minuteKey);

  // Cleanup old keys
  if (firedThisMinute.size > 120) {
    const arr = [...firedThisMinute];
    arr.slice(0, arr.length - 60).forEach(k => firedThisMinute.delete(k));
  }

  // Refresh client schedules every 15 min
  if (Date.now() - lastScheduleFetch > 15 * 60 * 1000) {
    await fetchClientSchedules();
  }

  const currentHHMM = nowHHMM();

  // ── 1. Global batches ──
  const globalToRun = GLOBAL_SCHEDULE.filter(entry => matchesCron(entry.cron, now));
  if (globalToRun.length > 0) {
    log('normal', `\n${'═'.repeat(60)}`);
    log('normal', `🕐 ${now.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} — ${globalToRun.length} global job(s)`);
    log('normal', `${'═'.repeat(60)}`);

    for (const entry of globalToRun) {
      const path = entry.path || `/api/cron/scheduler?slot=${entry.slot}`;
      log('normal', `▶ ${entry.label}`);
      const result = await callEndpoint(path);
      log('normal', result.ok ? `  ✓ Done in ${result.duration}s` : `  ✗ FAILED: ${result.error || `HTTP ${result.status}`}`);
      if (globalToRun.indexOf(entry) < globalToRun.length - 1) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }

  // ── 2. Per-client agents ──
  const clientJobs = [];
  for (const client of clientSchedules) {
    for (const [agentId, agentInfo] of Object.entries(client.agents)) {
      if (!agentInfo.active || !agentInfo.schedule) continue;

      // Check if current time matches any scheduled hour for this client+agent
      for (const schedTime of agentInfo.schedule) {
        if (schedTime === currentHHMM) {
          clientJobs.push({ client, agentId, schedTime });
        }
      }
    }
  }

  if (clientJobs.length > 0) {
    log('normal', `\n${'─'.repeat(60)}`);
    log('normal', `👤 ${currentHHMM} UTC — ${clientJobs.length} per-client job(s)`);
    log('normal', `${'─'.repeat(60)}`);

    for (const job of clientJobs) {
      const endpoint = AGENT_ENDPOINTS[job.agentId];
      if (!endpoint) {
        log('verbose', `  ⏭ ${job.agentId} — no endpoint mapped, skipping`);
        continue;
      }

      const separator = endpoint.path.includes('?') ? '&' : '?';
      const path = `${endpoint.path}${separator}user_id=${job.client.user_id}`;
      log('normal', `  ▶ ${job.agentId} for ${job.client.email} (${job.schedTime})`);

      const result = await callEndpoint(path, endpoint.method);
      log('normal', result.ok
        ? `    ✓ Done in ${result.duration}s`
        : `    ✗ FAILED: ${result.error || `HTTP ${result.status}`}`);

      // 2s between client jobs to avoid overload
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

// ──────────────────────────────────────────────────────────
// Startup
// ──────────────────────────────────────────────────────────

log('normal', `\n${'═'.repeat(60)}`);
log('normal', '🚀 KeiroAI Agent Worker v2 — per-client scheduler');
log('normal', `   URL:     ${KEIRO_URL}`);
log('normal', `   Secret:  ${CRON_SECRET.substring(0, 6)}...`);
log('normal', `${'═'.repeat(60)}\n`);

log('normal', '📅 Global schedule (UTC):');
for (const entry of GLOBAL_SCHEDULE) {
  log('normal', `   ${entry.cron.padEnd(15)} ${entry.label}`);
}
log('normal', '');

// Fetch client schedules on startup
fetchClientSchedules().then(() => {
  log('normal', '✅ Worker ready — checking every 30s\n');
});

// Main loop
setInterval(tick, 30_000);
tick();

// Graceful shutdown
process.on('SIGINT', () => { log('normal', '\n🛑 Worker stopping'); process.exit(0); });
process.on('SIGTERM', () => { log('normal', '\n🛑 Worker stopping'); process.exit(0); });
