'use client';

/**
 * One-click "force fresh TikTok OAuth" button for App Review recording.
 * Revokes the stored TikTok access token (server-side + at TikTok via
 * /v2/oauth/revoke/) then redirects to /api/auth/tiktok-oauth so the
 * next OAuth flow re-displays the full scope grant screen that TikTok
 * reviewers expect to see in the screencast.
 */

import { useState } from 'react';

export default function ForceFreshTikTokButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/auth/tiktok-revoke', {
        method: 'POST',
        credentials: 'include',
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) {
        setError('You must be logged in to KeiroAI first. Open /login in this same browser, sign in with the TikTok-connected account, then come back to this page.');
        setBusy(false);
        return;
      }
      if (!r.ok) {
        setError(j.error || `HTTP ${r.status} — please try again or open /login first.`);
        setBusy(false);
        return;
      }
      // Token revoked at TikTok + cleared locally. Next OAuth call
      // shows the consent screen with the full scope list because
      // the user is no longer marked as previously-authorised.
      window.location.href = '/api/auth/tiktok-oauth';
    } catch (e: any) {
      setError(e?.message || 'Network error');
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        onClick={run}
        disabled={busy}
        className="px-4 py-2 rounded-lg bg-black hover:bg-neutral-800 text-white text-xs font-bold disabled:opacity-60"
      >
        {busy ? 'Revoking + redirecting…' : '⚡ Force fresh TikTok OAuth (1 click)'}
      </button>
      {error && (
        <p className="text-xs text-rose-700 mt-2">{error}</p>
      )}
      <p className="text-[10px] text-neutral-700/80 mt-2 leading-snug">
        Calls <code>POST /v2/oauth/revoke/</code> at TikTok with our stored token, then opens the TikTok authorize dialog fresh.
        You will see the full grant screen listing every requested scope
        (<code>user.info.basic</code>, <code>video.list</code>, <code>video.upload</code>, <code>video.publish</code>)
        — exactly what TikTok App Review wants to record in the screencast.
      </p>
    </div>
  );
}
