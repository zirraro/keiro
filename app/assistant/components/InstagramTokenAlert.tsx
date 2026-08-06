'use client';

import { useState, useEffect } from 'react';

/**
 * Signale un jeton Instagram expiré. Sans jamais bloquer la navigation.
 *
 * Demande du fondateur (2026-08-07) : « quand Insta est déconnecté on a un
 * pop-up qui sort sur la page agent, c'est pas la peine. On veut pouvoir
 * naviguer tranquillement dans les agents et voir ensuite sur la page Léna
 * qu'on n'est pas connecté. »
 *
 * ── Ce qui a changé ──
 *
 * C'était un écran plein cadre, fond noirci, qui s'ouvrait à chaque entrée
 * dans l'espace de travail dès qu'Instagram n'était pas connecté. Il fallait
 * le fermer avant de pouvoir faire quoi que ce soit — y compris pour un
 * client qui n'a simplement pas encore branché Instagram, ce qui est l'état
 * normal des premières minutes.
 *
 * Deux situations distinctes, traitées différemment :
 *
 * • **Pas connecté** — rien du tout ici. Ce n'est pas un incident, c'est un
 *   état. Le panneau de Léna porte déjà sa bannière de connexion, à l'endroit
 *   où le client se pose la question.
 *
 * • **Jeton expiré ou sur le point de l'être** — là, quelque chose qui
 *   marchait s'est arrêté, et le client ne peut pas le deviner : ses
 *   publications cessent en silence. On le dit, mais dans un bandeau discret
 *   en bas d'écran, qui n'empêche rien et se ferme d'un geste.
 */
export default function InstagramTokenAlert() {
  const [status, setStatus] = useState<any>(null);
  const [ferme, setFerme] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('ig_token_alert_dismissed')) return;

    (async () => {
      try {
        const res = await fetch('/api/instagram/check-token', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        // « Jamais connecté » n'est pas une alerte : on ne remonte que ce qui
        // s'est cassé après avoir fonctionné.
        if (data.reason === 'not_connected') return;
        if (!data.valid || data.expires_soon) setStatus(data);
      } catch { /* silencieux : une alerte ne doit pas gêner si elle échoue */ }
    })();
  }, []);

  if (!status || ferme) return null;

  const expire = status.reason === 'token_invalid' || status.reason === 'ig_access_failed';

  const fermer = () => {
    setFerme(true);
    sessionStorage.setItem('ig_token_alert_dismissed', '1');
  };

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm z-40 rounded-2xl border border-amber-400/30 bg-neutral-900/95 backdrop-blur shadow-2xl p-4"
    >
      <div className="flex items-start gap-3">
        <span className="text-xl leading-none flex-shrink-0" aria-hidden>⚠️</span>
        <div className="min-w-0 flex-1">
          <p className="text-white text-sm font-semibold">
            {expire ? 'Ta connexion Instagram a expiré' : 'Ta connexion Instagram expire bientôt'}
          </p>
          <p className="text-white/55 text-[13px] leading-relaxed mt-0.5">
            {expire
              ? 'Léna ne peut plus publier ni répondre à tes messages tant que ce n’est pas rétabli.'
              : 'Reconnecte quand tu veux — ça évite une coupure de publication.'}
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <a
              href="/api/auth/instagram-oauth"
              className="min-h-[44px] inline-flex items-center justify-center px-4 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white text-[13px] font-semibold hover:opacity-90 transition-opacity"
            >
              Reconnecter
            </a>
            <button
              onClick={fermer}
              className="min-h-[44px] inline-flex items-center justify-center px-4 rounded-xl text-white/45 hover:text-white/75 text-[13px] font-medium transition-colors"
            >
              Plus tard
            </button>
          </div>
        </div>
        <button
          onClick={fermer}
          aria-label="Fermer"
          className="min-h-[44px] min-w-[44px] -mt-2 -mr-2 inline-flex items-center justify-center text-white/30 hover:text-white/70 text-lg transition-colors"
        >
          ×
        </button>
      </div>
    </div>
  );
}
