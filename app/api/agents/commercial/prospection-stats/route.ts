import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

/**
 * LÉO — STATS SESSION DÉMARCHAGE (founder 13/07 : "un historique facile à
 * retrouver, stats pour dire j'ai appelé tant de personnes, combien ont
 * répondu…"). Agrège les activités d'appel (crm_activities) du client sur
 * aujourd'hui / 7 jours / total, + un historique récent.
 *
 * Aligne l'instrumentation acquisition (Fable 5 §4) côté commercial terrain.
 */
const OUTCOME_TYPES = ['call_interested', 'call_callback', 'call_not_interested', 'call_no_answer', 'call_followup'];

export async function GET(_req: NextRequest) {
  try {
    const { user, error } = await getAuthUser();
    if (error || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const now = Date.now();
    const startOfDay = new Date(new Date().toISOString().slice(0, 10)).toISOString();
    const weekAgo = new Date(now - 7 * 86400000).toISOString();

    const { data: acts } = await supabase
      .from('crm_activities')
      .select('type, description, date_activite, prospect_id, created_at')
      .eq('user_id', user.id)
      .in('type', OUTCOME_TYPES)
      .gte('date_activite', weekAgo)
      .order('date_activite', { ascending: false })
      .limit(500);

    const rows = acts || [];
    const inRange = (iso: string, from: string) => (iso || '') >= from;
    const tally = (from: string) => {
      const r = { called: 0, reached: 0, interested: 0, callback: 0, not_interested: 0, no_answer: 0 };
      for (const a of rows) {
        if (!inRange(a.date_activite || a.created_at, from)) continue;
        r.called++;
        if (a.type === 'call_interested') { r.reached++; r.interested++; }
        else if (a.type === 'call_callback' || a.type === 'call_followup') { r.reached++; r.callback++; }
        else if (a.type === 'call_not_interested') { r.reached++; r.not_interested++; }
        else if (a.type === 'call_no_answer') { r.no_answer++; }
      }
      return r;
    };

    const today = tally(startOfDay);
    const week = tally(weekAgo);
    const reachRate = week.called > 0 ? Math.round((week.reached / week.called) * 100) : 0;
    const interestRate = week.reached > 0 ? Math.round((week.interested / week.reached) * 100) : 0;

    const LABEL: Record<string, string> = {
      call_interested: '✅ Intéressé', call_callback: '🔁 Rappeler', call_followup: '🔁 À relancer',
      call_not_interested: '🚫 Pas intéressé', call_no_answer: '📵 Pas joint',
    };
    const history = rows.slice(0, 40).map(a => ({
      type: a.type, label: LABEL[a.type] || a.type,
      note: (a.description || '').replace(/^📞\s*/, ''),
      at: a.date_activite || a.created_at,
    }));

    return NextResponse.json({ ok: true, today, week, reachRate, interestRate, history });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'server_error' }, { status: 500 });
  }
}
