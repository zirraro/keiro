/**
 * /admin/places-spend
 *
 * Real-time Google Places API spend dashboard. Reads from
 * `places_spend_daily` (populated by lib/places/prospect-pool.ts) and
 * shows last 30 days of details_calls, text_search_calls, pool_hits
 * and estimated_cost_eur per day.
 *
 * Admin-only. Surfaces:
 *   - Today's spend vs daily cap
 *   - Pool reuse rate (hits / (hits + new calls)) — the higher the
 *     better, this is what makes scaling cheap.
 *   - Top-served pool entries (most reused places).
 */

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function getUser() {
  const cookieStore = await cookies();
  for (const cookie of cookieStore.getAll()) {
    if (cookie.name.startsWith('sb-') && cookie.name.endsWith('-auth-token')) {
      try {
        let v = cookie.value;
        if (v.startsWith('base64-')) v = Buffer.from(v.substring(7), 'base64').toString('utf-8');
        const parsed = JSON.parse(v);
        return parsed.access_token || (Array.isArray(parsed) ? parsed[0] : null);
      } catch { /* ignore */ }
    }
  }
  return null;
}

export default async function PlacesSpendPage() {
  const accessToken = await getUser();
  if (!accessToken) redirect('/login?redirect=/admin/places-spend');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: { user } } = await supabase.auth.getUser(accessToken);
  if (!user) redirect('/login?redirect=/admin/places-spend');

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.is_admin) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-neutral-50">
        <div className="text-sm text-neutral-700">Admins only.</div>
      </main>
    );
  }

  const since30d = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const { data: rows } = await supabase
    .from('places_spend_daily')
    .select('*')
    .gte('day', since30d)
    .order('day', { ascending: false });

  const today = new Date().toISOString().slice(0, 10);
  const todayRow = (rows || []).find(r => r.day === today);
  const todaySpent = Number(todayRow?.estimated_cost_eur || 0);
  const dailyBudget = Number(process.env.DAILY_PLACES_BUDGET_EUR || '5');
  const usagePct = Math.min(100, Math.round((todaySpent / dailyBudget) * 100));

  const total30d = (rows || []).reduce((acc, r) => acc + Number(r.estimated_cost_eur || 0), 0);
  const detailsCalls30d = (rows || []).reduce((acc, r) => acc + (r.details_calls || 0), 0);
  const poolHits30d = (rows || []).reduce((acc, r) => acc + (r.pool_hits || 0), 0);
  const reuseRate = (detailsCalls30d + poolHits30d) > 0
    ? Math.round((poolHits30d / (detailsCalls30d + poolHits30d)) * 100)
    : 0;

  // Top-served pool entries (most reused).
  const { data: topServed } = await supabase
    .from('prospect_pool')
    .select('place_id, name, zone, business_type, hit_count, last_served_at')
    .order('hit_count', { ascending: false })
    .limit(20);

  const { count: poolSize } = await supabase
    .from('prospect_pool')
    .select('place_id', { count: 'exact', head: true });

  return (
    <main className="min-h-screen bg-neutral-50 py-10">
      <div className="max-w-5xl mx-auto px-6 space-y-6">
        <header>
          <p className="text-xs uppercase tracking-widest text-blue-700 font-semibold mb-1">Admin</p>
          <h1 className="text-2xl font-bold text-neutral-900">Google Places — spend &amp; pool</h1>
          <p className="text-sm text-neutral-600 mt-1">
            Tracks live API spend, daily budget usage, and the cross-client prospect pool reuse rate.
          </p>
        </header>

        {/* Today's spend */}
        <section className="grid sm:grid-cols-3 gap-4">
          <Card label="Aujourd'hui" value={`€${todaySpent.toFixed(2)}`} sub={`/ €${dailyBudget.toFixed(2)} cap`} highlight={usagePct >= 80} />
          <Card label="Sur 30 jours" value={`€${total30d.toFixed(2)}`} sub={`${detailsCalls30d} calls Places`} />
          <Card label="Pool reuse rate" value={`${reuseRate}%`} sub={`${poolHits30d} hits / ${detailsCalls30d + poolHits30d} demandes`} highlight={reuseRate >= 30} />
        </section>

        <ProgressBar pct={usagePct} budget={dailyBudget} spent={todaySpent} />

        {/* Daily history */}
        <section className="bg-white rounded-xl border border-neutral-200 p-4">
          <h2 className="text-sm font-bold text-neutral-900 mb-3">Historique 30 jours</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-neutral-500 border-b border-neutral-200">
                  <th className="pb-2">Jour</th>
                  <th className="pb-2 text-right">Text Search</th>
                  <th className="pb-2 text-right">Details (payants)</th>
                  <th className="pb-2 text-right">Pool hits (gratuits)</th>
                  <th className="pb-2 text-right">Coût (€)</th>
                </tr>
              </thead>
              <tbody>
                {(rows || []).map(r => (
                  <tr key={r.day} className="border-b border-neutral-100">
                    <td className="py-2 font-mono text-neutral-700">{r.day}</td>
                    <td className="py-2 text-right text-neutral-700">{r.text_search_calls || 0}</td>
                    <td className="py-2 text-right text-neutral-900 font-semibold">{r.details_calls || 0}</td>
                    <td className="py-2 text-right text-emerald-700 font-semibold">{r.pool_hits || 0}</td>
                    <td className="py-2 text-right font-bold text-neutral-900">€{Number(r.estimated_cost_eur || 0).toFixed(2)}</td>
                  </tr>
                ))}
                {(!rows || rows.length === 0) && (
                  <tr><td colSpan={5} className="py-4 text-center text-neutral-500">Aucune donnée pour les 30 derniers jours.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Top served pool entries */}
        <section className="bg-white rounded-xl border border-neutral-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-neutral-900">Top 20 entrées du pool</h2>
            <span className="text-xs text-neutral-500">Pool total : <strong className="text-neutral-900">{poolSize || 0}</strong> places</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-neutral-500 border-b border-neutral-200">
                  <th className="pb-2">Nom</th>
                  <th className="pb-2">Zone</th>
                  <th className="pb-2">Type</th>
                  <th className="pb-2 text-right">Hits</th>
                  <th className="pb-2 text-right">Dernière utilisation</th>
                </tr>
              </thead>
              <tbody>
                {(topServed || []).map(p => (
                  <tr key={p.place_id} className="border-b border-neutral-100">
                    <td className="py-2 text-neutral-900 truncate max-w-[200px]">{p.name}</td>
                    <td className="py-2 text-neutral-700">{p.zone || '—'}</td>
                    <td className="py-2 text-neutral-700">{p.business_type || '—'}</td>
                    <td className="py-2 text-right font-bold text-emerald-700">{p.hit_count}</td>
                    <td className="py-2 text-right text-neutral-500">{p.last_served_at ? new Date(p.last_served_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
                {(!topServed || topServed.length === 0) && (
                  <tr><td colSpan={5} className="py-4 text-center text-neutral-500">Le pool est vide pour l'instant — il se remplira au prochain run Léo.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function Card({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'border-amber-400/60 bg-amber-50/70' : 'border-neutral-200 bg-white'}`}>
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">{label}</div>
      <div className="text-2xl font-bold text-neutral-900 mt-1">{value}</div>
      {sub && <div className="text-xs text-neutral-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function ProgressBar({ pct, budget, spent }: { pct: number; budget: number; spent: number }) {
  const color = pct >= 100 ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between text-xs text-neutral-600 mb-2">
        <span>Budget journalier Places</span>
        <span>€{spent.toFixed(2)} / €{budget.toFixed(2)} ({pct}%)</span>
      </div>
      <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}
