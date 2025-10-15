"use client";
import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type TF = "24h"|"48h"|"72h"|"7d";

export default function TimeframeInline({ className }: { className?: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const current = (sp.get("timeframe") as TF) || "24h";

  const options = useMemo(
    ()=>[{v:"24h",l:"24h"},{v:"48h",l:"48h"},{v:"72h",l:"72h"},{v:"7d",l:"7j"}] as {v:TF,l:string}[],
    []
  );

  const setTF = (v: TF) => {
    const url = new URL(window.location.href);
    url.searchParams.set("timeframe", v);
    // on garde les autres filtres (topic, q, etc.)
    router.replace(url.toString(), { scroll: false });
  };

  return (
    <div className={className ?? ""}>
      <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
        {options.map(o=>{
          const active = o.v === current;
          return (
            <button key={o.v} type="button" onClick={()=>setTF(o.v)}
              className={[
                "px-3 py-[6px] text-sm rounded-lg transition",
                active ? "bg-black text-white" : "bg-transparent text-gray-700 hover:bg-gray-100",
              ].join(" ")}
              aria-pressed={active}
            >{o.l}</button>
          );
        })}
      </div>
    </div>
  );
}
