/**
 * fetchWithBackoff — retry a fetch that fails on transient network/5xx
 * errors with exponential backoff. Used for upload-style calls where a
 * timeout doesn't mean the upstream is permanently broken (Meta/TikTok
 * are notorious for transient 5xx during peak hours).
 *
 * Founder ask 2026-06-07: digest showed 1 timeout/148 runs = 99%.
 * Adding retry brings us to ~100% on transient issues without changing
 * the per-call timeout.
 *
 * Behavior:
 *   - On HTTP 2xx → returns immediately.
 *   - On HTTP 4xx (except 408/429) → returns immediately (client error, no retry).
 *   - On HTTP 5xx / 408 / 429 / network throw / abort → retry with backoff.
 *   - Default: 3 attempts total, delays 2s/5s/12s, hard cap 90s wall-clock.
 */

export interface FetchRetryOptions {
  maxAttempts?: number;        // default 3
  initialDelayMs?: number;     // default 2000
  factor?: number;             // default 2.5
  maxWallClockMs?: number;     // default 90_000
  retryStatuses?: number[];    // default [408, 429, 500, 502, 503, 504]
  /** Tag for log lines so callers can identify which retry happened. */
  label?: string;
}

export async function fetchWithBackoff(
  input: RequestInfo | URL,
  init: RequestInit & { perAttemptTimeoutMs?: number } = {},
  opts: FetchRetryOptions = {},
): Promise<Response> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const initialDelay = opts.initialDelayMs ?? 2000;
  const factor = opts.factor ?? 2.5;
  const maxWallClock = opts.maxWallClockMs ?? 90_000;
  const retryStatuses = opts.retryStatuses ?? [408, 429, 500, 502, 503, 504];
  const label = opts.label || 'fetch';
  const perAttemptTimeout = init.perAttemptTimeoutMs;

  const start = Date.now();
  let lastError: any = null;
  let lastResponse: Response | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Bail if total wall clock would exceed the cap before this attempt
    if (Date.now() - start > maxWallClock) {
      console.warn(`[${label}] wall-clock cap reached before attempt ${attempt}`);
      break;
    }

    try {
      const signal = perAttemptTimeout
        ? AbortSignal.timeout(perAttemptTimeout)
        : init.signal;
      const res = await fetch(input, { ...init, signal });
      lastResponse = res;
      if (res.ok) {
        if (attempt > 1) console.log(`[${label}] success on attempt ${attempt}`);
        return res;
      }
      if (!retryStatuses.includes(res.status)) {
        // 4xx (non-retryable) — return immediately
        return res;
      }
      console.warn(`[${label}] HTTP ${res.status} attempt ${attempt}/${maxAttempts} — retrying`);
    } catch (e: any) {
      lastError = e;
      const isAbort = e?.name === 'AbortError' || /abort|timeout/i.test(e?.message || '');
      console.warn(`[${label}] ${isAbort ? 'TIMEOUT' : 'ERROR'} attempt ${attempt}/${maxAttempts}:`, e?.message?.substring(0, 120));
    }

    if (attempt < maxAttempts) {
      const delay = Math.min(initialDelay * Math.pow(factor, attempt - 1), 30_000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError || new Error(`${label} failed after ${maxAttempts} attempts`);
}
