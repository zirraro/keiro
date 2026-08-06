'use client';

/**
 * Une semaine chez un restaurateur.
 *
 * Demande du fondateur : « je veux que tu ajoutes du contenu qui parle à un
 * restaurateur » — le métier qu'il démarche en priorité.
 *
 * ── Pourquoi une semaine, et pas une liste de fonctionnalités ──
 *
 * Un gérant de restaurant ne se demande pas si l'outil « génère du contenu
 * multi-plateforme ». Il se demande ce qui se passe le vendredi soir quand il
 * est en coup de feu et qu'un avis 2★ tombe. On lui montre donc sa semaine,
 * pas notre produit : chaque ligne est un moment qu'il reconnaît, et l'agent
 * n'apparaît qu'en second.
 *
 * ── Défilement horizontal ──
 *
 * Le fondateur a demandé que ça défile plutôt que d'empiler un mur de texte.
 * Sur mobile la bande glisse au doigt, avec calage sur chaque carte ; à partir
 * de 1024 px tout tient en grille et le défilement disparaît.
 */

interface Moment {
  jour: string;
  heure: string;
  situation: string;
  agent: string;
  action: string;
}

const SEMAINE: Moment[] = [
  {
    jour: 'Mardi', heure: '07 h',
    situation: "Tu réceptionnes la livraison. Personne n'a rien publié depuis dimanche.",
    agent: 'Léna',
    action: "Publie le plat du jour en photo, légende écrite, sans que tu ouvres l'application.",
  },
  {
    jour: 'Mercredi', heure: '12 h 40',
    situation: 'Trois personnes demandent en message privé si tu as de la place ce soir.',
    agent: 'Jade',
    action: "Répond aux trois, garde le fil, et te passe celui qui veut réserver pour douze.",
  },
  {
    jour: 'Jeudi', heure: '15 h',
    situation: "Un client a laissé 2★ : « bon mais trop d'attente au dessert ».",
    agent: 'Théo',
    action: "Te prévient avant de répondre. Tu valides la réponse en dix secondes, entre deux services.",
  },
  {
    jour: 'Vendredi', heure: '19 h 30',
    situation: 'Coup de feu. Ton téléphone sonne pour une réservation.',
    agent: 'Stella',
    action: 'A déjà confirmé les quatorze couverts du soir sur WhatsApp et envoyé les rappels.',
  },
  {
    jour: 'Samedi', heure: '23 h',
    situation: 'Service terminé. La salle était pleine, tu ne sais pas trop pourquoi.',
    agent: 'Ami',
    action: "Te le dit dimanche : le reel de mardi a fait le double de vues. Elle en reprogramme trois.",
  },
  {
    jour: 'Dimanche', heure: 'fermé',
    situation: "Ton jour off. Tu ne veux pas penser au restaurant.",
    agent: 'Personne',
    action: "Rien ne t'attend lundi : la semaine est déjà programmée.",
  },
];

export default function SemaineRestaurant() {
  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
      <div className="text-center mb-8 sm:mb-10">
        <span className="inline-block mb-3 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-bold">
          POUR LES RESTAURANTS
        </span>
        <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-neutral-900">
          Une semaine, vue de ta cuisine
        </h2>
        <p className="mt-3 text-neutral-500 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto">
          Pas une liste de fonctionnalités. Ce qui se passe vraiment pendant que tu
          es en salle.
        </p>
      </div>

      {/* Bande qui glisse au doigt sur mobile, grille au-delà de 1024 px. */}
      <div className="-mx-4 sm:mx-0 px-4 sm:px-0 flex lg:grid lg:grid-cols-3 gap-3 overflow-x-auto lg:overflow-visible snap-x snap-mandatory lg:snap-none pb-4 lg:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SEMAINE.map(m => (
          <article
            key={m.jour}
            className="snap-start shrink-0 w-[78vw] sm:w-[46vw] lg:w-auto rounded-2xl border border-neutral-200 bg-white p-5 flex flex-col"
          >
            <div className="flex items-baseline gap-2 mb-3">
              <span className="font-bold text-neutral-900">{m.jour}</span>
              <span className="text-neutral-400 text-xs">{m.heure}</span>
            </div>

            <p className="text-neutral-600 text-sm leading-relaxed flex-1">{m.situation}</p>

            <div className="mt-4 pt-4 border-t border-neutral-100">
              <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
                {m.agent}
              </span>
              <p className="text-neutral-800 text-sm leading-relaxed font-medium">{m.action}</p>
            </div>
          </article>
        ))}
      </div>

      <p className="mt-2 text-center text-neutral-400 text-xs lg:hidden">
        Fais glisser pour voir la semaine →
      </p>

      <div className="mt-8 sm:mt-10 text-center">
        <p className="text-neutral-500 text-sm mb-4">
          Moins qu&apos;un seul service d&apos;extra le samedi soir.
        </p>
        <a
          href="/essai?plan=createur"
          className="inline-flex items-center justify-center min-h-[52px] px-7 rounded-xl bg-neutral-900 text-white font-semibold hover:opacity-90 active:opacity-80 transition-opacity"
        >
          Essayer 7 jours gratuitement
        </a>
      </div>
    </section>
  );
}
