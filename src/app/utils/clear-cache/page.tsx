"use client";
import { useState } from "react";

export default function ClearCache() {
  const [log, setLog] = useState<string>("");

  async function run() {
    const lines: string[] = [];
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        for (const k of keys) { await caches.delete(k); lines.push(`Cache supprimé: ${k}`); }
      }
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) { await r.unregister(); lines.push(`SW désenregistré: ${r.scope}`); }
      }
      lines.push("OK. Rechargez la page.");
    } catch (e: any) {
      lines.push("Erreur: " + String(e));
    }
    setLog(lines.join("\n"));
  }

  return (
    <main style={{fontFamily:"system-ui", padding:24}}>
      <h1 style={{fontSize:22, fontWeight:700}}>Clear cache & Service Worker</h1>
      <p style={{color:"#6b7280"}}>Cliquez le bouton puis rechargez.</p>
      <button onClick={run} style={{marginTop:12, background:"#2563eb", color:"#fff", padding:"8px 14px", borderRadius:8}}>
        Nettoyer
      </button>
      {log && <pre style={{marginTop:16, background:"#f3f4f6", padding:12, borderRadius:8}}>{log}</pre>}
    </main>
  );
}
