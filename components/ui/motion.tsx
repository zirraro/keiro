'use client';

import { motion, useInView, useReducedMotion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import { useRef, useEffect, useState, ReactNode } from 'react';

const EASE_OUT_EXPO = [0.22, 1, 0.36, 1] as const;

// ─── FadeUp ───────────────────────────────────────────────
// Scroll-triggered fade-in + slide-up. The workhorse animation.
export function FadeUp({
  children,
  className,
  delay = 0,
  duration = 0.6,
  y = 32,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  y?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });
  const shouldReduce = useReducedMotion();

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={shouldReduce ? { opacity: 1 } : { opacity: 0, y }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration, delay, ease: EASE_OUT_EXPO }}
    >
      {children}
    </motion.div>
  );
}

// ─── FadeIn ───────────────────────────────────────────────
// Simple opacity fade, no translation.
export function FadeIn({
  children,
  className,
  delay = 0,
  duration = 0.8,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-40px' });
  const shouldReduce = useReducedMotion();

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={shouldReduce ? { opacity: 1 } : { opacity: 0 }}
      animate={isInView ? { opacity: 1 } : {}}
      transition={{ duration, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

// ─── ScaleIn ──────────────────────────────────────────────
// Pop-in for badges, CTAs.
export function ScaleIn({
  children,
  className,
  delay = 0,
  duration = 0.5,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-40px' });
  const shouldReduce = useReducedMotion();

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={shouldReduce ? { opacity: 1 } : { opacity: 0, scale: 0.85 }}
      animate={isInView ? { opacity: 1, scale: 1 } : {}}
      transition={{ duration, delay, ease: EASE_OUT_EXPO }}
    >
      {children}
    </motion.div>
  );
}

// ─── SlideInLeft / SlideInRight ───────────────────────────
export function SlideInLeft({
  children,
  className,
  delay = 0,
  duration = 0.7,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });
  const shouldReduce = useReducedMotion();

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={shouldReduce ? { opacity: 1 } : { opacity: 0, x: -48 }}
      animate={isInView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration, delay, ease: EASE_OUT_EXPO }}
    >
      {children}
    </motion.div>
  );
}

export function SlideInRight({
  children,
  className,
  delay = 0,
  duration = 0.7,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });
  const shouldReduce = useReducedMotion();

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={shouldReduce ? { opacity: 1 } : { opacity: 0, x: 48 }}
      animate={isInView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration, delay, ease: EASE_OUT_EXPO }}
    >
      {children}
    </motion.div>
  );
}

// ─── StaggerContainer + StaggerItem ──────────────────────
const staggerContainerVariants = {
  hidden: {},
  visible: (staggerDelay: number) => ({
    transition: { staggerChildren: staggerDelay },
  }),
};

const staggerItemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: EASE_OUT_EXPO },
  },
};

export function StaggerContainer({
  children,
  className,
  staggerDelay = 0.1,
}: {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });
  const shouldReduce = useReducedMotion();

  return (
    <motion.div
      ref={ref}
      className={className}
      variants={staggerContainerVariants}
      custom={staggerDelay}
      initial={shouldReduce ? 'visible' : 'hidden'}
      animate={isInView ? 'visible' : 'hidden'}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const shouldReduce = useReducedMotion();

  return (
    <motion.div
      className={className}
      variants={shouldReduce ? undefined : staggerItemVariants}
    >
      {children}
    </motion.div>
  );
}

// ─── CountUp ──────────────────────────────────────────────
// Animated number counter for stats.
export function CountUp({
  target,
  duration = 2,
  prefix = '',
  suffix = '',
  className,
}: {
  target: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-40px' });
  const shouldReduce = useReducedMotion();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    if (shouldReduce) {
      setCount(target);
      return;
    }

    const startTime = performance.now();
    const durationMs = duration * 1000;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [isInView, target, duration, shouldReduce]);

  return (
    <span ref={ref} className={className}>
      {prefix}{count.toLocaleString('fr-FR')}{suffix}
    </span>
  );
}

// ─── HeroTextReveal ──────────────────────────────────────
// Staggered word-by-word reveal for hero h1.
export function HeroTextReveal({
  text,
  className,
  highlightClassName,
  highlightWords = [],
}: {
  text: string;
  className?: string;
  highlightClassName?: string;
  highlightWords?: string[];
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  const isInView = useInView(ref, { once: true });
  const shouldReduce = useReducedMotion();
  const words = text.split(' ');

  return (
    <h1 ref={ref} className={className}>
      {words.map((word, i) => {
        const isHighlight = highlightWords.some(hw =>
          word.toLowerCase().includes(hw.toLowerCase())
        );
        return (
          <motion.span
            key={i}
            className={`inline-block ${isHighlight && highlightClassName ? highlightClassName : ''}`}
            initial={shouldReduce ? { opacity: 1 } : { opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{
              duration: 0.4,
              delay: shouldReduce ? 0 : i * 0.06,
              ease: EASE_OUT_EXPO,
            }}
          >
            {word}&nbsp;
          </motion.span>
        );
      })}
    </h1>
  );
}

// ─── AnimatedAccordion ───────────────────────────────────
// Smooth open/close FAQ accordion.
export function AnimatedAccordion({
  title,
  children,
  className,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={className}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-4 text-left font-semibold text-neutral-900 hover:text-blue-600 transition-colors"
      >
        <span>{title}</span>
        <motion.svg
          className="w-5 h-5 text-neutral-500 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </motion.svg>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
            className="overflow-hidden"
          >
            <div className="pb-4 text-neutral-600 text-sm leading-relaxed">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── BlurIn ──────────────────────────────────────────────
// Premium blur-to-focus reveal. Catches the eye.
export function BlurIn({
  children,
  className,
  delay = 0,
  duration = 0.8,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-40px' });
  const shouldReduce = useReducedMotion();

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={shouldReduce ? { opacity: 1 } : { opacity: 0, filter: 'blur(12px)' }}
      animate={isInView ? { opacity: 1, filter: 'blur(0px)' } : {}}
      transition={{ duration, delay, ease: EASE_OUT_EXPO }}
    >
      {children}
    </motion.div>
  );
}

// ─── FloatUp ─────────────────────────────────────────────
// Continuous gentle floating animation (for hero cards, badges).
export function FloatUp({
  children,
  className,
  amplitude = 8,
  duration = 4,
}: {
  children: ReactNode;
  className?: string;
  amplitude?: number;
  duration?: number;
}) {
  const shouldReduce = useReducedMotion();

  if (shouldReduce) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      animate={{ y: [-amplitude, amplitude, -amplitude] }}
      transition={{ duration, repeat: Infinity, ease: 'easeInOut' }}
    >
      {children}
    </motion.div>
  );
}

// ─── GlowPulse ──────────────────────────────────────────
// Animated glowing border/shadow pulse for premium cards.
export function GlowPulse({
  children,
  className,
  color = 'rgba(59, 130, 246, 0.15)',
}: {
  children: ReactNode;
  className?: string;
  color?: string;
}) {
  const shouldReduce = useReducedMotion();

  if (shouldReduce) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      animate={{
        boxShadow: [
          `0 0 20px ${color}`,
          `0 0 40px ${color}`,
          `0 0 20px ${color}`,
        ],
      }}
      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
    >
      {children}
    </motion.div>
  );
}

// ─── TextShimmer ─────────────────────────────────────────
// Animated gradient shimmer across text. Eye-catching for headlines.
export function TextShimmer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const shouldReduce = useReducedMotion();

  return (
    <motion.span
      className={`inline-block bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-cyan-500 to-blue-600 bg-[length:200%_auto] ${className || ''}`}
      animate={shouldReduce ? {} : { backgroundPosition: ['0% center', '200% center'] }}
      transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
    >
      {children}
    </motion.span>
  );
}

// ─── ParallaxScroll ──────────────────────────────────────
// Subtle parallax effect on scroll. Makes sections feel layered.
export function ParallaxScroll({
  children,
  className,
  speed = 0.3,
}: {
  children: ReactNode;
  className?: string;
  speed?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const shouldReduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  const y = useTransform(scrollYProgress, [0, 1], [50 * speed, -50 * speed]);

  if (shouldReduce) return <div ref={ref} className={className}>{children}</div>;

  return (
    <motion.div ref={ref} className={className} style={{ y }}>
      {children}
    </motion.div>
  );
}

// Re-export motion and AnimatePresence for direct use
export { motion, AnimatePresence };
