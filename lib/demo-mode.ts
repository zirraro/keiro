/**
 * Demo / Meta App Review mode.
 *
 * When the URL carries `?demo=1` the workspace renders extra inline
 * explanations under every Meta-critical button and during every Graph
 * API call, so a reviewer can record a screencast WITHOUT subtitles or
 * narration and still understand exactly what each click triggers.
 *
 * Activated by the public /meta-review page when the reviewer clicks the
 * deep links — every workspace URL receives `?lang=en&demo=1`.
 *
 * Persisted in localStorage so the flag survives navigation within the
 * SPA. Cleared with `?demo=0`.
 */

'use client';

import { useEffect, useState } from 'react';

const KEY = 'keiro_demo_mode';

// Reviewer accounts that should land with demo annotations on by default
// — Meta's App Review reviewer logs in here, so we want every Graph API
// caption visible without them having to click any toggle. Email-based
// match means the flag survives password resets and email changes inside
// the same auth user.
const AUTO_DEMO_EMAILS = new Set([
  'mrzirraro+metareview@gmail.com',
  'metareview@keiroai.com',
]);
const AUTO_DEMO_USER_IDS = new Set([
  '84ab08f0-f653-4c82-be28-4dd6a65dfbf2', // Meta App Review reviewer
]);

async function readReviewerHints(): Promise<{ email?: string; userId?: string } | null> {
  try {
    const { supabaseBrowser } = await import('@/lib/supabase/client');
    const sb = supabaseBrowser();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;
    return { email: user.email || undefined, userId: user.id };
  } catch {
    return null;
  }
}

export function useDemoMode(): boolean {
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      const v = url.searchParams.get('demo');
      if (v === '1') {
        localStorage.setItem(KEY, '1');
        setOn(true);
        return;
      }
      if (v === '0') {
        localStorage.removeItem(KEY);
        setOn(false);
        return;
      }
      // localStorage seed
      if (localStorage.getItem(KEY) === '1') {
        setOn(true);
        return;
      }
      // Auto-enable for the Meta App Review reviewer accounts so they don't
      // need to flip a switch when filming or testing — the captions are
      // only useful to them and to the founder while filming demos.
      readReviewerHints().then(hints => {
        if (!hints) return;
        const isReviewer =
          (hints.email && AUTO_DEMO_EMAILS.has(hints.email)) ||
          (hints.userId && AUTO_DEMO_USER_IDS.has(hints.userId));
        if (isReviewer) {
          try { localStorage.setItem(KEY, '1'); } catch {}
          setOn(true);
        }
      });
    } catch {
      setOn(false);
    }
  }, []);

  return on;
}

export function isDemoModeSync(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
