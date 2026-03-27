'use client';

import { useState, useEffect } from 'react';

/**
 * Hook pour gérer l'affichage du popup feedback.
 * Apparaît à la 10e connexion, puis toutes les 10 connexions.
 * "Plus tard" cache seulement pour ce chargement de page.
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

    // Afficher à la 10e visite, puis toutes les 10 visites (10, 20, 30...)
    if (count >= 10 && count % 10 === 0) {
      const timer = setTimeout(() => {
        setShowPopup(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    setShowPopup(false);
    setShowModal(true);
  };

  const handleDismiss = () => {
    // "Plus tard" cache seulement pour ce chargement de page
    setShowPopup(false);
  };

  const handleModalClose = () => {
    setShowModal(false);
  };

  return { showPopup, showModal, handleAccept, handleDismiss, handleModalClose };
}
