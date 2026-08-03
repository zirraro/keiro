'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Démonstration jouée du travail d'un agent, pour un visiteur qui ne s'est pas
 * encore inscrit.
 *
 * Demande du fondateur (2026-08-03) : « est-ce qu'un nouveau prospect va
 * comprendre facilement l'utilité et comment ça fonctionne ? Est-ce qu'on ne
 * mettrait pas en place un mode démo live automatique, genre tooltip, qui
 * simulerait le parcours d'un agent contenu ? »
 *
 * Un tour d'interface existe déjà (SpotlightTour) mais il s'accroche au DOM de
 * l'espace client et ne se déclenche qu'APRÈS l'activation d'un agent. Le
 * visiteur qui hésite ne le voit jamais — c'est précisément le trou.
 *
 * Choix de conception : on ne montre pas des BOUTONS, on montre du TRAVAIL.
 * Expliquer où cliquer ne convainc personne d'acheter ; voir une boulangerie
 * passer d'une photo à un post programmé à la bonne heure, si. Chaque étape
 * dure le temps qu'il faut pour être lue, et le déroulé se répète tant que le
 * visiteur regarde.
 *
 * L'animation est purement locale : aucun appel réseau, aucun coût. C'est une
 * reconstitution fidèle de ce que fait Léna, pas une exécution réelle — et le
 * texte le dit, pour ne pas faire passer une démonstration pour un résultat
 * client.
 */

interface Etape {
  /** Ce que fait l'agent, à la première personne. */
  action: string;
  /** Le détail qui rend l'étape crédible. */
  detail: string;
  /** Durée d'affichage, calée sur la longueur du texte. */
  ms: number;
  icone: string;
}

const ETAPES: Etape[] = [
  {
    icone: '🔎',
    action: 'Je regarde ton commerce',
    detail: 'Boulangerie à Toulouse · pains au levain · 4,6★ sur 312 avis',
    ms: 2600,
  },
  {
    icone: '📅',
    action: 'Je cherche ce qui vaut le coup cette semaine',
    detail: 'Vague de chaleur annoncée jeudi → les clients cherchent du frais et du léger',
    ms: 3200,
  },
  {
    icone: '✍️',
    action: "J'écris le post",
    detail: '« 32° jeudi. On sort les fougasses à l\'huile d\'olive dès 7h — celles qui se mangent sans four. »',
    ms: 3800,
  },
  {
    icone: '🎨',
    action: 'Je produis le visuel',
    detail: 'Photo de tes fougasses, lumière du matin, cadrage vertical — contrôlé avant publication',
    ms: 3200,
  },
  {
    icone: '⏰',
    action: 'Je choisis le moment',
    detail: 'Mercredi 7h42 : c\'est là que TON audience ouvre Instagram, d\'après tes propres chiffres',
    ms: 3200,
  },
  {
    icone: '✅',
    action: 'Je publie, tu ne fais rien',
    detail: 'Sur Instagram et TikTok. Tu reçois juste le résultat — et tu peux tout modifier avant si tu veux',
    ms: 3400,
  },
];

export default function DemoLive() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const conteneur = useRef<HTMLDivElement>(null);
  const [enVue, setEnVue] = useState(false);

  // On ne joue que si le bloc est à l'écran : une animation qui tourne dans le
  // vide consomme de la batterie et fait sauter le défilement sur mobile.
  useEffect(() => {
    const el = conteneur.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setEnVue(true); return; }
    const obs = new IntersectionObserver(([e]) => setEnVue(e.isIntersecting), { threshold: 0.35 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!enVue) return;
    setVisible(true);
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex(i => (i + 1) % ETAPES.length);
        setVisible(true);
      }, 320);
    }, ETAPES[index].ms);
    return () => clearTimeout(t);
  }, [index, enVue]);

  const etape = ETAPES[index];

  return (
    <div ref={conteneur} className="max-w-2xl mx-auto">
      <div className="rounded-2xl border border-white/10 bg-[#0c1a3a] overflow-hidden shadow-2xl">
        {/* Bandeau : on annonce que c'est une démonstration, pas un résultat client */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.04] border-b border-white/10">
          <span className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-400/70" />
          </span>
          <span className="ml-2 text-white/50 text-[11px] font-medium">
            Léna · agent contenu — exemple de déroulé
          </span>
          <span className="ml-auto flex items-center gap-1.5 text-[10px] text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            en cours
          </span>
        </div>

        <div className="p-6 sm:p-8 min-h-[188px] flex flex-col justify-center">
          <div
            className="transition-all duration-300"
            style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(8px)' }}
          >
            <div className="flex items-start gap-4">
              <span className="text-3xl flex-shrink-0 mt-0.5">{etape.icone}</span>
              <div className="min-w-0">
                <p className="text-white font-semibold text-[15px] sm:text-base leading-snug">
                  {etape.action}
                </p>
                <p className="text-white/60 text-[13px] sm:text-sm leading-relaxed mt-1.5">
                  {etape.detail}
                </p>
              </div>
            </div>
          </div>

          {/* Progression : le visiteur voit qu'il y a un début et une fin */}
          <div className="flex gap-1.5 mt-7">
            {ETAPES.map((_, i) => (
              <span
                key={i}
                className="h-1 rounded-full flex-1 transition-all duration-300"
                style={{
                  background: i === index ? '#8b5cf6' : i < index ? 'rgba(139,92,246,.35)' : 'rgba(255,255,255,.1)',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <p className="text-center text-[11px] text-neutral-500 mt-3">
        Déroulé reconstitué à partir du fonctionnement réel de l&apos;agent. Ton commerce,
        tes photos, tes horaires — c&apos;est ce qui change le résultat.
      </p>
    </div>
  );
}
