'use client';

import { useEffect, useRef, useState } from "react";

type ApiOk =
  | { ok: true; id?: string; status?: string; input?: any; demo?: false; videos?: string[] }
  | { ok: true; demo: true; note?: string; videos: string[] }
  | { ok: false; error: string; detail?: string };

type PollResp = {
  ok: boolean;
  status?: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[] | null;
  error?: string | null;
  logs?: string;
  id?: string;
};

export default function DemoVideoPage() {
  const [prompt, setPrompt] = useState(
    "cinematic coffee shop b-roll, shallow depth of field, natural light, subtle dolly motion"
  );
  const [imageUrl, setImageUrl] = useState("");
  const [ratio, setRatio] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [duration, setDuration] = useState(5);

  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<ApiOk | null>(null);

  // Polling state
  const [pollingId, setPollingId] = useState<string | null>(null);
  const [pollStatus, setPollStatus] = useState<string | null>(null);
  const [pollLogs, setPollLogs] = useState<string>("");
  const [finalVideos, setFinalVideos] = useState<string[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startedAtRef = useRef<number | null>(null);

  function stopPolling() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setPollingId(null);
  }

  async function fetchPrediction(id: string) {
    try {
      const r = await fetch(`/api/replicate/prediction/${id}`, { cache: "no-store" });
      const j: PollResp = await r.json();
      setPollStatus(j.status || null);
      setPollLogs(j.logs || "");

      if (j.status === "succeeded") {
        const arr = Array.isArray(j.output) ? j.output : j.output ? [j.output] : [];
        setFinalVideos(arr);
        stopPolling();
      } else if (j.status === "failed" || j.status === "canceled") {
        stopPolling();
      }
    } catch (e) {
      // on réessaie au prochain tick si besoin
    }
  }

  function scheduleNext(id: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      fetchPrediction(id).finally(() => scheduleNext(id));
    }, 3000);
  }

  useEffect(() => {
    // Timeout global anti-boucle (2 min)
    if (!pollingId) return;
    if (!startedAtRef.current) startedAtRef.current = Date.now();

    const elapsed = Date.now() - startedAtRef.current;
    if (elapsed > 2 * 60 * 1000) {
      stopPolling();
      setPollStatus("timeout");
    }

    return () => {
      // cleanup fait ailleurs
    };
  }, [pollingId, pollStatus]);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResp(null);
    setFinalVideos([]);
    setPollStatus(null);
    setPollLogs("");
    stopPolling();
    startedAtRef.current = null;

    try {
      const r = await fetch("/api/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          imageUrl: imageUrl || undefined,
          ratio,
          duration,
        }),
      });
      const json: ApiOk = await r.json();
      setResp(json);

      // Si l'API renvoie un id (mode réel), on lance le polling
      if (json && json.ok && "id" in json && json.id) {
        setPollingId(json.id);
        startedAtRef.current = Date.now();
        await fetchPrediction(json.id);
        scheduleNext(json.id);
      }
    } catch (err: any) {
      setResp({
        ok: false,
        error: "Network/Client error",
        detail: String(err?.message || err),
      } as any);
    } finally {
      setLoading(false);
    }
  }

  // Nettoyage quand on quitte
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 text-slate-100">
      <h1 className="text-2xl font-semibold mb-6">Sandbox vidéo (démo safe + polling)</h1>

      <form onSubmit={run} className="space-y-4">
        <div>
          <label className="block text-sm mb-1">Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full rounded-md bg-slate-800 border border-slate-700 p-3"
            rows={3}
          />
        </div>

        <div>
          <label className="block text-sm mb-1">
            Image URL (facultatif = text→video)
          </label>
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…/image.png"
            className="w-full rounded-md bg-slate-800 border border-slate-700 p-3"
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm mb-1">Ratio</label>
            <select
              value={ratio}
              onChange={(e) => setRatio(e.target.value as any)}
              className="w-full rounded-md bg-slate-800 border border-slate-700 p-2.5"
            >
              <option value="16:9">16:9</option>
              <option value="9:16">9:16</option>
              <option value="1:1">1:1</option>
            </select>
          </div>
          <div className="w-40">
            <label className="block text-sm mb-1">Durée (5–6s)</label>
            <input
              type="number"
              min={5}
              max={6}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full rounded-md bg-slate-800 border border-slate-700 p-2.5"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60"
        >
          {loading ? "Génération…" : "Lancer"}
        </button>
      </form>

      {/* Bannières infos / démo */}
      <div className="mt-8 space-y-4">
        {resp && resp.ok && "demo" in resp && resp.demo && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-amber-200">
            Mode démo (pas de crédits). {resp.note || "Vidéos de démonstration ci-dessous."}
          </div>
        )}

        {/* Polling en cours */}
        {pollingId && (
          <div className="rounded-md border border-sky-500/40 bg-sky-500/10 p-3 text-sky-200 text-sm">
            <div>Prédiction en cours…</div>
            <div className="opacity-80 mt-1">ID : <code>{pollingId}</code></div>
            <div className="opacity-80 mt-1">Statut : <code>{pollStatus || "…"} </code></div>
            {pollLogs ? (
              <details className="mt-2">
                <summary className="cursor-pointer">Logs</summary>
                <pre className="whitespace-pre-wrap text-xs opacity-80 mt-1">
                  {pollLogs}
                </pre>
              </details>
            ) : null}
          </div>
        )}

        {/* Vidéos finales (réel OU démo) */}
        {finalVideos.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-6">
            {finalVideos.map((u, i) => (
              <div key={i} className="rounded-lg overflow-hidden border border-slate-700">
                <video src={u} controls loop autoPlay muted className="w-full h-auto" />
                <div className="px-3 py-2 text-xs bg-slate-900 border-t border-slate-700 break-all">
                  {u}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/* Résultat non vidéo (ex: démo avec simple OK, sans urls) */}
        {resp && resp.ok && !("videos" in resp) && !pollingId && finalVideos.length === 0 && (
          <div className="rounded-md border border-slate-600 bg-slate-800 p-3 text-slate-200 text-sm">
            Requête envoyée avec succès. (Aucune vidéo attachée à la réponse)
          </div>
        )}

        {/* Erreur */}
        {resp && !resp.ok && (
          <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-rose-200">
            <div className="font-medium">Erreur: {resp.error}</div>
            {"detail" in resp && resp.detail ? (
              <div className="mt-1 opacity-80 text-xs whitespace-pre-wrap">{(resp as any).detail}</div>
            ) : null}
          </div>
        )}

        {/* Timeout polling */}
        {pollStatus === "timeout" && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-amber-200">
            Polling arrêté (timeout). Si besoin on peut augmenter la durée.
          </div>
        )}
      </div>
    </div>
  );
}
