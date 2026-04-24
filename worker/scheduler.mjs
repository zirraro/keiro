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
  { cron: '30 18 * * *',  slot: 'ceo_daily',         label: 'CEO Daily + Ops Health + Client Evening Brief' },
  { cron: '0 */6 * * *',  slot: 'video_poll',        label: 'Video Poll' },
  // Inbound email poll every 2h (8 fires/day) so prospect replies get
  // classified and auto-responded within ~2h instead of waiting for the
  // morning batch. Hugo triggers auto-dead on STOP / unsubscribe / refus.
  { cron: '0 */2 * * *',  slot: 'email_inbound_poll', label: 'Inbound Email Poll (Gmail/Outlook/IMAP)' },
  // Instagram comments auto-reply hourly (client-side cadence too strict
  // would trip Meta; hourly is comfortable on all plans).
  { cron: '15 * * * *',   slot: 'ig_comments_reply', label: 'IG Comments Auto-Reply (all active clients)' },
  { cron: '0 7 * * 1',    path: '/api/agents/weekly-trends', label: 'Weekly Trends (Monday)' },
  { cron: '0 7 1 * *',    path: '/api/agents/monthly-recap', label: 'Monthly Recap (1st)' },
  // Weekly enrichment refresh — keeps each agent's knowledge current with
  // market changes. Light depth so it doesn't balloon credits; the deep
  // campaign is manual / on-demand.
  { cron: '0 2 * * 0',    slot: 'weekly_enrichment', label: 'Weekly Agent Knowledge Refresh' },
  // Hourly check for Instagram token expiry → email client to reconnect
  { cron: '30 * * * *',   path: '/api/cron/process-ig-reauth', label: 'IG Reauth Email' },
];

// Agent endpoint mapping (for per-client direct calls)
// Only the agents listed here are firable — WhatsApp/TikTok DM/Ads/RH/Finance
// are intentionally absent (desactivés le temps de peaufiner les autres).
// When ready to ship, add the endpoint here AND remove from DISABLED_AGENTS
// in lib/agents/feature-flags.ts.
const AGENT_ENDPOINTS = {
  content:             { path: '/api/agents/content', method: 'GET' },
  email:               { path: '/api/agents/email/daily?slot=morning&types=restaurant,traiteur,boutique,coiffeur,fleuriste', method: 'GET' },
  commercial:          { path: '/api/agents/commercial', method: 'POST' },
  dm_instagram:        { path: '/api/agents/dm-instagram?slot=morning', method: 'POST' },
  instagram_comments:  { path: '/api/agents/instagram-comments', method: 'POST', body: { action: 'auto_reply_all' } },
  seo:                 { path: '/api/agents/seo', method: 'GET' },
  gmaps:               { path: '/api/agents/gmaps', method: 'GET' },
  marketing:           { path: '/api/agents/marketing', method: 'GET' },
  ceo:                 { path: '/api/agents/ceo', method: 'POST' },
  // chatbot fires only for Business+ clients via the client-schedules endpoint
  chatbot:             { path: '/api/agents/chatbot/sync', method: 'POST' },
};

// Hard block: agents that are *never* ready to fire right now. Source of
// truth kept in lib/agents/feature-flags.ts but mirrored here because the
// worker is pure JS (no TS import in prod build).
const DISABLED_AGENTS_WORKER = new Set([
  'ads', 'rh', 'comptable', 'whatsapp', 'tiktok_comments',
  'tiktok_dm', 'dm_tiktok', 'linkedin', 'emma', 'felix',
  'sara', 'stella', 'louis', 'axel',
]);

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

  // Refresh client schedules every 60s so UI changes (custom schedule,
  // auto_mode toggle, frequency) propagate to the next tick within 1 min
  // instead of the original 15 min window — the endpoint is cheap.
  if (Date.now() - lastScheduleFetch > 60 * 1000) {
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
      // Feature-flag block — ads/rh/comptable/whatsapp/tiktok* are paused
      // while the other agents get polished. Safe to bypass via DB config.
      if (DISABLED_AGENTS_WORKER.has(job.agentId)) {
        log('verbose', `  ⏸ ${job.agentId} for ${job.client.email} — agent disabled globally`);
        continue;
      }
      const endpoint = AGENT_ENDPOINTS[job.agentId];
      if (!endpoint) {
        log('verbose', `  ⏭ ${job.agentId} — no endpoint mapped, skipping`);
        continue;
      }

      const separator = endpoint.path.includes('?') ? '&' : '?';
      const path = `${endpoint.path}${separator}user_id=${job.client.user_id}`;
      log('normal', `  ▶ ${job.agentId} for ${job.client.email} (${job.schedTime})`);

      // Some agents expect the user_id in the body too (so the handler
      // can associate artifacts with the right client even when the
      // endpoint has no query-string support).
      const body = endpoint.body
        ? { ...endpoint.body, user_id: job.client.user_id }
        : null;
      const result = await callEndpoint(path, endpoint.method, body);
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

// ──────────────────────────────────────────────────────────
// DM Auto-reply poller — every 5 min, per client
// ──────────────────────────────────────────────────────────
//
// Continuously polls Instagram for unanswered prospect DMs so Jade
// can reply within minutes. The /auto-reply endpoint itself checks the
// per-client `auto_mode` toggle and returns early when the human has
// taken over, matching Meta's Human Agent protocol. Runs on its own
// interval so it is independent from the hourly per-client schedule.

async function pollAutoReplies() {
  if (clientSchedules.length === 0) return;
  for (const client of clientSchedules) {
    try {
      const r = await callEndpoint(
        `/api/agents/dm-instagram/auto-reply?user_id=${client.user_id}`,
        'POST',
        null,
        1, // one attempt — if it fails we'll try again in 5 min
      );
      if (r.ok) {
        const d = r.data || {};
        if (d.skipped_reason === 'ai_off') {
          log('verbose', `  ⏸ auto-reply skipped (AI off) for ${client.email}`);
        } else if (d.replied > 0) {
          log('normal', `  💬 auto-reply: ${d.replied} reply(s) sent for ${client.email}`);
        } else {
          log('verbose', `  · auto-reply: 0 new for ${client.email}`);
        }
      }
    } catch (e) {
      log('normal', `  ✗ auto-reply error for ${client.email}: ${e.message}`);
    }
    // Stagger so we don't hammer Meta back-to-back
    await new Promise(r => setTimeout(r, 2000));
  }
}

// 10 min (was 5) — lower cadence to avoid tripping Meta's app-level
// "Application request limit" when combined with the UI's per-conv polling.
setInterval(pollAutoReplies, 10 * 60 * 1000);
// First run after 90s so the app/worker has time to finish booting.
setTimeout(pollAutoReplies, 90_000);

// Graceful shutdown
process.on('SIGINT', () => { log('normal', '\n🛑 Worker stopping'); process.exit(0); });
process.on('SIGTERM', () => { log('normal', '\n🛑 Worker stopping'); process.exit(0); });
