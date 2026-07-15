import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

/**
 * CAPTURE WAITLIST (founder 15/07) — récupère l'email des visiteurs qui veulent
 * être prévenus quand une fonction « à venir » (Stella WhatsApp, Théo avis
 * Google, connecteurs Gmail/Outlook…) est dispo. On persiste côté serveur (pas
 * juste localStorage) → lead actionnable. Stocké dans agent_logs (aucune
 * contrainte CHECK, requêtable) + best-effort dans crm_prospects.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const feature = String(body.feature || body.agent || 'launch').slice(0, 60);
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: 'email invalide' }, { status: 400 });
    }
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const now = new Date().toISOString();

    // Dédup 30j : pas de doublon email+feature.
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: dup } = await supabase.from('agent_logs')
      .select('id').eq('agent', 'system').eq('action', 'waitlist_signup')
      .contains('data', { email, feature }).gte('created_at', since).limit(1);
    if (!dup?.length) {
      await supabase.from('agent_logs').insert({
        agent: 'system', action: 'waitlist_signup', status: 'ok',
        data: { email, feature }, created_at: now,
      });
    }

    // Confirmation légère (best-effort, ne bloque pas).
    try {
      const { sendEmailWithFallback } = await import('@/lib/email/send-with-fallback');
      await sendEmailWithFallback({
        to: email, toName: '', fromName: 'KeiroAI', fromEmail: 'contact@keiroai.com',
        subject: 'C\'est noté — on te prévient dès que c\'est prêt 👌',
        html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:24px auto;color:#0f172a"><p>Merci ! On te prévient <strong>dès que cette fonction est disponible</strong> — c'est pour très bientôt (quelques jours à un mois max).</p><p>En attendant, tu peux déjà utiliser tous les agents actifs de ton équipe KeiroAI.</p><p style="color:#94a3b8;font-size:12px">Tu reçois ça car tu as demandé à être prévenu sur keiroai.com.</p></div>`,
        tags: ['waitlist', feature],
      });
    } catch { /* best-effort */ }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'server_error' }, { status: 500 });
  }
}
