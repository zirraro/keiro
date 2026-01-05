import { useState, useEffect } from 'react';

interface EditLimitState {
  count: number;
  email: string | null;
  hasAccount: boolean;
}

export function useEditLimit() {
  const [state, setState] = useState<EditLimitState>({
    count: 0,
    email: null,
    hasAccount: false,
  });

  // Charger depuis localStorage au montage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('keiro_edit_limit');
      if (stored) {
        try {
          setState(JSON.parse(stored));
        } catch (e) {
          console.error('Failed to parse edit limit state', e);
        }
      }
    }
  }, []);

  // Sauvegarder dans localStorage à chaque changement
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('keiro_edit_limit', JSON.stringify(state));
    }
  }, [state]);

  const incrementCount = () => {
    setState(prev => ({ ...prev, count: prev.count + 1 }));
  };

  const setEmail = (email: string) => {
    setState(prev => ({ ...prev, email }));
  };

  const setHasAccount = (hasAccount: boolean) => {
    setState(prev => ({ ...prev, hasAccount }));
  };

  const reset = () => {
    setState({ count: 0, email: null, hasAccount: false });
    if (typeof window !== 'undefined') {
      localStorage.removeItem('keiro_edit_limit');
    }
  };

  // Déterminer l'action requise
  const getRequiredAction = (): 'edit' | 'email' | 'signup' | 'premium' => {
    if (state.hasAccount) return 'edit'; // Compte créé = illimité (pour freemium)
    if (state.count === 0) return 'edit'; // 1ère édition gratuite
    if (state.count === 1 && !state.email) return 'email'; // 2ème édition = email requis
    if (state.count === 1 && state.email) return 'edit'; // Email fourni = 1 édition de plus
    if (state.count === 2 && state.email) return 'signup'; // 3ème édition = compte requis
    return 'premium'; // 3+ = plan premium requis
  };

  return {
    count: state.count,
    email: state.email,
    hasAccount: state.hasAccount,
    incrementCount,
    setEmail,
    setHasAccount,
    reset,
    requiredAction: getRequiredAction(),
    canEdit: getRequiredAction() === 'edit',
  };
}
