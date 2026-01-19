"use client";

import { useEffect, useMemo, useState } from "react";
import NavBar from "@/app/components/NavBar";

type HistoryItem =
  | { kind: "image"; url: string; prompt: string; at: number }
  | { kind: "video"; url: string; prompt: string; at: number };

export default function DashboardPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("keiro:history");
      if (raw) setHistory(JSON.parse(raw));
    } catch {}
  }, []);

  const kpis = useMemo(() => {
    const imgs = history.filter(h => h.kind === "image").length;
    const vids = history.filter(h => h.kind === "video").length;
    const total = history.length;
    const lastGen = history[0]?.at ? new Date(history[0].at).toLocaleString() : "—";
    return { imgs, vids, total, lastGen };
  }, [history]);

  return (
    <div className="min-h-screen bg-white">
      <NavBar />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-semibold mb-6">Dashboard</h1>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="border rounded p-4">
            <div className="text-sm text-gray-600">Total rendus</div>
            <div className="text-2xl font-semibold">{kpis.total}</div>
          </div>
          <div className="border rounded p-4">
            <div className="text-sm text-gray-600">Images</div>
            <div className="text-2xl font-semibold">{kpis.imgs}</div>
          </div>
          <div className="border rounded p-4">
            <div className="text-sm text-gray-600">Vidéos</div>
            <div className="text-2xl font-semibold">{kpis.vids}</div>
          </div>
          <div className="border rounded p-4">
            <div className="text-sm text-gray-600">Dernière génération</div>
            <div className="text-lg">{kpis.lastGen}</div>
          </div>
        </div>

        {/* Derniers rendus */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-medium">Derniers rendus</h2>
          </div>
          {history.length === 0 ? (
            <div className="text-sm text-gray-500">Aucun rendu pour l’instant.</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {history.map((h, i) => (
                <a key={i} href={h.url} target="_blank" className="border rounded overflow-hidden group">
                  {h.kind === "image" ? (
                    <img src={h.url} className="w-full aspect-square object-cover" />
                  ) : (
                    <video src={h.url} className="w-full aspect-video object-cover" />
                  )}
                  <div className="px-2 py-1 text-xs text-gray-600">
                    {h.kind} • {new Date(h.at).toLocaleString()}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Raccourcis */}
        <div className="flex gap-3">
          <a className="px-4 py-2 rounded border" href="/generate">Générer un visuel</a>
          <a className="px-4 py-2 rounded border" href="/library">Ouvrir la galerie</a>
        </div>
      </main>
    </div>
  );
}
