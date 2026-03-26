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

  // TODO [Phase B5 — Multi-org]: Iterate over all active orgs and dispatch each slot
  // per org, passing ?org_id=<id> to each agent endpoint. For now, runs without org_id
  // (single-tenant mode, backwards compatible).
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

  const results: { task: string; ok: boolean; data?: any; error?: string }[] = [];

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
    case 'discovery':
      // 03:00 UTC — Commercial: verify CRM (audit existing prospects)
      await callEndpoint('Commercial Verify CRM', '/api/agents/commercial', 'POST', { action: 'verify_crm' });
      break;

    case 'discovery_2':
      // 11:00 UTC — Commercial: external prospection (Google Search for social)
      await callEndpoint('Commercial Prospect External', '/api/agents/commercial', 'POST', { action: 'prospect_external' });
      break;

    case 'discovery_3':
      // 14:00 UTC — Commercial: verify CRM batch 2 + prospect external batch 2
      // Sequential to avoid hitting same agent route concurrently
      await callEndpoint('Commercial Verify CRM #2', '/api/agents/commercial', 'POST', { action: 'verify_crm' });
      await delay(15000);
      await callEndpoint('Commercial Prospect External #2', '/api/agents/commercial', 'POST', { action: 'prospect_external' });
      break;

    case 'discovery_4':
      // 08:30 UTC — Commercial: verify CRM batch 3
      await callEndpoint('Commercial Verify CRM #3', '/api/agents/commercial', 'POST', { action: 'verify_crm' });
      break;

    case 'discovery_5':
      // 13:00 UTC — Commercial: prospect external batch 3
      await callEndpoint('Commercial Prospect External #3', '/api/agents/commercial', 'POST', { action: 'prospect_external' });
      break;

    case 'content_2':
      // 13:30 UTC — Content: 2nd post of the day (midday pillar) + PUBLISH
      await callEndpoint('Content (midday)', '/api/agents/content?slot=midday');
      await callEndpoint('Publish midday content', '/api/agents/content', 'POST', { action: 'execute_publication' });
      break;

    case 'content_3':
      // 17:30 UTC — Content: 3rd post of the day (evening pillar) + PUBLISH
      await callEndpoint('Content (evening)', '/api/agents/content?slot=evening');
      await callEndpoint('Publish evening content', '/api/agents/content', 'POST', { action: 'execute_publication' });
      break;

    case 'content_tiktok':
      // 18:15 UTC — Content: TikTok video #1 (soir, prime time)
      await callEndpoint('Content (TikTok #1)', '/api/agents/content?slot=tiktok');
      break;

    case 'content_tiktok_2':
      // 13:30 UTC — Content: TikTok video #2 (apres-midi)
      await callEndpoint('Content (TikTok #2)', '/api/agents/content?slot=tiktok');
      break;

    case 'content_tiktok_3':
      // 17:00 UTC — Content: TikTok video #3 (fin journee)
      await callEndpoint('Content (TikTok #3)', '/api/agents/content?slot=tiktok');
      break;

    case 'content_linkedin_1':
      // 09:30 UTC — LinkedIn: 1st post of the day (morning professional)
      await callEndpoint('Content (LinkedIn AM)', '/api/agents/content?slot=linkedin_1');
      break;

    case 'content_linkedin_2':
      // 14:20 UTC — LinkedIn: 2nd post (afternoon professional)
      await callEndpoint('Content (LinkedIn PM)', '/api/agents/content?slot=linkedin_2');
      break;

    case 'content_linkedin_3':
      // 16:00 UTC — LinkedIn: 3rd post (fin de journee pro)
      await callEndpoint('Content (LinkedIn #3)', '/api/agents/content?slot=linkedin_1');
      break;

    case 'discovery_6':
      // 16:30 UTC — Commercial: full run (end of day cleanup)
      fireBackground(async () => {
        await callEndpoint('Commercial Full EOD', '/api/agents/commercial', 'POST', { action: 'full' });
      });
      results.push({ task: 'Commercial Full EOD', ok: true, data: { status: 'dispatched_background' } });
      break;

    case 'email_warm_2':
      // 14:30 UTC — Email warm: follow-up batch 2 + Marketing afternoon (mid-day analysis for CEO evening at 15:00)
      await callEndpoint('Email Warm #2', '/api/agents/email/daily?type=warm');
      // Marketing afternoon: sequential to avoid concurrent marketing agent calls
      fireBackground(async () => {
        await callEndpoint('Marketing Sync Analytics (afternoon)', '/api/agents/marketing', 'POST', { action: 'sync_publication_analytics' });
        await delay(15000);
        await callEndpoint('Marketing Analysis (afternoon)', '/api/agents/marketing', 'POST');
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
      // 09:30 UTC — Community Manager: staggered to avoid concurrent marketing agent calls
      fireBackground(async () => {
        await callEndpoint('Community Comments', '/api/agents/marketing', 'POST', { action: 'prepare_comments', count: 15 });
        await delay(15000);
        await callEndpoint('Community Follow Targets IG', '/api/agents/marketing', 'POST', { action: 'find_follow_targets', platform: 'instagram', count: 15 });
        await delay(15000);
        await callEndpoint('Community Follow Targets TT', '/api/agents/marketing', 'POST', { action: 'find_follow_targets', platform: 'tiktok', count: 10 });
      });
      results.push({ task: 'Community', ok: true, data: { status: 'dispatched_background' } });
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
        await callEndpoint('CEO Improvement Report', '/api/agents/ceo-reports?type=improvement', 'POST');
        await delay(5000);
        await callEndpoint('CEO Status Report AM', '/api/agents/ceo-reports?type=status', 'POST');

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
      // Phase 2: CEO brief + orders (separate background to avoid timeout)
      fireBackground(async () => {
        await delay(60000); // Wait 60s for reports to finish
        await callEndpoint('CEO Brief', '/api/agents/ceo');
        await delay(10000);
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
      // 06:00 UTC — Restaurants/traiteurs (ouverture cuisine, check emails avant service)
      await callEndpoint('Email Cold (restaurants)', '/api/agents/email/daily?slot=early_morning&types=restaurant,traiteur,caviste');
      break;

    case 'morning_prep':
      // 07:00 UTC — DM prep (IG only) + SEO + Content matin + PUBLISH
      fireBackground(async () => {
        await callEndpoint('DM Instagram (morning)', '/api/agents/dm-instagram?slot=morning', 'POST');
        await delay(15000);
        await callEndpoint('SEO', '/api/agents/seo');
        await delay(15000);
        await callEndpoint('Content (morning)', '/api/agents/content?slot=morning');
        await delay(10000);
        await callEndpoint('Publish morning content', '/api/agents/content', 'POST', { action: 'execute_publication' });
      });
      results.push({ task: 'Morning Prep', ok: true, data: { status: 'dispatched_background' } });
      break;

    case 'morning':
      // 08:00 UTC — Boutiques/coiffeurs/fleuristes (ouverture magasin) + onboarding (parallel)
      await callParallel(
        ['Email Cold (boutiques)', '/api/agents/email/daily?slot=morning&types=boutique,coiffeur,fleuriste'],
        ['Onboarding', '/api/agents/onboarding'],
      );
      break;

    case 'midday':
      // 10:00 UTC — Coachs/freelances/services (fin de séances matin) + warm (parallel)
      await callParallel(
        ['Email Cold (coachs)', '/api/agents/email/daily?slot=midday&types=coach,freelance,services,professionnel'],
        ['Email Warm', '/api/agents/email/daily?type=warm'],
      );
      break;

    case 'afternoon':
      // 12:00 UTC — Restaurants (entre services) + PME/agences (pause déjeuner)
      await callEndpoint('Email Cold (midi)', '/api/agents/email/daily?slot=afternoon&types=restaurant,traiteur,pme,agence');
      break;

    case 'retention':
      // 09:00 UTC — Retention checks
      await callEndpoint('Retention', '/api/agents/retention');
      break;

    case 'ceo_evening':
      // 15:00 UTC — CEO: events → status report PM → brief → orders
      fireBackground(async () => {
        try {
          const eventResult = await processEventPipeline(aiSupabase);
          console.log(`[Scheduler/ceo_evening] Event pipeline: ${eventResult.actions} actions dispatched`);
        } catch (e: any) { console.error('[Scheduler/ceo_evening] Event pipeline error:', e.message?.substring(0, 200)); }
        await delay(5000);
        await callEndpoint('CEO Status Report PM', '/api/agents/ceo-reports?type=status', 'POST');
        await delay(5000);
        // CEO Group report PM
        try { await sendCeoGroupReport(aiSupabase); } catch {}
        await delay(10000);
        await callEndpoint('CEO Brief (afternoon)', '/api/agents/ceo');
        await callEndpoint('Execute Orders', '/api/agents/orders');
        await delay(5000);
        // Send CEO brief to each client (daily)
        await callEndpoint('CEO Client Brief', '/api/agents/ceo-reports?type=client_brief', 'POST');
      });
      results.push({ task: 'CEO Brief PM + Orders + Group + Client Briefs', ok: true, data: { status: 'dispatched_background' } });
      break;

    case 'evening':
      // 16:00 UTC — Restaurants/bars (avant service du soir) + tous les restants
      await callEndpoint('Email Cold (soir)', '/api/agents/email/daily?slot=evening&types=restaurant,caviste,traiteur');
      break;

    case 'evening_prep':
      // 17:00 UTC — Evening DM (IG only)
      fireBackground(async () => {
        await callEndpoint('DM Instagram (evening)', '/api/agents/dm-instagram?slot=evening', 'POST');
      });
      results.push({ task: 'Evening Prep', ok: true, data: { status: 'dispatched_background' } });
      break;

    case 'tiktok_dm_morning':
      // 07:30 UTC — TikTok DM preparation (morning batch, staggered)
      fireBackground(async () => {
        await callEndpoint('DM TikTok Batch 1', '/api/agents/dm-instagram?platform=tiktok&count=20', 'POST');
        await delay(15000);
        await callEndpoint('DM TikTok Batch 2', '/api/agents/dm-instagram?platform=tiktok&count=20', 'POST');
      });
      results.push({ task: 'TikTok DM Morning', ok: true, data: { status: 'dispatched_background' } });
      break;

    case 'tiktok_dm_midday':
      // 12:30 UTC — TikTok DM preparation (midday batch, staggered)
      fireBackground(async () => {
        await callEndpoint('DM TikTok Batch 3', '/api/agents/dm-instagram?platform=tiktok&count=20', 'POST');
        await delay(15000);
        await callEndpoint('DM TikTok Batch 4', '/api/agents/dm-instagram?platform=tiktok&count=20', 'POST');
      });
      results.push({ task: 'TikTok DM Midday', ok: true, data: { status: 'dispatched_background' } });
      break;

    case 'tiktok_dm_evening':
      // 17:30 UTC — TikTok DM preparation: evening batch
      fireBackground(async () => {
        await callEndpoint('DM TikTok Evening', '/api/agents/dm-instagram?platform=tiktok&count=20', 'POST');
      });
      results.push({ task: 'TikTok DM Evening', ok: true, data: { status: 'dispatched_background' } });
      break;

    case 'discovery_7':
      // 18:00 UTC — Commercial: prospect external #4 (evening batch)
      await callEndpoint('Commercial Prospect External #4', '/api/agents/commercial', 'POST', { action: 'prospect_external' });
      break;

    case 'ceo_night':
      // 20:00 UTC — CEO brief #3 (bilan de fin de journée) + execute orders
      // Runs after marketing_learn (19:00), so CEO has full day data + agent performance analysis
      // CEO reviews: all executed orders results, day metrics, plans tomorrow's priorities
      fireBackground(async () => {
        await callEndpoint('CEO Brief (night)', '/api/agents/ceo');
        await callEndpoint('Execute Orders', '/api/agents/orders');
      });
      results.push({ task: 'CEO Brief Night + Orders', ok: true, data: { status: 'dispatched_background' } });
      break;

    case 'marketing_learn':
      // 19:00 UTC — Marketing: sync analytics, analyze publications, full analysis + advise agents
      // All sequential with stagger — same marketing agent route, can't run concurrently
      fireBackground(async () => {
        await callEndpoint('Sync Publication Analytics', '/api/agents/marketing', 'POST', { action: 'sync_publication_analytics' });
        await delay(15000);
        await callEndpoint('Analyze Publications', '/api/agents/marketing', 'POST', { action: 'analyze_publications', days: 30 });
        await delay(15000);
        await callEndpoint('Marketing Analysis', '/api/agents/marketing');
        await delay(15000);
        await callEndpoint('Marketing Advise Agents', '/api/agents/marketing', 'POST', { action: 'advise_agents' });
      });
      results.push({ task: 'Marketing Learn', ok: true, data: { status: 'dispatched_background' } });
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
      // 19:30 UTC (21h30 Paris) — Publish ALL pending content (Reels + TikTok videos)
      await callEndpoint('Publish Reels+TikTok', '/api/agents/content', 'POST', { action: 'execute_publication' });
      break;

    case 'amit':
      // 21:00 UTC — AMIT Strategic Analysis (after ALL agents finished their day)
      // Reads all learnings, feedbacks, CRM data → generates strategic intelligence
      await callEndpoint('AMIT Strategic Analysis', '/api/agents/amit', 'POST', { action: 'analyze' });
      break;

    case 'ops':
      // 22:00 UTC — Ops Health Check + CEO Group evening report
      await callEndpoint('Ops Health Check', '/api/agents/ops', 'POST', { action: 'health_check' });
      // 3eme rapport CEO Group de la journee (bilan complet)
      fireBackground(async () => {
        try { await sendCeoGroupReport(aiSupabase); } catch {}
      });
      break;

    case 'gmaps':
      // 10:30 UTC — Google Maps: scan reviews + respond
      await callEndpoint('Google Maps Scan', '/api/agents/gmaps');
      break;

    case 'comptable':
      // 08:15 UTC — Comptable: daily finance check
      await callEndpoint('Comptable Daily', '/api/agents/comptable');
      break;

    case 'whatsapp_followup':
      // 10:15 UTC — WhatsApp: follow-up prospects chauds
      await callEndpoint('WhatsApp Followup', '/api/agents/whatsapp', 'POST', { action: 'send_followup' });
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
