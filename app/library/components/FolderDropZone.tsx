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
        isOver ? 'ring-2 ring-blue-500 ring-offset-2 bg-blue-50' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}
