import { NextRequest, NextResponse } from 'next/server';

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
 * 03:00 UTC  slot=discovery     → Commercial enrichment + Google Search social
 * 05:00 UTC  slot=ceo           → CEO brief (auto-triggers orders)
 * 05:30 UTC  slot=trends        → Refresh trends
 * 06:00 UTC  slot=early_morning → Email cold (weekdays)
 * 07:00 UTC  slot=morning_prep  → DM Instagram + SEO + Content
 * 08:00 UTC  slot=morning       → Email cold + Onboarding (weekdays)
 * 10:00 UTC  slot=midday        → Email cold + Email warm (weekdays)
 * 12:00 UTC  slot=afternoon     → Email cold (weekdays)
 * 15:00 UTC  slot=ceo_evening    → CEO brief #2 (suivi après-midi) + execute orders
 * 16:00 UTC  slot=evening       → Email cold (weekdays)
 * 17:00 UTC  slot=evening_prep  → DM Instagram evening + TikTok comments
 * 09:00 UTC  slot=retention     → Retention checks
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

  const host = request.headers.get('host') || 'localhost:3000';
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const baseUrl = `${proto}://${host}`;
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
      await callEndpoint('Commercial Verify CRM #2', '/api/agents/commercial', 'POST', { action: 'verify_crm' });
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

    case 'discovery_6':
      // 16:30 UTC — Commercial: full run (end of day cleanup)
      await callEndpoint('Commercial Full EOD', '/api/agents/commercial', 'POST', { action: 'full' });
      break;

    case 'community_2':
      // 15:30 UTC — Community Manager afternoon: more comments + follow targets
      await callEndpoint('Community Comments PM', '/api/agents/marketing', 'POST', { action: 'prepare_comments', count: 50 });
      await callEndpoint('Community Follow IG PM', '/api/agents/marketing', 'POST', { action: 'find_follow_targets', platform: 'instagram', count: 40 });
      break;

    case 'community':
      // 09:30 UTC — Community Manager: prepare comments on real posts + find follow targets
      await callEndpoint('Community Comments', '/api/agents/marketing', 'POST', { action: 'prepare_comments', count: 50 });
      await callEndpoint('Community Follow Targets IG', '/api/agents/marketing', 'POST', { action: 'find_follow_targets', platform: 'instagram', count: 40 });
      await callEndpoint('Community Follow Targets TT', '/api/agents/marketing', 'POST', { action: 'find_follow_targets', platform: 'tiktok', count: 35 });
      break;

    case 'ceo':
      // 05:00 UTC — CEO brief + auto-execute orders
      await callEndpoint('CEO Brief', '/api/agents/ceo');
      // Orders are already inserted by the brief generation (extractAndInsertOrders)
      // Execute them immediately after
      await callEndpoint('Execute Orders', '/api/agents/orders');
      break;

    case 'trends':
      // 05:30 UTC — Refresh news trends
      await callEndpoint('Refresh Trends', '/api/cron/refresh-trends');
      break;

    case 'early_morning':
      // 06:00 UTC — Early morning emails (weekdays only)
      if (isWeekday) {
        await callEndpoint('Email Cold (early)', '/api/agents/email/daily?slot=early_morning');
      }
      break;

    case 'morning_prep':
      // 07:00 UTC — DM prep + SEO + Content
      if (isWeekday) {
        await callEndpoint('DM Instagram (morning)', '/api/agents/dm-instagram?slot=morning', 'POST');
      }
      if (isSeoDay) {
        await callEndpoint('SEO', '/api/agents/seo');
      }
      await callEndpoint('Content', '/api/agents/content');
      break;

    case 'morning':
      // 08:00 UTC — Morning emails + onboarding
      if (isWeekday) {
        await callEndpoint('Email Cold (morning)', '/api/agents/email/daily?slot=morning');
      }
      await callEndpoint('Onboarding', '/api/agents/onboarding');
      break;

    case 'midday':
      // 10:00 UTC — Midday emails + warm follow-up
      if (isWeekday) {
        await callEndpoint('Email Cold (midday)', '/api/agents/email/daily?slot=midday');
      }
      await callEndpoint('Email Warm', '/api/agents/email/daily?type=warm');
      break;

    case 'afternoon':
      // 12:00 UTC — Afternoon emails
      if (isWeekday) {
        await callEndpoint('Email Cold (afternoon)', '/api/agents/email/daily?slot=afternoon');
      }
      break;

    case 'retention':
      // 09:00 UTC — Retention checks
      await callEndpoint('Retention', '/api/agents/retention');
      break;

    case 'ceo_evening':
      // 15:00 UTC — CEO brief #2 (afternoon review) + execute orders
      await callEndpoint('CEO Brief (afternoon)', '/api/agents/ceo');
      await callEndpoint('Execute Orders', '/api/agents/orders');
      break;

    case 'evening':
      // 16:00 UTC — Evening emails
      if (isWeekday) {
        await callEndpoint('Email Cold (evening)', '/api/agents/email/daily?slot=evening');
      }
      break;

    case 'evening_prep':
      // 17:00 UTC — Evening DM + TikTok
      if (isWeekday) {
        await callEndpoint('DM Instagram (evening)', '/api/agents/dm-instagram?slot=evening', 'POST');
      }
      if (isTiktokDay) {
        await callEndpoint('TikTok Comments', '/api/agents/tiktok-comments');
      }
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
