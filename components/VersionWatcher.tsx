'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Ramène discrètement chaque onglet ouvert sur la version en ligne.
 *
 * ── Pourquoi ──
 *
 * Fondateur, 2026-08-11 : « attention lors des mises à jour, de bien vérifier
 * qu'ils sont sur la version en ligne. »
 *
 * Le matin même, on a réglé le plantage qui suivait un déploiement : les
 * fichiers de l'ancienne version restent servis, donc une page ouverte ne
 * tombe plus en erreur. Mais ce correctif a une contrepartie exacte — elle
 * continue de tourner sur l'ANCIENNE version, indéfiniment. Un onglet laissé
 * ouvert deux jours ne verrait aucune des corrections déployées entre-temps,
 * et appellerait des API dont le contrat a pu changer.
 *
 * Les deux besoins sont donc complémentaires : ne pas casser la session en
 * cours, ET la ramener sur la version courante. Ce composant fait le second.
 *
 * ── Pourquoi pas simplement recharger ──
 *
 * Recharger la page d'un commerçant en train d'écrire une légende ou de
 * remplir son profil lui ferait perdre son travail — et ce serait, pour lui,
 * exactement le « site qui saute » qu'on cherche à supprimer. On attend donc
 * un moment où le rechargement ne se voit pas :
 *
 *   · l'onglet passe en arrière-plan → on recharge tout de suite, il ne
 *     regarde pas ;
 *   · il change de page → le chargement est attendu, il se fond dedans ;
 *   · il ne touche à rien depuis deux minutes, et n'a aucun champ en cours de
 *     saisie → on recharge.
 *
 * Aucun bandeau, aucune demande : le fondateur ne veut pas que le client voie
 * les mises à jour. Elles doivent être invisibles, dans les deux sens.
 */

/** Assez fréquent pour converger dans l'heure, assez rare pour ne rien coûter. */
const INTERVALLE_MS = 3 * 60 * 1000;

/** Sans activité depuis ce délai, un rechargement passe inaperçu. */
const INACTIVITE_MS = 2 * 60 * 1000;

export default function VersionWatcher() {
  const chemin = usePathname();
  /** Version chargée par CET onglet. Null tant qu'on ne l'a pas lue. */
  const versionChargee = useRef<string | null>(null);
  /** Une version plus récente est en ligne : on attend le bon moment. */
  const aRecharger = useRef(false);
  const derniereActivite = useRef(Date.now());

  // Le changement de page est le moment le plus naturel : un chargement y est
  // attendu. On le traite dans son propre effet pour qu'il réagisse au chemin.
  useEffect(() => {
    if (aRecharger.current) window.location.reload();
  }, [chemin]);

  useEffect(() => {
    let vivant = true;

    const marquerActivite = () => { derniereActivite.current = Date.now(); };
    for (const e of ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']) {
      window.addEventListener(e, marquerActivite, { passive: true });
    }

    /** Un champ en cours de saisie interdit tout rechargement. */
    const enTrainDeSaisir = () => {
      const a = document.activeElement as HTMLElement | null;
      if (!a) return false;
      return a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable;
    };

    const rechargerSiPossible = () => {
      if (!aRecharger.current) return;
      if (document.visibilityState === 'hidden') { window.location.reload(); return; }
      if (enTrainDeSaisir()) return;
      if (Date.now() - derniereActivite.current >= INACTIVITE_MS) window.location.reload();
    };

    const verifier = async () => {
      try {
        // Le paramètre casse les caches intermédiaires : sans lui, on peut
        // relire pendant des heures la réponse d'avant le déploiement.
        const r = await fetch(`/api/version?ts=${Date.now()}`, { cache: 'no-store' });
        if (!r.ok || !vivant) return;
        const { shortSha } = await r.json();
        if (!shortSha) return;
        if (versionChargee.current === null) { versionChargee.current = shortSha; return; }
        if (shortSha !== versionChargee.current) {
          aRecharger.current = true;
          rechargerSiPossible();
        }
      } catch { /* hors ligne ou API indisponible : on réessaiera */ }
    };

    void verifier();
    const surIntervalle = setInterval(() => { void verifier(); rechargerSiPossible(); }, INTERVALLE_MS);
    // L'onglet qu'on quitte est l'occasion idéale — on ne fait pas attendre
    // l'intervalle pour la saisir.
    const surVisibilite = () => { if (document.visibilityState === 'hidden') rechargerSiPossible(); };
    document.addEventListener('visibilitychange', surVisibilite);

    return () => {
      vivant = false;
      clearInterval(surIntervalle);
      document.removeEventListener('visibilitychange', surVisibilite);
      for (const e of ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']) {
        window.removeEventListener(e, marquerActivite);
      }
    };
  }, []);

  return null;
}
