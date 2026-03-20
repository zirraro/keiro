import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';

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
 * 03:00 UTC  slot=discovery       → Commercial: verify CRM
 * 04:50 UTC  slot=marketing_prep  → Marketing: sync analytics + analysis (prepares stats for CEO)
 * 05:00 UTC  slot=ceo             → CEO brief (auto-triggers orders) + Community early prep
 * 05:30 UTC  slot=trends          → Refresh trends
 * 06:00 UTC  slot=early_morning   → Email cold: restaurants/traiteurs (ouverture)
 * 07:00 UTC  slot=morning_prep    → DM Instagram + SEO + Content
 * 08:00 UTC  slot=morning         → Email cold: boutiques/coiffeurs/fleuristes + Onboarding
 * 08:30 UTC  slot=discovery_4     → Commercial: verify CRM #3
 * 09:00 UTC  slot=retention       → Retention checks
 * 09:30 UTC  slot=community       → Community Manager: comments + follows
 * 10:00 UTC  slot=midday          → Email cold: coachs/freelances/services + Email warm
 * 11:00 UTC  slot=discovery_2     → Commercial: prospect external
 * 12:00 UTC  slot=afternoon       → Email cold: restaurants (service midi) + PME/agences
 * 13:00 UTC  slot=discovery_5     → Commercial: prospect external #3
 * 14:00 UTC  slot=discovery_3     → Commercial: verify CRM #2 + prospect external #2
 * 13:30 UTC  slot=content_2        → Content: 2nd post of the day (midday)
 * 17:30 UTC  slot=content_3        → Content: 3rd post of the day (evening)
 * 14:30 UTC  slot=email_warm_2    → Email warm: follow-up batch 2 + Marketing afternoon (mid-day analysis for CEO evening)
 * 15:00 UTC  slot=ceo_evening     → CEO brief #2 + execute orders
 * 15:30 UTC  slot=community_2     → Community Manager afternoon
 * 16:00 UTC  slot=evening         → Email cold: restaurants/bars (soirée)
 * 16:30 UTC  slot=discovery_6     → Commercial: full run (EOD)
 * 17:00 UTC  slot=evening_prep    → DM Instagram evening + TikTok comments
 * 18:00 UTC  slot=discovery_7     → Commercial: prospect external #4
 * 18:30 UTC  slot=email_recap     → Email cold: rattrapage tous types restants
 * 19:00 UTC  slot=marketing_learn → Marketing: analyze + advise agents
 * 20:00 UTC  slot=ceo_night       → CEO brief #3 (bilan journée, résultats ordres, plan J+1) + execute orders
 * Every 10m  slot=video_poll      → Poll & advance async video generation jobs (30s+ TikTok)
 * Every 15m  slot=publish_scheduled → Auto-publish user-scheduled posts (from calendar)
 * 19:30 UTC  slot=tiktok_publish  → TikTok: publish pending TikTok content (21h30 Paris = peak engagement)
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

  const results: { task: string; ok: boolean; data?: any; error?: string }[] = [];

  async function callEndpoint(name: string, path: string, method: 'GET' | 'POST' = 'GET', body?: any) {
    try {
      console.log(`[Scheduler/${slot}] → ${name}: ${method} ${path}`);
      const opts: RequestInit = { method, headers };
      if (body && method === 'POST') opts.body = JSON.stringify(body);
      const res = await fetch(`${baseUrl}${path}`, opts);
      const data = await res.json().catch(() => ({ ok: false }));
      results.push({ task: name, ok: data.ok ?? res.ok, data });
      console.log(`[Scheduler/${slot}] ← ${name}: ${data.ok ? 'OK' : 'FAIL'}`);
    } catch (e: any) {
      results.push({ task: name, ok: false, error: e.message });
      console.error(`[Scheduler/${slot}] ✗ ${name}: ${e.message}`);
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

  // Stagger delay between sequential agent calls to avoid resource contention
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
      await delay(3000);
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
      // 13:30 UTC — Content: 2nd post of the day (midday pillar)
      await callEndpoint('Content (midday)', '/api/agents/content?slot=midday');
      break;

    case 'content_3':
      // 17:30 UTC — Content: 3rd post of the day (evening pillar)
      await callEndpoint('Content (evening)', '/api/agents/content?slot=evening');
      break;

    case 'content_tiktok':
      // 18:30 UTC — Content: daily TikTok video (1/day)
      await callEndpoint('Content (TikTok)', '/api/agents/content?slot=tiktok');
      break;

    case 'content_linkedin_1':
      // 09:30 UTC — LinkedIn: 1st post of the day (morning professional)
      await callEndpoint('Content (LinkedIn AM)', '/api/agents/content?slot=linkedin_1');
      break;

    case 'content_linkedin_2':
      // 14:00 UTC — LinkedIn: 2nd post of the day (afternoon professional)
      await callEndpoint('Content (LinkedIn PM)', '/api/agents/content?slot=linkedin_2');
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
        await delay(5000);
        await callEndpoint('Marketing Analysis (afternoon)', '/api/agents/marketing', 'POST');
      });
      results.push({ task: 'Marketing Afternoon', ok: true, data: { status: 'dispatched_background' } });
      break;

    case 'email_recap':
      // 18:30 UTC — Email cold: rattrapage tous types restants
      await callEndpoint('Email Cold (recap)', '/api/agents/email/daily?slot=recap&types=restaurant,boutique,coach,coiffeur,caviste,fleuriste,freelance,services,pme,agence,traiteur,professionnel');
      break;

    case 'community_2':
      // 15:30 UTC — Community Manager afternoon: staggered to avoid concurrent marketing agent calls
      fireBackground(async () => {
        await callEndpoint('Community Comments PM', '/api/agents/marketing', 'POST', { action: 'prepare_comments', count: 15 });
        await delay(5000);
        await callEndpoint('Community Follow IG PM', '/api/agents/marketing', 'POST', { action: 'find_follow_targets', platform: 'instagram', count: 15 });
        await delay(5000);
        await callEndpoint('Community Follow TT PM', '/api/agents/marketing', 'POST', { action: 'find_follow_targets', platform: 'tiktok', count: 10 });
      });
      results.push({ task: 'Community PM', ok: true, data: { status: 'dispatched_background' } });
      break;

    case 'community':
      // 09:30 UTC — Community Manager: staggered to avoid concurrent marketing agent calls
      fireBackground(async () => {
        await callEndpoint('Community Comments', '/api/agents/marketing', 'POST', { action: 'prepare_comments', count: 15 });
        await delay(5000);
        await callEndpoint('Community Follow Targets IG', '/api/agents/marketing', 'POST', { action: 'find_follow_targets', platform: 'instagram', count: 15 });
        await delay(5000);
        await callEndpoint('Community Follow Targets TT', '/api/agents/marketing', 'POST', { action: 'find_follow_targets', platform: 'tiktok', count: 10 });
      });
      results.push({ task: 'Community', ok: true, data: { status: 'dispatched_background' } });
      break;

    case 'marketing_prep':
      // 04:50 UTC — Marketing: sync analytics + analysis (runs 10 min before CEO so stats are ready)
      // Sequential: sync first, then analysis (analysis needs fresh data from sync)
      fireBackground(async () => {
        await callEndpoint('Marketing Sync Analytics', '/api/agents/marketing', 'POST', { action: 'sync_publication_analytics' });
        await delay(5000);
        await callEndpoint('Marketing Analysis (morning)', '/api/agents/marketing', 'GET');
      });
      results.push({ task: 'Marketing Prep', ok: true, data: { status: 'dispatched_background' } });
      break;

    case 'ceo':
      // 05:00 UTC — CEO brief + execute orders + Community morning prep
      // Uses waitUntil to avoid 300s timeout (CEO brief can take 2-4 min)
      // All staggered with delays to avoid resource contention
      fireBackground(async () => {
        await callEndpoint('CEO Brief', '/api/agents/ceo');
        await delay(5000);
        await callEndpoint('Execute Orders', '/api/agents/orders');
        await delay(5000);
        // Community: early prep — staggered
        await callEndpoint('Community Comments (early)', '/api/agents/marketing', 'POST', { action: 'prepare_comments', count: 10 });
        await delay(5000);
        await callEndpoint('Community Follow Targets IG (early)', '/api/agents/marketing', 'POST', { action: 'find_follow_targets', platform: 'instagram', count: 10 });
      });
      results.push({ task: 'CEO Brief + Orders + Community', ok: true, data: { status: 'dispatched_background' } });
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
      // 07:00 UTC — DM prep (IG only) + SEO + Content (staggered to avoid resource contention)
      fireBackground(async () => {
        await callEndpoint('DM Instagram (morning)', '/api/agents/dm-instagram?slot=morning', 'POST');
        await delay(5000);
        await callEndpoint('SEO', '/api/agents/seo');
        await delay(5000);
        await callEndpoint('Content', '/api/agents/content?slot=morning');
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
      // 15:00 UTC — CEO brief #2 (afternoon review) + execute orders
      fireBackground(async () => {
        await callEndpoint('CEO Brief (afternoon)', '/api/agents/ceo');
        await callEndpoint('Execute Orders', '/api/agents/orders');
      });
      results.push({ task: 'CEO Brief PM + Orders', ok: true, data: { status: 'dispatched_background' } });
      break;

    case 'evening':
      // 16:00 UTC — Restaurants/bars (avant service du soir) + tous les restants
      await callEndpoint('Email Cold (soir)', '/api/agents/email/daily?slot=evening&types=restaurant,caviste,traiteur');
      break;

    case 'evening_prep':
      // 17:00 UTC — Evening DM (IG only) + TikTok comments (staggered)
      fireBackground(async () => {
        await callEndpoint('DM Instagram (evening)', '/api/agents/dm-instagram?slot=evening', 'POST');
        await delay(5000);
        await callEndpoint('TikTok Comments', '/api/agents/tiktok-comments');
      });
      results.push({ task: 'Evening Prep', ok: true, data: { status: 'dispatched_background' } });
      break;

    case 'tiktok_dm_morning':
      // 07:30 UTC — TikTok DM preparation (morning batch, staggered)
      fireBackground(async () => {
        await callEndpoint('DM TikTok Batch 1', '/api/agents/dm-instagram?platform=tiktok&count=20', 'POST');
        await delay(5000);
        await callEndpoint('DM TikTok Batch 2', '/api/agents/dm-instagram?platform=tiktok&count=20', 'POST');
      });
      results.push({ task: 'TikTok DM Morning', ok: true, data: { status: 'dispatched_background' } });
      break;

    case 'tiktok_dm_midday':
      // 12:30 UTC — TikTok DM preparation (midday batch, staggered)
      fireBackground(async () => {
        await callEndpoint('DM TikTok Batch 3', '/api/agents/dm-instagram?platform=tiktok&count=20', 'POST');
        await delay(5000);
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
        await delay(5000);
        await callEndpoint('Analyze Publications', '/api/agents/marketing', 'POST', { action: 'analyze_publications', days: 30 });
        await delay(5000);
        await callEndpoint('Marketing Analysis', '/api/agents/marketing');
        await delay(5000);
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
