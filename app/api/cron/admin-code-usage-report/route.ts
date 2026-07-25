import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * RELEVÉ HEBDO — USAGE DES CODES ACTIVÉS (founder 25/07).
 * Les comptes activés via un code promo (surtout les codes ILLIMITÉS type Créateur,
 * credits_amount ≥ 1M) sont surveillés de près : on envoie chaque semaine à l'admin
 * l'utilisation EFFECTIVE (crédits consommés, posts, emails, DMs, prospects) pour
 * garder l'œil sur les coûts de ces comptes en particulier.
 */
function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function run() {
  const supabase = sb();
  const since7d = new Date(Date.now() - 7 * 86400000).toISOString();

  // 1) Comptes ayant activé un code (redemptions → code).
  const { data: reds } = await supabase
    .from('promo_code_redemptions')
    .select('user_id, created_at, promo_codes(code, plan_override, credits_amount)')
    .order('created_at', { ascending: false })
    .limit(500);
  if (!reds || reds.length === 0) {
    return NextResponse.json({ ok: true, sent: false, message: 'Aucun code activé.' });
  }

  // Dédoublonne par user (garde le dernier code).
  const byUser = new Map<string, any>();
  for (const r of reds) if (!byUser.has(r.user_id)) byUser.set(r.user_id, r);
  const userIds = [...byUser.keys()];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, company_name, subscription_plan, credits_balance')
    .in('id', userIds);
  const profMap = new Map((profiles || []).map((p: any) => [p.id, p]));

  const rows: any[] = [];
  for (const uid of userIds) {
    const red = byUser.get(uid);
    const code = (red.promo_codes as any)?.code || '?';
    const unlimited = ((red.promo_codes as any)?.credits_amount || 0) >= 1_000_000;
    const p: any = profMap.get(uid) || {};

    // Usage effectif 7j.
    let creditsSpent = 0, posts = 0, emails = 0, dms = 0, prospects = 0, actions = 0;
    try {
      const { data: tx } = await supabase.from('credit_transactions').select('amount').eq('user_id', uid).lt('amount', 0).gte('created_at', since7d);
      creditsSpent = (tx || []).reduce((s: number, t: any) => s + Math.abs(Number(t.amount) || 0), 0);
    } catch {}
    try { const { count } = await supabase.from('content_calendar').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('status', 'published').gte('published_at', since7d); posts = count || 0; } catch {}
    try { const { count } = await supabase.from('crm_activities').select('id, crm_prospects!inner(user_id)', { count: 'exact', head: true }).eq('crm_prospects.user_id', uid).eq('type', 'email').gte('created_at', since7d); emails = count || 0; } catch {}
    try { const { count } = await supabase.from('dm_queue').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('status', 'sent').gte('updated_at', since7d); dms = count || 0; } catch {}
    try { const { count } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('user_id', uid).gte('created_at', since7d); prospects = count || 0; } catch {}
    try { const { count } = await supabase.from('agent_logs').select('id', { count: 'exact', head: true }).eq('user_id', uid).gte('created_at', since7d); actions = count || 0; } catch {}

    rows.push({ code, unlimited, email: p.email || uid.slice(0, 8), company: p.company_name || '', plan: p.subscription_plan || '?', balance: p.credits_balance || 0, creditsSpent, posts, emails, dms, prospects, actions });
  }

  // Trie : illimités d'abord, puis par crédits consommés.
  rows.sort((a, b) => (b.unlimited ? 1 : 0) - (a.unlimited ? 1 : 0) || b.creditsSpent - a.creditsSpent);

  const trHtml = rows.map(r => `<tr>
    <td style="padding:4px 8px;">${r.code}${r.unlimited ? ' <span style="color:#7c3aed;font-weight:bold;">∞</span>' : ''}</td>
    <td style="padding:4px 8px;">${r.company || r.email}</td>
    <td style="padding:4px 8px;text-align:right;font-weight:bold;">${r.creditsSpent}</td>
    <td style="padding:4px 8px;text-align:right;">${r.posts}</td>
    <td style="padding:4px 8px;text-align:right;">${r.emails}</td>
    <td style="padding:4px 8px;text-align:right;">${r.dms}</td>
    <td style="padding:4px 8px;text-align:right;">${r.prospects}</td>
    <td style="padding:4px 8px;text-align:right;">${r.actions}</td>
  </tr>`).join('');

  try {
    const { sendEmailWithFallback } = await import('@/lib/email/send-with-fallback');
    await sendEmailWithFallback({
      to: process.env.ADMIN_EMAIL || 'contact@keiroai.com',
      subject: `📊 Relevé hebdo — usage des ${rows.length} compte(s) à code activé`,
      html: `<div style="font-family:Arial,sans-serif;color:#333;max-width:720px;">
        <h3>Usage effectif des comptes à code (7 derniers jours)</h3>
        <p style="color:#6b7280;font-size:13px;">∞ = code illimité (Créateur) — à surveiller de près côté coûts. « Crédits » = crédits consommés sur 7j.</p>
        <table style="border-collapse:collapse;font-size:12px;width:100%;"><thead><tr style="background:#f3f4f6;">
          <th style="padding:6px 8px;text-align:left;">Code</th><th style="padding:6px 8px;text-align:left;">Compte</th>
          <th style="padding:6px 8px;text-align:right;">Crédits</th><th style="padding:6px 8px;text-align:right;">Posts</th>
          <th style="padding:6px 8px;text-align:right;">Emails</th><th style="padding:6px 8px;text-align:right;">DMs</th>
          <th style="padding:6px 8px;text-align:right;">Prospects</th><th style="padding:6px 8px;text-align:right;">Actions</th>
        </tr></thead><tbody>${trHtml}</tbody></table>
      </div>`,
      fromName: 'KeiroAI Relevé Codes',
      fromEmail: 'contact@keiroai.com',
      tags: ['admin_code_usage_weekly'],
    });
  } catch (e) { console.error('[CodeUsageReport] send failed:', e); }

  return NextResponse.json({ ok: true, sent: true, accounts: rows.length });
}

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return run();
}
export async function POST(req: NextRequest) { return GET(req); }
