'use client';

/**
 * /admin/projections — strategic financial calculator.
 *
 * Inputs (sliders): total clients, % Pro vs % Créateur, monthly Meta
 * Ads spend, blended CAC, monthly churn, founder hours/week.
 * Outputs: MRR, COGS, fixed (staged by client count), EBITDA, net
 * dividend after IS + PFU, treasury buffer recommendation, capacity
 * recommendation (solo / alternant / team size).
 *
 * The cost model is anchored on real-month data pulled from
 * /api/admin/projections (uploaded bills + log estimates) so the
 * numbers reflect today's actual unit economics.
 */

import { useEffect, useMemo, useState } from 'react';

type Anchors = {
  ok: boolean;
  period: string;
  clients: { createur: number; pro: number; business: number; fondateurs: number; free: number; total_paying: number };
  real_costs_eur: {
    uploads_by_service: Record<string, number>;
    uploads_total: number;
    live_llm_estimate: number;
    visual_gen_estimate: number;
  };
  per_client_anchors_eur: { llm_per_active: number; visual_per_active: number };
};

// Default per-client COGS (€/month) used when no real anchor is yet
// available. Calibrated against May 2026 bills + scale assumptions.
const DEFAULT_VAR_COST = {
  createur: {
    stripe: 0.94, llm: 0.80, visual: 0.80, places: 0, infra: 0.35,
  },
  pro: {
    stripe: 1.64, llm: 2.00, visual: 0.80, places: 0.05, infra: 0.35,
  },
};

// Fixed cost staging — must match the strategic guidance below.
function fixedCostsFor(totalClients: number) {
  if (totalClients <= 100) return { label: 'Solo (toi)', monthly: 460 };
  if (totalClients <= 250) return { label: 'Toi + alternant 2j/sem', monthly: 1650 };
  if (totalClients <= 500) return { label: 'Toi + 1 salarié junior', monthly: 5500 };
  if (totalClients <= 1000) return { label: 'Toi + 3 salariés', monthly: 11300 };
  return { label: 'Toi + 5+ salariés', monthly: 18000 };
}

// Strategic guidance based on founder time budget + client count.
function strategicGuidance(totalClients: number, founderHoursPerWeek: number) {
  // Support load: 20 min/client/month at year-1 maturity (will fall to
  // ~8 min/client/month once agents reach 95% autonomy).
  const supportLoadHoursPerWeek = (totalClients * 20) / 60 / 4.33;
  // Founder must reserve: 10h dev (Claude Code assisted), 2h marketing,
  // 5h prospection, 1h admin. Remaining → support.
  const reservedHoursPerWeek = 10 + 2 + 5 + 1;
  const availableForSupport = Math.max(0, founderHoursPerWeek - reservedHoursPerWeek);
  const soloCeiling = Math.floor((availableForSupport * 60 * 4.33) / 20);

  let stage = '';
  let teamRec = '';
  let nextHire = '';

  if (totalClients <= soloCeiling) {
    stage = `✅ Solo viable (${supportLoadHoursPerWeek.toFixed(1)}h support/sem dans ton budget)`;
    teamRec = 'Toi seul. Pas d\'embauche nécessaire.';
    nextHire = `Embauche alternant 2j/sem quand support dépasse ${Math.floor(availableForSupport)}h/sem ≈ ${soloCeiling} clients.`;
  } else if (totalClients <= 200) {
    stage = `⚠️ Capacité solo dépassée — support = ${supportLoadHoursPerWeek.toFixed(1)}h/sem`;
    teamRec = 'Alternant 2j/sem (€900/mois all-in) absorbe L1 support + onboarding + content posting.';
    nextHire = 'Customer Success full-time à 200 clients.';
  } else if (totalClients <= 500) {
    stage = '🚀 Phase scale — produit doit être stable à 95 % d\'autonomie';
    teamRec = '+1 Customer Success (€3 500/mois) + alternant. Toi: vision + prospection Pro + partnerships.';
    nextHire = '+1 Dev junior à 350 clients pour décharger les bug fixes.';
  } else if (totalClients <= 1000) {
    stage = '📈 Croissance contrôlée — 3 salariés minimum';
    teamRec = '1 Dev senior + 1 CS lead + 1 Growth/Marketing. Toi: CEO mode, levée si besoin.';
    nextHire = 'Tête de Sales B2B à 800 clients pour pousser le mix vers Pro.';
  } else {
    stage = '🏢 Stade scale-up';
    teamRec = '5-7 salariés. Direction produit + 2 devs + 2 CS + 1 growth + 1 sales.';
    nextHire = 'Considérer Series A à €120k MRR si LTV/CAC ≥ 8 et churn ≤ 5 %.';
  }

  return { stage, teamRec, nextHire, supportLoadHoursPerWeek, soloCeiling };
}

function fmtEur(n: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

export default function ProjectionsPage() {
  const [anchors, setAnchors] = useState<Anchors | null>(null);
  const [loading, setLoading] = useState(true);

  // Sliders
  const [totalClients, setTotalClients] = useState(100);
  const [pctPro, setPctPro] = useState(30);
  const [cac, setCac] = useState(120);
  const [churnPct, setChurnPct] = useState(6);
  const [growthPerMonth, setGrowthPerMonth] = useState(10);
  const [founderHoursPerWeek, setFounderHoursPerWeek] = useState(28);

  useEffect(() => {
    fetch('/api/admin/projections')
      .then(r => r.json())
      .then(d => { if (d.ok) setAnchors(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Adjusted per-client COGS using real anchors when available.
  const varCost = useMemo(() => {
    const c = { ...DEFAULT_VAR_COST.createur };
    const p = { ...DEFAULT_VAR_COST.pro };
    if (anchors && anchors.per_client_anchors_eur.llm_per_active > 0) {
      // Blend real anchor 50/50 with model defaults (the anchor is small-N
      // today, so we don't trust it fully until we have ≥30 paying clients).
      const realLlm = anchors.per_client_anchors_eur.llm_per_active;
      const realVis = anchors.per_client_anchors_eur.visual_per_active;
      c.llm = (c.llm + realLlm * 0.5) / 1.5;
      c.visual = (c.visual + realVis * 0.5) / 1.5;
      p.llm = (p.llm + realLlm * 0.8) / 1.5; // Pro uses more LLM
      p.visual = (p.visual + realVis * 0.5) / 1.5;
    }
    return { createur: c, pro: p };
  }, [anchors]);

  const sumVar = (v: typeof DEFAULT_VAR_COST.createur) => v.stripe + v.llm + v.visual + (v as any).places + v.infra;

  const scenarios = useMemo(() => {
    const proCount = Math.round(totalClients * pctPro / 100);
    const createurCount = totalClients - proCount;
    const mrr = createurCount * 49 + proCount * 99;
    const cogs = createurCount * sumVar(varCost.createur) + proCount * sumVar(varCost.pro);

    // Ads: replace churn + fund growth
    const churnPerMonth = totalClients * churnPct / 100;
    const grossNewNeeded = churnPerMonth + growthPerMonth;
    const adsPerMonth = totalClients < 20 ? 0 : Math.round(grossNewNeeded * cac);

    const fixed = fixedCostsFor(totalClients);
    const ebitda = mrr - cogs - fixed.monthly - adsPerMonth;

    // Effective tax: IS 15 % up to ~€42 500/yr, 25 % above ; PFU 30 % on dividends.
    // Simplified blended: 40 % combined → net = 60 % of EBITDA.
    const netDividend = Math.max(0, ebitda * 0.60);

    // Treasury buffer recommendation: 3 months of fixed
    const treasuryNeed = fixed.monthly * 3;

    return {
      proCount, createurCount, mrr, cogs, adsPerMonth, fixed,
      ebitda, netDividend, treasuryNeed,
      churnPerMonth: Math.round(churnPerMonth),
      grossNewNeeded: Math.round(grossNewNeeded),
    };
  }, [totalClients, pctPro, churnPct, growthPerMonth, cac, varCost]);

  const guidance = strategicGuidance(totalClients, founderHoursPerWeek);

  // Pre-computed comparison tables (4 mixes × 4 client tiers)
  const tableTiers = [100, 250, 500, 1000];
  const tableMixes = [
    { label: '100 % Créateur', pctPro: 0 },
    { label: '70 % C / 30 % P', pctPro: 30 },
    { label: '50/50', pctPro: 50 },
    { label: '100 % Pro', pctPro: 100 },
  ];

  function computeMix(clients: number, pctP: number) {
    const proCount = Math.round(clients * pctP / 100);
    const createurCount = clients - proCount;
    const mrr = createurCount * 49 + proCount * 99;
    const cogs = createurCount * sumVar(varCost.createur) + proCount * sumVar(varCost.pro);
    const churnPerMonth = clients * 0.06; // baseline 6%
    const grossNewNeeded = churnPerMonth + 10; // baseline +10 net/mo
    const adsPerMonth = clients < 20 ? 0 : Math.round(grossNewNeeded * 120);
    const fixed = fixedCostsFor(clients);
    const ebitda = mrr - cogs - fixed.monthly - adsPerMonth;
    const netDividend = Math.max(0, ebitda * 0.60);
    return { mrr, cogs, adsPerMonth, fixed, ebitda, netDividend };
  }

  return (
    <div className="min-h-screen bg-[#0c1a3a] pt-16 pb-24 sm:pb-8 text-white">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-1">Projections financières</h1>
        <p className="text-white/50 text-sm mb-6">
          Calculateur live ancré sur les vrais coûts du mois en cours.
          {anchors && (
            <span className="ml-2">
              • {anchors.clients.total_paying} clients payants •
              {' '}LLM réel/client/mois : {anchors.per_client_anchors_eur.llm_per_active.toFixed(2)} € •
              {' '}Visuels réel/client/mois : {anchors.per_client_anchors_eur.visual_per_active.toFixed(2)} €
            </span>
          )}
        </p>

        {loading && <div className="text-white/40 text-sm">Chargement…</div>}

        {/* Sliders */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <SliderCard label={`Nombre de clients`} value={totalClients} min={20} max={2000} step={10} onChange={setTotalClients} suffix="" />
          <SliderCard label={`% Pro (€99)`} value={pctPro} min={0} max={100} step={5} onChange={setPctPro} suffix="%" />
          <SliderCard label={`CAC Meta Ads (€)`} value={cac} min={50} max={300} step={5} onChange={setCac} suffix="€" />
          <SliderCard label={`Churn mensuel`} value={churnPct} min={2} max={15} step={0.5} onChange={setChurnPct} suffix="%" />
          <SliderCard label={`Croissance nette visée /mois`} value={growthPerMonth} min={0} max={100} step={1} onChange={setGrowthPerMonth} suffix=" nouveaux" />
          <SliderCard label={`Tes heures/sem disponibles sur Keiro`} value={founderHoursPerWeek} min={10} max={60} step={1} onChange={setFounderHoursPerWeek} suffix="h" />
        </div>

        {/* Live scenario card */}
        <div className="rounded-2xl border border-purple-500/30 bg-purple-900/10 p-5 mb-6">
          <h2 className="text-lg font-bold mb-3">Scénario actuel : {totalClients} clients • {100-pctPro}/{pctPro} C/P</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Metric label="MRR" value={fmtEur(scenarios.mrr)} accent="emerald" />
            <Metric label="COGS variable" value={fmtEur(scenarios.cogs)} accent="amber" />
            <Metric label={`Fixe (${scenarios.fixed.label})`} value={fmtEur(scenarios.fixed.monthly)} accent="rose" />
            <Metric label="Meta Ads" value={fmtEur(scenarios.adsPerMonth)} accent="blue" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Metric label="EBITDA" value={fmtEur(scenarios.ebitda)} accent={scenarios.ebitda > 0 ? 'emerald' : 'rose'} big />
            <Metric label="Net dividende /mois" value={fmtEur(scenarios.netDividend)} accent="purple" big />
            <Metric label="Trésorerie cible" value={fmtEur(scenarios.treasuryNeed)} accent="white" />
          </div>
          <div className="mt-4 text-xs text-white/60">
            {scenarios.churnPerMonth} clients churné/mois → besoin {scenarios.grossNewNeeded} nouveaux/mois (incl. {growthPerMonth} croissance nette).
          </div>
        </div>

        {/* Strategic guidance */}
        <div className="rounded-2xl border border-amber-500/30 bg-amber-900/10 p-5 mb-6">
          <h2 className="text-lg font-bold mb-3">📋 Stratégie pour {totalClients} clients</h2>
          <div className="space-y-2 text-sm">
            <div><span className="text-amber-300 font-semibold">Stade :</span> {guidance.stage}</div>
            <div><span className="text-amber-300 font-semibold">Équipe :</span> {guidance.teamRec}</div>
            <div><span className="text-amber-300 font-semibold">Prochaine embauche :</span> {guidance.nextHire}</div>
            <div className="pt-2 text-xs text-white/50 border-t border-white/10 mt-3">
              Support estimé : {guidance.supportLoadHoursPerWeek.toFixed(1)} h/sem (20 min/client/mois année 1).
              Ton plafond solo : ~{guidance.soloCeiling} clients ({founderHoursPerWeek} h/sem dispo − 18 h reserved dev/marketing/sales/admin).
            </div>
          </div>
        </div>

        {/* Comparison table */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 mb-6">
          <h2 className="text-lg font-bold mb-3">Comparaison net dividende /mois (toutes hypothèses standard)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-2 px-2 text-white/60">Mix</th>
                  {tableTiers.map(t => <th key={t} className="text-right py-2 px-2 text-white/60">{t} clients</th>)}
                </tr>
              </thead>
              <tbody>
                {tableMixes.map(m => (
                  <tr key={m.label} className="border-b border-white/5">
                    <td className="py-2 px-2 font-medium">{m.label}</td>
                    {tableTiers.map(t => {
                      const r = computeMix(t, m.pctPro);
                      return (
                        <td key={t} className="text-right py-2 px-2">
                          <span className={r.netDividend > 0 ? 'text-emerald-300 font-bold' : 'text-rose-400'}>
                            {fmtEur(r.netDividend)}
                          </span>
                          <div className="text-[10px] text-white/30">EBITDA {fmtEur(r.ebitda)}</div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-white/40 mt-3">
            Net dividende = EBITDA × 60 % (IS 15-25 % + PFU 30 %).
            CAC €120 • Churn 6 % • Croissance +10/mois • Mix infra fixe escaladée par palier.
          </p>
        </div>

        {/* Real bills snapshot */}
        {anchors && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 mb-6">
            <h2 className="text-lg font-bold mb-3">Factures réelles {anchors.period}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {Object.entries(anchors.real_costs_eur.uploads_by_service).map(([svc, eur]) => (
                <div key={svc} className="rounded-lg bg-white/5 p-2 border border-white/10">
                  <div className="text-white/40 uppercase tracking-wider text-[10px]">{svc}</div>
                  <div className="font-bold text-base">{fmtEur(eur)}</div>
                </div>
              ))}
              <div className="rounded-lg bg-purple-500/10 p-2 border border-purple-500/20">
                <div className="text-purple-300 uppercase tracking-wider text-[10px]">LLM estimé live</div>
                <div className="font-bold text-base">{fmtEur(anchors.real_costs_eur.live_llm_estimate)}</div>
              </div>
              <div className="rounded-lg bg-purple-500/10 p-2 border border-purple-500/20">
                <div className="text-purple-300 uppercase tracking-wider text-[10px]">Visuels estimés live</div>
                <div className="font-bold text-base">{fmtEur(anchors.real_costs_eur.visual_gen_estimate)}</div>
              </div>
            </div>
            <p className="text-[11px] text-white/40 mt-3">
              Upload tes factures sur <a href="/admin/costs" className="text-purple-400 underline">/admin/costs</a> pour calibrer le modèle.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function SliderCard({ label, value, min, max, step, onChange, suffix }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; suffix: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs text-white/60">{label}</span>
        <span className="text-lg font-bold">{value}{suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-purple-500"
      />
    </div>
  );
}

function Metric({ label, value, accent, big }: { label: string; value: string; accent: string; big?: boolean }) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-300', amber: 'text-amber-300', rose: 'text-rose-300',
    blue: 'text-blue-300', purple: 'text-purple-300', white: 'text-white',
  };
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 p-3">
      <div className="text-[10px] text-white/50 uppercase tracking-wider mb-1">{label}</div>
      <div className={`${big ? 'text-2xl' : 'text-lg'} font-bold ${colorMap[accent] || 'text-white'}`}>{value}</div>
    </div>
  );
}
