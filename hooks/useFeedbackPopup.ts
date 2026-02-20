'use client';

import { useState, useEffect } from 'react';

/**
 * Hook pour gérer l'affichage du popup feedback.
 * Apparaît après la 5e connexion, puis toutes les 10 connexions.
 * Disparaît définitivement une fois le questionnaire rempli.
 */
export function useFeedbackPopup() {
  const [showPopup, setShowPopup] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    // Si déjà rempli, ne plus afficher
    if (localStorage.getItem('keiro_feedback_done') === 'true') return;

    // Incrémenter le compteur de visites
    const count = parseInt(localStorage.getItem('keiro_page_visits') || '0', 10) + 1;
    localStorage.setItem('keiro_page_visits', String(count));

    // Afficher après la 5e visite, puis toutes les 10 visites
    const shouldShow = count === 5 || (count > 5 && (count - 5) % 10 === 0);

    // Vérifier qu'on ne l'a pas déjà montré dans cette session
    const shownThisSession = sessionStorage.getItem('keiro_feedback_shown');

    if (shouldShow && !shownThisSession) {
      // Petit délai pour ne pas gêner le chargement
      const timer = setTimeout(() => {
        setShowPopup(true);
        sessionStorage.setItem('keiro_feedback_shown', 'true');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    setShowPopup(false);
    setShowModal(true);
  };

  const handleDismiss = () => {
    setShowPopup(false);
  };

  const handleModalClose = () => {
    setShowModal(false);
  };

  return { showPopup, showModal, handleAccept, handleDismiss, handleModalClose };
}
