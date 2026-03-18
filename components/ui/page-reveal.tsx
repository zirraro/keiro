'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useState, useEffect, useMemo } from 'react';

/**
 * PageReveal — Luxury cinematic intro.
 *
 * Phases:
 * 1. INTRO   (0-1.2s)  — Dark screen, floating particles drift in, logo materializes from blur
 * 2. GLOW    (1.2-2.2s) — Logo pulses, luminous arcs sweep, tagline types in
 * 3. EXPAND  (2.2-3.4s) — Logo scales up & fades, light beams radiate outward
 * 4. FADE    (3.4-4.4s) — Whole overlay dissolves with a smooth opacity+blur, page appears underneath
 * 5. DONE    (4.4s)     — Unmount from DOM
 *
 * No hard "curtain split" — everything fades/scales smoothly.
 */

const EASE = [0.16, 1, 0.3, 1] as const;
const EASE_IN_OUT = [0.4, 0, 0.2, 1] as const;

// Generate deterministic particles for the background
function useParticles(count: number) {
  return useMemo(() => {
    const particles: Array<{
      x: number; y: number; size: number; delay: number;
      dx: number; dy: number; duration: number; opacity: number;
    }> = [];
    for (let i = 0; i < count; i++) {
      // Use a simple deterministic approach based on index
      const seed = (i * 7919 + 104729) % 1000;
      particles.push({
        x: (seed % 100),
        y: ((seed * 3 + 271) % 100),
        size: 1 + (seed % 3),
        delay: (i * 0.08),
        dx: ((seed % 60) - 30),
        dy: ((seed * 2 + 137) % 60) - 30,
        duration: 3 + (seed % 3),
        opacity: 0.2 + (seed % 40) / 100,
      });
    }
    return particles;
  }, [count]);
}

export function PageReveal() {
  const [phase, setPhase] = useState<'intro' | 'glow' | 'expand' | 'fade' | 'done'>('intro');
  const shouldReduce = useReducedMotion();
  const particles = useParticles(40);

  useEffect(() => {
    if (shouldReduce) { setPhase('done'); return; }
    const timers = [
      setTimeout(() => setPhase('glow'), 1200),
      setTimeout(() => setPhase('expand'), 2200),
      setTimeout(() => setPhase('fade'), 3400),
      setTimeout(() => setPhase('done'), 4600),
    ];
    return () => timers.forEach(clearTimeout);
  }, [shouldReduce]);

  if (phase === 'done') return null;

  const isFading = phase === 'fade';
  const isExpanding = phase === 'expand' || isFading;
  const isGlowing = phase === 'glow' || isExpanding;

  return (
    <motion.div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        pointerEvents: isFading ? 'none' : 'all',
      }}
      animate={isFading ? { opacity: 0 } : { opacity: 1 }}
      transition={{ duration: 1.2, ease: EASE }}
    >
      {/* Background — deep dark with subtle radial glow */}
      <motion.div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse 80% 60% at 50% 50%, #0d1529 0%, #060a14 100%)',
        }}
        animate={isExpanding
          ? { background: 'radial-gradient(ellipse 150% 120% at 50% 50%, #0d1529 0%, #060a14 100%)' }
          : {}
        }
        transition={{ duration: 1.2, ease: EASE_IN_OUT }}
      />

      {/* Floating particles — tiny dots drifting */}
      {particles.map((p, i) => (
        <motion.div
          key={i}
          style={{
            position: 'absolute',
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: i % 3 === 0
              ? 'rgba(59, 130, 246, 0.8)'
              : i % 3 === 1
                ? 'rgba(6, 182, 212, 0.7)'
                : 'rgba(139, 92, 246, 0.6)',
          }}
          initial={{ opacity: 0, x: 0, y: 0, scale: 0 }}
          animate={isFading
            ? { opacity: 0, x: p.dx * 3, y: p.dy * 3, scale: 0 }
            : { opacity: p.opacity, x: p.dx, y: p.dy, scale: 1 }
          }
          transition={{
            delay: p.delay,
            duration: p.duration,
            ease: 'easeOut',
          }}
        />
      ))}

      {/* Orbiting luminous arcs — appear on glow phase */}
      <motion.div
        style={{
          position: 'absolute',
          width: 300,
          height: 300,
          borderRadius: '50%',
          border: '1px solid transparent',
          borderTopColor: 'rgba(59, 130, 246, 0.3)',
          borderRightColor: 'rgba(6, 182, 212, 0.2)',
        }}
        initial={{ opacity: 0, scale: 0.5, rotate: 0 }}
        animate={isGlowing
          ? isExpanding
            ? { opacity: 0, scale: 3, rotate: 180 }
            : { opacity: 1, scale: 1, rotate: 90 }
          : { opacity: 0, scale: 0.5, rotate: 0 }
        }
        transition={{ duration: isExpanding ? 1.2 : 0.8, ease: EASE }}
      />
      <motion.div
        style={{
          position: 'absolute',
          width: 200,
          height: 200,
          borderRadius: '50%',
          border: '1px solid transparent',
          borderBottomColor: 'rgba(139, 92, 246, 0.3)',
          borderLeftColor: 'rgba(59, 130, 246, 0.15)',
        }}
        initial={{ opacity: 0, scale: 0.5, rotate: 0 }}
        animate={isGlowing
          ? isExpanding
            ? { opacity: 0, scale: 4, rotate: -270 }
            : { opacity: 1, scale: 1, rotate: -120 }
          : { opacity: 0, scale: 0.5, rotate: 0 }
        }
        transition={{ duration: isExpanding ? 1.2 : 0.8, ease: EASE, delay: 0.1 }}
      />
      <motion.div
        style={{
          position: 'absolute',
          width: 420,
          height: 420,
          borderRadius: '50%',
          border: '1px solid transparent',
          borderTopColor: 'rgba(6, 182, 212, 0.15)',
        }}
        initial={{ opacity: 0, scale: 0.3, rotate: 0 }}
        animate={isGlowing
          ? isExpanding
            ? { opacity: 0, scale: 2.5, rotate: 60 }
            : { opacity: 0.6, scale: 1, rotate: 45 }
          : { opacity: 0, scale: 0.3, rotate: 0 }
        }
        transition={{ duration: isExpanding ? 1.2 : 1, ease: EASE, delay: 0.2 }}
      />

      {/* Central glow burst — expands outward */}
      <motion.div
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.4) 0%, rgba(6, 182, 212, 0.2) 40%, transparent 70%)',
        }}
        initial={{ scale: 0, opacity: 0 }}
        animate={isExpanding
          ? { scale: 2000, opacity: 0.3 }
          : isGlowing
            ? { scale: 200, opacity: 0.5 }
            : { scale: 0, opacity: 0 }
        }
        transition={{ duration: isExpanding ? 1.4 : 0.8, ease: EASE }}
      />

      {/* Radial light beams — appear on expand */}
      {isExpanding && [0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
        <motion.div
          key={`beam-${angle}`}
          style={{
            position: 'absolute',
            width: '2px',
            height: '200vh',
            background: `linear-gradient(180deg, transparent 0%, ${
              i % 2 === 0 ? 'rgba(59, 130, 246, 0.15)' : 'rgba(6, 182, 212, 0.1)'
            } 50%, transparent 100%)`,
            transformOrigin: 'center center',
            rotate: `${angle}deg`,
          }}
          initial={{ scaleY: 0, opacity: 0 }}
          animate={{ scaleY: 1, opacity: 1 }}
          transition={{ duration: 0.8, delay: i * 0.04, ease: EASE }}
        />
      ))}

      {/* Logo container */}
      <motion.div
        style={{ position: 'relative', zIndex: 10, textAlign: 'center' }}
        initial={{ opacity: 0, scale: 0.8, filter: 'blur(24px)' }}
        animate={isExpanding
          ? { opacity: 0, scale: 1.5, filter: 'blur(20px)' }
          : { opacity: 1, scale: 1, filter: 'blur(0px)' }
        }
        transition={{ duration: isExpanding ? 1 : 0.9, ease: EASE }}
      >
        {/* Logo icon */}
        <motion.div
          style={{
            width: 72,
            height: 72,
            margin: '0 auto 20px',
            borderRadius: '18px',
            background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 60px rgba(59, 130, 246, 0.5), 0 0 120px rgba(6, 182, 212, 0.3)',
          }}
          animate={!isExpanding ? {
            boxShadow: [
              '0 0 60px rgba(59, 130, 246, 0.4), 0 0 120px rgba(6, 182, 212, 0.2)',
              '0 0 100px rgba(59, 130, 246, 0.7), 0 0 200px rgba(6, 182, 212, 0.4)',
              '0 0 60px rgba(59, 130, 246, 0.4), 0 0 120px rgba(6, 182, 212, 0.2)',
            ],
          } : {}}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </motion.div>

        {/* Brand text */}
        <motion.div style={{ overflow: 'hidden' }}>
          <motion.h1
            style={{
              fontSize: '2.5rem',
              fontWeight: 800,
              color: 'white',
              letterSpacing: '0.12em',
              margin: 0,
              lineHeight: 1,
            }}
            initial={{ y: 40 }}
            animate={{ y: 0 }}
            transition={{ delay: 0.3, duration: 0.8, ease: EASE }}
          >
            KEIRO
            <span style={{
              background: 'linear-gradient(90deg, #3b82f6, #06b6d4)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>AI</span>
          </motion.h1>
        </motion.div>

        {/* Tagline — types in letter by letter feel */}
        <motion.p
          style={{
            fontSize: '0.8rem',
            color: 'rgba(148, 163, 184, 0.9)',
            marginTop: 12,
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            fontWeight: 500,
          }}
          initial={{ opacity: 0, y: 8, letterSpacing: '0.5em' }}
          animate={isGlowing
            ? { opacity: 1, y: 0, letterSpacing: '0.25em' }
            : { opacity: 0, y: 8, letterSpacing: '0.5em' }
          }
          transition={{ delay: 0.1, duration: 0.7, ease: EASE }}
        >
          Marketing Intelligence
        </motion.p>

        {/* Horizontal accent line under tagline */}
        <motion.div
          style={{
            height: 1,
            margin: '16px auto 0',
            background: 'linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.6), rgba(6, 182, 212, 0.4), transparent)',
            maxWidth: 200,
          }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={isGlowing
            ? isExpanding
              ? { scaleX: 3, opacity: 0 }
              : { scaleX: 1, opacity: 1 }
            : { scaleX: 0, opacity: 0 }
          }
          transition={{ duration: 0.6, ease: EASE }}
        />
      </motion.div>

      {/* Corner brackets — premium detail */}
      {[
        { top: 30, left: 30, borderTop: '1px solid', borderLeft: '1px solid', color: 'rgba(59, 130, 246, 0.25)' },
        { top: 30, right: 30, borderTop: '1px solid', borderRight: '1px solid', color: 'rgba(6, 182, 212, 0.25)' },
        { bottom: 30, left: 30, borderBottom: '1px solid', borderLeft: '1px solid', color: 'rgba(139, 92, 246, 0.25)' },
        { bottom: 30, right: 30, borderBottom: '1px solid', borderRight: '1px solid', color: 'rgba(59, 130, 246, 0.25)' },
      ].map((s, i) => (
        <motion.div
          key={`corner-${i}`}
          style={{
            position: 'absolute',
            width: 30,
            height: 30,
            ...s,
            borderColor: s.color,
          }}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={isExpanding
            ? { opacity: 0, scale: 2 }
            : { opacity: 1, scale: 1 }
          }
          transition={{ delay: 0.5 + i * 0.1, duration: 0.5, ease: EASE }}
        />
      ))}
    </motion.div>
  );
}
