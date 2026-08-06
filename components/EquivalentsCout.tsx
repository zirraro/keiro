'use client';

import { useState, useEffect } from 'react';
import { equivalentsVitrine } from '@/lib/marketing/equivalents-cout';

/**
 * Ce que ça coûte, dit dans les termes du commerçant.
 *
 * Remplace « −95 %, 2 350 € à 4 850 € économisés ». Un patron de restaurant n'a
 * jamais envisagé de payer 3 000 € par mois un community manager : ce chiffre
 * ne lui parle pas d'économie, il lui signale qu'on s'adresse à quelqu'un
 * d'autre. Une économie ne se comprend que par rapport à une dépense qu'on fait
 * déjà.
 *
 * ── Pourquoi ça défile ──
 *
 * Seize métiers affichés d'un coup formeraient un mur qu'on ne lit pas. Un
 * seul, choisi par nous, laisserait tous les autres se dire « ce n'est pas pour
 * moi ». Le défilé résout les deux : chacun finit par voir le sien passer, et
 * l'attente crée une petite curiosité — on regarde le suivant.
 *
 * Le rythme est lent (3,5 s) : assez pour lire à voix haute, assez lent pour ne
 * pas donner l'impression d'un bandeau publicitaire.
 */
export default function EquivalentsCout({ locale = 'fr' }: { locale?: string }) {
  const exemples = equivalentsVitrine();
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Respecte le réglage système : une animation qui tourne en boucle est
    // pénible pour qui a demandé à les réduire.
    const reduit = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduit || exemples.length < 2) return;

    const minuteur = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex(i => (i + 1) % exemples.length);
        setVisible(true);
      }, 320);
    }, 3500);
    return () => clearInterval(minuteur);
  }, [exemples.length]);

  if (!exemples.length) return null;
  const courant = exemples[index];
  const en = locale === 'en';

  return (
    <div className="mx-auto max-w-xl">
      <p className="text-center text-white/50 text-sm mb-3">
        {en ? 'What it actually costs, in your terms' : 'Ce que ça représente vraiment, chez vous'}
      </p>

      <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-6 text-center">
        {/* Hauteur fixe : sans elle, la carte saute à chaque changement de
            phrase et l'œil perd le fil. */}
        <div
          className={`min-h-[4.5rem] flex flex-col justify-center transition-opacity duration-300 ${
            visible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5eead4] mb-2">
            {courant.metier}
          </div>
          <p className="text-white text-lg sm:text-xl font-semibold leading-snug text-balance">
            {courant.equivalent.phrase}
          </p>
        </div>

        {/* Points de progression : ils disent qu'il y a d'autres métiers, sans
            les lister. */}
        <div className="flex justify-center gap-1.5 mt-5" aria-hidden="true">
          {exemples.map((_, i) => (
            <span
              key={i}
              className={`h-1 rounded-full transition-all duration-300 ${
                i === index ? 'w-5 bg-[#5eead4]' : 'w-1 bg-white/20'
              }`}
            />
          ))}
        </div>
      </div>

      <p className="text-center text-white/35 text-xs mt-3">
        {en
          ? 'Cancel anytime, no commitment.'
          : 'Sans engagement, résiliable à tout moment.'}
      </p>
    </div>
  );
}
