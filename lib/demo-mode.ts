'use client';

/**
 * Demo / Meta App Review annotation mode — REMOVED (2026-06-14).
 *
 * The inline "Graph API →" captions under each button did NOT influence Meta
 * App Review (the real blocker was the Facebook-Login vs Instagram-Login
 * mismatch, now fixed). They are replaced by per-agent / per-section info
 * tooltips that are useful for real prospects.
 *
 * These hooks are kept as no-op exports so the components that still import
 * DemoCaption / DemoStepBanner keep compiling and simply render nothing.
 */

export function useDemoMode(): boolean {
  return false;
}

export function isDemoModeSync(): boolean {
  return false;
}
