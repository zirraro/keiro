"use client";
import { useEffect } from "react";
export default function ChunkGuard(){
  useEffect(()=>{
    let done=false; const reload=()=>{ if(done) return; done=true; const u=new URL(location.href); u.searchParams.set("_r", Date.now().toString()); location.replace(u.toString()); };
    function onErr(e:any){ const m=String(e?.message||e?.error?.message||""); if(m.includes("Loading chunk")) reload(); }
    function onRej(e:any){ const m=String(e?.reason?.message||""); if(m.includes("Loading chunk")) reload(); }
    addEventListener("error", onErr, true); addEventListener("unhandledrejection", onRej);
    return ()=>{ removeEventListener("error", onErr, true); removeEventListener("unhandledrejection", onRej); };
  },[]);
  return null;
}
