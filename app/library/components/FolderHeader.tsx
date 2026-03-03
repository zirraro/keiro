'use client';

import { useLanguage } from '@/lib/i18n/context';

interface FolderHeaderProps {
  icon?: string;
  name: string;
  color?: string;
  itemCount: number;
}

export default function FolderHeader({ icon = '📁', name, color = '#3B82F6', itemCount }: FolderHeaderProps) {
  const { t } = useLanguage();

  return (
    <div className="flex items-center gap-3 mb-4 pb-3 border-b-2" style={{ borderColor: color }}>
      <span className="text-2xl">{icon}</span>
      <div className="flex-1">
        <h3 className="text-lg font-bold text-neutral-900">{name}</h3>
        <p className="text-sm text-neutral-500">
          {itemCount} {itemCount === 1 ? t.library.fhElement : t.library.fhElements}
        </p>
      </div>
    </div>
  );
}
