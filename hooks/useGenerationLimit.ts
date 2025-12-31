import { useState, useEffect } from 'react';

interface GenerationLimitState {
  count: number;
  email: string | null;
  hasAccount: boolean;
}

export function useGenerationLimit() {
  const [state, setState] = useState<GenerationLimitState>({
    count: 0,
    email: null,
    hasAccount: false,
  });

  // Charger depuis localStorage au montage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('keiro_generation_limit');
      if (stored) {
        try {
          setState(JSON.parse(stored));
        } catch (e) {
          console.error('Failed to parse generation limit state', e);
        }
      }
    }
  }, []);

  // Sauvegarder dans localStorage à chaque changement
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('keiro_generation_limit', JSON.stringify(state));
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
      localStorage.removeItem('keiro_generation_limit');
    }
  };

  // Déterminer l'action requise
  const getRequiredAction = (): 'generate' | 'email' | 'signup' => {
    if (state.hasAccount) return 'generate'; // Compte créé = illimité (pour freemium)
    if (state.count === 0) return 'generate'; // 1ère génération gratuite
    if (state.count === 1 && !state.email) return 'email'; // 2ème génération = email requis
    if (state.count === 1 && state.email) return 'generate'; // Email fourni = 1 génération de plus
    return 'signup'; // 3ème+ = compte requis
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
    canGenerate: getRequiredAction() === 'generate',
  };
}
