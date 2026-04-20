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
  duration = 0.25,
  y = 20,
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
  duration = 0.25,
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
  duration = 0.25,
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
      initial={shouldReduce ? { opacity: 1 } : { opacity: 0, scale: 0.92 }}
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
  duration = 0.3,
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
      initial={shouldReduce ? { opacity: 1 } : { opacity: 0, x: -24 }}
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
  duration = 0.3,
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
      initial={shouldReduce ? { opacity: 1 } : { opacity: 0, x: 24 }}
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
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: EASE_OUT_EXPO },
  },
};

export function StaggerContainer({
  children,
  className,
  staggerDelay = 0.04,
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
      {prefix}{count.toLocaleString(typeof window !== 'undefined' && localStorage.getItem('keiro_language') === 'en' ? 'en-US' : 'fr-FR')}{suffix}
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
            initial={shouldReduce ? { opacity: 1 } : { opacity: 0, y: 12 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{
              duration: 0.2,
              delay: shouldReduce ? 0 : i * 0.03,
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
        className="w-full flex items-center justify-between py-4 text-left font-semibold text-neutral-900 hover:text-[#0c1a3a] transition-colors"
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
  duration = 0.3,
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
  color = 'rgba(12, 26, 58, 0.15)',
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
      className={`inline-block bg-clip-text text-transparent bg-gradient-to-r from-[#0c1a3a] via-[#1e3a5f] to-[#0c1a3a] bg-[length:200%_auto] ${className || ''}`}
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

// ─── TextRotator ─────────────────────────────────────────
// Cycles through words with a smooth clip/blur morph transition.
export function TextRotator({
  words,
  className,
  interval = 3000,
}: {
  words: string[];
  className?: string;
  interval?: number;
}) {
  const [index, setIndex] = useState(0);
  const shouldReduce = useReducedMotion();

  useEffect(() => {
    if (shouldReduce) return;
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % words.length);
    }, interval);
    return () => clearInterval(timer);
  }, [words.length, interval, shouldReduce]);

  if (shouldReduce) return <span className={className}>{words[0]}</span>;

  return (
    <span className={`inline-block relative ${className || ''}`}>
      <AnimatePresence mode="wait">
        <motion.span
          key={words[index]}
          className="inline-block"
          initial={{ opacity: 0, y: 20, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -20, filter: 'blur(8px)' }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          {words[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

// ─── MorphingShape ───────────────────────────────────────
// An SVG shape that slowly morphs between blob paths. Creates organic, living feel.
export function MorphingShape({
  className,
  color = '#0c1a3a',
  size = 400,
  duration = 12,
}: {
  className?: string;
  color?: string;
  size?: number;
  duration?: number;
}) {
  const shouldReduce = useReducedMotion();
  const paths = [
    'M45,-51.3C56.5,-40.8,62.8,-24.5,64.4,-7.8C66.1,8.9,63.1,26,53.8,39.1C44.5,52.2,28.9,61.3,11.5,65.1C-5.9,68.9,-25.1,67.4,-39.7,58.3C-54.3,49.2,-64.3,32.5,-67.5,14.5C-70.7,-3.5,-67.1,-22.8,-56.6,-33.7C-46.1,-44.6,-28.7,-47.1,-12.4,-50.4C3.9,-53.7,33.5,-61.8,45,-51.3Z',
    'M39.5,-48.5C50.2,-38.4,57.2,-24.4,60.5,-9C63.8,6.4,63.4,23.2,55.4,35.8C47.4,48.4,31.8,56.8,15,61.4C-1.8,66,-19.8,66.8,-34.8,60C-49.8,53.2,-61.8,38.8,-66.1,22.6C-70.4,6.4,-67,-11.6,-58.2,-25.4C-49.4,-39.2,-35.2,-48.8,-21.2,-57.2C-7.2,-65.6,6.6,-72.8,19.8,-69.4C33,-66,28.8,-58.6,39.5,-48.5Z',
    'M43.3,-50.5C54.8,-41,62,-25.5,63.9,-9.4C65.8,6.7,62.4,23.4,53.1,36.3C43.8,49.2,28.6,58.3,12.1,63.4C-4.4,68.5,-22.2,69.6,-36.3,62.3C-50.4,55,-60.8,39.3,-65.3,22.4C-69.8,5.5,-68.4,-12.6,-60.1,-26.4C-51.8,-40.2,-36.6,-49.7,-22,-56.8C-7.4,-63.9,6.6,-68.6,20.8,-65.3C35,-62,31.8,-60,43.3,-50.5Z',
  ];

  if (shouldReduce) return null;

  return (
    <svg
      className={className}
      viewBox="-100 -100 200 200"
      width={size}
      height={size}
      style={{ overflow: 'visible' }}
    >
      <motion.path
        d={paths[0]}
        fill={color}
        animate={{
          d: paths,
        }}
        transition={{
          duration,
          repeat: Infinity,
          repeatType: 'reverse',
          ease: 'easeInOut',
        }}
      />
    </svg>
  );
}

// ─── MagneticButton ─────────────────────────────────────
// Button that subtly follows cursor. Premium micro-interaction.
export function MagneticButton({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const shouldReduce = useReducedMotion();
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const handleMouse = (e: React.MouseEvent<HTMLDivElement>) => {
    if (shouldReduce) return;
    const { clientX, clientY } = e;
    const { left, top, width, height } = ref.current!.getBoundingClientRect();
    const x = (clientX - left - width / 2) * 0.15;
    const y = (clientY - top - height / 2) * 0.15;
    setPosition({ x, y });
  };

  const handleLeave = () => setPosition({ x: 0, y: 0 });

  return (
    <motion.div
      ref={ref}
      className={className}
      onMouseMove={handleMouse}
      onMouseLeave={handleLeave}
      animate={{ x: position.x, y: position.y }}
      transition={{ type: 'spring', stiffness: 150, damping: 15, mass: 0.1 }}
    >
      {children}
    </motion.div>
  );
}

// Re-export motion and AnimatePresence for direct use
export { motion, AnimatePresence };
