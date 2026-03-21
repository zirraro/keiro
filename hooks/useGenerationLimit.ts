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

  // Nouveau flow : 1ère gen gratuite sans compte, puis popup conversion
  const getRequiredAction = (): 'generate' | 'conversion_popup' | 'signup' => {
    if (state.hasAccount) return 'generate'; // Compte créé = utilise ses crédits
    if (state.count === 0) return 'generate'; // 1ère génération gratuite
    return 'conversion_popup'; // 2ème+ = popup de conversion (visuel généré mais bloqué)
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
