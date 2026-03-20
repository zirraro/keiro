'use client';

import { useCallback } from 'react';

type FilterState = {
  temperatures: string[];
  type: string | null;
  source: string | null;
  stage: string | null;
  period: '7d' | '30d' | '90d' | 'all';
  hasEmail: boolean;
  hasInstagram: boolean;
};

type Props = {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  types: string[];
  sources: string[];
};

const TEMPERATURE_CONFIG: { value: string; label: string; color: string; activeColor: string }[] = [
  { value: 'cold', label: 'Froid', color: 'bg-blue-100 text-blue-700 border-blue-300', activeColor: 'bg-blue-600 text-white border-blue-600' },
  { value: 'warm', label: 'Tiede', color: 'bg-orange-100 text-orange-700 border-orange-300', activeColor: 'bg-orange-500 text-white border-orange-500' },
  { value: 'hot', label: 'Chaud', color: 'bg-red-100 text-red-700 border-red-300', activeColor: 'bg-red-600 text-white border-red-600' },
  { value: 'dead', label: 'Mort', color: 'bg-neutral-100 text-neutral-500 border-neutral-300', activeColor: 'bg-neutral-600 text-white border-neutral-600' },
];

const PERIODS: { value: FilterState['period']; label: string }[] = [
  { value: '7d', label: '7j' },
  { value: '30d', label: '30j' },
  { value: '90d', label: '90j' },
  { value: 'all', label: 'Tout' },
];

const PIPELINE_STAGES = [
  'new', 'contacted', 'interested', 'demo', 'negotiation', 'won', 'lost', 'churned',
];

const DEFAULT_FILTERS: FilterState = {
  temperatures: [],
  type: null,
  source: null,
  stage: null,
  period: '30d',
  hasEmail: false,
  hasInstagram: false,
};

export default function QuickFilters({ filters, onChange, types, sources }: Props) {
  const update = useCallback(
    (patch: Partial<FilterState>) => {
      onChange({ ...filters, ...patch });
    },
    [filters, onChange]
  );

  const toggleTemperature = useCallback(
    (temp: string) => {
      const current = filters.temperatures;
      const next = current.includes(temp)
        ? current.filter((t) => t !== temp)
        : [...current, temp];
      update({ temperatures: next });
    },
    [filters.temperatures, update]
  );

  const clearAll = useCallback(() => {
    onChange({ ...DEFAULT_FILTERS });
  }, [onChange]);

  return (
    <div className="flex flex-wrap items-center gap-3 p-3 bg-white rounded-xl border border-neutral-200">
      {/* Temperature pills */}
      <div className="flex items-center gap-1.5">
        {TEMPERATURE_CONFIG.map((t) => {
          const active = filters.temperatures.includes(t.value);
          return (
            <button
              key={t.value}
              onClick={() => toggleTemperature(t.value)}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${active ? t.activeColor : t.color}`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Type dropdown */}
      <select
        value={filters.type ?? ''}
        onChange={(e) => update({ type: e.target.value || null })}
        className="text-xs border border-neutral-200 rounded-lg px-2 py-1.5 bg-white text-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400"
      >
        <option value="">Type...</option>
        {types.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>

      {/* Source dropdown */}
      <select
        value={filters.source ?? ''}
        onChange={(e) => update({ source: e.target.value || null })}
        className="text-xs border border-neutral-200 rounded-lg px-2 py-1.5 bg-white text-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400"
      >
        <option value="">Source...</option>
        {sources.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      {/* Stage dropdown */}
      <select
        value={filters.stage ?? ''}
        onChange={(e) => update({ stage: e.target.value || null })}
        className="text-xs border border-neutral-200 rounded-lg px-2 py-1.5 bg-white text-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400"
      >
        <option value="">Stage...</option>
        {PIPELINE_STAGES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      {/* Period pills */}
      <div className="flex items-center gap-1">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => update({ period: p.value })}
            className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
              filters.period === p.value
                ? 'bg-neutral-800 text-white border-neutral-800'
                : 'bg-neutral-50 text-neutral-600 border-neutral-200 hover:bg-neutral-100'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Checkboxes */}
      <label className="flex items-center gap-1.5 text-xs text-neutral-600 cursor-pointer">
        <input
          type="checkbox"
          checked={filters.hasEmail}
          onChange={(e) => update({ hasEmail: e.target.checked })}
          className="rounded border-neutral-300 text-neutral-800 focus:ring-neutral-400"
        />
        Avec email
      </label>
      <label className="flex items-center gap-1.5 text-xs text-neutral-600 cursor-pointer">
        <input
          type="checkbox"
          checked={filters.hasInstagram}
          onChange={(e) => update({ hasInstagram: e.target.checked })}
          className="rounded border-neutral-300 text-neutral-800 focus:ring-neutral-400"
        />
        Avec Instagram
      </label>

      {/* Clear button */}
      <button
        onClick={clearAll}
        className="ml-auto text-xs text-neutral-400 hover:text-neutral-700 transition-colors underline"
      >
        Reinitialiser
      </button>
    </div>
  );
}
