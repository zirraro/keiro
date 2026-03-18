'use client';

/**
 * KeiroAI Logo — Real brand mark (concentric triangle pairs).
 * Uses the official SVG paths from the brand kit.
 * Variants: symbol-only or lockup (symbol + wordmark).
 */

// 12 triangle pairs — outer to inner (from brand kit SVG)
const TRIANGLES = [
  { y1: 2.00, y2: 98.00, x1: 97.00, x2: 3.00, sw: 2.00, op: 0.220 },
  { y1: 6.19, y2: 93.81, x1: 93.55, x2: 6.45, sw: 1.91, op: 0.277 },
  { y1: 10.38, y2: 89.62, x1: 90.09, x2: 9.91, sw: 1.82, op: 0.335 },
  { y1: 14.57, y2: 85.43, x1: 86.64, x2: 13.36, sw: 1.73, op: 0.392 },
  { y1: 18.76, y2: 81.24, x1: 83.18, x2: 16.82, sw: 1.64, op: 0.449 },
  { y1: 22.95, y2: 77.05, x1: 79.73, x2: 20.27, sw: 1.55, op: 0.506 },
  { y1: 27.13, y2: 72.87, x1: 76.27, x2: 23.73, sw: 1.45, op: 0.564 },
  { y1: 31.32, y2: 68.68, x1: 72.82, x2: 27.18, sw: 1.36, op: 0.621 },
  { y1: 35.51, y2: 64.49, x1: 69.36, x2: 30.64, sw: 1.27, op: 0.678 },
  { y1: 39.70, y2: 60.30, x1: 65.91, x2: 34.09, sw: 1.18, op: 0.735 },
  { y1: 43.89, y2: 56.11, x1: 62.45, x2: 37.55, sw: 1.09, op: 0.793 },
  { y1: 48.08, y2: 51.92, x1: 59.00, x2: 41.00, sw: 1.00, op: 0.850 },
];

interface KeiroLogoProps {
  size?: number;
  color?: string;
  className?: string;
}

/** Symbol only — the concentric triangles mark */
export function KeiroLogo({ size = 32, color = 'currentColor', className }: KeiroLogoProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      aria-label="KeiroAI"
    >
      {TRIANGLES.map((tri, i) => (
        <g key={i}>
          <path
            d={`M50 ${tri.y1} L${tri.x1} 50 L${tri.x2} 50Z`}
            stroke={color}
            strokeWidth={tri.sw}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={tri.op}
          />
          <path
            d={`M50 ${tri.y2} L${tri.x1} 50 L${tri.x2} 50Z`}
            stroke={color}
            strokeWidth={tri.sw}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={tri.op}
          />
        </g>
      ))}
    </svg>
  );
}

interface KeiroLockupProps {
  size?: number;
  color?: string;
  className?: string;
}

/** Full lockup — symbol + "KeiroAI" wordmark */
export function KeiroLockup({ size = 32, color = 'currentColor', className }: KeiroLockupProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className || ''}`}>
      <KeiroLogo size={size} color={color} />
      <span
        style={{
          fontSize: size * 0.65,
          fontWeight: 800,
          letterSpacing: '-0.04em',
          lineHeight: 1,
          color,
          fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
        }}
      >
        Keiro<span style={{ opacity: 0.25 }}>AI</span>
      </span>
    </span>
  );
}
