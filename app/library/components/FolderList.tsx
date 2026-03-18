'use client';

import FolderDropZone from './FolderDropZone';
import { FolderIcon } from './Icons';
import { useLanguage } from '@/lib/i18n/context';

type Folder = {
  id: string;
  name: string;
  icon: string;
  color: string;
  image_count?: number;
};

interface FolderListProps {
  folders: Folder[];
  selectedFolder: string | null;
  onSelectFolder: (folderId: string | null) => void;
}

export default function FolderList({ folders, selectedFolder, onSelectFolder }: FolderListProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-2">
      {/* All folders (root) */}
      <FolderDropZone folderId={null}>
        <button
          onClick={() => onSelectFolder(null)}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
            selectedFolder === null
              ? 'bg-[#0c1a3a]/5 border-2 border-[#0c1a3a] text-[#0c1a3a]'
              : 'bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50'
          }`}
        >
          <FolderIcon className="w-5 h-5" />
          <span className="flex-1 text-left font-medium">{t.library.flAllImages}</span>
          <span className="text-xs text-neutral-500">
            {folders.reduce((sum, f) => sum + (f.image_count || 0), 0)}
          </span>
        </button>
      </FolderDropZone>

      {/* Individual folders */}
      {folders.map((folder) => (
        <FolderDropZone key={folder.id} folderId={folder.id}>
          <button
            onClick={() => onSelectFolder(folder.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
              selectedFolder === folder.id
                ? 'bg-[#0c1a3a]/5 border-2 border-[#0c1a3a] text-[#0c1a3a]'
                : 'bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50'
            }`}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-lg"
              style={{ backgroundColor: folder.color + '20' }}
            >
              {folder.icon}
            </div>
            <span className="flex-1 text-left font-medium truncate">{folder.name}</span>
            {folder.image_count !== undefined && (
              <span className="text-xs text-neutral-500">{folder.image_count}</span>
            )}
          </button>
        </FolderDropZone>
      ))}
    </div>
  );
}
