'use client';

/**
 * Client-only button that programmatically revokes the KeiroAI app's
 * Facebook permissions (via /api/auth/instagram-force-fresh) and then
 * redirects to the OAuth start URL with auth_type=reauthenticate so the
 * founder can record the full grant dialog for the App Review screencast
 * without having to find the right Facebook settings page.
 */

import { useState } from 'react';

export default function ForceFreshButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/auth/instagram-force-fresh', {
        method: 'POST',
        credentials: 'include',
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(j.error || `HTTP ${r.status} — open this page while logged in to your KeiroAI workspace`);
        setBusy(false);
        return;
      }
      // Tokens are wiped and (best-effort) revoked on Facebook side.
      // Now bounce to the OAuth start URL with reauth=full so Meta
      // re-displays the complete grant dialog.
      window.location.href = '/api/auth/instagram-oauth?reauth=full';
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
        className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold disabled:opacity-60"
      >
        {busy ? 'Revoking + redirecting…' : '⚡ Force fresh OAuth grant (1 click)'}
      </button>
      {error && (
        <p className="text-xs text-rose-700 mt-2">
          {error}
        </p>
      )}
      <p className="text-[10px] text-amber-900/70 mt-2 leading-snug">
        Calls <code>DELETE /me/permissions</code> on the Graph API with our stored token, then opens the OAuth dialog with
        <code className="ml-1">auth_type=reauthenticate</code>. You will see Facebook re-ask for your password and present the full
        Page selector + IG account selector + permissions screen — exactly what App Review wants to see in the screencast.
      </p>
    </div>
  );
}
