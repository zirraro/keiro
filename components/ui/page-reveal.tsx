'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useState, useEffect, useMemo } from 'react';

/**
 * PageReveal — Cinematic luxury intro with real KeiroAI logo.
 *
 * Phases (8s total):
 * 1. DRAW     (0-2.0s)    — Logo triangles draw immediately, particles drift in
 * 2. GLOW     (2.0-3.8s)  — Logo pulses with light, arcs orbit, tagline appears
 * 3. EXPAND   (3.8-6.0s)  — Logo scales up, light beams radiate, everything expands (LONG)
 * 4. FADE     (6.0-8.0s)  — Smooth dissolve to transparent, page revealed
 * 5. DONE     (8.0s)      — Unmount
 */

const EASE = [0.16, 1, 0.3, 1] as const;

const TRIANGLES = [
  { y1: 2.00, y2: 98.00, x1: 97.00, x2: 3.00, sw: 2.00, op: 0.22 },
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

function useParticles(count: number) {
  return useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const s = (i * 7919 + 104729) % 1000;
      return {
        x: s % 100, y: ((s * 3 + 271) % 100),
        size: 1 + (s % 3), delay: i * 0.03,
        dx: ((s % 80) - 40), dy: ((s * 2 + 137) % 80) - 40,
        dur: 3 + (s % 3), op: 0.2 + (s % 30) / 100,
        color: i % 3,
      };
    });
  }, [count]);
}

export function PageReveal() {
  const [phase, setPhase] = useState<'draw' | 'glow' | 'expand' | 'fade' | 'done'>('draw');
  const shouldReduce = useReducedMotion();
  const particles = useParticles(60);

  useEffect(() => {
    if (shouldReduce) { setPhase('done'); return; }
    const t = [
      // Logo draws immediately (no empty dark phase)
      setTimeout(() => setPhase('glow'), 2000),
      setTimeout(() => setPhase('expand'), 3800),
      // Long expand → fade for cinematic exit
      setTimeout(() => setPhase('fade'), 6000),
      setTimeout(() => setPhase('done'), 8000),
    ];
    return () => t.forEach(clearTimeout);
  }, [shouldReduce]);

  if (phase === 'done') return null;

  const isDraw = true; // always drawing from the start
  const isGlow = phase === 'glow' || phase === 'expand' || phase === 'fade';
  const isExpand = phase === 'expand' || phase === 'fade';
  const isFade = phase === 'fade';

  return (
    <motion.div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
        pointerEvents: isFade ? 'none' : 'all',
      }}
      animate={isFade ? { opacity: 0 } : { opacity: 1 }}
      transition={{ duration: 2, ease: EASE }}
    >
      {/* Background — matches site palette */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 80% 60% at 50% 50%, #0c1a3a 0%, #060a14 100%)',
      }} />

      {/* Ambient glow pools — visible from frame 1, same colors as site bg */}
      <motion.div
        style={{
          position: 'absolute', top: '10%', left: '5%',
          width: '55%', height: '45%',
          background: 'radial-gradient(ellipse, rgba(59,130,246,0.15) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
        animate={{ x: [0, 30, -20, 0], y: [0, -20, 15, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        style={{
          position: 'absolute', bottom: '10%', right: '5%',
          width: '50%', height: '40%',
          background: 'radial-gradient(ellipse, rgba(6,182,212,0.12) 0%, transparent 70%)',
          filter: 'blur(70px)',
        }}
        animate={{ x: [0, -25, 20, 0], y: [0, 15, -25, 0] }}
        transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        style={{
          position: 'absolute', top: '40%', left: '35%',
          width: '35%', height: '30%',
          background: 'radial-gradient(ellipse, rgba(139,92,246,0.1) 0%, transparent 70%)',
          filter: 'blur(50px)',
        }}
        animate={{ x: [0, 20, -15, 0], y: [0, -15, 20, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Particles — appear immediately */}
      {particles.map((p, i) => (
        <motion.div
          key={i}
          style={{
            position: 'absolute',
            left: `${p.x}%`, top: `${p.y}%`,
            width: p.size, height: p.size,
            borderRadius: '50%',
            background: ['rgba(59,130,246,0.8)', 'rgba(6,182,212,0.7)', 'rgba(139,92,246,0.6)'][p.color],
          }}
          initial={{ opacity: 0, x: 0, y: 0, scale: 0 }}
          animate={isExpand
            ? { opacity: 0, x: p.dx * 5, y: p.dy * 5, scale: 0 }
            : { opacity: p.op, x: p.dx, y: p.dy, scale: 1 }
          }
          transition={{ delay: p.delay, duration: p.dur, ease: 'easeOut' }}
        />
      ))}

      {/* Orbiting arcs */}
      {[300, 220, 400].map((size, i) => (
        <motion.div
          key={`arc-${i}`}
          style={{
            position: 'absolute',
            width: size, height: size,
            borderRadius: '50%',
            border: '1px solid transparent',
            borderTopColor: ['rgba(59,130,246,0.3)', 'rgba(139,92,246,0.25)', 'rgba(6,182,212,0.2)'][i],
            borderRightColor: ['rgba(6,182,212,0.2)', 'rgba(59,130,246,0.15)', 'rgba(139,92,246,0.15)'][i],
          }}
          initial={{ opacity: 0, scale: 0.4, rotate: 0 }}
          animate={isExpand
            ? { opacity: 0, scale: 5, rotate: 220 + i * 60 }
            : isGlow
              ? { opacity: 0.9, scale: 1, rotate: 90 + i * 40 }
              : { opacity: 0, scale: 0.4, rotate: 0 }
          }
          transition={{ duration: isExpand ? 2.2 : 1, ease: EASE, delay: i * 0.1 }}
        />
      ))}

      {/* Central glow burst — expand phase is much bigger and slower */}
      <motion.div
        style={{
          position: 'absolute', width: 1, height: 1, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(59,130,246,0.5) 0%, rgba(6,182,212,0.25) 40%, transparent 70%)',
        }}
        initial={{ scale: 0, opacity: 0 }}
        animate={isExpand
          ? { scale: 3000, opacity: 0.3 }
          : isGlow
            ? { scale: 280, opacity: 0.5 }
            : { scale: 0, opacity: 0 }
        }
        transition={{ duration: isExpand ? 2.2 : 1, ease: EASE }}
      />

      {/* Light beams on expand — more beams, slower reveal */}
      {isExpand && [0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300, 320, 340].map((angle, i) => (
        <motion.div
          key={`beam-${angle}`}
          style={{
            position: 'absolute', width: '1.5px', height: '300vh',
            background: `linear-gradient(180deg, transparent 0%, ${
              i % 3 === 0 ? 'rgba(59,130,246,0.15)' : i % 3 === 1 ? 'rgba(6,182,212,0.1)' : 'rgba(139,92,246,0.1)'
            } 50%, transparent 100%)`,
            transformOrigin: 'center center',
            rotate: `${angle}deg`,
          }}
          initial={{ scaleY: 0, opacity: 0 }}
          animate={{ scaleY: 1, opacity: 1 }}
          transition={{ duration: 1.8, delay: i * 0.04, ease: EASE }}
        />
      ))}

      {/* ===== LOGO — starts drawing immediately ===== */}
      <motion.div
        style={{ position: 'relative', zIndex: 10, textAlign: 'center' }}
        animate={isExpand
          ? { scale: 3, opacity: 0, filter: 'blur(20px)' }
          : { scale: 1, opacity: 1, filter: 'blur(0px)' }
        }
        transition={{ duration: isExpand ? 2.2 : 0.8, ease: EASE }}
      >
        {/* SVG logo — triangle draw-in starts at t=0 */}
        <motion.div
          style={{ width: 140, height: 140, margin: '0 auto 24px' }}
          animate={isGlow ? {
            filter: [
              'drop-shadow(0 0 30px rgba(59,130,246,0.4))',
              'drop-shadow(0 0 80px rgba(59,130,246,0.7)) drop-shadow(0 0 140px rgba(6,182,212,0.4))',
              'drop-shadow(0 0 30px rgba(59,130,246,0.4))',
            ],
          } : {}}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          <svg viewBox="0 0 100 100" width="140" height="140">
            {TRIANGLES.map((tri, i) => {
              const topPath = `M50 ${tri.y1} L${tri.x1} 50 L${tri.x2} 50Z`;
              const botPath = `M50 ${tri.y2} L${tri.x1} 50 L${tri.x2} 50Z`;
              // Draw starts immediately — outer triangles first, inner last
              const delay = i * 0.1;
              const drawDuration = 0.5;

              return [
                <motion.path
                  key={`t-${i}`}
                  d={topPath}
                  stroke="white"
                  strokeWidth={tri.sw}
                  fill="none"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={isDraw
                    ? { pathLength: 1, opacity: tri.op }
                    : { pathLength: 0, opacity: 0 }
                  }
                  transition={{ delay, duration: drawDuration, ease: EASE }}
                />,
                <motion.path
                  key={`b-${i}`}
                  d={botPath}
                  stroke="white"
                  strokeWidth={tri.sw}
                  fill="none"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={isDraw
                    ? { pathLength: 1, opacity: tri.op }
                    : { pathLength: 0, opacity: 0 }
                  }
                  transition={{ delay: delay + 0.04, duration: drawDuration, ease: EASE }}
                />,
              ];
            })}
          </svg>
        </motion.div>

        {/* Brand text */}
        <motion.div style={{ overflow: 'hidden' }}>
          <motion.h1
            style={{
              fontSize: '3rem', fontWeight: 800, color: 'white',
              letterSpacing: '0.08em', margin: 0, lineHeight: 1,
              fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
            }}
            initial={{ y: 50, opacity: 0 }}
            animate={isGlow
              ? { y: 0, opacity: 1 }
              : { y: 50, opacity: 0 }
            }
            transition={{ duration: 0.8, ease: EASE }}
          >
            Keiro<span style={{ opacity: 0.25 }}>AI</span>
          </motion.h1>
        </motion.div>

        {/* Tagline */}
        <motion.p
          style={{
            fontSize: '0.75rem', color: 'rgba(148,163,184,0.8)',
            marginTop: 10, letterSpacing: '0.3em',
            textTransform: 'uppercase', fontWeight: 500,
          }}
          initial={{ opacity: 0, y: 10, letterSpacing: '0.6em' }}
          animate={isGlow
            ? { opacity: 1, y: 0, letterSpacing: '0.3em' }
            : { opacity: 0, y: 10, letterSpacing: '0.6em' }
          }
          transition={{ delay: 0.3, duration: 0.7, ease: EASE }}
        >
          Marketing Intelligence
        </motion.p>

        {/* Accent line */}
        <motion.div
          style={{
            height: 1, margin: '14px auto 0', maxWidth: 200,
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)',
          }}
          initial={{ scaleX: 0 }}
          animate={isGlow
            ? isExpand ? { scaleX: 5, opacity: 0 } : { scaleX: 1, opacity: 1 }
            : { scaleX: 0, opacity: 0 }
          }
          transition={{ duration: 0.5, ease: EASE }}
        />
      </motion.div>

      {/* Corner brackets */}
      {[
        { top: 24, left: 24 }, { top: 24, right: 24 },
        { bottom: 24, left: 24 }, { bottom: 24, right: 24 },
      ].map((pos, i) => (
        <motion.div
          key={`c-${i}`}
          style={{
            position: 'absolute', width: 24, height: 24, ...pos,
            borderColor: 'rgba(255,255,255,0.12)',
            ...(i === 0 ? { borderTop: '1px solid', borderLeft: '1px solid' } :
                i === 1 ? { borderTop: '1px solid', borderRight: '1px solid' } :
                i === 2 ? { borderBottom: '1px solid', borderLeft: '1px solid' } :
                         { borderBottom: '1px solid', borderRight: '1px solid' }),
          } as any}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={isExpand
            ? { opacity: 0, scale: 4 }
            : isDraw ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.5 }
          }
          transition={{ delay: 0.3 + i * 0.06, duration: 0.5, ease: EASE }}
        />
      ))}
    </motion.div>
  );
}
