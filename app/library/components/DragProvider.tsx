'use client';

import { ReactNode, useState } from 'react';
import { DndContext, DragOverlay, closestCenter, DragEndEvent, DragStartEvent } from '@dnd-kit/core';

interface DragProviderProps {
  children: ReactNode;
  onDragEnd: (imageId: string, folderId: string | null) => void;
}

export default function DragProvider({ children, onDragEnd }: DragProviderProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const imageId = active.id as string;
      // 'root' signifie dossier racine (aucun dossier)
      const folderId = over.id === 'root' ? null : (over.id as string);
      onDragEnd(imageId, folderId);
    }

    setActiveId(null);
  };

  return (
    <DndContext
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {children}
      <DragOverlay>
        {activeId && (
          <div className="bg-white rounded-lg border-2 border-blue-500 shadow-2xl p-3 opacity-80">
            <div className="w-48 h-48 bg-neutral-100 rounded flex items-center justify-center">
              <p className="text-sm text-neutral-500">Déplacement...</p>
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
