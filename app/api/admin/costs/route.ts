import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function assertAdmin() {
  const { user } = await getAuthUser();
  if (!user) return null;
  const sb = admin();
  const { data: p } = await sb.from('profiles').select('is_admin').eq('id', user.id).single();
  return p?.is_admin ? user.id : null;
}

/**
 * GET /api/admin/costs
 * Aggregate view: uploaded third-party bills + live-estimated costs from logs,
 * grouped by service and billing period. Reconciliation of the two columns
 * tells us how accurate our in-app margin estimate really is.
 */
export async function GET() {
  const userId = await assertAdmin();
  if (!userId) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const sb = admin();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // 1. Third-party uploads
  const { data: uploads } = await sb
    .from('external_cost_uploads')
    .select('id, service, billing_period, total_cost_eur, uploaded_at, notes')
    .order('uploaded_at', { ascending: false })
    .limit(100);

  // 2. Live estimates for current month
  // Seedream images: count posts with visual_url (generated-images path)
  const { count: imgCount } = await sb
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', monthStart)
    .not('visual_url', 'is', null)
    .like('visual_url', '%generated-images%');

  // Seedance videos: count posts with video_url
  const { count: vidCount } = await sb
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', monthStart)
    .not('video_url', 'is', null);

  // Gemini / agent_logs breakdown by agent for current month
  const { data: logs } = await sb
    .from('agent_logs')
    .select('agent, action')
    .gte('created_at', monthStart)
    .limit(50000);

  const agentActions: Record<string, number> = {};
  for (const l of logs || []) {
    const key = l.agent || 'unknown';
    agentActions[key] = (agentActions[key] || 0) + 1;
  }

  // gmaps: count daily scans and sum details calls from the report data
  const { data: gmapsLogs } = await sb
    .from('agent_logs')
    .select('data')
    .eq('agent', 'gmaps')
    .eq('action', 'daily_scan')
    .gte('created_at', monthStart)
    .limit(500);

  let placesDetailsEstimate = 0;
  let placesSearchEstimate = 0;
  for (const l of (gmapsLogs || []) as any[]) {
    // Each scan fires ~2 zones × 4 queries = 8 text searches, plus 1 details per imported prospect
    placesSearchEstimate += 8;
    placesDetailsEstimate += (l.data?.imported ?? 0) + (l.data?.skipped ?? 0);
  }
  const placesCostEstimate = placesDetailsEstimate * 0.021 + placesSearchEstimate * 0.035;

  // Rough cost estimates per service (EUR)
  const imageCost = (imgCount || 0) * 0.035; // $0.04 ≈ €0.035 per Seedream image
  const videoCost = (vidCount || 0) * 0.25;  // ~€0.25 per Seedance clip
  // Claude/Gemini aggregate — rough per-agent averages based on typical token counts
  const claudeCost = (agentActions['content'] || 0) * 0.015
    + (agentActions['dm_instagram'] || 0) * 0.003
    + (agentActions['email'] || 0) * 0.005
    + (agentActions['ceo'] || 0) * 0.02
    + (agentActions['amit'] || 0) * 0.02
    + (agentActions['seo'] || 0) * 0.08;

  const geminiCost = (agentActions['chatbot'] || 0) * 0.002
    + (agentActions['dm_instagram_webhook'] || 0) * 0.005
    + (agentActions['whatsapp'] || 0) * 0.001;

  // ─── Per-client breakdown — revenue + cost + margin (current month) ───
  // Aggregates LLM cost from agent_logs by user_id, plus a small per-
  // user share of the image/video gen costs (which can't easily be
  // attributed without owner tracking on every gen). Honest estimate.
  const COST_PER_AGENT_CALL_EUR: Record<string, number> = {
    content: 0.015, dm_instagram: 0.005, email: 0.005, ceo: 0.02,
    seo: 0.05, gmaps: 0.003, marketing: 0.015, instagram_comments: 0.003,
    tiktok_comments: 0.003, chatbot: 0.003, retention: 0.003,
    commercial: 0.005, onboarding: 0.005, ads: 0.005,
  };
  const REVENUE_PER_PLAN_EUR: Record<string, number> = {
    free: 0, createur: 49, pro: 99, business: 199,
    fondateurs: 149, elite: 999, agence: 999, admin: 0,
  };

  const { data: clientLogs } = await sb
    .from('agent_logs')
    .select('agent, user_id')
    .eq('status', 'success')
    .not('user_id', 'is', null)
    .gte('created_at', monthStart)
    .limit(50000);
  const llmCostByUser: Record<string, number> = {};
  for (const log of (clientLogs || []) as any[]) {
    const coef = COST_PER_AGENT_CALL_EUR[log.agent] ?? 0.003;
    if (log.user_id) {
      llmCostByUser[log.user_id] = (llmCostByUser[log.user_id] || 0) + coef;
    }
  }

  const { data: clients } = await sb
    .from('profiles')
    .select('id, email, subscription_plan, instagram_username, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  const payingCount = Math.max(1, (clients || []).filter(c => REVENUE_PER_PLAN_EUR[(c.subscription_plan || 'free').toLowerCase()] > 0).length);
  const sharedAssetCostPerUser = (imageCost + videoCost) / payingCount;

  const per_client = (clients || []).map(c => {
    const plan = (c.subscription_plan || 'free').toLowerCase();
    const revenue = REVENUE_PER_PLAN_EUR[plan] ?? 0;
    const llmCost = Number(llmCostByUser[c.id] || 0);
    const sharedCost = revenue > 0 ? sharedAssetCostPerUser : 0;
    const totalCost = llmCost + sharedCost;
    const margin = revenue > 0 ? Math.round(((revenue - totalCost) / revenue) * 100) : null;
    return {
      id: c.id, email: c.email, plan, instagram_username: c.instagram_username,
      revenue_eur: revenue, llm_cost_eur: Number(llmCost.toFixed(4)),
      shared_cost_eur: Number(sharedCost.toFixed(4)),
      total_cost_eur: Number(totalCost.toFixed(4)),
      margin_pct: margin,
    };
  }).filter(c => c.revenue_eur > 0)
    .sort((a, b) => b.revenue_eur - a.revenue_eur);

  const total_revenue_eur = per_client.reduce((acc, c) => acc + c.revenue_eur, 0);
  const total_cost_all = imageCost + videoCost + placesCostEstimate + claudeCost + geminiCost;
  const total_margin_pct = total_revenue_eur > 0
    ? Math.round(((total_revenue_eur - total_cost_all) / total_revenue_eur) * 100)
    : 0;

  return NextResponse.json({
    ok: true,
    period: monthStart.split('T')[0],
    live_estimates: {
      seedream_images: { count: imgCount || 0, eur: imageCost },
      seedance_videos: { count: vidCount || 0, eur: videoCost },
      google_places_details: { count: placesDetailsEstimate, eur: placesDetailsEstimate * 0.021 },
      google_places_search: { count: placesSearchEstimate, eur: placesSearchEstimate * 0.035 },
      claude_anthropic: { eur: claudeCost, breakdown: agentActions },
      gemini: { eur: geminiCost },
      total_eur: total_cost_all,
    },
    margin_snapshot: {
      revenue_eur: total_revenue_eur,
      cost_eur: total_cost_all,
      margin_pct: total_margin_pct,
      paying_clients: per_client.length,
    },
    per_client,
    uploads: uploads || [],
  });
}

/**
 * POST /api/admin/costs
 * Upload a third-party bill (CSV pasted into body.csv) with a service tag.
 * We parse the total amount and store the whole CSV for audit.
 *
 * Body: { service, billing_period, csv_text, notes? }
 *   service: 'bytedance' | 'google_cloud' | 'anthropic' | 'gemini' | 'brevo' | ...
 *   billing_period: 'YYYY-MM'
 */
export async function POST(request: NextRequest) {
  const userId = await assertAdmin();
  if (!userId) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

  let body: any = {};
  try { body = await request.json(); } catch {}
  const service = (body.service || '').trim().toLowerCase();
  const period = (body.billing_period || '').trim();
  const csvText = (body.csv_text || '').trim();
  const notes = body.notes || null;

  // 2026-06-02 — quick upload path: just service + period + amount_eur.
  // Allows the founder to paste the bill total without copy-pasting a CSV.
  // Founder ask: "j'ai 108 eur anthropic, 20 eur bytedance, ..." → just type those.
  if (!csvText && body.amount_eur !== undefined && !isNaN(parseFloat(body.amount_eur))) {
    if (!service || !period) {
      return NextResponse.json({ ok: false, error: 'service, billing_period required' }, { status: 400 });
    }
    const total = parseFloat(body.amount_eur);
    const sb = admin();
    const { data: inserted, error } = await sb
      .from('external_cost_uploads')
      .insert({
        service,
        billing_period: period,
        total_cost_eur: total,
        raw_rows: { quick_upload: true, amount_eur: total },
        uploaded_by: userId,
        notes,
      })
      .select('id, total_cost_eur, service, billing_period')
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, upload: inserted, quick_upload: true });
  }

  if (!service || !period || !csvText) {
    return NextResponse.json({ ok: false, error: 'service, billing_period, csv_text OR amount_eur required' }, { status: 400 });
  }

  // Parse CSV: support the common shapes we've seen (Google Cloud billing,
  // ByteDance bill detail). We look for a "Total" row or sum known amount
  // columns. Conservative — if we can't identify a total, the admin can
  // override via body.total_override.
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  const header = (lines[0] || '').toLowerCase();
  const cols = header.split(',');

  let total = 0;
  let parsedRows = 0;

  if (service === 'google_cloud' || service === 'places_api') {
    // Google Cloud format: "Sous-total" row or sum of "Sous-total (€)" column
    const subtotalIdx = cols.findIndex((c: string) => c.includes('sous-total') && c.includes('€') && !c.includes('non'));
    if (subtotalIdx >= 0) {
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        const v = parts[subtotalIdx];
        if (parts[0] === '' && String(parts[4] || '').toLowerCase().includes('total')) {
          total = parseFloat(String(v || '0').replace('"', '').replace(',', '.')) || 0;
          break;
        }
        parsedRows++;
      }
    }
  } else if (service === 'bytedance' || service === 'seedream') {
    // ByteDance format: sum "Gross amount" column (index 29)
    const grossIdx = cols.findIndex((c: string) => c.includes('gross amount'));
    if (grossIdx >= 0) {
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        const v = parseFloat(String(parts[grossIdx] || '0')) || 0;
        total += v;
        parsedRows++;
      }
      // ByteDance is USD — rough EUR conversion 0.93
      total = total * 0.93;
    }
  } else {
    // Generic: last numeric value in the last row
    const lastRow = lines[lines.length - 1];
    const nums = lastRow.match(/-?\d+[.,]\d+/g) || [];
    if (nums.length > 0) {
      total = parseFloat(nums[nums.length - 1].replace(',', '.')) || 0;
      parsedRows = lines.length - 1;
    }
  }

  if (body.total_override !== undefined && !isNaN(parseFloat(body.total_override))) {
    total = parseFloat(body.total_override);
  }

  const sb = admin();
  const { data: inserted, error } = await sb
    .from('external_cost_uploads')
    .insert({
      service,
      billing_period: period,
      total_cost_eur: total,
      raw_rows: { parsed_rows: parsedRows, csv_preview: csvText.substring(0, 2000) },
      uploaded_by: userId,
      notes,
    })
    .select('id, total_cost_eur, service, billing_period')
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, upload: inserted, parsed_rows: parsedRows });
}

/**
 * DELETE /api/admin/costs?id=<uploadId>
 */
export async function DELETE(request: NextRequest) {
  const userId = await assertAdmin();
  if (!userId) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
  const sb = admin();
  await sb.from('external_cost_uploads').delete().eq('id', id);
  return NextResponse.json({ ok: true });
}
