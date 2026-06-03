'use client';

export function AnimatedGradientBG({ variant = 'hero' }: { variant?: 'hero' | 'dark' | 'pricing' }) {
  const configs = {
    hero: {
      blob1: 'bg-[#0c1a3a]/20',
      blob2: 'bg-cyan-400/15',
      blob3: 'bg-indigo-400/10',
    },
    dark: {
      blob1: 'bg-[#0c1a3a]/20',
      blob2: 'bg-indigo-500/15',
      blob3: 'bg-purple-600/10',
    },
    pricing: {
      blob1: 'bg-[#0c1a3a]/15',
      blob2: 'bg-purple-400/12',
      blob3: 'bg-cyan-400/10',
    },
  };

  const c = configs[variant];

  // 2026-06-03 — fluidity pass: scale removed from float-blob (was thrashing
  // the blur layer on every keyframe = janky stutter on home load), durations
  // lengthened (less repaint/sec), will-change + GPU layer hints applied so
  // the browser composites blobs on a dedicated layer instead of reflowing
  // the section on every animation frame.
  const blobStyle = { willChange: 'transform', transform: 'translateZ(0)' };

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true" style={{ zIndex: 0 }}>
      {/* Blob 1 - top left */}
      <div
        className={`absolute -top-32 -left-32 w-96 h-96 ${c.blob1} rounded-full blur-3xl`}
        style={{ ...blobStyle, animation: 'float-blob 14s ease-in-out infinite' }}
      />
      {/* Blob 2 - bottom right */}
      <div
        className={`absolute -bottom-24 -right-24 w-80 h-80 ${c.blob2} rounded-full blur-3xl`}
        style={{ ...blobStyle, animation: 'float-blob 12s ease-in-out infinite 3s' }}
      />
      {/* Blob 3 - center */}
      <div
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 ${c.blob3} rounded-full blur-3xl`}
        style={{ ...blobStyle, animation: 'float-blob 18s ease-in-out infinite 6s' }}
      />
    </div>
  );
}
