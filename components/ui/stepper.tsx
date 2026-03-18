export function Stepper({ step, total = 3 }: { step: number; total?: number }) {
  const pct = Math.max(0, Math.min(100, Math.round((step-1)/(total-1)*100)));
  return (
    <div className="mb-4">
      <div className="flex justify-between text-xs text-neutral-600 mb-1">
        <span>Étape {step}/{total}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-[#0c1a3a] to-[#1e3a5f]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
