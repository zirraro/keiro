'use client';

export default function Spotlight() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10">
      {/* Halo central */}
      <div
        className="absolute -top-64 left-1/2 -translate-x-1/2 w-[1200px] h-[1200px] rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(closest-side, rgba(59,130,246,.35), transparent)" }}
      />
      {/* Lueurs latérales */}
      <div
        className="absolute top-1/3 -left-40 w-[600px] h-[600px] rounded-full opacity-20 blur-3xl"
        style={{ background: "radial-gradient(closest-side, rgba(147,197,253,.25), transparent)" }}
      />
      <div
        className="absolute top-1/2 -right-40 w-[600px] h-[600px] rounded-full opacity-20 blur-3xl"
        style={{ background: "radial-gradient(closest-side, rgba(56,189,248,.25), transparent)" }}
      />
    </div>
  );
}
