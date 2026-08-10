'use client';

import { useEffect } from 'react';

/**
 * Le filet quand l'application tombe entièrement côté navigateur.
 *
 * ── Ce qu'on répare ──
 *
 * 2026-08-10, le fondateur en pleine utilisation : « Application error: a
 * client-side exception has occurred ». Puis, de lui-même : « en fait je me
 * rends compte que c'est parce que tu travailles sur le site. »
 *
 * Diagnostic confirmé. Next.js découpe l'application en fichiers JavaScript
 * dont le nom porte une empreinte du contenu. Après un déploiement, les
 * anciens noms n'existent plus ; un navigateur ouvert AVANT continue de les
 * réclamer au premier clic, reçoit un 404, et toute l'interface tombe sur ce
 * message technique.
 *
 * La cause est traitée dans scripts/deploy.sh, qui conserve désormais les
 * fichiers des versions précédentes — c'est ce que faisait Vercel
 * implicitement. Ce fichier-ci est la seconde ligne de défense : même avec la
 * première, un fichier peut manquer (purge, cache intermédiaire, session
 * vieille de plus d'une semaine).
 *
 * ── Pourquoi recharger plutôt qu'afficher une erreur ──
 *
 * Dans ce cas précis, la page suivante marchera : le code manquant existe, sous
 * un autre nom. Un rechargement le récupère et le client ne perd que deux
 * secondes, au lieu de se retrouver devant un écran mort au milieu de son
 * travail.
 *
 * Un seul rechargement, marqué dans la session : si l'erreur revient tout de
 * suite, elle n'est pas due au déploiement, et boucler indéfiniment serait pire
 * que de l'afficher.
 */

const MARQUEUR = 'keiro_rechargement_apres_maj';

/** L'erreur vient-elle d'un fichier de code devenu introuvable ? */
function estFichierManquant(e: Error & { digest?: string }): boolean {
  const texte = `${e?.name || ''} ${e?.message || ''}`.toLowerCase();
  return (
    texte.includes('chunkloaderror')
    || texte.includes('loading chunk')
    || texte.includes('failed to fetch dynamically imported module')
    || texte.includes('importing a module script failed')
    || texte.includes('unexpected token')          // un 404 renvoie du HTML là où du JS était attendu
  );
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (!estFichierManquant(error)) return;
    try {
      if (sessionStorage.getItem(MARQUEUR)) return;   // déjà tenté : on n'insiste pas
      sessionStorage.setItem(MARQUEUR, '1');
      window.location.reload();
    } catch { /* stockage indisponible : on laisse l'écran ci-dessous */ }
  }, [error]);

  const miseAJour = estFichierManquant(error);

  return (
    <html lang="fr">
      <body style={{ margin: 0, background: '#0c1a3a', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ maxWidth: '420px', textAlign: 'center' }}>
            <p style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px' }}>
              {miseAJour ? 'KeiroAI vient d’être mis à jour' : 'Un souci est survenu'}
            </p>
            <p style={{ fontSize: '13px', lineHeight: 1.5, opacity: 0.7, marginBottom: '20px' }}>
              {miseAJour
                ? 'On recharge la page pour te donner la dernière version. Rien n’est perdu.'
                : 'Rien n’est perdu de ton côté. Recharge la page, et si ça recommence, écris-nous : on regarde tout de suite.'}
            </p>
            <button
              onClick={() => { try { sessionStorage.removeItem(MARQUEUR); } catch {} reset(); }}
              style={{
                padding: '12px 22px', minHeight: '44px', borderRadius: '10px', border: 'none',
                background: '#22d3ee', color: '#06263a', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
              }}
            >
              Recharger
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
