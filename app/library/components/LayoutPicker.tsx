'use client';

type LayoutOption = 'both-open' | 'instagram-open' | 'tiktok-open';

interface LayoutPickerProps {
  currentLayout: LayoutOption;
  onLayoutChange: (layout: LayoutOption) => void;
}

export default function LayoutPicker({ currentLayout, onLayoutChange }: LayoutPickerProps) {
  const layouts: { id: LayoutOption; label: string; icon: JSX.Element }[] = [
    {
      id: 'both-open',
      label: 'Les deux ouverts',
      icon: (
        <div className="flex gap-0.5">
          <div className="w-2 h-3 bg-purple-400 rounded-sm"></div>
          <div className="w-2 h-3 bg-cyan-400 rounded-sm"></div>
        </div>
      )
    },
    {
      id: 'instagram-open',
      label: 'Instagram ouvert',
      icon: (
        <div className="flex gap-0.5">
          <div className="w-3.5 h-3 bg-purple-400 rounded-sm"></div>
          <div className="w-0.5 h-3 bg-cyan-200 rounded-sm"></div>
        </div>
      )
    },
    {
      id: 'tiktok-open',
      label: 'TikTok ouvert',
      icon: (
        <div className="flex gap-0.5">
          <div className="w-0.5 h-3 bg-purple-200 rounded-sm"></div>
          <div className="w-3.5 h-3 bg-cyan-400 rounded-sm"></div>
        </div>
      )
    }
  ];

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-neutral-500">Affichage:</span>
      <div className="flex gap-1.5">
        {layouts.map((layout) => (
          <button
            key={layout.id}
            onClick={() => onLayoutChange(layout.id)}
            className={`p-1.5 rounded border transition-all ${
              currentLayout === layout.id
                ? 'border-blue-500 bg-blue-50'
                : 'border-neutral-200 bg-white hover:border-neutral-300'
            }`}
            title={layout.label}
            aria-label={layout.label}
          >
            {layout.icon}
          </button>
        ))}
      </div>
    </div>
  );
}
