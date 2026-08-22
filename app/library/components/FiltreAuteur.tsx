'use client';

/**
 * Qui a fait quoi — le filtre et le badge, partagés par tous les onglets.
 *
 * ── La révision du fondateur, et pourquoi elle est meilleure ──
 *
 * J'avais construit un onglet « Publications » séparé pour le travail des
 * agents. Le fondateur, 19 août : « je voyais le travail de Léna se mélanger
 * avec celui du client, avec une possibilité de filtre dans chaque onglet, et
 * surtout bien la mention "fait par Léna" sur chaque post préparé ou publié. »
 *
 * Il a raison, et ma version était moins bonne pour une raison précise : un
 * onglet séparé range le travail des agents à côté du reste, alors qu'il EST
 * le reste. Un commerçant ouvre sa galerie pour voir ses contenus — pas pour
 * choisir entre « les miens » et « ceux de l'équipe ». La bibliothèque est
 * commune ; l'auteur est une propriété de chaque pièce, pas une porte.
 *
 * D'où ces deux éléments plutôt qu'un dixième onglet : un filtre qu'on pose
 * dans n'importe quel onglet, et un badge qui voyage avec la vignette.
 *
 * ── Pourquoi le badge compte plus que le filtre ──
 *
 * Le filtre sert quand on cherche. Le badge sert TOUT LE TEMPS : c'est lui qui
 * rend visible, à chaque coup d'œil, ce que l'équipe a produit pendant que le
 * client servait ses clients. Sans lui, le travail des agents se dissout dans
 * la masse et le client ne voit plus ce qu'il paie.
 */

export type Auteur = 'tous' | 'agents' | 'moi';

const OPTIONS: { cle: Auteur; libelle: string }[] = [
  { cle: 'tous', libelle: 'Tout' },
  { cle: 'agents', libelle: 'Par mes agents' },
  { cle: 'moi', libelle: 'Par moi' },
];

export function FiltreAuteur({ valeur, onChange }: { valeur: Auteur; onChange: (a: Auteur) => void }) {
  return (
    <div className="flex gap-1.5 mb-4 overflow-x-auto -mx-1 px-1 pb-0.5">
      {OPTIONS.map((o) => {
        const actif = valeur === o.cle;
        return (
          <button
            key={o.cle}
            onClick={() => onChange(o.cle)}
            className={`flex-shrink-0 px-3.5 py-2 rounded-full text-xs font-medium transition-all min-h-[36px] ${
              actif
                ? 'bg-[#0c1a3a] text-white'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
            }`}
          >
            {o.libelle}
          </button>
        );
      })}
    </div>
  );
}

/**
 * La mention d'auteur posée sur une vignette.
 *
 * Discrète mais lisible : elle informe sans voler la vedette au visuel. Le
 * violet la distingue des badges d'état (vert publié, bleu programmé) — deux
 * informations différentes ne doivent pas se ressembler, sinon on ne lit plus
 * ni l'une ni l'autre.
 */
export function BadgeAuteur({ auteur, compact = false }: { auteur: string; compact?: boolean }) {
  const parMoi = auteur === 'Vous' || auteur === 'moi';
  return (
    <span
      title={parMoi ? 'Créé par vous' : `Préparé par ${auteur}`}
      className={`inline-flex items-center gap-1 rounded font-semibold ${compact ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-0.5 text-xs'} ${
        parMoi
          ? 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
          : 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
      }`}
    >
      {parMoi ? 'Vous' : `par ${auteur}`}
    </span>
  );
}
