# KeiroAI Agent Worker

Replaces Vercel crons with a standalone Node.js scheduler running on a dedicated server.

## Why

| Vercel crons | This worker |
|---|---|
| 300s timeout (kills long jobs) | No timeout — jobs run until done |
| Silent errors (swallowed by serverless) | All errors logged with timestamps |
| Cold starts (each run starts from zero) | Persistent process, warm |
| No retry on failure | 3 retries with exponential backoff |
| Parallel cold starts can overload DB | Sequential per batch |

## Quick Start

```bash
# On your dedicated server:
npm install -g pm2

# Copy the worker/ folder or clone the repo
cd keiro

# Start with PM2
pm2 start worker/ecosystem.config.cjs

# Check logs
pm2 logs keiro-worker

# Monitor
pm2 monit
```

## Env Vars

| Variable | Required | Default | Description |
|---|---|---|---|
| `KEIRO_URL` | yes | `https://keiroai.com` | Base URL of the KeiroAI app |
| `CRON_SECRET` | yes | — | Auth secret (same as Vercel) |
| `TZ` | no | `Europe/Paris` | Timezone for schedules |
| `LOG_LEVEL` | no | `normal` | `verbose` for detailed output |

## Once Running

1. **Disable Vercel crons** — remove entries from `vercel.json` (or set to empty array)
2. **Keep Vercel for the web app** — only crons move to the server
3. **Monitor** — `pm2 logs keiro-worker --lines 100`

## Schedule (UTC)

Same as vercel.json — all times UTC:

| Time | Job |
|---|---|
| 05:00 | CEO Reports + Client Briefs |
| 07:00 | Morning Batch |
| 09:00, 13:00, 18:00 | Publish Scheduled |
| 10:00 | Midday Batch |
| 13:30 | Afternoon Batch |
| 14:00 | Prospect External |
| 17:00 | Evening Batch |
| 20:00 | CEO Daily + Ops |
| */6h | Video Poll |
| Mon 07:00 | Weekly Trends |
| 1st 07:00 | Monthly Recap |
