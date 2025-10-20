"use client";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }, reset: () => void }) {
  useEffect(() => { console.error("GlobalError:", error); }, [error]);
  return (
    <html>
      <body style={{fontFamily:"system-ui, sans-serif", padding:24}}>
        <h1 style={{fontSize:24, fontWeight:700, marginBottom:8}}>Une erreur est survenue</h1>
        <p style={{color:"#6b7280"}}>L’interface a rencontré un problème côté client.</p>
        <pre style={{marginTop:16, background:"#f3f4f6", padding:12, borderRadius:8, overflow:"auto"}}>
{String(error?.message || error)}
{error?.digest ? `\nDigest: ${error.digest}` : ""}
        </pre>
        <div style={{display:"flex", gap:12, marginTop:16}}>
          <button onClick={()=>reset()} style={{background:"#2563eb", color:"#fff", padding:"8px 14px", borderRadius:8}}>
            Réessayer
          </button>
          <button onClick={()=>{
            const u = new URL(location.href);
            u.searchParams.set("_r", Date.now().toString());
            location.replace(u.toString());
          }} style={{border:"1px solid #d1d5db", padding:"8px 14px", borderRadius:8}}>
            Recharger (forcer)
          </button>
        </div>
      </body>
    </html>
  );
}
