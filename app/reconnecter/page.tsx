'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Reconnexion d'un réseau en un clic, depuis un email.
 *
 * Demande du fondateur (2026-08-03) : « quand tu dis reconnecter le réseau, ça
 * doit amener directement à la bonne page de reconnexion, donc on force la
 * déconnexion avant et la redirection ensuite vers l'agent correspondant. Ça
 * doit être fluide pour le client. »
 *
 * Avant, l'email disait « va dans tes réglages, déconnecte, reconnecte » : trois
 * actions à comprendre et à trouver, sur un mobile, alors que la publication est
 * déjà à l'arrêt. Ici le client clique une fois et n'a plus qu'à valider chez
 * Meta ou TikTok.
 *
 * Le déroulé est volontairement visible : on annonce chaque étape plutôt que de
 * faire disparaître l'écran. Une redirection silencieuse vers Meta, après un
 * clic depuis un email, ressemble à du hameçonnage.
 *
 * La page passe par le NAVIGATEUR pour lancer l'autorisation, et non par une
 * redirection serveur, parce que la route OAuth lit le `referer` pour savoir où
 * ramener le client ensuite. C'est ce qui le fait atterrir sur SON agent, pas
 * sur un tableau de bord générique.
 */

const RESEAUX: Record<string, { nom: string; couleur: string; autorisation: string; agent: string }> = {
  instagram: {
    nom: 'Instagram',
    couleur: '#E1306C',
    autorisation: '/api/auth/instagram-oauth?reauth=full',
    agent: '/assistant/agent/content',
  },
  tiktok: {
    nom: 'TikTok',
    couleur: '#000000',
    autorisation: '/api/auth/tiktok-oauth',
    agent: '/assistant/agent/content',
  },
  linkedin: {
    nom: 'LinkedIn',
    couleur: '#0A66C2',
    autorisation: '/api/auth/linkedin-oauth',
    agent: '/assistant/agent/content',
  },
};

function Contenu() {
  const params = useSearchParams();
  const cle = (params.get('reseau') || '').toLowerCase();
  const reseau = RESEAUX[cle];
  const [etape, setEtape] = useState<'preparation' | 'pret' | 'erreur'>('preparation');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!reseau) { setEtape('erreur'); setMessage('Réseau inconnu.'); return; }
    let annule = false;

    (async () => {
      try {
        // On efface l'ancienne connexion AVANT de redemander l'autorisation :
        // sans ça, le réseau réutilise silencieusement le jeton mort et on
        // revient au point de départ.
        const r = await fetch('/api/agents/disconnect-network', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ network: cle }),
        });
        if (r.status === 401) {
          if (!annule) {
            setEtape('erreur');
            setMessage('Connecte-toi à ton compte KeiroAI, puis reclique sur le lien de l’email.');
          }
          return;
        }
      } catch {
        // Une déconnexion qui échoue n'empêche pas de retenter l'autorisation.
      }
      if (!annule) setEtape('pret');
    })();

    return () => { annule = true; };
  }, [cle]);

  // Dès que le nettoyage est fait, on part sur l'écran d'autorisation. Le court
  // délai laisse le temps de lire ce qui se passe.
  useEffect(() => {
    if (etape !== 'pret' || !reseau) return;
    const t = setTimeout(() => { window.location.href = reseau.autorisation; }, 1200);
    return () => clearTimeout(t);
  }, [etape, cle]);

  const titre = reseau ? `Reconnexion de ${reseau.nom}` : 'Reconnexion';

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(180deg,#0c1a3a,#1e3a5f)', padding: 24,
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{
        maxWidth: 460, width: '100%', background: '#fff', borderRadius: 20, padding: 32,
        boxShadow: '0 24px 70px -20px rgba(0,0,0,.6)', textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%', margin: '0 auto 18px',
          background: reseau ? `${reseau.couleur}18` : '#eee',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
        }}>
          {etape === 'erreur' ? '🔒' : '🔗'}
        </div>

        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>{titre}</h1>

        {etape === 'preparation' && (
          <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            On efface l&apos;ancienne connexion, périmée…
          </p>
        )}

        {etape === 'pret' && reseau && (
          <>
            <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.6, margin: '0 0 18px' }}>
              Ancienne connexion effacée. On t&apos;emmène sur {reseau.nom} pour réautoriser
              KeiroAI — c&apos;est la dernière étape, la publication automatique
              reprend juste après.
            </p>
            <a
              href={reseau.autorisation}
              style={{
                display: 'block', background: reseau.couleur, color: '#fff', textDecoration: 'none',
                padding: '13px 20px', borderRadius: 12, fontWeight: 600, fontSize: 15,
              }}
            >
              Autoriser sur {reseau.nom}
            </a>
            <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 12 }}>
              Redirection automatique dans un instant…
            </p>
          </>
        )}

        {etape === 'erreur' && (
          <>
            <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.6, margin: '0 0 18px' }}>{message}</p>
            <a href="/login" style={{
              display: 'block', background: '#111827', color: '#fff', textDecoration: 'none',
              padding: '13px 20px', borderRadius: 12, fontWeight: 600, fontSize: 15,
            }}>
              Se connecter
            </a>
          </>
        )}

        <p style={{ color: '#9ca3af', fontSize: 11, marginTop: 20, lineHeight: 1.5 }}>
          Tes publications programmées sont conservées. Rien n&apos;est perdu, elles
          repartent dès que la connexion est rétablie.
        </p>
      </div>
    </div>
  );
}

export default function ReconnecterPage() {
  return (
    <Suspense fallback={null}>
      <Contenu />
    </Suspense>
  );
}
