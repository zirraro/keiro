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

function getArrowColor(rate: number): string {
  if (rate > 15) return 'text-green-600';
  if (rate >= 5) return 'text-yellow-500';
  return 'text-red-500';
}

function getArrowBg(rate: number): string {
  if (rate > 15) return 'bg-green-50';
  if (rate >= 5) return 'bg-yellow-50';
  return 'bg-red-50';
}

function getConversionRate(
  conversionRates: ConversionRate[],
  fromId: string,
  toId: string
): ConversionRate | undefined {
  return conversionRates.find((cr) => cr.from === fromId && cr.to === toId);
}

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
    return (
      <div className="text-center text-neutral-400 py-8">
        Aucune donnee de pipeline
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        {stages.map((stage, index) => {
          const isActive = activeStage === stage.id;
          const nextStage = stages[index + 1];
          const conversion = nextStage
            ? getConversionRate(conversionRates, stage.id, nextStage.id)
            : undefined;

          return (
            <div key={stage.id} className="flex items-center gap-2">
              {/* Stage block */}
              <button
                onClick={() => handleClick(stage.id)}
                className={`
                  flex flex-col items-center justify-center px-5 py-4 rounded-xl
                  transition-all duration-200 cursor-pointer min-w-[120px]
                  ${isActive ? 'ring-2 ring-offset-2 ring-neutral-900 shadow-lg scale-105' : 'hover:shadow-md hover:scale-[1.02]'}
                `}
                style={{ backgroundColor: stage.color + '20', borderLeft: `4px solid ${stage.color}` }}
              >
                <span className="text-2xl mb-1">{stage.icon}</span>
                <span
                  className="text-sm font-semibold truncate max-w-[110px]"
                  style={{ color: stage.color }}
                >
                  {stage.label}
                </span>
                <span className="text-xl font-bold text-neutral-800 mt-1">
                  {stage.count}
                </span>
              </button>

              {/* Arrow with conversion rate */}
              {conversion && (
                <div className="flex flex-col items-center mx-1">
                  <div
                    className={`
                      text-xs font-semibold px-2 py-0.5 rounded-full mb-1
                      ${getArrowBg(conversion.rate)} ${getArrowColor(conversion.rate)}
                    `}
                  >
                    {conversion.rate.toFixed(1)}%
                  </div>
                  <svg
                    className={`w-6 h-6 ${getArrowColor(conversion.rate)}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
