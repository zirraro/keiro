import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { createClient } from '@supabase/supabase-js';
import { autoImprove } from '@/lib/agents/auto-improve';
import { processEventPipeline } from '@/lib/agents/event-bus';
import { analyzeAndFix } from '@/lib/agents/auto-fix';
import { sendCeoGroupReport } from '@/lib/agents/ceo-group';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET /api/cron/scheduler?slot=<slot>
 *
 * Single endpoint for external cron services (cron-job.org, etc.)
 * Auth: CRON_SECRET required.
 *
 * Slots and what they trigger:
 *
 * SCHEDULE v2 — All slots spaced min 15 min apart, no overlaps
 *
 * 03:00  discovery         → Commercial: verify CRM
 * 04:50  marketing_prep    → Marketing: sync analytics (prépare stats CEO)
 * 05:00  ceo               → CEO brief + ordres + community early
 * 05:30  trends            → Refresh actualités
 * 06:00  early_morning     → Email cold: restaurants/traiteurs
 * 07:00  morning_prep      → DM Instagram + SEO + Content matin
 * 07:30  tiktok_dm_morning → DM TikTok 2x20
 * 08:00  morning           → Email cold: boutiques/coiffeurs + Onboarding
 * 08:30  discovery_4       → Commercial: verify CRM #2
 * 09:00  retention         → Retention checks
 * 09:30  community         → Community: comments + follows
 * 09:45  content_linkedin_1→ LinkedIn post matin (décalé de community)
 * 10:00  midday            → Email cold: coachs/freelances + warm
 * 11:00  discovery_2       → Commercial: prospect external
 * 12:00  afternoon         → Email cold: restaurants midi + PME
 * 12:30  tiktok_dm_midday  → DM TikTok 2x20
 * 13:00  discovery_5       → Commercial: prospect external #2
 * 13:30  content_2         → Content post midi
 * 14:00  discovery_3       → Commercial: verify + prospect #3
 * 14:20  content_linkedin_2→ LinkedIn post après-midi (décalé de discovery_3)
 * 14:40  email_warm_2      → Email warm #2 + Marketing sync
 * 15:00  ceo_evening       → CEO brief soir + ordres
 * 15:30  community_2       → Community après-midi
 * 16:00  evening           → Email cold: restaurants/bars soirée
 * 16:30  discovery_6       → Commercial: full EOD
 * 17:00  evening_prep      → DM Instagram soir
 * 17:30  content_3         → Content post soir
 * 18:15  content_tiktok    → TikTok vidéo quotidienne
 * 18:45  email_recap       → Email cold: rattrapage tous types
 * 19:00  marketing_learn   → Marketing: analyse + conseil agents
 * 19:30  tiktok_publish    → Publication Reels + TikTok
 * 21:00  amit              → AMIT: analyse stratégique
 * 22:00  ops               → Ops: diagnostic système
 * every20m video_poll      → Poll vidéos async (toutes les 20 min)
 * 3x/day  publish_scheduled→ Publication posts programmés (9h, 13h, 18h UTC)
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const slot = request.nextUrl.searchParams.get('slot');

  if (!slot) {
    return NextResponse.json({ ok: false, error: 'slot parameter required' }, { status: 400 });
  }

  // Use VERCEL_URL or NEXT_PUBLIC_SITE_URL for reliable self-referencing
  // (host header can fail for internal fetch on Vercel serverless)
  const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || null;
  const host = request.headers.get('host') || 'localhost:3000';
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const baseUrl = siteUrl || vercelUrl || `${proto}://${host}`;
  console.log(`[Scheduler] baseUrl resolved to: ${baseUrl}`);
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${cronSecret}`,
    'Content-Type': 'application/json',
  };

  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon...6=Sat
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5; // Mon-Fri
  // For SEO: Mon/Wed/Fri
  const isSeoDay = [1, 3, 5].includes(dayOfWeek);
  // For TikTok: Mon/Wed
  const isTiktokDay = [1, 3].includes(dayOfWeek);

  // Guard: no emails between 22h-7h Paris time (UTC+2)
  const parisHour = (now.getUTCHours() + 2) % 24;
  const isNightParis = parisHour >= 22 || parisHour < 7;
  const emailSlots = new Set(['early_morning', 'morning', 'midday', 'afternoon', 'evening', 'email_warm_2', 'email_recap', 'retention', 'onboarding']);
  if (isNightParis && emailSlots.has(slot)) {
    console.log(`[Scheduler] BLOCKED: slot=${slot} at ${parisHour}h Paris time (night guard)`);
    return NextResponse.json({ ok: true, skipped: true, reason: `Night guard: ${parisHour}h Paris — no emails between 22h-7h` });
  }

  const results: { task: string; ok: boolean; data?: any; error?: string }[] = [];

  // ── Multi-tenant: get active client accounts ──────────────────────
  // Action slots (email, DM, content, publish, comments) run PER CLIENT only
  // Monitoring slots (QA, CEO, marketing) run globally (all clients)
  const actionSlots = new Set([
    // v3 batched slots
    'morning_batch', 'midday_batch', 'afternoon_batch', 'evening_batch', 'prospect_external',
    // Legacy individual slots (still work if called directly)
    'early_morning', 'morning', 'midday', 'afternoon', 'evening',
    'email_warm_2', 'email_recap',
    'morning_prep', 'content_2', 'content_3', 'content_tiktok',
    'content_tiktok_2', 'content_tiktok_3',
    'content_linkedin_1', 'content_linkedin_2', 'content_linkedin_3',
    'community', 'community_2',
    'tiktok_dm_morning', 'tiktok_dm_midday', 'tiktok_dm_evening',
    'onboarding', 'retention',
    'publish_scheduled', 'tiktok_publish',
    'evening_prep',
    'gmaps', 'whatsapp_followup',
    'discovery', 'discovery_2', 'discovery_3', 'discovery_4', 'discovery_5', 'discovery_6',
  ]);

  // For action slots: get list of active non-admin client user_ids + agent configs
  let clientUserIds: string[] = [];
  const clientAgentConfigs: Record<string, Record<string, any>> = {};
  const clientPlans: Record<string, string> = {}; // userId → plan name

  // ── Plan-based throttle: which slots are allowed per plan ──────────
  // Créateur (49€): minimal crons → 80%+ margin
  // Pro (99€): standard crons → 85% margin
  // Business (199€): all crons → 85% margin
  const PLAN_SLOT_LIMITS: Record<string, Set<string>> = {
    // Créateur: morning + midday + prospect_external (2 email, 1 content, 1 DM, discovery)
    créateur: new Set([
      'morning_batch', 'midday_batch', 'prospect_external',
      'publish_scheduled',
      // Legacy slots (if called individually)
      'early_morning', 'evening', 'morning_prep', 'discovery', 'retention', 'gmaps',
    ]),
    // Pro: morning + midday + afternoon + prospect_external
    pro: new Set([
      'morning_batch', 'midday_batch', 'afternoon_batch', 'prospect_external',
      'publish_scheduled',
      // Legacy slots
      'early_morning', 'morning', 'midday', 'evening',
      'morning_prep', 'content_2', 'discovery', 'discovery_2',
      'ceo_evening', 'community', 'retention', 'gmaps', 'comptable', 'email_warm_2',
    ]),
    // Business: all batches
    business: new Set([
      'morning_batch', 'midday_batch', 'afternoon_batch', 'evening_batch', 'ceo_daily', 'prospect_external',
      'publish_scheduled',
      // Legacy slots (all)
      'early_morning', 'morning', 'midday', 'afternoon', 'evening', 'email_warm_2', 'email_recap',
      'morning_prep', 'content_2', 'content_3',
      'discovery', 'discovery_2', 'discovery_3',
      'ceo', 'ceo_evening', 'ceo_night',
      'community', 'evening_prep',
      'retention', 'gmaps', 'comptable',
      'publish_scheduled', 'tiktok_publish',
    ]),
  };
  // Aliases
  PLAN_SLOT_LIMITS['createur'] = PLAN_SLOT_LIMITS['créateur'];
  PLAN_SLOT_LIMITS['fondateurs'] = PLAN_SLOT_LIMITS['business'];
  PLAN_SLOT_LIMITS['elite'] = PLAN_SLOT_LIMITS['business'];
  // Trial users get Pro-level access
  PLAN_SLOT_LIMITS['trial'] = PLAN_SLOT_LIMITS['pro'];

  if (actionSlots.has(slot)) {
    const supabaseForClients = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: clients } = await supabaseForClients
      .from('profiles')
      .select('id, email, subscription_plan')
      .or('is_admin.is.null,is_admin.eq.false')
      .not('subscription_plan', 'is', null)
      .not('subscription_plan', 'eq', 'free');

    // Also include trial users (plan might be null but trial_ends_at in future)
    let trialClients: any[] = [];
    try {
      const { data } = await supabaseForClients
        .from('profiles')
        .select('id, email, subscription_plan')
        .or('is_admin.is.null,is_admin.eq.false')
        .not('trial_ends_at', 'is', null)
        .gt('trial_ends_at', now.toISOString());
      trialClients = data || [];
    } catch { /* trial_ends_at column might not exist yet */ }

    const allClientIds = new Set<string>();
    (clients || []).forEach(c => { allClientIds.add(c.id); clientPlans[c.id] = (c.subscription_plan || 'créateur').toLowerCase(); });
    (trialClients || []).forEach(c => { allClientIds.add(c.id); if (!clientPlans[c.id]) clientPlans[c.id] = 'trial'; });
    clientUserIds = [...allClientIds];

    console.log(`[Scheduler] Action slot=${slot}: ${clientUserIds.length} active client(s)`);

    if (clientUserIds.length === 0) {
      console.log(`[Scheduler] No active clients — skipping action slot ${slot}`);
      return NextResponse.json({ ok: true, skipped: true, reason: 'No active clients' });
    }

    // ── Load ALL agent configs for all clients (batch query, not N+1) ──
    const { data: allConfigs } = await supabaseForClients
      .from('org_agent_configs')
      .select('user_id, agent_id, config')
      .in('user_id', clientUserIds);

    for (const cfg of (allConfigs || [])) {
      if (!clientAgentConfigs[cfg.user_id]) clientAgentConfigs[cfg.user_id] = {};
      clientAgentConfigs[cfg.user_id][cfg.agent_id] = cfg.config || {};
    }
  }

  // ── Helper: get clients who activated a specific agent AND whose plan allows this slot ──
  function getClientsWithAgent(agentId: string): string[] {
    return clientUserIds.filter(uid => {
      const cfg = clientAgentConfigs[uid]?.[agentId];
      const isActive = cfg?.auto_mode === true || cfg?.setup_completed === true;
      if (!isActive) return false;
      // Plan-based throttle: check if this slot is allowed for the client's plan
      const plan = clientPlans[uid] || 'créateur';
      const allowedSlots = PLAN_SLOT_LIMITS[plan] || PLAN_SLOT_LIMITS['business'];
      if (slot && !allowedSlots.has(slot)) {
        console.log(`[Scheduler] Throttled: ${uid.substring(0, 8)} plan=${plan} cannot run slot=${slot}`);
        return false;
      }
      return true;
    });
  }

  // ── Helper: check if agent is active for a specific network ──────────
  function isNetworkActive(userId: string, agentId: string, network: string): boolean {
    const cfg = clientAgentConfigs[userId]?.[agentId];
    if (!cfg) return false;
    // Check per-network toggle first, fallback to global auto_mode
    const networkKey = `auto_mode_${network}`;
    if (cfg[networkKey] !== undefined) return cfg[networkKey] === true;
    return cfg.auto_mode === true;
  }

  // ── Helper: call endpoint for each client with agent active ──────────
  // agentFilter: only call for clients who activated this agent. If null, call for all.
  async function callForEachClient(name: string, path: string, method: 'GET' | 'POST' = 'GET', body?: any, agentFilter?: string) {
    if (clientUserIds.length === 0) {
      // No clients — single global call (monitoring slots)
      return callEndpoint(name, path, method, body);
    }
    const targetClients = agentFilter ? getClientsWithAgent(agentFilter) : clientUserIds;

    if (targetClients.length === 0) {
      console.log(`[Scheduler] No clients with agent ${agentFilter} active — skipping ${name}`);
      results.push({ task: name, ok: true, data: { skipped: true, reason: `No clients with ${agentFilter} active` } });
      return;
    }
    console.log(`[Scheduler] ${name}: ${targetClients.length}/${clientUserIds.length} clients with ${agentFilter || 'any'} active`);

    for (const uid of targetClients) {
      const separator = path.includes('?') ? '&' : '?';
      const clientPath = `${path}${separator}user_id=${uid}`;
      await callEndpoint(`${name} [${uid.substring(0, 8)}]`, clientPath, method, body);
    }
  }

  // Supabase for auto-improve logging
  const aiSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  async function callEndpoint(name: string, path: string, method: 'GET' | 'POST' = 'GET', body?: any) {
    const startMs = Date.now();
    try {
      console.log(`[Scheduler/${slot}] → ${name}: ${method} ${path}`);
      const opts: RequestInit = { method, headers };
      if (body && method === 'POST') opts.body = JSON.stringify(body);
      const res = await fetch(`${baseUrl}${path}`, opts);
      const data = await res.json().catch(() => ({ ok: false }));
      const duration = Date.now() - startMs;
      results.push({ task: name, ok: data.ok ?? res.ok, data });
      console.log(`[Scheduler/${slot}] ← ${name}: ${data.ok ? 'OK' : 'FAIL'} (${duration}ms)`);

      // Auto-improve: log result for learning
      const agentName = path.split('/agents/')[1]?.split(/[?/]/)[0] || name.toLowerCase();
      waitUntil(autoImprove(aiSupabase, {
        agent: agentName,
        action: `cron_${slot}_${name.toLowerCase().replace(/\s+/g, '_')}`,
        success: !!(data.ok ?? res.ok),
        error: data.ok ? undefined : (data.error || data.message || `HTTP ${res.status}`),
        details: `Duration: ${duration}ms, slot: ${slot}`,
        metrics: typeof data === 'object' ? { duration, ...(data.sent != null ? { sent: data.sent } : {}), ...(data.published != null ? { published: data.published } : {}) } : { duration },
      }).catch(() => {}));
    } catch (e: any) {
      const duration = Date.now() - startMs;
      results.push({ task: name, ok: false, error: e.message });
      console.error(`[Scheduler/${slot}] ✗ ${name}: ${e.message} (${duration}ms)`);

      // Auto-improve: log failure
      const agentName = path.split('/agents/')[1]?.split(/[?/]/)[0] || name.toLowerCase();
      waitUntil(autoImprove(aiSupabase, {
        agent: agentName,
        action: `cron_${slot}_${name.toLowerCase().replace(/\s+/g, '_')}`,
        success: false,
        error: e.message,
        details: `Crashed after ${duration}ms, slot: ${slot}`,
      }).catch(() => {}));
    }
  }

  // Run multiple endpoints in parallel (all awaited but concurrently — much faster)
  async function callParallel(...calls: [string, string, ('GET' | 'POST')?, any?][]) {
    await Promise.all(calls.map(([name, path, method, body]) => callEndpoint(name, path, method || 'GET', body)));
  }

  // Fire-and-forget via waitUntil — runs after response is sent, won't be killed by Vercel
  function fireBackground(fn: () => Promise<void>) {
    waitUntil(fn().catch(e => console.error(`[Scheduler/${slot}] background error:`, e.message)));
  }

  // 15s stagger between sequential agent calls — each callEndpoint already awaits completion,
  // but this extra buffer lets Vercel fully release serverless resources (memory, connections) before next launch
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  switch (slot) {
    // ════════════════════════════════════════════════════════════════
    // BATCHED SLOTS (v3) — 5 daily batches instead of 30+ individual crons
    // ════════════════════════════════════════════════════════════════

    case 'morning_batch':
      // 07:00 UTC — Everything morning: DM + Content + Email #1 + Discovery + Trends + Diag + Comptable
      // PRIORITY ORDER: Commercial first (feeds the pipeline), then DM, Content, Email, SEO
      // Each major task is a separate fireBackground to avoid timeout cascading

      // 1. Commercial — HIGHEST PRIORITY: finds new prospects for all other agents
      fireBackground(async () => {
        await callForEachClient('Commercial Verify CRM', '/api/agents/commercial', 'POST', { action: 'verify_crm' }, 'commercial');
      });

      // 2. DM — auto-reply + preparation + send queue + daily follow warm-up
      fireBackground(async () => {
        for (const uid of getClientsWithAgent('dm_instagram')) {
          await callEndpoint(`DM AutoReply [${uid.substring(0, 8)}]`, `/api/agents/dm-instagram/auto-reply?user_id=${uid}`, 'POST');
          await delay(2000);
          await callEndpoint(`DM Instagram [${uid.substring(0, 8)}]`, `/api/agents/dm-instagram?slot=morning&user_id=${uid}`, 'POST');
          await delay(2000);
          await callEndpoint(`DM Send Queue [${uid.substring(0, 8)}]`, `/api/agents/dm-instagram/send-queue?user_id=${uid}`, 'POST');
          await delay(2000);
          // Daily follow campaign: Jade queues ~25 qualified prospects for
          // manual warm-up follows. Rate-limited in the route.
          await callEndpoint(`DM Follow [${uid.substring(0, 8)}]`, `/api/agents/dm-instagram/follow-prospects?user_id=${uid}`, 'POST', { user_id: uid });
        }
        // Morning push: one notification per client with pending follows
        // so they see the number on their phone before opening the app.
        // Runs AFTER the follow queue is populated — order matters.
        await delay(5000);
        await callEndpoint('Push Morning Follows', '/api/push/send-morning-follows', 'POST');
      });

      // 2bis. Inbound email poll — two channels, per client with email agent.
      // Lands any prospect reply into /api/webhooks/email-inbound where
      // Hugo classifies + auto-replies. Runs in its own fireBackground so
      // a slow provider response doesn't block the DM chain above.
      // Both pollers are idempotent (mark-as-read + last_poll_at) so
      // calling both is safe even when the same client has two channels.
      fireBackground(async () => {
        for (const uid of getClientsWithAgent('email')) {
          await callEndpoint(`Gmail Poll [${uid.substring(0, 8)}]`, `/api/agents/email/poll-inbound?user_id=${uid}`, 'POST');
          await delay(1000);
          await callEndpoint(`IMAP Poll [${uid.substring(0, 8)}]`, `/api/agents/email/poll-imap?user_id=${uid}`, 'POST');
          await delay(1500);
        }
      });

      // 3bis. Email — separate fireBackground (was timing out when combined with DM)
      fireBackground(async () => {
        for (const uid of getClientsWithAgent('email')) {
          await callEndpoint(`Email Cold [${uid.substring(0, 8)}]`, `/api/agents/email/daily?slot=morning&types=restaurant,traiteur,boutique,coiffeur,fleuriste&user_id=${uid}`);
        }
      });

      // 4. Content + Publish — visibility
      fireBackground(async () => {
        for (const uid of getClientsWithAgent('content')) {
          await callEndpoint(`Content [${uid.substring(0, 8)}]`, `/api/agents/content?slot=morning&user_id=${uid}`);
          await delay(3000);
          await callEndpoint(`Publish [${uid.substring(0, 8)}]`, `/api/agents/content?user_id=${uid}`, 'POST', { action: 'execute_publication' });
        }
      });

      // 5. Support tasks — lower priority
      fireBackground(async () => {
        await callEndpoint('Trends Refresh', '/api/cron/refresh-trends');
        await callEndpoint('Diagnose Social', '/api/cron/diagnose-social');
        for (const uid of getClientsWithAgent('comptable')) {
          await callEndpoint(`Comptable [${uid.substring(0, 8)}]`, `/api/agents/comptable?user_id=${uid}`);
        }
        if (isSeoDay) {
          await callEndpoint('SEO', '/api/agents/seo');
        }
      });
      results.push({ task: 'Morning Batch', ok: true, data: { status: 'dispatched_background', clients: clientUserIds.length } });
      break;

    case 'midday_batch':
      // 10:00 UTC — Email #2 + Community + GMaps + Retention + Onboarding
      // Retention
      for (const uid of getClientsWithAgent('email')) {
        await callEndpoint(`Retention [${uid.substring(0, 8)}]`, `/api/agents/retention?user_id=${uid}`);
      }
      // Email cold #2
      for (const uid of getClientsWithAgent('email')) {
        await callEndpoint(`Email Cold [${uid.substring(0, 8)}]`, `/api/agents/email/daily?slot=midday&types=coach,freelance,services,professionnel&user_id=${uid}`);
      }
      // Community (comments + follows)
      for (const uid of getClientsWithAgent('content')) {
        callEndpoint(`Community [${uid.substring(0, 8)}]`, `/api/agents/content?slot=community&user_id=${uid}`).catch(() => {});
      }
      // GMaps
      for (const uid of getClientsWithAgent('gmaps')) {
        callEndpoint(`GMaps [${uid.substring(0, 8)}]`, `/api/agents/gmaps?user_id=${uid}`).catch(() => {});
      }
      // Onboarding
      for (const uid of clientUserIds) {
        await callEndpoint(`Onboarding [${uid.substring(0, 8)}]`, `/api/agents/onboarding?user_id=${uid}`);
      }
      break;

    case 'afternoon_batch':
      // 13:30 UTC — Content #2 + Email #3 + TikTok + LinkedIn + Discovery #2
      // All in background to avoid Vercel 300s timeout
      fireBackground(async () => {
        // Content midday + publish
        for (const uid of getClientsWithAgent('content')) {
          await callEndpoint(`Content midday [${uid.substring(0, 8)}]`, `/api/agents/content?slot=midday&user_id=${uid}`);
          await delay(3000);
          await callEndpoint(`Publish midday [${uid.substring(0, 8)}]`, `/api/agents/content?user_id=${uid}`, 'POST', { action: 'execute_publication' });
          await delay(3000);
        }
        // TikTok content (if connected, Mon/Wed only)
        if (isTiktokDay) {
          for (const uid of getClientsWithAgent('content')) {
            if (isNetworkActive(uid, 'content', 'tiktok')) {
              await callEndpoint(`Content TikTok [${uid.substring(0, 8)}]`, `/api/agents/content?slot=tiktok&user_id=${uid}`);
            }
          }
        }
        // LinkedIn content (if connected)
        for (const uid of getClientsWithAgent('linkedin')) {
          await callEndpoint(`Content LinkedIn [${uid.substring(0, 8)}]`, `/api/agents/content?slot=linkedin_1&user_id=${uid}`);
        }
        // Email cold #3 + warm
        for (const uid of getClientsWithAgent('email')) {
          await callEndpoint(`Email Cold [${uid.substring(0, 8)}]`, `/api/agents/email/daily?slot=afternoon&types=restaurant,pme,services&user_id=${uid}`);
          await delay(3000);
          await callEndpoint(`Email Warm [${uid.substring(0, 8)}]`, `/api/agents/email/daily?slot=warm&user_id=${uid}`);
        }
        // Discovery #2
        await callForEachClient('Commercial Prospect', '/api/agents/commercial', 'POST', { action: 'prospect_external' }, 'commercial');
        // DM auto-reply
        for (const uid of getClientsWithAgent('dm_instagram')) {
          await callEndpoint(`DM AutoReply [${uid.substring(0, 8)}]`, `/api/agents/dm-instagram/auto-reply?user_id=${uid}`, 'POST');
        }
      });
      results.push({ task: 'Afternoon Batch', ok: true, data: { status: 'dispatched_background', clients: clientUserIds.length } });
      break;

    case 'evening_batch':
      // 17:00 UTC — DM soir + Content #3 + Email #4 + Recap
      fireBackground(async () => {
        // DM evening
        for (const uid of getClientsWithAgent('dm_instagram')) {
          await callEndpoint(`DM Evening [${uid.substring(0, 8)}]`, `/api/agents/dm-instagram?slot=evening&user_id=${uid}`, 'POST');
          await delay(5000);
        }
        // Content evening + publish
        for (const uid of getClientsWithAgent('content')) {
          await callEndpoint(`Content evening [${uid.substring(0, 8)}]`, `/api/agents/content?slot=evening&user_id=${uid}`);
          await delay(5000);
          await callEndpoint(`Publish evening [${uid.substring(0, 8)}]`, `/api/agents/content?user_id=${uid}`, 'POST', { action: 'execute_publication' });
        }
        // Email cold #4 + recap
        for (const uid of getClientsWithAgent('email')) {
          await callEndpoint(`Email Cold [${uid.substring(0, 8)}]`, `/api/agents/email/daily?slot=evening&types=restaurant,bar,commerce&user_id=${uid}`);
          await delay(3000);
          await callEndpoint(`Email Recap [${uid.substring(0, 8)}]`, `/api/agents/email/daily?slot=recap&user_id=${uid}`);
        }
        // TikTok publish
        await callForEachClient('Publish TikTok', '/api/agents/content', 'POST', { action: 'execute_publication' }, 'content');
      });
      results.push({ task: 'Evening Batch', ok: true, data: { status: 'dispatched_background', clients: clientUserIds.length } });
      break;

    case 'prospect_external':
      // 14:00 UTC — Léo finds NEW prospects via Google Search (separate cron, needs full 300s)
      // NOT in fireBackground because Google Search grounding takes 60-120s per batch
      for (const uid of getClientsWithAgent('commercial')) {
        await callEndpoint(`Commercial Prospect [${uid.substring(0, 8)}]`, `/api/agents/commercial?user_id=${uid}`, 'POST', { action: 'prospect_external' });
      }
      break;

    case 'ceo_daily':
      // 18:30 UTC (20:30 Paris) — Evening pipeline: Marketing → CEO → AMIT → Ops
      // → Engagement sync → Followers snapshot → Client evening debrief.
      // Chosen so the client brief lands ~20:45 Paris: after the evening batch
      // (17:00 UTC) has completed and Brevo engagement signals have settled,
      // but while the client is still mentally in "end of day" mode and can
      // act on tomorrow's todos before winding down.
      // All in background to avoid the 300s serverless timeout.
      fireBackground(async () => {
        // Marketing analysis first (feeds CEO)
        await callEndpoint('Marketing Learn', '/api/agents/marketing', 'POST', { action: 'learn' });
        await delay(5000);
        // CEO daily brief (reads marketing insights)
        await callEndpoint('CEO Daily Brief', '/api/agents/ceo', 'POST', { action: 'daily_brief' });
        await delay(5000);
        // AMIT strategic (reads CEO + marketing)
        await callEndpoint('AMIT Strategic', '/api/agents/amit', 'POST', { action: 'analyze' });
        await delay(3000);
        // Ops health check + send report
        await callEndpoint('Ops Health', '/api/agents/ops', 'POST', { action: 'health_check' });
        await delay(5000);
        // Sync engagement (likes/comments/reach) from Instagram for every
        // client before the brief is rendered — otherwise engagement_data
        // stays null and the brief can't show real engagement numbers.
        await callEndpoint('Content Sync Engagement', '/api/agents/content/sync-engagement', 'POST');
        await delay(5000);
        // Snapshot followers/media counts into social_metrics so the
        // brief can show "+X followers aujourd'hui" (diff vs yesterday).
        await callEndpoint('Content Sync Social Metrics', '/api/agents/content/sync-social-metrics', 'POST');
        await delay(5000);
        // Clara proactive outreach: any client stuck under 50% dossier
        // completion after 3+ days gets offered a setup call. Runs once
        // per day from the ceo_daily slot so we don't spam at multiple
        // touch points.
        await callEndpoint('Clara Check Stuck', '/api/agents/onboarding/check-stuck', 'POST');
        await delay(3000);
        // Client evening debrief — each client gets "what ran today + what to do
        // tomorrow". Mirror of the morning brief, firing at 20h UTC (~22h Paris).
        await callEndpoint('Noah Client Evening Brief', '/api/agents/ceo-reports?type=client_evening', 'POST');
      });
      results.push({ task: 'CEO Daily', ok: true, data: { status: 'dispatched_background' } });
      break;

    // ════════════════════════════════════════════════════════════════
    // LEGACY INDIVIDUAL SLOTS (kept for backward compatibility)
    // These still work if called directly but are no longer in vercel.json
    // ════════════════════════════════════════════════════════════════

    case 'discovery':
      // 03:00 UTC — Commercial: verify CRM — PER CLIENT (commercial agent filter)
      await callForEachClient('Commercial Verify CRM', '/api/agents/commercial', 'POST', { action: 'verify_crm' }, 'commercial');
      // DM auto-reply polling (piggyback on discovery slots for wider coverage)
      for (const uid of getClientsWithAgent('dm_instagram')) {
        callEndpoint(`DM AutoReply [${uid.substring(0, 8)}]`, `/api/agents/dm-instagram/auto-reply?user_id=${uid}`, 'POST').catch(() => {});
      }
      break;

    case 'discovery_2':
      // 11:00 UTC — Commercial: external prospection — PER CLIENT
      await callForEachClient('Commercial Prospect External', '/api/agents/commercial', 'POST', { action: 'prospect_external' }, 'commercial');
      break;

    case 'discovery_3':
      // 14:00 UTC — Commercial: verify + prospect — PER CLIENT
      await callForEachClient('Commercial Verify CRM #2', '/api/agents/commercial', 'POST', { action: 'verify_crm' }, 'commercial');
      await delay(15000);
      await callForEachClient('Commercial Prospect External #2', '/api/agents/commercial', 'POST', { action: 'prospect_external' }, 'commercial');
      break;

    case 'discovery_4':
      // 08:30 UTC — Commercial: verify CRM — PER CLIENT
      await callForEachClient('Commercial Verify CRM #3', '/api/agents/commercial', 'POST', { action: 'verify_crm' }, 'commercial');
      break;

    case 'discovery_5':
      // 13:00 UTC — Commercial: prospect external — PER CLIENT
      await callForEachClient('Commercial Prospect External #3', '/api/agents/commercial', 'POST', { action: 'prospect_external' }, 'commercial');
      break;

    case 'content_2':
      // 13:30 UTC — Content: 2nd post (IG + TikTok + LinkedIn) — PER CLIENT
      for (const uid of getClientsWithAgent('content')) {
        await callEndpoint(`Content midday [${uid.substring(0, 8)}]`, `/api/agents/content?slot=midday&user_id=${uid}`);
        await callEndpoint(`Publish midday [${uid.substring(0, 8)}]`, `/api/agents/content?user_id=${uid}`, 'POST', { action: 'execute_publication' });
      }
      // TikTok content — only for clients with TikTok connected
      if (isTiktokDay) {
        for (const uid of getClientsWithAgent('content')) {
          if (isNetworkActive(uid, 'content', 'tiktok')) {
            await callEndpoint(`Content TikTok [${uid.substring(0, 8)}]`, `/api/agents/content?slot=tiktok&user_id=${uid}`);
          }
        }
      }
      // LinkedIn content — only for clients with LinkedIn connected
      for (const uid of getClientsWithAgent('linkedin')) {
        await callEndpoint(`Content LinkedIn [${uid.substring(0, 8)}]`, `/api/agents/content?slot=linkedin_1&user_id=${uid}`);
      }
      // TikTok DM — only for clients with TikTok DM active
      fireBackground(async () => {
        for (const uid of getClientsWithAgent('dm_instagram')) {
          if (isNetworkActive(uid, 'dm_instagram', 'tiktok')) {
            await callEndpoint(`DM TikTok [${uid.substring(0, 8)}]`, `/api/agents/dm-instagram?platform=tiktok&count=20&user_id=${uid}`, 'POST');
            await delay(10000);
          }
        }
      });
      break;

    case 'content_3':
      // 17:30 UTC — Content: 3rd post — PER CLIENT
      for (const uid of getClientsWithAgent('content')) {
        await callEndpoint(`Content evening [${uid.substring(0, 8)}]`, `/api/agents/content?slot=evening&user_id=${uid}`);
        await callEndpoint(`Publish evening [${uid.substring(0, 8)}]`, `/api/agents/content?user_id=${uid}`, 'POST', { action: 'execute_publication' });
      }
      // DM auto-reply polling
      for (const uid of getClientsWithAgent('dm_instagram')) {
        callEndpoint(`DM AutoReply [${uid.substring(0, 8)}]`, `/api/agents/dm-instagram/auto-reply?user_id=${uid}`, 'POST').catch(() => {});
      }
      break;

    case 'content_tiktok':
      // 18:15 UTC — TikTok video — PER CLIENT
      await callForEachClient('Content TikTok', '/api/agents/content?slot=tiktok', 'GET', undefined, 'content');
      break;

    case 'content_tiktok_2':
      // 13:30 UTC — TikTok video #2 — PER CLIENT
      await callForEachClient('Content TikTok #2', '/api/agents/content?slot=tiktok', 'GET', undefined, 'content');
      break;

    case 'content_tiktok_3':
      // 17:00 UTC — Content: TikTok video #3 — PER CLIENT
      await callForEachClient('Content (TikTok #3)', '/api/agents/content?slot=tiktok', 'GET', undefined, 'content');
      break;

    case 'content_linkedin_1':
      // 09:30 UTC — LinkedIn: 1st post — PER CLIENT (linkedin agent filter)
      await callForEachClient('Content (LinkedIn AM)', '/api/agents/content?slot=linkedin_1', 'GET', undefined, 'linkedin');
      break;

    case 'content_linkedin_2':
      // 14:20 UTC — LinkedIn: 2nd post — PER CLIENT
      await callForEachClient('Content (LinkedIn PM)', '/api/agents/content?slot=linkedin_2', 'GET', undefined, 'linkedin');
      break;

    case 'content_linkedin_3':
      // 16:00 UTC — LinkedIn: 3rd post — PER CLIENT
      await callForEachClient('Content (LinkedIn #3)', '/api/agents/content?slot=linkedin_1', 'GET', undefined, 'linkedin');
      break;

    case 'discovery_6':
      // 16:30 UTC — Commercial: full EOD — PER CLIENT
      fireBackground(async () => {
        await callForEachClient('Commercial Full EOD', '/api/agents/commercial', 'POST', { action: 'full' }, 'commercial');
      });
      results.push({ task: 'Commercial Full EOD', ok: true, data: { status: 'dispatched_background' } });
      break;

    case 'email_warm_2':
      // 14:30 UTC — Email warm: follow-up batch 2 — PER CLIENT + Marketing afternoon (global)
      await callForEachClient('Email Warm #2', '/api/agents/email/daily?type=warm', 'GET', undefined, 'email');
      // Marketing afternoon: sequential to avoid concurrent marketing agent calls
      fireBackground(async () => {
        await callEndpoint('Marketing Sync Analytics (afternoon)', '/api/agents/marketing', 'POST', { action: 'sync_publication_analytics' });
        await delay(15000);
        await callEndpoint('Marketing Analysis (afternoon)', '/api/agents/marketing', 'POST', { action: 'analyze_publications' });
      });
      results.push({ task: 'Marketing Afternoon', ok: true, data: { status: 'dispatched_background' } });
      break;

    case 'email_recap':
      // DESACTIVE — causait du spam (re-envoi a tous les types deja contactes dans la journee)
      // Le dedup same-day protege maintenant mais on ne relance plus en fin de journee
      results.push({ task: 'Email Recap (disabled anti-spam)', ok: true, data: { skipped: true } });
      break;

    case 'community_2':
      // 15:30 UTC — Community Manager afternoon: staggered to avoid concurrent marketing agent calls
      fireBackground(async () => {
        await callEndpoint('Community Comments PM', '/api/agents/marketing', 'POST', { action: 'prepare_comments', count: 15 });
        await delay(15000);
        await callEndpoint('Community Follow IG PM', '/api/agents/marketing', 'POST', { action: 'find_follow_targets', platform: 'instagram', count: 15 });
        await delay(15000);
        await callEndpoint('Community Follow TT PM', '/api/agents/marketing', 'POST', { action: 'find_follow_targets', platform: 'tiktok', count: 10 });
      });
      results.push({ task: 'Community PM', ok: true, data: { status: 'dispatched_background' } });
      break;

    case 'community':
      // 09:30 UTC — Community tasks (gérées par Lena/Content via endpoint marketing)
      // Commentaires engagement + ciblage follow IG + ciblage follow TT
      fireBackground(async () => {
        await callEndpoint('Lena Community: Comments', '/api/agents/marketing', 'POST', { action: 'prepare_comments', count: 15 });
        await delay(15000);
        await callEndpoint('Lena Community: Follow IG', '/api/agents/marketing', 'POST', { action: 'find_follow_targets', platform: 'instagram', count: 15 });
        await delay(15000);
        await callEndpoint('Lena Community: Follow TT', '/api/agents/marketing', 'POST', { action: 'find_follow_targets', platform: 'tiktok', count: 10 });
      });
      results.push({ task: 'Lena Community (comments + follows)', ok: true, data: { status: 'dispatched_background' } });
      break;

    case 'marketing_prep':
      // 04:50 UTC — Marketing: sync analytics + analysis (runs 10 min before CEO so stats are ready)
      // Sequential: sync first, then analysis (analysis needs fresh data from sync)
      fireBackground(async () => {
        await callEndpoint('Marketing Sync Analytics', '/api/agents/marketing', 'POST', { action: 'sync_publication_analytics' });
        await delay(15000);
        await callEndpoint('Marketing Analysis (morning)', '/api/agents/marketing', 'GET');
      });
      results.push({ task: 'Marketing Prep', ok: true, data: { status: 'dispatched_background' } });
      break;

    case 'ceo':
      // 05:00 UTC — CEO: events + reports + brief + orders (SPLIT to avoid 300s timeout)
      // Phase 1: Event pipeline + reports (background, non-blocking)
      fireBackground(async () => {
        try {
          const eventResult = await processEventPipeline(aiSupabase);
          console.log(`[Scheduler/ceo] Event pipeline: ${eventResult.actions} actions dispatched`);
        } catch (e: any) { console.error('[Scheduler/ceo] Event pipeline error:', e.message?.substring(0, 200)); }
        await delay(3000);
        // Only improvement report in the morning (includes stats + code reco)
        // Status report removed to avoid double email
        await callEndpoint('CEO Improvement Report', '/api/agents/ceo-reports?type=improvement', 'POST');

        // Phase 1.5: CEO auto-fix — analyze recent failures and fix configs
        try {
          const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const { data: recentFailures } = await aiSupabase
            .from('agent_logs')
            .select('agent, data')
            .eq('action', 'execution_failure')
            .gte('created_at', twentyFourHoursAgo);
          if (recentFailures && recentFailures.length > 0) {
            // Group by agent and count
            const issueMap: Record<string, { error: string; count: number }> = {};
            for (const f of recentFailures) {
              const key = f.agent;
              if (!issueMap[key]) issueMap[key] = { error: f.data?.error || 'unknown', count: 0 };
              issueMap[key].count++;
            }
            const issues = Object.entries(issueMap).map(([agent, data]) => ({ agent, ...data }));
            const fixes = await analyzeAndFix(aiSupabase, issues);
            if (fixes.length > 0) console.log(`[Scheduler/ceo] Auto-fix: ${fixes.filter(f => f.success).length}/${fixes.length} fixes applied`);
          }
        } catch (e: any) { console.error('[Scheduler/ceo] Auto-fix error:', e.message?.substring(0, 200)); }

        // Phase 1.6: CEO Group report — aggregate all client reports → admin code recommendations
        try {
          await sendCeoGroupReport(aiSupabase);
          console.log('[Scheduler/ceo] CEO Group report sent to admin');
        } catch (e: any) { console.error('[Scheduler/ceo] CEO Group error:', e.message?.substring(0, 200)); }
      });
      // Phase 2: Orders only (no morning client brief — user asked for a
      // single Noah email per day, fired in the evening slot so it reports
      // what actually ran that day).
      fireBackground(async () => {
        await delay(60000);
        await callEndpoint('Execute Orders', '/api/agents/orders');
      });
      results.push({ task: 'CEO Brief + Reports + Orders', ok: true, data: { status: 'dispatched_background' } });
      break;

    case 'ceo_community':
      // 05:15 UTC — Community early prep (split from CEO to avoid timeout)
      fireBackground(async () => {
        await callEndpoint('Community Comments (early)', '/api/agents/marketing', 'POST', { action: 'prepare_comments', count: 10 });
        await delay(15000);
        await callEndpoint('Community Follow Targets IG (early)', '/api/agents/marketing', 'POST', { action: 'find_follow_targets', platform: 'instagram', count: 10 });
      });
      results.push({ task: 'CEO Community', ok: true, data: { status: 'dispatched_background' } });
      break;

    case 'trends':
      // 05:30 UTC — Refresh news trends
      await callEndpoint('Refresh Trends', '/api/cron/refresh-trends');
      break;

    case 'early_morning':
      // 06:00 UTC — Restaurants/traiteurs — PER CLIENT
      await callForEachClient('Email Cold (restaurants)', '/api/agents/email/daily?slot=early_morning&types=restaurant,traiteur,caviste', 'GET', undefined, 'email');
      break;

    case 'morning_prep':
      // 07:00 UTC — DM prep + SEO + Content — PER CLIENT (filtered by active agents)
      fireBackground(async () => {
        // DM: auto-reply to pending DMs + prepare proactive DMs
        for (const uid of getClientsWithAgent('dm_instagram')) {
          // Poll & auto-reply first (fast, low cost — only API call, AI only if needed)
          await callEndpoint(`DM AutoReply [${uid.substring(0, 8)}]`, `/api/agents/dm-instagram/auto-reply?user_id=${uid}`, 'POST');
          await delay(3000);
          // Then prepare proactive DMs
          await callEndpoint(`DM Instagram [${uid.substring(0, 8)}]`, `/api/agents/dm-instagram?slot=morning&user_id=${uid}`, 'POST');
          await delay(5000);
        }
        // TikTok DM — only if client has TikTok DM active (merged from tiktok_dm_morning)
        for (const uid of getClientsWithAgent('dm_instagram')) {
          if (isNetworkActive(uid, 'dm_instagram', 'tiktok')) {
            await callEndpoint(`DM TikTok [${uid.substring(0, 8)}]`, `/api/agents/dm-instagram?platform=tiktok&count=20&user_id=${uid}`, 'POST');
            await delay(10000);
          }
        }
        // Content: only for clients with content active
        for (const uid of getClientsWithAgent('content')) {
          await callEndpoint(`Content [${uid.substring(0, 8)}]`, `/api/agents/content?slot=morning&user_id=${uid}`);
          await delay(5000);
          await callEndpoint(`Publish [${uid.substring(0, 8)}]`, `/api/agents/content?user_id=${uid}`, 'POST', { action: 'execute_publication' });
          await delay(5000);
        }
        // SEO runs once globally (shared analysis)
        await callEndpoint('SEO', '/api/agents/seo');
      });
      results.push({ task: 'Morning Prep', ok: true, data: { status: 'dispatched_background', clients: clientUserIds.length } });
      break;

    case 'morning':
      // 08:00 UTC — Boutiques/coiffeurs + onboarding — PER CLIENT (email agent filter)
      for (const uid of getClientsWithAgent('email')) {
        await callEndpoint(`Email Cold [${uid.substring(0, 8)}]`, `/api/agents/email/daily?slot=morning&types=boutique,coiffeur,fleuriste&user_id=${uid}`);
      }
      // Onboarding runs for all clients (no agent filter)
      for (const uid of clientUserIds) {
        await callEndpoint(`Onboarding [${uid.substring(0, 8)}]`, `/api/agents/onboarding?user_id=${uid}`);
      }
      break;

    case 'midday':
      // 10:00 UTC — Coachs/freelances + warm — PER CLIENT (email agent filter)
      for (const uid of getClientsWithAgent('email')) {
        await callEndpoint(`Email Cold [${uid.substring(0, 8)}]`, `/api/agents/email/daily?slot=midday&types=coach,freelance,services,professionnel&user_id=${uid}`);
        await callEndpoint(`Email Warm [${uid.substring(0, 8)}]`, `/api/agents/email/daily?type=warm&user_id=${uid}`);
      }
      break;

    case 'afternoon':
      // 12:00 UTC — Restaurants/PME — PER CLIENT
      await callForEachClient('Email Cold (midi)', '/api/agents/email/daily?slot=afternoon&types=restaurant,traiteur,pme,agence', 'GET', undefined, 'email');
      break;

    case 'retention':
      // 09:00 UTC — Retention checks — PER CLIENT
      await callForEachClient('Retention', '/api/agents/retention');
      break;

    case 'ceo_evening':
      // 15:00 UTC — CEO evening: SPLIT into 2 background tasks to avoid 300s timeout
      // Phase 1: Events only (fast, < 60s) — no status report to avoid double email
      fireBackground(async () => {
        try {
          const eventResult = await processEventPipeline(aiSupabase);
          console.log(`[Scheduler/ceo_evening] Event pipeline: ${eventResult.actions} actions dispatched`);
        } catch (e: any) { console.error('[Scheduler/ceo_evening] Event pipeline error:', e.message?.substring(0, 200)); }
        try { await sendCeoGroupReport(aiSupabase); } catch {}
      });
      // Phase 2: Brief + orders (separate, can take up to 300s)
      fireBackground(async () => {
        await delay(30000); // Wait 30s for phase 1
        // CEO Brief removed for admin — only orders
        await callEndpoint('Execute Orders', '/api/agents/orders');
      });
      results.push({ task: 'CEO Evening (split)', ok: true, data: { status: 'dispatched_background' } });
      break;

    case 'evening':
      // 16:00 UTC — Restaurants/bars — PER CLIENT
      await callForEachClient('Email Cold (soir)', '/api/agents/email/daily?slot=evening&types=restaurant,caviste,traiteur', 'GET', undefined, 'email');
      break;

    case 'evening_prep':
      // 17:00 UTC — Evening DM — PER CLIENT (dm_instagram agent filter)
      fireBackground(async () => {
        for (const uid of getClientsWithAgent('dm_instagram')) {
          // Poll & auto-reply first
          await callEndpoint(`DM AutoReply [${uid.substring(0, 8)}]`, `/api/agents/dm-instagram/auto-reply?user_id=${uid}`, 'POST');
          await delay(3000);
          await callEndpoint(`DM Instagram [${uid.substring(0, 8)}]`, `/api/agents/dm-instagram?slot=evening&user_id=${uid}`, 'POST');
          await delay(5000);
        }
      });
      results.push({ task: 'Evening Prep', ok: true, data: { status: 'dispatched_background', clients: clientUserIds.length } });
      break;

    case 'tiktok_dm_morning':
      // 07:30 UTC — TikTok DM — PER CLIENT (dm_instagram agent filter)
      fireBackground(async () => {
        for (const uid of getClientsWithAgent('dm_instagram')) {
          await callEndpoint(`DM TikTok [${uid.substring(0, 8)}]`, `/api/agents/dm-instagram?platform=tiktok&count=20&user_id=${uid}`, 'POST');
          await delay(10000);
        }
      });
      results.push({ task: 'TikTok DM Morning', ok: true, data: { status: 'dispatched_background', clients: clientUserIds.length } });
      break;

    case 'tiktok_dm_midday':
      // 12:30 UTC — TikTok DM midday — PER CLIENT (dm_instagram agent filter)
      fireBackground(async () => {
        for (const uid of getClientsWithAgent('dm_instagram')) {
          await callEndpoint(`DM TikTok [${uid.substring(0, 8)}]`, `/api/agents/dm-instagram?platform=tiktok&count=20&user_id=${uid}`, 'POST');
          await delay(10000);
        }
      });
      results.push({ task: 'TikTok DM Midday', ok: true, data: { status: 'dispatched_background', clients: clientUserIds.length } });
      break;

    case 'tiktok_dm_evening':
      // 17:30 UTC — TikTok DM evening — PER CLIENT (dm_instagram agent filter)
      fireBackground(async () => {
        for (const uid of getClientsWithAgent('dm_instagram')) {
          await callEndpoint(`DM TikTok [${uid.substring(0, 8)}]`, `/api/agents/dm-instagram?platform=tiktok&count=20&user_id=${uid}`, 'POST');
        }
      });
      results.push({ task: 'TikTok DM Evening', ok: true, data: { status: 'dispatched_background', clients: clientUserIds.length } });
      break;

    case 'discovery_7':
      // 18:00 UTC — Commercial: prospect external #4 (evening batch)
      await callEndpoint('Commercial Prospect External #4', '/api/agents/commercial', 'POST', { action: 'prospect_external' });
      break;

    case 'ceo_night':
      // 20:00 UTC — CEO brief #3 (bilan de fin de journée) + execute orders + RAG embedding backfill
      fireBackground(async () => {
        // CEO Brief removed for admin — only orders + RAG
        await callEndpoint('Execute Orders', '/api/agents/orders');
        await delay(5000);
        // Auto-backfill des embeddings RAG (pour les nouveaux learnings de la journee)
        await callEndpoint('RAG Embedding Backfill', '/api/agents/knowledge-backfill?batch=200', 'POST');
      });
      results.push({ task: 'CEO Brief Night + Orders + RAG Backfill', ok: true, data: { status: 'dispatched_background' } });
      break;

    case 'marketing_learn':
      // 19:00 UTC — Marketing: sync analytics, analyze publications, full analysis + advise agents + widget learning
      fireBackground(async () => {
        await callEndpoint('Sync Publication Analytics', '/api/agents/marketing', 'POST', { action: 'sync_publication_analytics' });
        await delay(15000);
        await callEndpoint('Analyze Publications', '/api/agents/marketing', 'POST', { action: 'analyze_publications', days: 30 });
        await delay(15000);
        await callEndpoint('Marketing Analysis', '/api/agents/marketing');
        await delay(15000);
        await callEndpoint('Marketing Advise Agents', '/api/agents/marketing', 'POST', { action: 'advise_agents' });
        await delay(10000);
        // Analyze widget conversations → extract learnings → RAG
        await callEndpoint('Widget Learning', '/api/widget/learn', 'POST');
      });
      results.push({ task: 'Marketing Learn + Widget Learning', ok: true, data: { status: 'dispatched_background' } });
      break;

    case 'video_poll':
      // Every 10 min (via external cron) — Poll & advance async video generation jobs
      // Advances multi-segment video jobs (30s+ TikTok) and publishes when complete
      await callEndpoint('Video Poll', '/api/cron/video-poll');
      break;

    case 'publish_scheduled':
      // Every 15 min — Auto-publish user-scheduled posts from calendar
      await callEndpoint('Publish Scheduled Posts', '/api/cron/publish-scheduled');
      break;

    case 'tiktok_publish':
      // 19:30 UTC (21h30 Paris) — Publish ALL pending content — PER CLIENT
      await callForEachClient('Publish Reels+TikTok', '/api/agents/content', 'POST', { action: 'execute_publication' }, 'content');
      break;

    case 'amit':
      // 21:00 UTC — AMIT Strategic Analysis (after ALL agents finished their day)
      // Reads all learnings, feedbacks, CRM data → generates strategic intelligence
      await callEndpoint('AMIT Strategic Analysis', '/api/agents/amit', 'POST', { action: 'analyze' });
      break;

    case 'ops':
      // 22:00 UTC — Ops Health Check + CEO Group evening report
      await callEndpoint('Ops Health Check', '/api/agents/ops', 'POST', { action: 'health_check' });
      // CEO Group: 2x/jour seulement (matin + soir), pas la nuit
      break;

    case 'gmaps':
      // 10:30 UTC — Google Maps: scan new prospects + reviews — PER CLIENT
      await callForEachClient('Google Maps Scan', '/api/agents/gmaps', 'POST', {}, 'gmaps');
      // Also respond to Google reviews
      await callForEachClient('Google Reviews Reply', '/api/agents/google-reviews', 'GET', undefined, 'gmaps');
      break;

    case 'comptable':
      // 08:15 UTC — Comptable: daily finance check
      await callEndpoint('Comptable Daily', '/api/agents/comptable');
      break;

    case 'whatsapp_followup':
      // 10:15 UTC — WhatsApp: follow-up — PER CLIENT
      await callForEachClient('WhatsApp Followup', '/api/agents/whatsapp', 'POST', { action: 'send_followup' }, 'whatsapp');
      break;

    default:
      return NextResponse.json({ ok: false, error: `Unknown slot: ${slot}` }, { status: 400 });
  }

  const succeeded = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;

  console.log(`[Scheduler] Slot "${slot}" done: ${succeeded} ok, ${failed} failed`);

  return NextResponse.json({
    ok: failed === 0,
    slot,
    succeeded,
    failed,
    results,
  });
}
