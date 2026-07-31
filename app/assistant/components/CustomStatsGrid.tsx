'use client';

import { useEffect, useMemo, useState } from 'react';
import { STAT_CATALOG, defaultStatsFor, type StatDef } from '@/lib/stats/catalog';
import { useLanguage } from '@/lib/i18n/context';

/**
 * Les statistiques que le client CHOISIT d'afficher.
 *
 * Demande fondateur (2026-07-31) : « le client doit pouvoir choisir quels stats
 * il affiche, donc on veut un mini filtre menu, et par type de commerce on met
 * des stats pertinentes par défaut et modulables ».
 *
 * Le défaut vient du type de commerce (defaultStatsFor) : un restaurant ouvre
 * sur sa portée et ses avis, une PME sur ses prospects et son taux de
 * conversion. Personne ne part d'une grille vide, et personne ne reste coincé
 * avec la nôtre.
 *
 * Une métrique absente de la réponse de l'API n'est PAS rendue à zéro : une
 * tuile à 0 se lit comme un échec alors qu'elle signifie « pas encore mesuré ».
 */

const MAX_SELECTED = 12;

const AGENT_GROUPS: { key: StatDef['agent']; fr: string; en: string }[] = [
  { key: 'content', fr: 'Contenu — Léna', en: 'Content — Léna' },
  { key: 'dm_instagram', fr: 'DM & commentaires — Jade', en: 'DMs & comments — Jade' },
  { key: 'gmaps', fr: 'Avis & Google — Théo', en: 'Reviews & Google — Théo' },
  { key: 'email', fr: 'Emails — Hugo', en: 'Emails — Hugo' },
  { key: 'commercial', fr: 'Prospection — Léo', en: 'Prospecting — Léo' },
  { key: 'whatsapp', fr: 'WhatsApp — Stella', en: 'WhatsApp — Stella' },
  { key: 'global', fr: 'Vue d’ensemble', en: 'Overview' },
];

function formatValue(v: number, unit: StatDef['unit'], locale: string): string {
  if (unit === 'pourcentage') return `${v}%`;
  if (unit === 'euros') return `${v.toLocaleString(locale === 'en' ? 'en-US' : 'fr-FR')}€`;
  if (unit === 'note') return v.toFixed(1);
  return v.toLocaleString(locale === 'en' ? 'en-US' : 'fr-FR');
}

export default function CustomStatsGrid() {
  const { locale } = useLanguage();
  const en = locale === 'en';
  const [metrics, setMetrics] = useState<Record<string, number> | null>(null);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [businessType, setBusinessType] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/stats/metrics', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data?.ok) return;
        setMetrics(data.metrics || {});
        setBusinessType(data.businessType || null);
        setSelected(Array.isArray(data.prefs) && data.prefs.length
          ? data.prefs
          : defaultStatsFor(data.businessType));
      } catch { /* la grille reste masquée plutôt que d'afficher du faux */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const save = async (next: string[]) => {
    setSelected(next);
    setSaving(true);
    try {
      await fetch('/api/stats/metrics', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stats: next }),
      });
    } catch { /* le choix reste appliqué localement */ }
    finally { setSaving(false); }
  };

  const toggle = (id: string) => {
    if (!selected) return;
    if (selected.includes(id)) save(selected.filter(s => s !== id));
    else if (selected.length < MAX_SELECTED) save([...selected, id]);
  };

  // On n'affiche que les métriques réellement calculées.
  const tiles = useMemo(() => {
    if (!metrics || !selected) return [];
    return selected
      .map(id => STAT_CATALOG.find(s => s.id === id))
      .filter((s): s is StatDef => !!s && typeof metrics[s.id] === 'number');
  }, [metrics, selected]);

  if (!metrics || !selected) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="min-w-0">
          <h3 className="text-white/70 text-xs uppercase tracking-wider font-semibold">
            {en ? 'Your numbers' : 'Tes chiffres'}
          </h3>
          <p className="text-white/30 text-[10px]">
            {en ? 'Last 30 days' : '30 derniers jours'}
            {businessType ? ` · ${businessType}` : ''}
          </p>
        </div>
        <button
          onClick={() => setMenuOpen(o => !o)}
          className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-white/70 text-[11px] font-medium transition-colors flex items-center gap-1.5"
        >
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
          {en ? 'Choose' : 'Choisir'}
          {saving && <span className="text-white/30">…</span>}
        </button>
      </div>

      {menuOpen && (
        <div className="mb-4 rounded-xl border border-white/10 bg-[#0c1a3a]/80 backdrop-blur p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-white/50 text-[11px]">
              {en
                ? `${selected.length} of ${MAX_SELECTED} selected — untick what you don't care about.`
                : `${selected.length} sur ${MAX_SELECTED} — décoche ce qui ne t'intéresse pas.`}
            </p>
            <button
              onClick={() => save(defaultStatsFor(businessType))}
              className="text-[11px] text-white/40 hover:text-white/70 underline underline-offset-2"
            >
              {en ? 'Reset to my trade' : 'Remettre celles de mon métier'}
            </button>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 max-h-[50vh] overflow-y-auto">
            {AGENT_GROUPS.map(group => {
              const items = STAT_CATALOG.filter(s => s.agent === group.key);
              if (!items.length) return null;
              return (
                <div key={group.key}>
                  <p className="text-white/40 text-[10px] uppercase tracking-wider font-semibold mb-1.5">
                    {en ? group.en : group.fr}
                  </p>
                  <div className="space-y-1">
                    {items.map(s => {
                      const on = selected.includes(s.id);
                      const measurable = typeof metrics[s.id] === 'number';
                      return (
                        <label
                          key={s.id}
                          className={`flex items-start gap-2 text-[12px] cursor-pointer rounded px-1.5 py-1 transition-colors ${
                            on ? 'text-white bg-white/[0.06]' : 'text-white/50 hover:bg-white/[0.03]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggle(s.id)}
                            disabled={!on && selected.length >= MAX_SELECTED}
                            className="mt-0.5 accent-purple-500"
                          />
                          <span className="leading-tight">
                            {en ? s.label.en : s.label.fr}
                            {!measurable && (
                              <span className="text-white/25 text-[10px] ml-1">
                                {en ? '(no data yet)' : '(pas encore de donnée)'}
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tiles.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-white/40 text-xs">
          {en
            ? 'Nothing measured yet on the stats you picked. They will fill in as your agents work.'
            : 'Rien de mesuré pour l’instant sur les stats que tu as choisies. Elles se rempliront au fil du travail de tes agents.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {tiles.map(s => (
            <div key={s.id} className="rounded-xl bg-white/[0.04] border border-white/10 p-4">
              <p className="text-white/40 text-[10px] uppercase tracking-wider font-semibold mb-1.5 leading-tight">
                {en ? s.label.en : s.label.fr}
              </p>
              <p className="text-white text-2xl font-bold">
                {formatValue(metrics[s.id], s.unit, locale)}
              </p>
              <p className="text-white/30 text-[10px] mt-0.5">{en ? s.hint.en : s.hint.fr}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
