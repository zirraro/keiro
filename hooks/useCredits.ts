'use client';

import { useState, useEffect, useCallback } from 'react';

interface CreditsState {
  balance: number;
  monthlyAllowance: number;
  plan: string | null;
  resetAt: string | null;
  expiresAt: string | null;
  loading: boolean;
}

export function useCredits() {
  const [state, setState] = useState<CreditsState>({
    balance: 0,
    monthlyAllowance: 0,
    plan: null,
    resetAt: null,
    expiresAt: null,
    loading: true,
  });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/credits/balance');
      if (res.ok) {
        const data = await res.json();
        setState({
          balance: data.balance,
          monthlyAllowance: data.monthlyAllowance,
          plan: data.plan,
          resetAt: data.resetAt || null,
          expiresAt: data.expiresAt || null,
          loading: false,
        });
      } else {
        setState(prev => ({ ...prev, loading: false }));
      }
    } catch {
      setState(prev => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    ...state,
    refresh,
  };
}
