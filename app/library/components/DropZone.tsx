'use client';

interface DropZoneProps {
  isDragging: boolean;
  onCancel?: () => void;
}

export default function DropZone({ isDragging, onCancel }: DropZoneProps) {
  if (!isDragging) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-blue-500/20 backdrop-blur-sm flex items-center justify-center"
      onClick={onCancel}
    >
      <div className="bg-white rounded-2xl shadow-2xl p-12 border-4 border-dashed border-blue-500 max-w-md mx-4 pointer-events-none">
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-neutral-900 mb-2">
            Déposez vos fichiers ici
          </h3>
          <p className="text-neutral-600 text-sm">
            <strong>Images :</strong> JPG, PNG, GIF, WebP (max 8MB)<br />
            <strong>Vidéos :</strong> MP4, MOV, WebM (max 50MB)
          </p>
          <p className="text-neutral-400 text-xs mt-3 pointer-events-auto">
            Cliquez n'importe où ou appuyez sur Échap pour annuler
          </p>
        </div>
      </div>
    </div>
  );
}
