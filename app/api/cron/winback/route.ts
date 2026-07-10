import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendBrevoCompat } from '@/lib/email/brevo-compat';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * WINBACK (Fable 5 B2) — relance des clients résiliés. J+30 « voilà ce qui a
 * changé » (changelog réel = crédibilité), J+90 « offre retour » (1 mois -50%),
 * puis stop. Un churné d'un produit qui s'améliore vite revient — mais une seule
 * fois, proprement. Idempotent (flags sur le log de churn).
 */
function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function wrap(title: string, body: string) {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#333;margin:0;padding:0;">
<div style="max-width:540px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg,#0c1a3a,#1e3a5f);color:white;padding:24px;border-radius:12px 12px 0 0;text-align:center;"><h2 style="margin:0;">${title}</h2></div>
  <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;">${body}</div>
  <div style="background:#f9fafb;padding:12px;text-align:center;color:#9ca3af;font-size:11px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;">KeiroAI</div>
</div></body></html>`;
}

async function run() {
  const supabase = sb();
  const now = Date.now();
  const since = new Date(now - 100 * 86400000).toISOString();
  const { data: churns } = await supabase
    .from('agent_logs')
    .select('id, data, created_at')
    .eq('action', 'client_churn')
    .gte('created_at', since)
    .limit(1000);

  let sent = 0;
  for (const c of churns || []) {
    const d: any = c.data || {};
    const email = d.email;
    if (!email) continue;
    const ageDays = (now - new Date(d.churned_at || c.created_at).getTime()) / 86400000;

    let stage: 'j30' | 'j90' | null = null;
    if (ageDays >= 30 && ageDays < 45 && !d.winback_j30_sent) stage = 'j30';
    else if (ageDays >= 90 && ageDays < 110 && !d.winback_j90_sent) stage = 'j90';
    if (!stage) continue;

    const mail = stage === 'j30'
      ? { subject: 'Ton équipe KeiroAI a bien changé depuis 👀',
          html: wrap('On a beaucoup amélioré KeiroAI', `<p>Bonjour,</p><p>Depuis ton départ, ton équipe d'agents a fait des progrès : reels avec vrai mouvement, réponses plus fines, collecte d'avis Google, prospection téléphonique guidée… et bien plus.</p><p>Si tu veux revoir ce que ça donne aujourd'hui, ton espace t'attend :</p><p style="text-align:center;margin:24px 0;"><a href="https://keiroai.com/assistant" style="display:inline-block;background:linear-gradient(to right,#0c1a3a,#1e3a5f);color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:bold;">Revoir mon équipe</a></p><p style="color:#6b7280;font-size:12px;">Pas intéressé ? Ignore cet email, on ne te relancera qu'une dernière fois.</p>`) }
      : { subject: 'On aimerait te revoir — réessaie gratuitement 🎁',
          html: wrap('On aimerait te revoir', `<p>Bonjour,</p><p>Ça fait 3 mois. On a continué à améliorer KeiroAI presque chaque semaine.</p><p>Pour te redonner envie : <strong>réessaie gratuitement 7 jours</strong>, sans engagement, annulable en 1 clic. Tu verras tout ce qui a changé.</p><p style="text-align:center;margin:24px 0;"><a href="https://keiroai.com/essai" style="display:inline-block;background:linear-gradient(to right,#0c1a3a,#1e3a5f);color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:bold;">Réessayer gratuitement</a></p><p style="color:#6b7280;font-size:12px;">C'est la dernière fois qu'on t'écrit — promis.</p>`) };

    try {
      await sendBrevoCompat({ sender: { name: 'KeiroAI', email: 'contact@keiroai.com' }, to: [{ email }], subject: mail.subject, htmlContent: mail.html });
      const flag = stage === 'j30' ? { winback_j30_sent: true } : { winback_j90_sent: true };
      await supabase.from('agent_logs').update({ data: { ...d, ...flag } }).eq('id', c.id);
      sent++;
    } catch { /* best-effort */ }
  }
  return NextResponse.json({ ok: true, churns: (churns || []).length, winback_sent: sent });
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return run();
}
export async function POST(req: NextRequest) { return GET(req); }
