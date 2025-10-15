"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import TimeframeBar from "@/components/timeframe-bar";

type TF = "24h" | "48h" | "72h" | "7d";

type Props = {
  topic: string;
  onTopicChange: (t: string) => void;
  timeframe?: TF;                            // optionnel : si non fourni, état local
  onTimeframeChange?: (tf: TF) => void;      // optionnel
  onSearch?: (q: string) => void;            // optionnel
};

const TOPICS = ["business","technology","science","world","health","sports"];

export function TopFilters({ topic, onTopicChange, timeframe, onTimeframeChange, onSearch }: Props) {
  const [q, setQ] = useState("");
  const [localTF, setLocalTF] = useState<TF>("24h");
  const effectiveTF = timeframe ?? localTF;

  const setTF = (v: TF) => {
    if (onTimeframeChange) onTimeframeChange(v);
    else {
      setLocalTF(v);
      // Persiste dans l'URL pour debug/partage
      const url = new URL(window.location.href);
      url.searchParams.set("timeframe", v);
      history.replaceState(null, "", url.toString());
    }
    // Si l'UI appelle onSearch pour rafraîchir, déclenche une recherche
    onSearch?.(q);
  };

  const topicsButtons = useMemo(()=>(
    <div className="flex flex-wrap items-center gap-2">
      {TOPICS.map((t)=>(
        <button key={t} onClick={()=>onTopicChange(t)}
          className={[
            "h-8 rounded-full px-3 text-[12px] border",
            topic===t ? "bg-black text-white border-black" : "bg-white text-gray-800 hover:bg-gray-50 border-gray-200",
          ].join(" ")}
        >{t}</button>
      ))}
    </div>
  ), [topic, onTopicChange]);

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      {/* À gauche : catégories */}
      {topicsButtons}

      {/* À droite : temporalité */}
      <TimeframeBar value={effectiveTF} onChange={setTF as any} className="ml-auto" />

      {/* Recherche (peut être déplacée si tu veux totalement à droite) */}
      <div className="flex items-center gap-2">
        <Input
          placeholder="Rechercher une actu…"
          value={q}
          onChange={(e)=>setQ(e.target.value)}
          className="h-8 w-[220px] text-[12px]"
        />
        <Button variant="outline" className="h-8 text-[12px]" onClick={()=>onSearch?.(q)}>Filtrer</Button>
      </div>
    </div>
  );
}
