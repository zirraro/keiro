"use client";
import { useEffect, useState } from "react";

type FileItem = { name: string; path: string; url: string | null; created_at?: string };

export default function LibraryPage() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    const res = await fetch("/api/storage/list", { cache: "no-store" });
    const json = await res.json();
    if (!json.ok) setError(json.error || "Erreur list");
    setFiles(json.files || []);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/storage/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Upload failed");
      await refresh();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
      e.currentTarget.value = "";
    }
  }

  async function onRemove(item: FileItem) {
    if (!confirm(`Supprimer ${item.name} ?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/storage/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: item.path }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Remove failed");
      setFiles((prev) => prev.filter((f) => f.path !== item.path));
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Librairie d’assets</h1>
        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-neutral-900 text-white text-sm hover:opacity-90 cursor-pointer">
          <input type="file" className="hidden" onChange={onUpload} disabled={busy} />
          Importer
        </label>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 p-3 text-sm">{error}</div>
      )}

      <div className="rounded-2xl border border-neutral-200 p-4 bg-neutral-50">
        {files.length === 0 ? (
          <div className="text-sm text-neutral-600">Aucun asset pour le moment.</div>
        ) : (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {files.map((f) => {
              const ext = f.name.split(".").pop()?.toLowerCase() || "";
              const isVideo = ["mp4", "webm", "mov"].includes(ext);
              const isImage = ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext);
              return (
                <div key={f.path} className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                  <div className="aspect-square bg-neutral-100 flex items-center justify-center">
                    {isImage && f.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.url} alt={f.name} className="w-full h-full object-cover" />
                    ) : isVideo && f.url ? (
                      <video src={f.url} controls className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-xs text-neutral-500 p-4 text-center">Aperçu non disponible</div>
                    )}
                  </div>
                  <div className="p-3 text-sm">
                    <div className="truncate" title={f.name}>{f.name}</div>
                    <div className="mt-2 flex items-center justify-between">
                      {f.url ? (
                        <a
                          href={f.url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-4 text-neutral-700 hover:opacity-80"
                        >
                          Ouvrir
                        </a>
                      ) : <span className="text-neutral-400">—</span>}
                      <button
                        onClick={() => onRemove(f)}
                        className="text-red-600 hover:opacity-80"
                        disabled={busy}
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="text-xs text-neutral-500">
        Bucket: <code>assets/library</code> — Public. Pour accès privé: on passera par des URLs signées.
      </div>
    </div>
  );
}
