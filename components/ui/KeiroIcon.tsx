/**
 * Unified icon system for KeiroAI marketing surfaces.
 *
 * Drop-in replacement for the emoji that currently pepper section
 * headers (🔮, ⚡, 🎬, 🎯, 🤖, 🎨, 🚀…). Emoji look amateurish at
 * landing-page scale and drift in color/style across platforms — the
 * UX audit flagged this as the single biggest credibility hit.
 *
 * Design constraints (matching Linear/Stripe aesthetic):
 *   - single stroke weight (1.75)
 *   - rounded caps & joins
 *   - 24×24 viewport, currentColor
 *   - no filled backgrounds — let the parent set gradient / tint
 *
 * Usage:
 *   <KeiroIcon name="agents" className="w-5 h-5 text-cyan-400" />
 */

import type { SVGProps, ReactNode } from 'react';

export type KeiroIconName =
  | 'agents'       // team / user group — was 🤖 👥
  | 'sparkle'      // generation / magic — was ✨ 🔮
  | 'bolt'         // speed / power — was ⚡
  | 'video'        // reels / tiktok — was 🎬
  | 'target'       // conversion / CTA — was 🎯
  | 'palette'      // brand / design — was 🎨
  | 'rocket'       // launch / growth — was 🚀
  | 'chart'        // analytics — was 📊
  | 'mail'         // emails — was 📧 ✉️
  | 'chat'         // DMs / comments — was 💬
  | 'star'         // social proof / rating — was ⭐ 🏆
  | 'shield'       // trust / security — was 🛡️
  | 'calendar'     // planning — was 📅
  | 'store'        // business / shop — was 🏪 🏢
  | 'check';       // done — was ✓ ✅

interface IconProps extends SVGProps<SVGSVGElement> {
  name: KeiroIconName;
}

const PATHS: Record<KeiroIconName, ReactNode> = {
  agents: (
    <>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3 20c.5-3 3-5 6-5s5.5 2 6 5" />
      <path d="M14 20c.3-2.2 2-3.7 4-3.7s3.7 1.5 4 3.7" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
    </>
  ),
  bolt: <path d="M13 3L5 13h6l-1 8 8-10h-6l1-8z" />,
  video: (
    <>
      <rect x="3" y="5" width="14" height="14" rx="2" />
      <path d="M17 10l4-2v8l-4-2z" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3a9 9 0 109 9c0-1.5-1.5-2-3-2h-2a2 2 0 010-4h1a5 5 0 00-5-3z" />
      <circle cx="8" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="10" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  rocket: (
    <>
      <path d="M12 3c4 0 7 3 7 7l-4 4-6-6c0-4 3-5 3-5z" />
      <path d="M9 14l-3 3 2 2 3-3" />
      <path d="M14 11a2 2 0 100-4 2 2 0 000 4z" fill="currentColor" stroke="none" />
    </>
  ),
  chart: (
    <>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 15l4-6 3 3 4-7" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 7 9-7" />
    </>
  ),
  chat: (
    <>
      <path d="M4 5h16v10H9l-5 4V5z" />
      <circle cx="9" cy="10" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="12" cy="10" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="0.8" fill="currentColor" stroke="none" />
    </>
  ),
  star: (
    <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6-5.4-2.9L6.6 19.8l1-6L3.2 9.5l6.1-.9z" />
  ),
  shield: <path d="M12 3l8 3v7c0 4.5-3.5 7-8 8-4.5-1-8-3.5-8-8V6z" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </>
  ),
  store: (
    <>
      <path d="M4 9l2-5h12l2 5" />
      <path d="M4 9v10h16V9" />
      <path d="M4 9a2 2 0 004 0 2 2 0 004 0 2 2 0 004 0 2 2 0 004 0" />
    </>
  ),
  check: <path d="M5 12l4 4 10-10" />,
};

export function KeiroIcon({ name, className, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
