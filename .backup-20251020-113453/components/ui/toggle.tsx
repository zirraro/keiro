import * as React from "react";

export function Toggle({
  left="Mensuel", right="Annuel", value="left", onChange
}: { left?: string; right?: string; value?: "left"|"right"; onChange?: (v:"left"|"right")=>void }) {
  return (
    <div className="inline-flex rounded-full border border-neutral-200 bg-white/60 p-1">
      <button
        onClick={() => onChange?.("left")}
        className={`px-3 py-1 text-sm rounded-full ${value==="left" ? "bg-white text-black" : "text-neutral-600 hover:bg-neutral-100"}`}
      >
        {left}
      </button>
      <button
        onClick={() => onChange?.("right")}
        className={`px-3 py-1 text-sm rounded-full ${value==="right" ? "bg-white text-black" : "text-neutral-600 hover:bg-neutral-100"}`}
      >
        {right}
      </button>
    </div>
  );
}
