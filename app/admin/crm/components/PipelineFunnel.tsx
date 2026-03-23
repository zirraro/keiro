'use client';

import { useCallback } from 'react';

type FunnelStage = {
  id: string;
  label: string;
  count: number;
  color: string;
  icon: string;
};

type ConversionRate = {
  from: string;
  to: string;
  rate: number;
};

type Props = {
  stages: FunnelStage[];
  conversionRates: ConversionRate[];
  onStageClick: (stageId: string) => void;
  activeStage: string | null;
};

const SHORT_LABELS: Record<string, string> = {
  identifie: 'Ident.',
  contacte: 'Contact.',
  relance_1: 'R1',
  relance_2: 'R2',
  relance_3: 'R3',
  repondu: 'Rép.',
  demo: 'Démo',
  sprint: 'Sprint',
  client: 'Client',
  perdu: 'Perdu',
};

export default function PipelineFunnel({
  stages,
  conversionRates,
  onStageClick,
  activeStage,
}: Props) {
  const handleClick = useCallback(
    (stageId: string) => {
      onStageClick(stageId);
    },
    [onStageClick]
  );

  if (!stages.length) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1 px-1 py-1.5">
      {stages.map((stage, index) => {
        const isActive = activeStage === stage.id;
        const nextStage = stages[index + 1];
        const conversion = nextStage
          ? conversionRates.find((cr) => cr.from === stage.id && cr.to === nextStage.id)
          : undefined;
        const shortLabel = SHORT_LABELS[stage.id] || stage.label;

        return (
          <div key={stage.id} className="flex items-center gap-1">
            <button
              onClick={() => handleClick(stage.id)}
              className={`
                inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium
                transition-all cursor-pointer
                ${isActive ? 'ring-1 ring-white/40 bg-white/15' : 'bg-white/5 hover:bg-white/10'}
              `}
            >
              <span className="text-white/50">{shortLabel}</span>
              <span className="text-white font-bold">{stage.count}</span>
            </button>
            {conversion && index < stages.length - 1 && (
              <span className={`text-[9px] ${conversion.rate > 10 ? 'text-green-400/60' : conversion.rate > 0 ? 'text-yellow-400/60' : 'text-white/20'}`}>
                →
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
