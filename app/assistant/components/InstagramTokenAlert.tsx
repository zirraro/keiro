'use client';

import { useState, useEffect } from 'react';

/**
 * Checks Instagram token validity on mount.
 * Shows a popup/banner if token is expired, missing, or expiring soon.
 */
export default function InstagramTokenAlert() {
  const [status, setStatus] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Don't check if already dismissed this session
    const dismissed = sessionStorage.getItem('ig_token_alert_dismissed');
    if (dismissed) return;

    async function check() {
      try {
        const res = await fetch('/api/instagram/check-token', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        if (!data.valid || data.expires_soon) {
          setStatus(data);
        }
      } catch { /* silent */ }
    }
    check();
  }, []);

  if (!status || dismissed) return null;

  const isExpired = status.reason === 'token_invalid' || status.reason === 'ig_access_failed';
  const isNotConnected = status.reason === 'not_connected';
  const isExpiringSoon = status.expires_soon;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
        {/* Icon */}
        <div className="text-center mb-4">
          <div className="text-5xl mb-2">{isExpired ? '⚠️' : isNotConnected ? '📸' : '⏳'}</div>
          <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
            {isExpired ? 'Token Instagram expire' :
             isNotConnected ? 'Instagram non connecte' :
             'Token Instagram expire bientot'}
          </h3>
        </div>

        {/* Message */}
        <p className="text-sm text-neutral-600 dark:text-neutral-300 text-center mb-4">
          {status.message}
        </p>

        {/* Impact */}
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 mb-4">
          <p className="text-xs text-red-700 dark:text-red-300 font-medium">
            {isNotConnected ? 'Sans connexion Instagram :' : 'Avec un token expire :'}
          </p>
          <ul className="text-xs text-red-600 dark:text-red-400 mt-1 space-y-0.5">
            <li>• Aucune publication automatique sur Instagram</li>
            <li>• Agent Content bloque</li>
            <li>• Agent Community inactif</li>
            <li>• Pas de DMs automatiques</li>
          </ul>
        </div>

        {/* CTA — direct Instagram OAuth connection */}
        <a
          href="/api/auth/instagram-oauth"
          className="block w-full py-3 text-center rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold text-sm hover:opacity-90 transition"
        >
          {isNotConnected ? 'Connecter Instagram' : 'Reconnecter Instagram'}
        </a>

        {/* Dismiss */}
        {isExpiringSoon && !isExpired && (
          <button
            onClick={() => { setDismissed(true); sessionStorage.setItem('ig_token_alert_dismissed', '1'); }}
            className="block w-full mt-2 py-2 text-center text-sm text-neutral-400 hover:text-neutral-600 transition"
          >
            Me rappeler plus tard
          </button>
        )}

        {/* Close for expired (forced reconnect) */}
        {(isExpired || isNotConnected) && (
          <button
            onClick={() => { setDismissed(true); sessionStorage.setItem('ig_token_alert_dismissed', '1'); }}
            className="block w-full mt-2 py-2 text-center text-xs text-neutral-400 hover:text-neutral-500"
          >
            Ignorer pour le moment
          </button>
        )}
      </div>
    </div>
  );
}
