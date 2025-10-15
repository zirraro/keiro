"use client";
type Opt = { label: string; value: string };

const OPTIONS: Opt[] = [
  { label: "Hooks viraux",                 value: "hooks" },
  { label: "IA & Tech grand public",       value: "iatech" },
  { label: "Business & Startups",          value: "business" },
  { label: "Finance & Crypto",             value: "finance" },
  { label: "Sports",                       value: "sports" },
  { label: "Gaming & Esports",             value: "gaming" },
  { label: "Pop-culture & Influence",      value: "pop" },
  { label: "Food / Restauration",          value: "food" },
  { label: "Lifestyle & Voyage",           value: "lifestyle" },
  { label: "Santé & Bien-être",            value: "health" },
  { label: "Auto & Mobilité (EV)",         value: "auto" },
  { label: "Environnement & Climat",       value: "environment" },
  { label: "Immobilier & Architecture",    value: "realestate" },
  { label: "Monde / Politique",            value: "world" }
];

export default function CategoryDropdown({
  value,
  onChange,
  className = "",
  options = OPTIONS,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  options?: Opt[];
}) {
  return (
    <div className={"inline-flex items-center gap-2 " + className}>
      <label className="text-sm text-neutral-600">Catégorie</label>
      <select
        className="h-9 rounded-md border px-3 text-sm bg-white"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
