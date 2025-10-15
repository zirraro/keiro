"use client";

export default function InlineProgress({
  value = 0,
  label,
}: { value?: number; label?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="w-full rounded-md border p-3">
      <div className="mb-1 text-xs text-neutral-600">
        {label ?? `Chargement ${v}%`}
      </div>
      <div className="h-2 w-full rounded bg-neutral-200">
        <div
          className="h-2 rounded bg-black transition-[width] duration-500"
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
}
