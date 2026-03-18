'use client';

import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useState, useEffect } from 'react';

/**
 * PageReveal — Luxury intro animation when landing on the site.
 *
 * Sequence:
 * 1. Dark overlay covers everything
 * 2. Logo + tagline fade in with blur-to-sharp
 * 3. A luminous line sweeps across
 * 4. Overlay splits open (curtain effect) revealing the page
 * 5. Component unmounts after reveal
 */

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

export function PageReveal() {
  const [phase, setPhase] = useState<'logo' | 'sweep' | 'reveal' | 'done'>('logo');
  const shouldReduce = useReducedMotion();

  useEffect(() => {
    if (shouldReduce) {
      setPhase('done');
      return;
    }
    // Show logo
    const t1 = setTimeout(() => setPhase('sweep'), 1200);
    // Start reveal
    const t2 = setTimeout(() => setPhase('reveal'), 1800);
    // Remove entirely
    const t3 = setTimeout(() => setPhase('done'), 2800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [shouldReduce]);

  if (phase === 'done') return null;

  return (
    <AnimatePresence>
      {(
        <motion.div
          key="page-reveal"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            pointerEvents: phase === 'reveal' ? 'none' : 'all',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {/* Top curtain */}
          <motion.div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '50%',
              background: 'linear-gradient(180deg, #0B1120 0%, #131B2E 100%)',
              transformOrigin: 'top center',
            }}
            animate={phase === 'reveal' ? { y: '-100%' } : { y: 0 }}
            transition={{ duration: 0.9, ease: EASE_OUT_EXPO }}
          />

          {/* Bottom curtain */}
          <motion.div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '50%',
              background: 'linear-gradient(0deg, #0B1120 0%, #131B2E 100%)',
              transformOrigin: 'bottom center',
            }}
            animate={phase === 'reveal' ? { y: '100%' } : { y: 0 }}
            transition={{ duration: 0.9, ease: EASE_OUT_EXPO }}
          />

          {/* Center content — logo + tagline */}
          <motion.div
            style={{
              position: 'relative',
              zIndex: 10,
              textAlign: 'center',
            }}
            initial={{ opacity: 0, scale: 0.9, filter: 'blur(20px)' }}
            animate={
              phase === 'reveal'
                ? { opacity: 0, scale: 1.1, filter: 'blur(10px)' }
                : { opacity: 1, scale: 1, filter: 'blur(0px)' }
            }
            transition={{ duration: 0.7, ease: EASE_OUT_EXPO }}
          >
            {/* Logo mark */}
            <motion.div
              style={{
                width: 64,
                height: 64,
                margin: '0 auto 16px',
                borderRadius: '16px',
                background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 60px rgba(59, 130, 246, 0.4), 0 0 120px rgba(6, 182, 212, 0.2)',
              }}
              animate={{
                boxShadow: [
                  '0 0 60px rgba(59, 130, 246, 0.4), 0 0 120px rgba(6, 182, 212, 0.2)',
                  '0 0 80px rgba(59, 130, 246, 0.6), 0 0 160px rgba(6, 182, 212, 0.3)',
                  '0 0 60px rgba(59, 130, 246, 0.4), 0 0 120px rgba(6, 182, 212, 0.2)',
                ],
              }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </motion.div>

            {/* Brand name */}
            <motion.h1
              style={{
                fontSize: '2rem',
                fontWeight: 700,
                color: 'white',
                letterSpacing: '0.1em',
                margin: 0,
              }}
            >
              KEIRO
              <span style={{
                background: 'linear-gradient(90deg, #3b82f6, #06b6d4)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>AI</span>
            </motion.h1>

            {/* Tagline */}
            <motion.p
              style={{
                fontSize: '0.85rem',
                color: 'rgba(148, 163, 184, 0.8)',
                marginTop: 8,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
              }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.6, ease: EASE_OUT_EXPO }}
            >
              Marketing Intelligence
            </motion.p>
          </motion.div>

          {/* Luminous sweep line */}
          <motion.div
            style={{
              position: 'absolute',
              top: '50%',
              left: 0,
              right: 0,
              height: '1px',
              zIndex: 5,
            }}
          >
            <motion.div
              style={{
                height: '1px',
                background: 'linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.8), rgba(6, 182, 212, 0.6), transparent)',
                boxShadow: '0 0 20px rgba(59, 130, 246, 0.5), 0 0 60px rgba(6, 182, 212, 0.3)',
              }}
              initial={{ scaleX: 0, opacity: 0 }}
              animate={
                phase === 'sweep' || phase === 'reveal'
                  ? { scaleX: 1, opacity: 1 }
                  : { scaleX: 0, opacity: 0 }
              }
              transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
            />
          </motion.div>

          {/* Corner accents — thin lines */}
          <motion.div
            style={{
              position: 'absolute',
              top: 40,
              left: 40,
              width: 40,
              height: 40,
              borderLeft: '1px solid rgba(59, 130, 246, 0.3)',
              borderTop: '1px solid rgba(59, 130, 246, 0.3)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === 'reveal' ? 0 : 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          />
          <motion.div
            style={{
              position: 'absolute',
              bottom: 40,
              right: 40,
              width: 40,
              height: 40,
              borderRight: '1px solid rgba(6, 182, 212, 0.3)',
              borderBottom: '1px solid rgba(6, 182, 212, 0.3)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === 'reveal' ? 0 : 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
