"use client";
import { useEffect, useMemo, useState } from "react";
import { GenKind, getStatus, startJob } from "@/lib/jobs";

type NewsLite = { title?: string; summary?: string; topic?: string; url?: string };
type BrandPrompt = {
  brand?: string;
  objective?: string;
  tone?: string;
  constraints?: string;
  cta?: string;
  hashtags?: string;
};

export default function PreviewPane({
  selectedNews,
  brandPrompt,
  controls = "full",
}: {
  selectedNews?: NewsLite | null;
  brandPrompt?: BrandPrompt;
  /** "full" = boutons + aperçu ; "preview" = aperçu seul (si le jobId est fourni par ailleurs) */
  controls?: "full" | "preview";
}) {
  const [jobId, setJobId] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "queued" | "running" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("");

  const disabled = useMemo(
    () => status === "queued" || status === "running",
    [status]
  );

  async function handleGenerate(kind: GenKind) {
    try {
      setIsVideo(kind === "video");
      setError(null);
      setPreviewUrl("");
      setStatus("queued");

      const payload = {
        kind,
        news: selectedNews ?? null,
        promptHints: brandPrompt ?? {},
      };

      const { jobId } = await startJob(payload);
      setJobId(jobId);

      // Poll
      let attempts = 0;
      const maxAttempts = 300; // ~15 min si 3s
      while (attempts++ < maxAttempts) {
        const s = await getStatus(jobId);
        if (s.status === "done") {
          setStatus("done");
          setPreviewUrl(`/api/preview?jobId=${encodeURIComponent(jobId)}&t=${Date.now()}`);
          break;
        }
        if (s.status === "error") {
          setStatus("error");
          setError(s.error ?? "Une erreur est survenue");
          break;
        }
        setStatus(s.status);
        await new Promise(r => setTimeout(r, 3000));
      }
      if (attempts >= maxAttempts) {
        setStatus("error");
        setError("Délai dépassé (polling).");
      }
    } catch (e: any) {
      setStatus("error");
      setError(e?.message || String(e));
    }
  }

  // Si job "done", raffraîchir l'URL à chaque affichage pour ne pas cacher par le cache
  useEffect(() => {
    if (status === "done" && jobId) {
      setPreviewUrl(`/api/preview?jobId=${encodeURIComponent(jobId)}&t=${Date.now()}`);
    }
  }, [status, jobId]);

  return (
    <div className="space-y-3">
      {controls === "full" && (
        <div className="flex gap-2">
          <button
            onClick={() => handleGenerate("image")}
            disabled={disabled}
            className="rounded border px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-60"
            title="Générer une image"
          >
            Générer une image
          </button>
          <button
            onClick={() => handleGenerate("video")}
            disabled={disabled}
            className="rounded border px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-60"
            title="Générer une vidéo"
          >
            Générer une vidéo
          </button>
          <div className="ml-2 text-xs text-neutral-500 self-center">
            {status === "idle" && "Prêt"}
            {status === "queued" && "En file d’attente…"}
            {status === "running" && "Génération en cours…"}
            {status === "done" && "Terminé ✔"}
            {status === "error" && "Erreur ✖"}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-md border bg-white p-2">
        {!previewUrl && (
          <div className="flex h-[320px] w-full items-center justify-center text-xs text-neutral-400">
            L’aperçu s’affichera ici après génération.
          </div>
        )}
        {previewUrl && !isVideo && (
          // Image
          <img
            src={previewUrl}
            alt="preview"
            className="mx-auto max-h-[480px] w-full rounded object-contain"
          />
        )}
        {previewUrl && isVideo && (
          // Vidéo (si ton /api/preview renvoie une vidéo)
          <video
            src={previewUrl}
            controls
            className="mx-auto max-h-[480px] w-full rounded"
          />
        )}
      </div>
    </div>
  );
}
