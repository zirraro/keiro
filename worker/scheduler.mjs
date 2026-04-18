#!/usr/bin/env node
/**
 * KeiroAI Agent Worker — standalone scheduler that replaces Vercel crons.
 *
 * Advantages over Vercel crons:
 *   - No 300s timeout (jobs run until done)
 *   - Retry on failure (3 attempts with exponential backoff)
 *   - Sequential execution per batch (no parallel cold starts)
 *   - Visible logs with timestamps (no silent errors)
 *   - Persistent process — PM2 keeps it alive
 *
 * Usage:
 *   KEIRO_URL=https://keiroai.com CRON_SECRET=xxx node worker/scheduler.mjs
 *   # or via PM2:
 *   pm2 start worker/scheduler.mjs --name keiro-worker
 *
 * Env vars:
 *   KEIRO_URL    — base URL of the KeiroAI app (default: https://keiroai.com)
 *   CRON_SECRET  — same secret used by Vercel crons for auth
 *   TZ           — timezone for cron schedules (default: Europe/Paris)
 *   LOG_LEVEL    — 'verbose' for all, 'normal' for summary only (default: normal)
 */

const KEIRO_URL = process.env.KEIRO_URL || 'https://keiroai.com';
const CRON_SECRET = process.env.CRON_SECRET;
const LOG_LEVEL = process.env.LOG_LEVEL || 'normal';

if (!CRON_SECRET) {
  console.error('[Worker] FATAL: CRON_SECRET env var is required');
  process.exit(1);
}

// ──────────────────────────────────────────────────────────
// Schedule definition — mirrors vercel.json exactly
// ──────────────────────────────────────────────────────────

const SCHEDULE = [
  // Daily agents
  { cron: '0 5 * * *',    slot: 'ceo',              label: 'CEO Reports + Client Briefs' },
  { cron: '0 7 * * *',    slot: 'morning_batch',     label: 'Morning Batch (DM, Email, Content, Commercial)' },
  { cron: '0 9 * * *',    slot: 'publish_scheduled', label: 'Publish Scheduled (morning)' },
  { cron: '0 10 * * *',   slot: 'midday_batch',      label: 'Midday Batch (Email, Community, GMaps)' },
  { cron: '0 13 * * *',   slot: 'publish_scheduled', label: 'Publish Scheduled (midday)' },
  { cron: '30 13 * * *',  slot: 'afternoon_batch',   label: 'Afternoon Batch (Content, Email, TikTok)' },
  { cron: '0 14 * * *',   slot: 'prospect_external', label: 'Prospect External (Google Search)' },
  { cron: '0 17 * * *',   slot: 'evening_batch',     label: 'Evening Batch (DM, Content, Email Recap)' },
  { cron: '0 18 * * *',   slot: 'publish_scheduled', label: 'Publish Scheduled (evening)' },
  { cron: '0 20 * * *',   slot: 'ceo_daily',         label: 'CEO Daily + Ops Health' },
  { cron: '0 */6 * * *',  slot: 'video_poll',        label: 'Video Poll (Seedance status)' },
  // Weekly / Monthly
  { cron: '0 7 * * 1',    path: '/api/agents/weekly-trends', label: 'Weekly Trends (Monday)' },
  { cron: '0 7 1 * *',    path: '/api/agents/monthly-recap', label: 'Monthly Recap (1st)' },
];

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

/**
 * Call a KeiroAI endpoint with retry logic.
 * No timeout — waits until the server responds (the whole point of this worker).
 */
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
        log('verbose', `  ✓ ${path} — ${duration}s — ${JSON.stringify(data).substring(0, 200)}`);
        return { ok: true, status: res.status, data, duration: parseFloat(duration) };
      }

      const errText = await res.text().catch(() => '');
      log('normal', `  ✗ ${path} — HTTP ${res.status} — ${errText.substring(0, 200)} (${duration}s, attempt ${attempt}/${retries})`);

      // Don't retry on 4xx (client error, won't fix itself)
      if (res.status >= 400 && res.status < 500) {
        return { ok: false, status: res.status, error: errText.substring(0, 200) };
      }
    } catch (e) {
      const duration = ((Date.now() - startMs) / 1000).toFixed(1);
      log('normal', `  ✗ ${path} — NETWORK ERROR: ${e.message} (${duration}s, attempt ${attempt}/${retries})`);
    }

    // Exponential backoff: 5s, 15s, 45s
    if (attempt < retries) {
      const delay = 5000 * Math.pow(3, attempt - 1);
      log('verbose', `  ⏳ Retrying in ${delay / 1000}s...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  return { ok: false, error: `Failed after ${retries} attempts` };
}

/**
 * Run a scheduled slot (same as Vercel calling /api/cron/scheduler?slot=xxx).
 */
async function runSlot(entry) {
  const path = entry.path || `/api/cron/scheduler?slot=${entry.slot}`;
  log('normal', `▶ ${entry.label}`);
  const result = await callEndpoint(path, 'GET');
  if (result.ok) {
    log('normal', `  ✓ Done in ${result.duration}s`);
  } else {
    log('normal', `  ✗ FAILED: ${result.error || `HTTP ${result.status}`}`);
  }
  return result;
}

// ──────────────────────────────────────────────────────────
// Cron parser (lightweight, no dependencies)
// Supports: minute hour day-of-month month day-of-week
// Values: number, *, */N, comma-separated
// ──────────────────────────────────────────────────────────

function matchesCron(cronExpr, date) {
  const [minExpr, hourExpr, domExpr, monExpr, dowExpr] = cronExpr.split(/\s+/);
  const min = date.getMinutes();
  const hour = date.getHours();
  const dom = date.getDate();
  const mon = date.getMonth() + 1;
  const dow = date.getDay();

  return matchField(minExpr, min)
    && matchField(hourExpr, hour)
    && matchField(domExpr, dom)
    && matchField(monExpr, mon)
    && matchField(dowExpr, dow);
}

function matchField(expr, value) {
  if (expr === '*') return true;

  // */N step
  if (expr.startsWith('*/')) {
    const step = parseInt(expr.substring(2));
    return value % step === 0;
  }

  // Comma-separated: 9,13,18
  if (expr.includes(',')) {
    return expr.split(',').some(v => parseInt(v) === value);
  }

  // Exact match
  return parseInt(expr) === value;
}

// ──────────────────────────────────────────────────────────
// Main loop — check every 60s which crons should fire
// ──────────────────────────────────────────────────────────

const firedThisMinute = new Set();

async function tick() {
  const now = new Date();
  const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;

  // Don't fire same minute twice
  if (firedThisMinute.has(minuteKey)) return;

  const toRun = SCHEDULE.filter(entry => matchesCron(entry.cron, now));
  if (toRun.length === 0) return;

  firedThisMinute.add(minuteKey);

  // Clean old entries (keep last 60 to prevent memory leak)
  if (firedThisMinute.size > 60) {
    const arr = [...firedThisMinute];
    arr.slice(0, arr.length - 60).forEach(k => firedThisMinute.delete(k));
  }

  log('normal', `\n${'═'.repeat(60)}`);
  log('normal', `🕐 ${now.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} — ${toRun.length} job(s) to run`);
  log('normal', `${'═'.repeat(60)}`);

  // Run sequentially (not in parallel — avoid resource contention)
  let ok = 0;
  let fail = 0;
  for (const entry of toRun) {
    const result = await runSlot(entry);
    if (result.ok) ok++;
    else fail++;

    // 3s between jobs to let the server breathe
    if (toRun.indexOf(entry) < toRun.length - 1) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  log('normal', `\n📊 Summary: ${ok} succeeded, ${fail} failed out of ${toRun.length}`);
  if (fail > 0) {
    log('normal', `⚠️  ${fail} job(s) failed — check logs above`);
  }
}

// ──────────────────────────────────────────────────────────
// Startup
// ──────────────────────────────────────────────────────────

log('normal', `\n${'═'.repeat(60)}`);
log('normal', '🚀 KeiroAI Agent Worker started');
log('normal', `   URL:     ${KEIRO_URL}`);
log('normal', `   Secret:  ${CRON_SECRET.substring(0, 6)}...`);
log('normal', `   TZ:      ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
log('normal', `   Jobs:    ${SCHEDULE.length} scheduled`);
log('normal', `${'═'.repeat(60)}\n`);

// List all schedules
for (const entry of SCHEDULE) {
  log('normal', `   ${entry.cron.padEnd(15)} ${entry.label}`);
}
log('normal', '');

// Check every 30s (ensures we never miss a minute boundary)
setInterval(tick, 30_000);

// Also run immediately on start (catches any missed jobs)
tick();

// Graceful shutdown
process.on('SIGINT', () => {
  log('normal', '\n🛑 Worker stopping (SIGINT)');
  process.exit(0);
});
process.on('SIGTERM', () => {
  log('normal', '\n🛑 Worker stopping (SIGTERM)');
  process.exit(0);
});
