'use client';

import { ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';

interface FolderDropZoneProps {
  folderId: string | null;
  children: ReactNode;
  className?: string;
}

export default function FolderDropZone({ folderId, children, className = '' }: FolderDropZoneProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: folderId || 'root'
  });

  return (
    <div
      ref={setNodeRef}
      className={`transition-all ${
        isOver ? 'ring-2 ring-[#0c1a3a] ring-offset-2 bg-[#0c1a3a]/5' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}
