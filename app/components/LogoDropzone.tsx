'use client';
import React, { useRef, useState } from 'react';

export default function LogoDropzone({
  value,
  onChange
}: {
  value?: string;
  onChange?: (url: string) => void;
}) {
  const [preview, setPreview] = useState<string|undefined>(value);
  const inputRef = useRef<HTMLInputElement|null>(null);

  function handleFiles(files: FileList | null) {
    if (!files || !files[0]) return;
    const f = files[0];
    const url = URL.createObjectURL(f);
    setPreview(url);
    onChange?.(url);
  }

  return (
    <div className="rounded-2xl border border-dashed border-neutral-300 p-4 bg-white">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium">Ajouter un logo</h4>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="px-3 py-1.5 rounded-md text-sm bg-black text-white hover:opacity-90"
        >
          Importer
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e)=>handleFiles(e.target.files)}
      />

      <div
        className="w-full h-[140px] rounded-md border border-dashed border-neutral-300 bg-neutral-50 flex items-center justify-center text-sm text-neutral-500 overflow-hidden"
        onDragOver={(e)=>{ e.preventDefault(); }}
        onDrop={(e)=>{ e.preventDefault(); handleFiles(e.dataTransfer.files); }}
      >
        {preview ? (
          <img src={preview} alt="Logo" className="max-h-full object-contain" />
        ) : (
          <span>Glisser / déposer ou cliquer « Importer »</span>
        )}
      </div>
    </div>
  );
}
