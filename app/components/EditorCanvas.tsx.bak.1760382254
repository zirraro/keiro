'use client';
import React from 'react';

type Props = {
  image?: string;                 // dataURL ou URL distante
  width?: number;
  height?: number;
  onExport?: (dataUrl: string)=>void;
};

export default function EditorCanvas({ image, width=640, height=640, onExport }: Props){
  const containerRef = React.useRef<HTMLDivElement|null>(null);
  const fabricRef = React.useRef<any>(null);
  const initialized = React.useRef(false);
  const [ready, setReady] = React.useState(false);
  const [err, setErr] = React.useState<string|undefined>(undefined);

  React.useEffect(() => {
    let disposed = false;
    if (initialized.current) return;            // évite double init (StrictMode)

    const init = async () => {
      try {
        // attendre que le container soit réellement dans le DOM
        await new Promise(requestAnimationFrame);
        const container = containerRef.current;
        if (!container || !container.isConnected) return;

        // Crée un <canvas> géré uniquement par Fabric (React n'y touche pas)
        const canvasEl = document.createElement('canvas');
        canvasEl.width = width;
        canvasEl.height = height;
        canvasEl.className = 'w-full border rounded-md';
        container.appendChild(canvasEl);

        const mod = await import('fabric');
        const Fabric = (mod as any).fabric ?? (mod as any).default?.fabric ?? (mod as any).default ?? (mod as any);
        if (!Fabric?.Canvas) throw new Error('fabric not loaded');

        const canvas = new Fabric.Canvas(canvasEl, {
          preserveObjectStacking: true,
          backgroundColor: '#ffffff',
          selection: true,
        });

        // store refs
        fabricRef.current = canvas;
        (window as any).__keiro_canvas = canvas;

        // Charger l'image de base (si fournie)
        if (image) {
          await new Promise<void>((resolve) => {
            Fabric.Image.fromURL(
              image,
              (img: any) => {
                if (!img) return resolve();
                const scale = Math.min(width / img.width, height / img.height) || 1;
                img.set({ left: 0, top: 0, selectable: true });
                img.scale(scale);
                canvas.add(img);
                canvas.renderAll();
                resolve();
              },
              { crossOrigin: 'anonymous' }
            );
          });
        }

        if (!disposed) {
          initialized.current = true;
          setReady(true);
        }
      } catch (e: any) {
        if (!disposed) setErr(e?.message || String(e));
      }
    };

    init();

    return () => {
      disposed = true;
      try {
        fabricRef.current?.dispose?.();
      } catch {}
      fabricRef.current = null;
      initialized.current = false;
      // Nettoyer le container (supprime wrapper/upperCanvas créés par Fabric)
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [image, width, height]);

  const exportPNG = () => {
    try{
      const c: any = fabricRef.current;
      if (c && onExport) onExport(c.toDataURL({ format:'png', quality:1 }));
    }catch(e){}
  };

  return (
    <div className="border rounded-lg p-3 bg-white">
      {err ? <div className="text-sm text-red-600 mb-2">Canvas error: {err}</div> : null}
      <div ref={containerRef} className="w-full" />
      <div className="mt-3 flex gap-2">
        <button
          className="px-3 py-1.5 rounded-md bg-black text-white disabled:opacity-60"
          onClick={exportPNG}
          disabled={!ready}
        >
          Exporter en PNG
        </button>
      </div>
    </div>
  );
}
