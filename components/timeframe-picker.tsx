"use client";

import * as React from "react";

type TF = "24h" | "48h" | "72h" | "7d";

export function TimeframePicker({
  value,
  onChange,
  className,
}: {
  value: TF;
  onChange: (v: TF) => void;
  className?: string;
}) {
  const options: { label: string; value: TF }[] = [
    { label: "24h", value: "24h" },
    { label: "48h", value: "48h" },
    { label: "72h", value: "72h" },
    { label: "7j", value: "7d" },
  ];

  return (
    <div className={className ?? ""}>
      <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={[
                "px-3 py-[6px] text-sm rounded-lg transition",
                active
                  ? "bg-black text-white"
                  : "bg-transparent text-gray-700 hover:bg-gray-100",
              ].join(" ")}
              aria-pressed={active}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
