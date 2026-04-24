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
      total_eur: imageCost + videoCost + placesCostEstimate + claudeCost + geminiCost,
    },
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

  if (!service || !period || !csvText) {
    return NextResponse.json({ ok: false, error: 'service, billing_period, csv_text required' }, { status: 400 });
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
