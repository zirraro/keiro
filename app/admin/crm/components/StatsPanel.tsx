'use client';

import { useState, useMemo, useCallback } from 'react';

type EmailPerfRow = {
  category: string;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
};

type StepPerfRow = {
  step: number;
  label: string;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
};

type BestAction = {
  actionType: string;
  label: string;
  conversions: number;
  totalActions: number;
  conversionRate: number;
};

type SourceRow = {
  source: string;
  total: number;
  converted: number;
  conversionRate: number;
};

type Props = {
  emailByCategory: EmailPerfRow[];
  emailByStep: StepPerfRow[];
  bestActions: BestAction[];
  sourceAttribution: SourceRow[];
  loading: boolean;
};

type SortDir = 'asc' | 'desc';

const STEP_LABELS: Record<number, string> = {
  1: '1er contact',
  2: 'Relance douce',
  3: 'Valeur gratuite',
  4: 'FOMO',
  5: 'Derniere chance',
  10: 'Warm lead',
};

function useSortable<T>(data: T[], defaultKey: keyof T & string) {
  const [sortKey, setSortKey] = useState<string>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      const as = String(av);
      const bs = String(bv);
      return sortDir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
    });
  }, [data, sortKey, sortDir]);

  const toggleSort = useCallback(
    (key: string) => {
      if (sortKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir('desc');
      }
    },
    [sortKey]
  );

  return { sorted, sortKey, sortDir, toggleSort };
}

function SortHeader({
  label,
  field,
  active,
  dir,
  onClick,
}: {
  label: string;
  field: string;
  active: boolean;
  dir: SortDir;
  onClick: (field: string) => void;
}) {
  return (
    <th
      className="px-2 py-2 text-left text-[11px] font-semibold text-neutral-500 uppercase tracking-wide cursor-pointer hover:text-neutral-800 select-none whitespace-nowrap"
      onClick={() => onClick(field)}
    >
      {label}
      {active && (
        <span className="ml-1 text-neutral-800">{dir === 'asc' ? '\u2191' : '\u2193'}</span>
      )}
    </th>
  );
}

function rateColor(rate: number): string {
  if (rate >= 30) return 'text-green-600 font-semibold';
  if (rate >= 15) return 'text-yellow-600';
  return 'text-neutral-500';
}

function findBestIndex<T>(data: T[], key: keyof T): number {
  if (!data.length) return -1;
  let best = 0;
  for (let i = 1; i < data.length; i++) {
    if ((data[i] as any)[key] > (data[best] as any)[key]) best = i;
  }
  return best;
}

function HorizontalBar({
  label,
  value,
  maxValue,
  subtext,
  color,
}: {
  label: string;
  value: number;
  maxValue: number;
  subtext: string;
  color: string;
}) {
  const width = maxValue > 0 ? Math.max((value / maxValue) * 100, 2) : 0;
  return (
    <div className="flex items-center gap-3 mb-2">
      <span className="text-xs text-neutral-600 w-28 truncate shrink-0">{label}</span>
      <div className="flex-1 h-5 bg-neutral-100 rounded-full overflow-hidden relative">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${width}%` }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-neutral-700">
          {value.toFixed(1)}%
        </span>
      </div>
      <span className="text-[10px] text-neutral-400 w-20 text-right shrink-0">{subtext}</span>
    </div>
  );
}

export default function StatsPanel({
  emailByCategory,
  emailByStep,
  bestActions,
  sourceAttribution,
  loading,
}: Props) {
  const catSort = useSortable(emailByCategory, 'openRate');
  const bestCatIdx = findBestIndex(emailByCategory, 'openRate');

  const stepsWithLabels = useMemo(
    () =>
      emailByStep.map((row) => ({
        ...row,
        label: STEP_LABELS[row.step] ?? row.label ?? `Step ${row.step}`,
      })),
    [emailByStep]
  );
  const stepSort = useSortable(stepsWithLabels, 'openRate');
  const bestStepIdx = findBestIndex(stepsWithLabels, 'openRate');

  const maxActionRate = useMemo(
    () => Math.max(...bestActions.map((a) => a.conversionRate), 1),
    [bestActions]
  );
  const maxSourceRate = useMemo(
    () => Math.max(...sourceAttribution.map((s) => s.conversionRate), 1),
    [sourceAttribution]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-neutral-400 text-sm">
        Chargement des statistiques...
      </div>
    );
  }

  const EMAIL_COLUMNS = [
    { field: 'sent', label: 'Envoyes' },
    { field: 'opened', label: 'Ouverts' },
    { field: 'openRate', label: 'OR%' },
    { field: 'clicked', label: 'Cliques' },
    { field: 'clickRate', label: 'CTR%' },
    { field: 'replied', label: 'Repondus' },
    { field: 'replyRate', label: 'RR%' },
  ];

  return (
    <div className="space-y-4">
      {/* Section 1: Email par Categorie */}
      <details open>
        <summary className="cursor-pointer text-sm font-bold text-neutral-800 mb-2 select-none hover:text-neutral-600">
          Email par Categorie
        </summary>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-100">
                <SortHeader label="Categorie" field="category" active={catSort.sortKey === 'category'} dir={catSort.sortDir} onClick={catSort.toggleSort} />
                {EMAIL_COLUMNS.map((col) => (
                  <SortHeader
                    key={col.field}
                    label={col.label}
                    field={col.field}
                    active={catSort.sortKey === col.field}
                    dir={catSort.sortDir}
                    onClick={catSort.toggleSort}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {catSort.sorted.map((row, i) => {
                const origIdx = emailByCategory.indexOf(row);
                const isBest = origIdx === bestCatIdx;
                return (
                  <tr
                    key={row.category}
                    className={`border-b border-neutral-50 ${isBest ? 'bg-green-50' : i % 2 === 0 ? 'bg-white' : 'bg-neutral-50/50'}`}
                  >
                    <td className="px-2 py-1.5 font-medium text-neutral-700">{row.category}</td>
                    <td className="px-2 py-1.5 text-neutral-600">{row.sent}</td>
                    <td className="px-2 py-1.5 text-neutral-600">{row.opened}</td>
                    <td className={`px-2 py-1.5 ${rateColor(row.openRate)}`}>{row.openRate.toFixed(1)}%</td>
                    <td className="px-2 py-1.5 text-neutral-600">{row.clicked}</td>
                    <td className={`px-2 py-1.5 ${rateColor(row.clickRate)}`}>{row.clickRate.toFixed(1)}%</td>
                    <td className="px-2 py-1.5 text-neutral-600">{row.replied}</td>
                    <td className={`px-2 py-1.5 ${rateColor(row.replyRate)}`}>{row.replyRate.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!emailByCategory.length && (
            <p className="text-center text-neutral-400 text-xs py-4">Aucune donnee</p>
          )}
        </div>
      </details>

      {/* Section 2: Email par Step */}
      <details open>
        <summary className="cursor-pointer text-sm font-bold text-neutral-800 mb-2 select-none hover:text-neutral-600">
          Email par Step
        </summary>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-100">
                <SortHeader label="Step" field="step" active={stepSort.sortKey === 'step'} dir={stepSort.sortDir} onClick={stepSort.toggleSort} />
                <SortHeader label="Label" field="label" active={stepSort.sortKey === 'label'} dir={stepSort.sortDir} onClick={stepSort.toggleSort} />
                {EMAIL_COLUMNS.map((col) => (
                  <SortHeader
                    key={col.field}
                    label={col.label}
                    field={col.field}
                    active={stepSort.sortKey === col.field}
                    dir={stepSort.sortDir}
                    onClick={stepSort.toggleSort}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {stepSort.sorted.map((row, i) => {
                const origIdx = stepsWithLabels.indexOf(row);
                const isBest = origIdx === bestStepIdx;
                return (
                  <tr
                    key={row.step}
                    className={`border-b border-neutral-50 ${isBest ? 'bg-green-50' : i % 2 === 0 ? 'bg-white' : 'bg-neutral-50/50'}`}
                  >
                    <td className="px-2 py-1.5 font-medium text-neutral-700">{row.step}</td>
                    <td className="px-2 py-1.5 text-neutral-600">{row.label}</td>
                    <td className="px-2 py-1.5 text-neutral-600">{row.sent}</td>
                    <td className="px-2 py-1.5 text-neutral-600">{row.opened}</td>
                    <td className={`px-2 py-1.5 ${rateColor(row.openRate)}`}>{row.openRate.toFixed(1)}%</td>
                    <td className="px-2 py-1.5 text-neutral-600">{row.clicked}</td>
                    <td className={`px-2 py-1.5 ${rateColor(row.clickRate)}`}>{row.clickRate.toFixed(1)}%</td>
                    <td className="px-2 py-1.5 text-neutral-600">{row.replied}</td>
                    <td className={`px-2 py-1.5 ${rateColor(row.replyRate)}`}>{row.replyRate.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!stepsWithLabels.length && (
            <p className="text-center text-neutral-400 text-xs py-4">Aucune donnee</p>
          )}
        </div>
      </details>

      {/* Section 3: Meilleures Actions */}
      <details open>
        <summary className="cursor-pointer text-sm font-bold text-neutral-800 mb-2 select-none hover:text-neutral-600">
          Meilleures Actions
        </summary>
        <div className="space-y-1">
          {bestActions.map((action) => (
            <HorizontalBar
              key={action.actionType}
              label={action.label}
              value={action.conversionRate}
              maxValue={maxActionRate}
              subtext={`${action.conversions}/${action.totalActions}`}
              color="bg-indigo-400"
            />
          ))}
          {!bestActions.length && (
            <p className="text-center text-neutral-400 text-xs py-4">Aucune donnee</p>
          )}
        </div>
      </details>

      {/* Section 4: Attribution Source */}
      <details open>
        <summary className="cursor-pointer text-sm font-bold text-neutral-800 mb-2 select-none hover:text-neutral-600">
          Attribution Source
        </summary>
        <div className="space-y-1">
          {sourceAttribution.map((source) => (
            <HorizontalBar
              key={source.source}
              label={source.source}
              value={source.conversionRate}
              maxValue={maxSourceRate}
              subtext={`${source.converted}/${source.total}`}
              color="bg-cyan-400"
            />
          ))}
          {!sourceAttribution.length && (
            <p className="text-center text-neutral-400 text-xs py-4">Aucune donnee</p>
          )}
        </div>
      </details>
    </div>
  );
}
