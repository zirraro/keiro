import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendBrevoCompat } from '@/lib/email/brevo-compat';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * SÉQUENCE D'ESSAI J1 / J3 / J5 (Fable 5 : la conversion essai→payant se joue
 * là — surtout le J5 « voilà ce que ton équipe a produit » AVANT le débit J7).
 * Quotidien, idempotent (dédup via agent_logs : un stage envoyé une seule fois).
 * Les chiffres affichés sont RÉELS (livrables produits pendant l'essai).
 */
function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const STAGES = [1, 3, 5] as const;

async function producedFor(supabase: any, userId: string, sinceIso: string) {
  // Livrables réels pendant l'essai (best-effort, chiffres honnêtes).
  const [posts, dms, reviews] = await Promise.all([
    supabase.from('content_calendar').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'published').gte('published_at', sinceIso),
    supabase.from('crm_activities').select('id', { count: 'exact', head: true }).eq('user_id', userId).in('type', ['dm_sent', 'dm_reply', 'dm_auto']).gte('created_at', sinceIso),
    supabase.from('crm_activities').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('type', 'review_reply').gte('created_at', sinceIso),
  ]).catch(() => [null, null, null]);
  return { posts: posts?.count || 0, dms: dms?.count || 0, reviews: reviews?.count || 0 };
}

function emailFor(stage: number, name: string, produced: { posts: number; dms: number; reviews: number }, trialEndStr: string) {
  const bits: string[] = [];
  if (produced.posts) bits.push(`${produced.posts} publication${produced.posts > 1 ? 's' : ''}`);
  if (produced.dms) bits.push(`${produced.dms} message${produced.dms > 1 ? 's' : ''} traité${produced.dms > 1 ? 's' : ''}`);
  if (produced.reviews) bits.push(`${produced.reviews} avis répondu${produced.reviews > 1 ? 's' : ''}`);
  const recap = bits.length ? bits.join(' · ') : 'ta configuration est prête, ton équipe démarre';
  const cta = (label: string) => `<p style="text-align:center;margin:24px 0;"><a href="https://keiroai.com/assistant" style="display:inline-block;background:linear-gradient(to right,#0c1a3a,#1e3a5f);color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:bold;">${label}</a></p>`;
  const wrap = (title: string, body: string) => `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#333;margin:0;padding:0;">
<div style="max-width:540px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg,#0c1a3a,#1e3a5f);color:white;padding:24px;border-radius:12px 12px 0 0;text-align:center;"><h2 style="margin:0;">${title}</h2></div>
  <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;">${body}</div>
  <div style="background:#f9fafb;padding:12px;text-align:center;color:#9ca3af;font-size:11px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;">KeiroAI — Ton équipe IA</div>
</div></body></html>`;
  const hello = `<p>Bonjour${name ? ` ${name}` : ''},</p>`;
  if (stage === 1) return {
    subject: 'Ton équipe KeiroAI est au travail 👋',
    html: wrap('Bienvenue — ton équipe démarre', `${hello}<p>Ton essai gratuit de 7 jours est lancé. <strong>Ton équipe d'agents a commencé à travailler pour toi.</strong></p><p>Le meilleur réflexe aujourd'hui : ajoute quelques photos de ton activité et tes horaires — c'est ce qui rend le contenu vraiment à ton image.</p>${cta('Voir mon équipe')}<p style="color:#6b7280;font-size:12px;">Une question ? Réponds simplement à cet email.</p>`),
  };
  if (stage === 3) return {
    subject: `Déjà ${recap} — ton équipe avance`,
    html: wrap('À mi-parcours de ton essai', `${hello}<p>En 3 jours, ton équipe a déjà produit : <strong>${recap}</strong>.</p><p>Continue à valider ce qu'elle prépare (posts, réponses) — plus tu l'alimentes, plus elle te ressemble.</p>${cta('Voir ce qui t\'attend')}`),
  };
  return {
    subject: 'Avant la fin de ton essai — voilà ce que ton équipe a produit',
    html: wrap('Ton équipe a fait ses preuves', `${hello}<p>Depuis le début de ton essai, ton équipe KeiroAI a produit : <strong>${recap}</strong> — sans que tu aies à t'en occuper.</p><p>Ton essai se termine le <strong>${trialEndStr}</strong>. Pour que ton équipe continue sans interruption, tout est déjà en place — tu n'as rien à faire.</p>${cta('Continuer avec mon équipe')}
      <div style="margin:18px 0;padding:14px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;">
        <div style="font-weight:bold;color:#92400e;margin-bottom:4px;">💛 Envie de t'engager sereinement ? Passe en annuel = 2 mois offerts</div>
        <div style="font-size:13px;color:#78716c;">Tu paies 10 mois au lieu de 12, et ton équipe tourne toute l'année. <a href="https://keiroai.com/mon-compte?section=billing" style="color:#0c1a3a;font-weight:600;">Activer l'annuel →</a></div>
      </div>
      <p style="color:#6b7280;font-size:12px;">Tu peux annuler en 1 clic à tout moment depuis ton espace facturation.</p>`),
  };
}

async function run() {
  const supabase = sb();
  const now = Date.now();
  // Utilisateurs encore en essai (trial_ends_at dans le futur).
  const { data: users } = await supabase
    .from('profiles')
    .select('id, email, full_name, company_name, created_at, trial_ends_at, is_admin')
    .gt('trial_ends_at', new Date().toISOString())
    .limit(500);

  const results: any[] = [];
  for (const u of users || []) {
    if (!u.email || u.is_admin) continue;
    const created = u.created_at ? new Date(u.created_at).getTime() : 0;
    if (!created) continue;
    const dayN = Math.floor((now - created) / 86400000);
    const stage = STAGES.find(s => s === dayN);
    if (!stage) continue;

    // Idempotence : déjà envoyé ce stage ?
    const { data: sent } = await supabase.from('agent_logs')
      .select('id').eq('agent', 'system').eq('action', `trial_nurture_j${stage}`)
      .contains('data', { user_id: u.id }).limit(1).maybeSingle();
    if (sent) { results.push({ user: u.id.slice(0, 8), stage, skipped: 'already_sent' }); continue; }

    const produced = await producedFor(supabase, u.id, new Date(created).toISOString());
    const trialEndStr = u.trial_ends_at ? new Date(u.trial_ends_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '';
    const name = (u.company_name || u.full_name || '').split(' ')[0] || '';
    const mail = emailFor(stage, name, produced, trialEndStr);

    try {
      await sendBrevoCompat({
        sender: { name: 'KeiroAI', email: 'contact@keiroai.com' },
        to: [{ email: u.email }],
        subject: mail.subject, htmlContent: mail.html,
      });
      await supabase.from('agent_logs').insert({
        agent: 'system', action: `trial_nurture_j${stage}`, status: 'ok',
        data: { user_id: u.id, stage, produced }, created_at: new Date().toISOString(),
      });
      results.push({ user: u.id.slice(0, 8), stage, sent: true, produced });
    } catch (e: any) {
      results.push({ user: u.id.slice(0, 8), stage, error: e?.message?.slice(0, 80) });
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
