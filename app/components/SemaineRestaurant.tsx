'use client';

import { useState } from 'react';
import { equivalentsPour } from '@/lib/marketing/equivalents-cout';

/**
 * Une semaine, dans le métier du visiteur.
 *
 * Demande du fondateur (2026-08-06) : « il faut que ça tourne avec d'autres
 * types de business — il sélectionne et il voit. »
 *
 * ── Pourquoi une semaine, et pas une liste de fonctionnalités ──
 *
 * Un gérant ne se demande pas si l'outil « génère du contenu multi-plateforme ».
 * Il se demande ce qui se passe le vendredi soir quand il est en coup de feu et
 * qu'un avis 2★ tombe. On lui montre donc sa semaine, pas notre produit :
 * chaque ligne est un moment qu'il reconnaît, et l'agent n'apparaît qu'en
 * second.
 *
 * ── Pourquoi chaque métier a ses propres moments ──
 *
 * Rien n'est recopié d'un métier à l'autre. Un coiffeur ne vit pas le coup de
 * feu du vendredi soir, il vit les créneaux qui sautent ; un garage ne remplit
 * pas une salle, il remplit un pont. Une semaine générique où seul le nom du
 * commerce change se repère immédiatement, et c'est précisément ce qui fait
 * dire « ils ne connaissent pas mon métier ».
 *
 * Sept jours pleins, dimanche compris. Une première version montrait le
 * dimanche « fermé, rien à faire » : le fondateur l'a corrigé le 2026-08-06.
 * Beaucoup de commerces travaillent ce jour-là, et surtout nos agents ne
 * prennent pas de jour de repos — laisser une case vide vendait l'inverse de
 * ce qu'on livre.
 */

interface Moment {
  jour: string;
  heure: string;
  situation: string;
  agent: string;
  action: string;
}

interface Metier {
  cle: string;
  libelle: string;
  emoji: string;
  /** Sert à récupérer l'équivalence de coût propre au métier. */
  typeBusiness: string;
  semaine: Moment[];
}

const METIERS: Metier[] = [
  {
    cle: 'restaurant', libelle: 'Restaurant', emoji: '🍽️', typeBusiness: 'restaurant',
    semaine: [
      { jour: 'Mardi', heure: '07 h',
        situation: "Tu réceptionnes la livraison. Personne n'a rien publié depuis dimanche.",
        agent: 'Léna', action: "Publie le plat du jour en photo, légende écrite, sans que tu ouvres l'application." },
      { jour: 'Mercredi', heure: '12 h 40',
        situation: 'Trois personnes demandent en message privé si tu as de la place ce soir.',
        agent: 'Jade', action: 'Répond aux trois, garde le fil, et te passe celui qui veut réserver pour douze.' },
      { jour: 'Jeudi', heure: '15 h',
        situation: "Un client a laissé 2★ : « bon mais trop d'attente au dessert ».",
        agent: 'Théo', action: 'Te prévient avant de répondre. Tu valides en dix secondes, entre deux services.' },
      { jour: 'Vendredi', heure: '19 h 30',
        situation: 'Coup de feu. Ton téléphone sonne pour une réservation.',
        agent: 'Stella', action: 'A déjà confirmé les quatorze couverts du soir et envoyé les rappels.' },
      { jour: 'Samedi', heure: '23 h',
        situation: 'Service terminé. La salle était pleine, tu ne sais pas trop pourquoi.',
        agent: 'Ami', action: 'Le reel de mardi a fait le double de vues. Elle en reprogramme trois.' },
      { jour: 'Dimanche', heure: '11 h',
        situation: 'Brunch. La salle se remplit sans que tu aies rien annoncé cette semaine.',
        agent: 'Léna', action: "A publié la formule samedi soir, à l'heure où on cherche où bruncher." },
    ],
  },
  {
    cle: 'boulangerie', libelle: 'Boulangerie', emoji: '🥐', typeBusiness: 'boulangerie',
    semaine: [
      { jour: 'Mardi', heure: '06 h',
        situation: 'Tu enfournes. Ta vitrine est belle et seuls les passants la voient.',
        agent: 'Léna', action: 'Publie la fournée du matin. Les habitués la voient avant de sortir de chez eux.' },
      { jour: 'Mercredi', heure: '11 h',
        situation: "Un client demande en message si tu fais les gâteaux d'anniversaire.",
        agent: 'Jade', action: 'Répond, donne les délais, et te transmet la commande à valider.' },
      { jour: 'Jeudi', heure: '16 h',
        situation: 'Un avis dit que tu fermes trop tôt le samedi. Tes horaires ont changé en mars.',
        agent: 'Théo', action: 'Répond, et te signale que ta fiche Google affiche encore les anciens horaires.' },
      { jour: 'Vendredi', heure: '18 h',
        situation: 'Il te reste trois plateaux de viennoiseries.',
        agent: 'Léna', action: 'Publie une story de fin de journée. Ce qui part le soir ne finit pas à la poubelle.' },
      { jour: 'Samedi', heure: '13 h',
        situation: "Grosse matinée. Tu ne sais pas si c'est la météo ou autre chose.",
        agent: 'Ami', action: "Les publications du matin rapportent trois fois plus que celles de l'après-midi." },
      { jour: 'Dimanche', heure: '09 h',
        situation: 'Jour le plus chargé de la semaine. La file est dehors.',
        agent: 'Stella', action: 'A pris les commandes de pain à emporter la veille au soir, prêtes à récupérer.' },
    ],
  },
  {
    cle: 'coiffeur', libelle: 'Coiffeur', emoji: '💇', typeBusiness: 'coiffeur',
    semaine: [
      { jour: 'Mardi', heure: '10 h',
        situation: 'Belle couleur ce matin. La photo restera dans ton téléphone comme les autres.',
        agent: 'Léna', action: 'La publie en avant/après, avec la légende qui va bien. Sans retoucher le visage.' },
      { jour: 'Mercredi', heure: '14 h',
        situation: "Quelqu'un demande en message combien coûte un balayage.",
        agent: 'Jade', action: 'Répond avec ta grille, propose deux créneaux, et te passe la personne.' },
      { jour: 'Jeudi', heure: '17 h',
        situation: 'Deux annulations coup sur coup. Deux créneaux vides demain.',
        agent: 'Stella', action: "Propose les créneaux libérés aux clientes en attente. Un est repris dans l'heure." },
      { jour: 'Vendredi', heure: '11 h',
        situation: "Un avis 3★ : « bon résultat mais j'ai attendu vingt minutes ».",
        agent: 'Théo', action: 'Prépare la réponse. Tu la relis entre deux têtes et elle part.' },
      { jour: 'Samedi', heure: '19 h',
        situation: "Journée pleine. Tu n'as pas eu une minute pour ton compte.",
        agent: 'Ami', action: 'Il a tourné seul : quatre publications, et les avant/après portent le plus.' },
      { jour: 'Dimanche', heure: '20 h',
        situation: 'Tu regardes ton planning de la semaine. Trois trous le mardi.',
        agent: 'Léna', action: 'A déjà programmé une offre mardi matin pour les remplir.' },
    ],
  },
  {
    cle: 'institut', libelle: 'Institut de beauté', emoji: '💅', typeBusiness: 'institut de beaute',
    semaine: [
      { jour: 'Mardi', heure: '09 h',
        situation: 'Cabine libre toute la matinée. Personne ne sait que tu as de la place.',
        agent: 'Léna', action: 'Publie une disponibilité du jour. Les créneaux se remplissent avant midi.' },
      { jour: 'Mercredi', heure: '13 h',
        situation: 'On te demande en message si tu fais le semi-permanent.',
        agent: 'Jade', action: 'Répond, envoie la durée et le tarif, et te transmet la demande de rendez-vous.' },
      { jour: 'Jeudi', heure: '18 h',
        situation: "Une cliente n'est pas venue. Encore.",
        agent: 'Stella', action: 'Envoie les rappels la veille depuis trois semaines : les oublis ont baissé.' },
      { jour: 'Vendredi', heure: '15 h',
        situation: "Nouvel avis 5★ très détaillé. Tu voudrais remercier, tu n'y penseras pas.",
        agent: 'Théo', action: 'A répondu le jour même, avec une réponse qui ne ressemble pas à un modèle.' },
      { jour: 'Samedi', heure: '20 h',
        situation: 'Semaine bien remplie. Tu ne sais pas ce qui a marché.',
        agent: 'Ami', action: 'Les soins visage attirent, les ongles convertissent. Elle rééquilibre les publications.' },
      { jour: 'Dimanche', heure: '10 h',
        situation: 'Fermé, mais les gens réservent quand même le week-end.',
        agent: 'Jade', action: "Répond aux messages du dimanche : ils ne t'attendent pas jusqu'à mardi." },
    ],
  },
  {
    cle: 'garage', libelle: 'Garage', emoji: '🔧', typeBusiness: 'garage',
    semaine: [
      { jour: 'Lundi', heure: '08 h',
        situation: 'Un pont libre et deux devis sans réponse depuis la semaine dernière.',
        agent: 'Hugo', action: 'Les a relancés vendredi. Un client rappelle ce matin pour confirmer.' },
      { jour: 'Mardi', heure: '11 h',
        situation: 'On te demande sur Google si tu fais le contrôle avant vente.',
        agent: 'Théo', action: 'Répond, et a ajouté la prestation à ta fiche pour que la question ne revienne pas.' },
      { jour: 'Mercredi', heure: '16 h',
        situation: 'Réparation propre sur un moteur bien abîmé. Personne ne le saura.',
        agent: 'Léna', action: "Publie l'avant/après. C'est ce qui rassure quelqu'un qui cherche un garage." },
      { jour: 'Jeudi', heure: '09 h',
        situation: 'Un client mécontent laisse 2★ sur le délai.',
        agent: 'Théo', action: 'Te prévient avant de répondre : au-dessous de 3★, tu valides toujours toi-même.' },
      { jour: 'Vendredi', heure: '17 h',
        situation: 'Semaine chargée. Le planning de la semaine prochaine est à moitié vide.',
        agent: 'Léo', action: "A trouvé douze flottes d'entreprise dans ta zone et préparé l'approche." },
      { jour: 'Samedi', heure: '12 h',
        situation: 'Demi-journée. Deux personnes passent sans rendez-vous.',
        agent: 'Ami', action: 'Le samedi matin amène le plus de passage : elle y concentre les publications.' },
    ],
  },
  {
    cle: 'fleuriste', libelle: 'Fleuriste', emoji: '💐', typeBusiness: 'fleuriste',
    semaine: [
      { jour: 'Mardi', heure: '08 h',
        situation: "Arrivage. Les fleurs sont belles aujourd'hui et fanées dans six jours.",
        agent: 'Léna', action: 'Publie l\'arrivage le matin même. Ce qui se voit tôt se vend avant de faner.' },
      { jour: 'Mercredi', heure: '15 h',
        situation: 'Un message pour un deuil, à livrer demain.',
        agent: 'Jade', action: "Répond avec le tact qu'il faut et te transmet immédiatement." },
      { jour: 'Jeudi', heure: '10 h',
        situation: 'Une entreprise du quartier cherche un abonnement floral. Tu ne le sais pas.',
        agent: 'Léo', action: "L'a repérée et ajoutée à ton CRM, avec le bon interlocuteur." },
      { jour: 'Vendredi', heure: '18 h',
        situation: 'Composition de mariage terminée. La plus belle du mois.',
        agent: 'Léna', action: 'La publie samedi matin, quand les futurs mariés cherchent leur fleuriste.' },
      { jour: 'Samedi', heure: '19 h',
        situation: 'Il reste du stock qui ne passera pas le week-end.',
        agent: 'Ami', action: 'Programme une offre du dimanche : ce qui partait à la poubelle part en bouquet.' },
      { jour: 'Dimanche', heure: '11 h',
        situation: 'Fête des mères dans trois semaines. Tu y penseras trop tard.',
        agent: 'Léna', action: 'A déjà calé quatre publications sur la période, espacées, chacune sous un angle neuf.' },
    ],
  },
];

export default function SemaineRestaurant() {
  const [actif, setActif] = useState(0);
  const metier = METIERS[actif];
  const equivalent = equivalentsPour(metier.typeBusiness)[0];

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
      <div className="text-center mb-6 sm:mb-8">
        <span className="inline-block mb-3 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-bold">
          POUR TON COMMERCE
        </span>
        <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-neutral-900">
          Une semaine, vue de ton comptoir
        </h2>
        <p className="mt-3 text-neutral-500 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto">
          Choisis ton métier. Pas une liste de fonctionnalités — ce qui se passe
          vraiment pendant que tu travailles, sept jours sur sept.
        </p>
      </div>

      {/* Sélecteur : bande qui glisse au doigt sur mobile, cibles à 44 px. */}
      <div
        role="tablist"
        aria-label="Choisis ton métier"
        className="-mx-4 sm:mx-0 px-4 sm:px-0 flex gap-2 overflow-x-auto pb-3 justify-start sm:justify-center [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {METIERS.map((m, i) => (
          <button
            key={m.cle}
            role="tab"
            aria-selected={i === actif}
            onClick={() => setActif(i)}
            className={`shrink-0 min-h-[44px] inline-flex items-center gap-1.5 px-4 rounded-full border text-sm font-semibold transition-colors ${
              i === actif
                ? 'bg-neutral-900 border-neutral-900 text-white'
                : 'bg-white border-neutral-200 text-neutral-600 hover:border-neutral-300 active:bg-neutral-50'
            }`}
          >
            <span aria-hidden>{m.emoji}</span>
            {m.libelle}
          </button>
        ))}
      </div>

      {/* La clé force le remontage : la bande revient au premier jour quand on
          change de métier, au lieu de rester au milieu de la semaine précédente. */}
      <div
        key={metier.cle}
        className="-mx-4 sm:mx-0 px-4 sm:px-0 mt-4 flex lg:grid lg:grid-cols-3 gap-3 overflow-x-auto lg:overflow-visible snap-x snap-mandatory lg:snap-none pb-4 lg:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {metier.semaine.map(m => (
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
        {/* L'équivalence de coût suit le métier choisi : elle vient du même
            barème que la page tarifs, jamais d'un chiffre recopié ici. */}
        <p className="text-neutral-500 text-sm mb-4">{equivalent.phrase}</p>
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
