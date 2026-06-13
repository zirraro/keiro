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
    <div className="rounded-xl border-2 border-amber-500 bg-amber-50 p-4">
      <p className="text-sm font-extrabold text-amber-900 mb-1">🎬 Bouton d'enregistrement Meta App Review</p>
      <p className="text-[11px] text-amber-900/80 mb-3 leading-snug">
        <strong>Démarre ton enregistrement d'écran AVANT de cliquer.</strong> Ce bouton lance la
        connexion <strong>Instagram Login</strong> avec <code>force_reauth=true</code> → Instagram
        redemande tes identifiants et réaffiche l'écran de permissions complet. C'est le
        <strong> login Instagram</strong> + le <strong>grant des permissions</strong> que le reviewer
        doit voir (tes anciennes vidéos montraient un login Facebook → mismatch → refus).
      </p>
      <button
        onClick={run}
        disabled={busy}
        className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold disabled:opacity-60"
      >
        {busy ? 'Préparation…' : '⚡ Démarrer une connexion Instagram complète'}
      </button>
      {error && (
        <p className="text-xs text-rose-700 mt-2">
          {error}
        </p>
      )}
      <ol className="text-[11px] text-amber-900/80 mt-3 leading-relaxed list-decimal pl-4 space-y-0.5">
        <li>Lance l'enregistrement d'écran.</li>
        <li>Clique le bouton → <strong>login Instagram</strong> (identifiants Instagram) ← l'étape qui manquait.</li>
        <li><strong>Écran des permissions Instagram — laisse TOUT autorisé</strong>, puis valide.</li>
        <li>Retour dans KeiroAI → exécute le cas d'usage (publier / commenter / stats / message).</li>
        <li>Montre le résultat <strong>sur l'app Instagram réelle</strong> (post / commentaire / message en ligne).</li>
        <li>Stoppe l'enregistrement. <strong>Une vidéo par permission.</strong></li>
      </ol>
      <p className="text-[10px] text-amber-900/60 mt-2 leading-snug">
        Pré-requis : <code>INSTAGRAM_APP_ID</code> + <code>INSTAGRAM_APP_SECRET</code> configurés et l'URL de redirection
        enregistrée dans « API setup with Instagram login » du dashboard Meta. Sinon le bouton retombe sur l'ancien login Facebook.
      </p>
    </div>
  );
}
