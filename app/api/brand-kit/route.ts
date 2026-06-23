import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Brand kit API — fondation de l'onboarding Clara (brief v3 §2).
 * GET  /api/brand-kit          → kit du client (+ completeness, confirmed)
 * POST /api/brand-kit          → upsert kit + prices/hours/offers/forbidden_topics
 *                                pose confirmed_at quand les essentiels sont là.
 * org_id = identité client (profiles.id). Le service role bypass RLS côté serveur.
 */
function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// Règle de confirmation (§2.3) : business_name + vertical + horaires (≥1 jour
// renseigné OU tous fermés explicites) + forbidden_topics confirmés (liste vide
// OK si confirmée) + (≥1 prix actif OU no_public_prices).
function computeCompleteness(kit: any, prices: any[], hours: any[], forbiddenConfirmed: boolean): { pct: number; ready: boolean } {
  const checks = [
    !!kit.business_name,
    !!kit.vertical,
    hours.length > 0,
    forbiddenConfirmed,
    (prices.some((p: any) => p.is_active) || kit.no_public_prices === true),
  ];
  const done = checks.filter(Boolean).length;
  return { pct: Math.round((done / checks.length) * 100), ready: done === checks.length };
}

export async function GET() {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const supabase = sb();
  const { data: kit } = await supabase.from('brand_kits').select('*').eq('org_id', user.id).maybeSingle();
  if (!kit) return NextResponse.json({ ok: true, kit: null, confirmed: false });
  const [{ data: prices }, { data: hours }, { data: offers }, { data: topics }] = await Promise.all([
    supabase.from('brand_kit_prices').select('*').eq('brand_kit_id', kit.id).order('created_at'),
    supabase.from('brand_kit_hours').select('*').eq('brand_kit_id', kit.id),
    supabase.from('brand_kit_offers').select('*').eq('brand_kit_id', kit.id),
    supabase.from('brand_kit_forbidden_topics').select('topic').eq('brand_kit_id', kit.id),
  ]);
  // Personal branding vit dans org_agent_configs (content) — jsonb, pas de DDL.
  const { data: pbCfg } = await supabase.from('org_agent_configs')
    .select('config').eq('user_id', user.id).eq('agent_id', 'content')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return NextResponse.json({
    ok: true,
    kit,
    prices: prices || [],
    hours: hours || [],
    offers: offers || [],
    forbidden_topics: (topics || []).map((t: any) => t.topic),
    personal_branding: !!(pbCfg?.config as any)?.personal_branding,
    personal_branding_brief: (pbCfg?.config as any)?.personal_branding_brief || '',
    confirmed: !!kit.confirmed_at,
    completeness: kit.completeness,
  });
}

export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const supabase = sb();
  const body = await req.json().catch(() => ({}));
  const now = new Date().toISOString();

  // 1) Upsert le kit (1 par org).
  const { data: existing } = await supabase.from('brand_kits').select('id').eq('org_id', user.id).maybeSingle();
  const kitFields = {
    org_id: user.id,
    business_name: String(body.business_name || '').slice(0, 200),
    vertical: String(body.vertical || 'autre').toLowerCase(),
    tone: body.tone ? String(body.tone).slice(0, 300) : null,
    address: body.address ? String(body.address).slice(0, 300) : null,
    no_public_prices: body.no_public_prices === true,
    avg_ticket: body.avg_ticket != null ? Number(body.avg_ticket) : null,
    slow_days: body.slow_days ? String(body.slow_days).slice(0, 120) : null,
    catchment: body.catchment ? String(body.catchment).slice(0, 200) : null,
    collab_offer: body.collab_offer ? String(body.collab_offer).slice(0, 300) : null,
    updated_at: now,
  };
  let kitId: string;
  if (existing) {
    kitId = existing.id;
    await supabase.from('brand_kits').update(kitFields).eq('id', kitId);
  } else {
    const { data: ins, error: insErr } = await supabase.from('brand_kits').insert({ ...kitFields, created_at: now }).select('id').single();
    if (insErr || !ins) return NextResponse.json({ ok: false, error: insErr?.message || 'insert failed' }, { status: 500 });
    kitId = ins.id;
  }

  // 2) Remplacer les collections enfants si fournies (full replace = idempotent).
  if (Array.isArray(body.prices)) {
    await supabase.from('brand_kit_prices').delete().eq('brand_kit_id', kitId);
    const rows = body.prices.filter((p: any) => p.service_name && p.amount_eur != null).map((p: any) => ({
      brand_kit_id: kitId, service_name: String(p.service_name).slice(0, 200), amount_eur: Number(p.amount_eur),
      unit: p.unit ? String(p.unit).slice(0, 40) : null, no_discount: p.no_discount === true, is_active: p.is_active !== false,
    }));
    if (rows.length) await supabase.from('brand_kit_prices').insert(rows);
  }
  if (Array.isArray(body.hours)) {
    await supabase.from('brand_kit_hours').delete().eq('brand_kit_id', kitId);
    const rows = body.hours.filter((h: any) => h.weekday != null).map((h: any) => ({
      brand_kit_id: kitId, weekday: Number(h.weekday), open_time: h.open_time || null, close_time: h.close_time || null, closed: h.closed === true,
    }));
    if (rows.length) await supabase.from('brand_kit_hours').insert(rows);
  }
  if (Array.isArray(body.offers)) {
    await supabase.from('brand_kit_offers').delete().eq('brand_kit_id', kitId);
    const rows = body.offers.filter((o: any) => o.label && o.valid_from && o.valid_to).map((o: any) => ({
      brand_kit_id: kitId, label: String(o.label).slice(0, 200), description: o.description ? String(o.description).slice(0, 500) : null,
      discount_type: ['percent', 'amount', 'gift'].includes(o.discount_type) ? o.discount_type : null,
      discount_value: o.discount_value != null ? Number(o.discount_value) : null, conditions: o.conditions ? String(o.conditions).slice(0, 300) : null,
      valid_from: o.valid_from, valid_to: o.valid_to,
    }));
    if (rows.length) await supabase.from('brand_kit_offers').insert(rows);
  }
  // forbidden_topics : confirmé si la clé est présente (même liste vide = confirmée).
  const forbiddenConfirmed = Array.isArray(body.forbidden_topics);
  if (forbiddenConfirmed) {
    await supabase.from('brand_kit_forbidden_topics').delete().eq('brand_kit_id', kitId);
    const rows = body.forbidden_topics.filter((t: any) => t && String(t).trim()).map((t: any) => ({ brand_kit_id: kitId, topic: String(t).trim().slice(0, 80) }));
    if (rows.length) await supabase.from('brand_kit_forbidden_topics').insert(rows);
  }

  // 2bis) Personal branding → org_agent_configs (content) config JSON (pas de
  // DDL). Léna lit ce flag pour activer son playbook de marque personnelle.
  if (body.personal_branding !== undefined) {
    const { data: cfgRow } = await supabase.from('org_agent_configs')
      .select('id, config').eq('user_id', user.id).eq('agent_id', 'content')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    const cfg = (cfgRow?.config as any) || {};
    const nextCfg = { ...cfg, personal_branding: body.personal_branding === true, personal_branding_brief: String(body.personal_branding_brief || '').slice(0, 2000) };
    if (cfgRow?.id) await supabase.from('org_agent_configs').update({ config: nextCfg }).eq('id', cfgRow.id);
    else await supabase.from('org_agent_configs').insert({ user_id: user.id, agent_id: 'content', config: nextCfg });
  }

  // 3) Recompute completeness + confirmed_at.
  const [{ data: pr }, { data: hr }] = await Promise.all([
    supabase.from('brand_kit_prices').select('is_active').eq('brand_kit_id', kitId),
    supabase.from('brand_kit_hours').select('weekday').eq('brand_kit_id', kitId),
  ]);
  const { pct, ready } = computeCompleteness(kitFields, pr || [], hr || [], forbiddenConfirmed || body.forbidden_confirmed === true);
  const update: any = { completeness: pct, updated_at: now };
  // confirmed_at posé une fois quand prêt (fin onboarding Clara = prérequis toggle auto).
  if (ready) update.confirmed_at = now;
  await supabase.from('brand_kits').update(update).eq('id', kitId);

  return NextResponse.json({ ok: true, kit_id: kitId, completeness: pct, confirmed: ready });
}
