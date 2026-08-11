'use client';

import { useEffect } from 'react';

/**
 * Retient le code d'un apporteur d'affaires jusqu'à la création du compte.
 *
 * ── Pourquoi ça ne peut pas être plus simple ──
 *
 * L'apporteur diffuse un lien `keiroai.com/?ref=SONCODE`. Le prospect arrive,
 * lit, essaie le générateur gratuit, part, revient deux jours plus tard par
 * une recherche Google, et crée son compte. Le paramètre a disparu depuis
 * longtemps : sans mémoire, l'apporteur n'est jamais payé et le programme
 * perd toute crédibilité dès le premier litige.
 *
 * On garde donc le code quatre-vingt-dix jours — la durée d'un cycle de
 * décision pour un commerçant, mesurée large.
 *
 * ── Pourquoi le PREMIER code gagne ──
 *
 * Si un visiteur passe par deux liens, on garde le premier. C'est celui qui
 * l'a fait découvrir KeiroAI ; le second n'aurait fait que capter un prospect
 * déjà acquis. Le contraire encouragerait à arroser des audiences déjà
 * travaillées par d'autres.
 */

const CLE = 'keiro_parrainage';
const VALIDITE_MS = 90 * 24 * 60 * 60 * 1000;

export default function ParrainageCapture() {
  useEffect(() => {
    try {
      const code = new URLSearchParams(window.location.search).get('ref');
      if (!code) return;

      const existant = localStorage.getItem(CLE);
      if (existant) {
        const { expire } = JSON.parse(existant);
        if (expire > Date.now()) return;   // premier arrivé, premier servi
      }

      localStorage.setItem(CLE, JSON.stringify({
        code: code.trim().toUpperCase().slice(0, 32),
        expire: Date.now() + VALIDITE_MS,
      }));
    } catch { /* navigation privée ou stockage plein : on n'insiste pas */ }
  }, []);

  return null;
}

/** Le code retenu, ou null. Appelé au moment de créer le compte. */
export function codeParrainageRetenu(): string | null {
  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) return null;
    const { code, expire } = JSON.parse(brut);
    if (!code || expire <= Date.now()) { localStorage.removeItem(CLE); return null; }
    return code;
  } catch { return null; }
}

/**
 * Rattache le nouveau compte à son apporteur.
 *
 * Ne lève jamais : une inscription ne doit pas échouer parce que le programme
 * d'apport a un souci. Au pire l'apporteur est réclamé à la main.
 */
export async function rattacherParrainage(userId: string): Promise<void> {
  const code = codeParrainageRetenu();
  if (!code || !userId) return;
  try {
    const r = await fetch('/api/apporteurs/attribution', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, userId }),
    });
    if (r.ok) localStorage.removeItem(CLE);
  } catch { /* réessayé au prochain passage tant que le code est en mémoire */ }
}
