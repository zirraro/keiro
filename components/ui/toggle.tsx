import * as React from "react";

export function Toggle({
  left="Mensuel", right="Annuel", value="left", onChange
}: { left?: string; right?: string; value?: "left"|"right"; onChange?: (v:"left"|"right")=>void }) {
  return (
    <div className="inline-flex rounded-full border border-neutral-800 bg-neutral-900/60 p-1">
      <button
        onClick={() => onChange?.("left")}
        className={`px-3 py-1 text-sm rounded-full ${value==="left" ? "bg-white text-black" : "text-neutral-300 hover:bg-neutral-800"}`}
      >
        {left}
      </button>
      <button
        onClick={() => onChange?.("right")}
        className={`px-3 py-1 text-sm rounded-full ${value==="right" ? "bg-white text-black" : "text-neutral-300 hover:bg-neutral-800"}`}
      >
        {right}
      </button>
    </div>
  );
}
