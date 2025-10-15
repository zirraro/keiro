"use client";
import { useRef } from "react";

export default function LogoUploader({
  value,
  onChange,
  title = "Sélectionner un logo",
}: {
  value: string;
  onChange: (dataUrl: string, file: File | null) => void;
  title?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function readFile(file: File | null) {
    if (!file) return onChange("", null);
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result || ""), file);
    reader.readAsDataURL(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0] || null;
    readFile(f);
  }

  return (
    <div className="rounded-lg border bg-white p-4">
      <h4 className="mb-3 font-medium">{title}</h4>

      <div
        className="relative rounded-md border-2 border-dashed border-neutral-300 p-4 text-sm hover:bg-neutral-50 cursor-pointer"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e)=>e.preventDefault()}
        onDrop={handleDrop}
        role="button"
        aria-label="Déposer ou sélectionner un logo"
      >
        {!value ? (
          <div className="text-neutral-500 text-center">
            Déposez votre logo ici ou cliquez pour sélectionner un fichier.
            <div className="mt-2 text-[11px] opacity-70">PNG / JPG / SVG — fond transparent recommandé</div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            {/* Aperçu non rogné */}
            <img
              src={value}
              alt="logo"
              className="h-12 w-12 object-contain rounded border bg-white"
            />
            <button
              type="button"
              onClick={(e)=>{e.stopPropagation(); onChange("", null);}}
              className="text-xs underline text-neutral-600 hover:text-black"
            >
              Retirer
            </button>
          </div>
        )}

        <input
          ref={inputRef}
          id="logo-input-hidden"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e)=> readFile(e.target.files?.[0] || null)}
        />
      </div>
    </div>
  );
}
