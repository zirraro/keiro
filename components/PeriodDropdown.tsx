"use client";

const PERIODS = [
  { label: "24 h", value: "24h" },
  { label: "48 h", value: "48h" },
  { label: "72 h", value: "72h" },
  { label: "7 j",  value: "7d"  },
];

export default function PeriodDropdown({
  value, onChange, className = "",
}: { value: string; onChange: (v: string) => void; className?: string; }) {
  return (
    <div className={"inline-flex items-center gap-2 " + className}>
      <label className="text-sm text-neutral-600">Période</label>
      <select
        className="h-9 rounded-md border px-3 text-sm bg-white"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {PERIODS.map((p) => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>
    </div>
  );
}
