'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';

type GenerationLimits = {
  imageGenerations: number;
  videoGenerations: number;
  edits: number;
  hasProvidedEmail: boolean;
  email: string | null;
  hasPaidPlan: boolean;
};

type GenerationContextType = {
  limits: GenerationLimits;
  canGenerate: (type: 'image' | 'video' | 'edit') => boolean;
  incrementGeneration: (type: 'image' | 'video' | 'edit') => void;
  setEmail: (email: string) => void;
  needsEmail: () => boolean;
  needsPaidPlan: () => boolean;
  getRemainingGenerations: () => number;
};

const GenerationContext = createContext<GenerationContextType | undefined>(undefined);

// Limites pour utilisateurs gratuits
const FREE_LIMIT = 1;
const EMAIL_BONUS = 2; // +2 générations après email = 3 total
const TOTAL_FREE_LIMIT = FREE_LIMIT + EMAIL_BONUS;

export function GenerationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [limits, setLimits] = useState<GenerationLimits>({
    imageGenerations: 0,
    videoGenerations: 0,
    edits: 0,
    hasProvidedEmail: false,
    email: null,
    hasPaidPlan: false,
  });

  // Charger les limites depuis localStorage au démarrage
  useEffect(() => {
    if (!user) {
      // Visiteur: charger depuis localStorage
      const stored = localStorage.getItem('keiro_generation_limits');
      if (stored) {
        try {
          setLimits(JSON.parse(stored));
        } catch (e) {
          console.error('Error parsing limits:', e);
        }
      }
    } else {
      // Utilisateur connecté: TODO - charger depuis DB
      // Pour l'instant, réinitialiser les compteurs pour les utilisateurs connectés
      setLimits({
        imageGenerations: 0,
        videoGenerations: 0,
        edits: 0,
        hasProvidedEmail: true,
        email: user.email,
        hasPaidPlan: false, // TODO: vérifier depuis DB
      });
    }
  }, [user]);

  // Sauvegarder dans localStorage à chaque changement (pour visiteurs)
  useEffect(() => {
    if (!user) {
      localStorage.setItem('keiro_generation_limits', JSON.stringify(limits));
    }
  }, [limits, user]);

  const getTotalGenerations = () => {
    return limits.imageGenerations + limits.videoGenerations + limits.edits;
  };

  const needsEmail = () => {
    return getTotalGenerations() >= FREE_LIMIT && !limits.hasProvidedEmail;
  };

  const needsPaidPlan = () => {
    if (limits.hasPaidPlan) return false;
    return getTotalGenerations() >= TOTAL_FREE_LIMIT;
  };

  const canGenerate = (type: 'image' | 'video' | 'edit') => {
    // Si plan payant, pas de limite
    if (limits.hasPaidPlan) return true;

    const total = getTotalGenerations();

    // Première génération gratuite
    if (total < FREE_LIMIT) return true;

    // Après première génération, email requis
    if (!limits.hasProvidedEmail) return false;

    // Avec email, jusqu'à 3 générations
    return total < TOTAL_FREE_LIMIT;
  };

  const incrementGeneration = (type: 'image' | 'video' | 'edit') => {
    setLimits(prev => ({
      ...prev,
      imageGenerations: type === 'image' ? prev.imageGenerations + 1 : prev.imageGenerations,
      videoGenerations: type === 'video' ? prev.videoGenerations + 1 : prev.videoGenerations,
      edits: type === 'edit' ? prev.edits + 1 : prev.edits,
    }));
  };

  const setEmail = (email: string) => {
    setLimits(prev => ({
      ...prev,
      hasProvidedEmail: true,
      email,
    }));
  };

  const getRemainingGenerations = () => {
    if (limits.hasPaidPlan) return Infinity;

    const total = getTotalGenerations();
    const maxAllowed = limits.hasProvidedEmail ? TOTAL_FREE_LIMIT : FREE_LIMIT;
    return Math.max(0, maxAllowed - total);
  };

  return (
    <GenerationContext.Provider
      value={{
        limits,
        canGenerate,
        incrementGeneration,
        setEmail,
        needsEmail,
        needsPaidPlan,
        getRemainingGenerations,
      }}
    >
      {children}
    </GenerationContext.Provider>
  );
}

export function useGeneration() {
  const context = useContext(GenerationContext);
  if (context === undefined) {
    throw new Error('useGeneration must be used within a GenerationProvider');
  }
  return context;
}
