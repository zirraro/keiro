import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendBrevoCompat } from '@/lib/email/brevo-compat';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * PACKS = RAMPE D'ACQUISITION (Fable 5 §3.1).
 * Un acheteur de pack de crédits SANS abonnement teste KeiroAI "à la main".
 * Ce cron le convertit vers l'autopilote (un plan) au bon moment :
 *
 *   A) "crédits vs autopilote" — quand ses crédits s'épuisent (< seuil), on lui
 *      montre qu'un plan = les agents publient/prospectent tout seuls (vs
 *      recharger un pack à la main). C'est le pitch de conversion.
 *   B) J+14 relance dormance — pack acheté il y a ≥14j, plus aucune conso depuis
 *      → relance douce "reviens, tes crédits t'attendent".
 *
 * Quotidien, idempotent (dédup via agent_logs : chaque nudge envoyé 1× / client).
 * Coût maîtrisé : population = acheteurs de pack en plan gratuit uniquement
 * (petite cohorte), 1-2 requêtes de comptage + au plus 1 email par client.
 */
function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const LOW_CREDITS = 15;   // seuil "crédits qui s'épuisent"
const DORMANT_DAYS = 14;  // fenêtre d'inactivité avant relance

const cta = (label: string, href = 'https://keiroai.com/pricing') =>
  `<p style="text-align:center;margin:24px 0;"><a href="${href}" style="display:inline-block;background:linear-gradient(to right,#0c1a3a,#1e3a5f);color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:bold;">${label}</a></p>`;
const wrap = (title: string, body: string) => `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#333;margin:0;padding:0;">
<div style="max-width:540px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg,#0c1a3a,#1e3a5f);color:white;padding:24px;border-radius:12px 12px 0 0;text-align:center;"><h2 style="margin:0;">${title}</h2></div>
  <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;">${body}</div>
  <div style="background:#f9fafb;padding:12px;text-align:center;color:#9ca3af;font-size:11px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;">KeiroAI — Ton équipe IA · Réponds à cet email, on lit tout.</div>
</div></body></html>`;

function autopiloteMail(name: string, balance: number) {
  const hello = `<p>Bonjour${name ? ` ${name}` : ''},</p>`;
  return {
    subject: 'Tes crédits font le travail à la main — passe en pilote automatique',
    html: wrap('À la main… ou en automatique ?', `${hello}
      <p>Il te reste <strong>${balance} crédit${balance > 1 ? 's' : ''}</strong>. Avec un pack, c'est toi qui lances chaque génération — un post, une image, un email à la fois.</p>
      <p>Avec un <strong>plan KeiroAI</strong>, ton équipe d'agents travaille <strong>toute seule, tous les jours</strong> : elle publie ton contenu, répond à tes messages, prospecte pour toi — sans que tu aies à cliquer.</p>
      <div style="background:#f1f5f9;border-radius:8px;padding:14px;margin:16px 0;font-size:14px;color:#0f172a">
        <div style="margin-bottom:6px">📦 <strong>Pack</strong> — tu recharges, tu génères à la main quand tu y penses.</div>
        <div>🚀 <strong>Plan</strong> — l'autopilote : ça tourne pour toi 7j/7, même quand tu fermes l'app.</div>
      </div>
      <p>Essai gratuit 7 jours, sans engagement. Tu gardes tes crédits actuels.</p>
      ${cta('Activer l\'autopilote →')}`),
  };
}

function dormantMail(name: string, balance: number) {
  const hello = `<p>Bonjour${name ? ` ${name}` : ''},</p>`;
  return {
    subject: 'Tes crédits KeiroAI t\'attendent 👋',
    html: wrap('On ne t\'a pas revu depuis un moment', `${hello}
      <p>Tu as encore <strong>${balance} crédit${balance > 1 ? 's' : ''}</strong> disponibles sur ton compte — de quoi générer du contenu qui te ressemble dès maintenant.</p>
      <p>Et si tu veux que ça tourne sans y penser, un plan met ton équipe en pilote automatique (publication, messages, prospection) pendant que tu gères ton commerce.</p>
      ${cta('Reprendre là où j\'en étais →', 'https://keiroai.com/assistant')}
      <p style="color:#6b7280;font-size:12px;">Découvre les plans et l'essai gratuit 7 jours sur <a href="https://keiroai.com/pricing">keiroai.com/pricing</a>.</p>`),
  };
}

async function alreadySent(supabase: any, action: string, userId: string) {
  const { data } = await supabase.from('agent_logs')
    .select('id').eq('agent', 'system').eq('action', action)
    .contains('data', { user_id: userId }).limit(1).maybeSingle();
  return !!data;
}

async function run() {
  const supabase = sb();
  const now = Date.now();

  // 1) Acheteurs de pack récents → dernier achat par user_id.
  const { data: packTx } = await supabase
    .from('credit_transactions')
    .select('user_id, created_at')
    .eq('type', 'credit_pack')
    .order('created_at', { ascending: false })
    .limit(500);
  const lastPackAt = new Map<string, number>();
  for (const t of packTx || []) {
    if (!t.user_id) continue;
    if (!lastPackAt.has(t.user_id)) lastPackAt.set(t.user_id, new Date(t.created_at).getTime());
  }
  const buyerIds = [...lastPackAt.keys()];
  if (!buyerIds.length) return NextResponse.json({ ok: true, processed: 0, note: 'no pack buyers' });

  // 2) Profils correspondants, en plan GRATUIT uniquement (les payants ont déjà l'autopilote).
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, full_name, company_name, subscription_plan, credits_balance, is_admin')
    .in('id', buyerIds);

  const results: any[] = [];
  for (const p of profiles || []) {
    if (!p.email || p.is_admin) continue;
    const isFreePlan = !p.subscription_plan || p.subscription_plan === 'free';
    if (!isFreePlan) { results.push({ user: p.id.slice(0, 8), skipped: 'has_plan' }); continue; }

    const name = (p.company_name || p.full_name || '').split(' ')[0] || '';
    const balance = p.credits_balance ?? 0;
    const packAt = lastPackAt.get(p.id) || 0;
    const packAgeDays = packAt ? Math.floor((now - packAt) / 86400000) : 0;

    // A) Crédits qui s'épuisent → pitch autopilote (1× par client).
    if (balance <= LOW_CREDITS && !(await alreadySent(supabase, 'pack_nurture_autopilot', p.id))) {
      const mail = autopiloteMail(name, balance);
      try {
        await sendBrevoCompat({ sender: { name: 'KeiroAI', email: 'contact@keiroai.com' }, to: [{ email: p.email }], subject: mail.subject, htmlContent: mail.html });
        await supabase.from('agent_logs').insert({ agent: 'system', action: 'pack_nurture_autopilot', status: 'ok', data: { user_id: p.id, balance }, created_at: new Date().toISOString() });
        results.push({ user: p.id.slice(0, 8), sent: 'autopilot', balance });
      } catch (e: any) { results.push({ user: p.id.slice(0, 8), error: e?.message?.slice(0, 80) }); }
      continue; // un seul email par run et par client
    }

    // B) Dormance J+14 → relance douce (1× par client). On ne relance que s'il
    //    reste des crédits à consommer (sinon le pitch autopilote ci-dessus suffit).
    if (packAgeDays >= DORMANT_DAYS && balance > LOW_CREDITS && !(await alreadySent(supabase, 'pack_nurture_dormant', p.id))) {
      // Vérifie l'inactivité : aucune conso (transaction négative) sur la fenêtre.
      const sinceIso = new Date(now - DORMANT_DAYS * 86400000).toISOString();
      const { count: usage } = await supabase
        .from('credit_transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', p.id).lt('amount', 0).gte('created_at', sinceIso);
      if ((usage || 0) > 0) { results.push({ user: p.id.slice(0, 8), skipped: 'still_active' }); continue; }
      const mail = dormantMail(name, balance);
      try {
        await sendBrevoCompat({ sender: { name: 'KeiroAI', email: 'contact@keiroai.com' }, to: [{ email: p.email }], subject: mail.subject, htmlContent: mail.html });
        await supabase.from('agent_logs').insert({ agent: 'system', action: 'pack_nurture_dormant', status: 'ok', data: { user_id: p.id, balance, packAgeDays }, created_at: new Date().toISOString() });
        results.push({ user: p.id.slice(0, 8), sent: 'dormant', balance, packAgeDays });
      } catch (e: any) { results.push({ user: p.id.slice(0, 8), error: e?.message?.slice(0, 80) }); }
    }
  }
  return NextResponse.json({ ok: true, processed: results.length, results });
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return run();
}
export async function POST(req: NextRequest) { return GET(req); }
