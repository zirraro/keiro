'use client';

import { useState, useMemo } from 'react';

/**
 * La fiche Google du commerce, telle que Théo la voit et l'entretient.
 *
 * Demande du fondateur (2026-08-06) : « je me connecte et je vois toujours pas
 * la fiche établissement, toujours le bouton voir ma fiche Google qui sert à
 * rien, et on voit pas des sample data de comment ça fonctionne. Il faut une
 * section commentaires avec filtre de temps ou de recherche. »
 *
 * ── Pourquoi des données d'exemple ──
 *
 * Le fondateur démontre le produit au comptoir. Un panneau vide ne démontre
 * rien, et « connectez-vous pour voir » demande au prospect de faire confiance
 * avant d'avoir vu. On montre donc toujours quelque chose — l'exemple est
 * signalé sans ambiguïté, ce qui vaut mieux qu'un écran vide et mieux qu'un
 * faux qu'on laisserait passer pour vrai.
 *
 * ── Ce que ce fichier ne fait pas ──
 *
 * Il ne rend pas les avis eux-mêmes : le panneau a déjà des cartes qui savent
 * générer une réponse et la publier sur Google. On fournit la fiche et les
 * filtres, le panneau garde ses cartes.
 */

export interface Fiche {
  nom: string;
  adresse?: string | null;
  categorie?: string | null;
  note?: number | null;
  nombreAvis?: number | null;
  telephone?: string | null;
  site?: string | null;
  horaires?: string[] | null;
}

/** Exemple réaliste, montré tant que la fiche réelle n'est pas lisible. */
export const FICHE_EXEMPLE: Fiche = {
  nom: 'La Table du Marché',
  adresse: '12 rue des Halles, 69002 Lyon',
  categorie: 'Restaurant français',
  note: 4.6,
  nombreAvis: 187,
  telephone: '04 78 XX XX XX',
  site: 'latabledumarche.fr',
  horaires: ['Lun–Ven : 12h–14h30, 19h–22h30', 'Sam : 19h–23h', 'Dim : fermé'],
};

export type Periode = 'tous' | '7j' | '30j' | '90j';

/**
 * Convertit une date d'avis en nombre de jours, pour filtrer.
 *
 * Accepte l'ISO renvoyé par Google comme le « il y a 6 jours » des exemples :
 * les deux cohabitent à l'écran selon que le quota est accordé ou non.
 */
export function joursDepuis(date: string | null | undefined): number {
  if (!date) return 0;
  const t = String(date).toLowerCase();
  if (t.includes('il y a') || /^\s*\d+\s*(jour|semaine|mois|an)/.test(t)) {
    const n = parseInt(t.replace(/\D+/, ''), 10) || 0;
    if (t.includes('jour')) return n;
    if (t.includes('semaine')) return n * 7;
    if (t.includes('mois')) return n * 30;
    if (t.includes('an')) return n * 365;
  }
  const d = new Date(date).getTime();
  return Number.isFinite(d) ? Math.max(0, Math.floor((Date.now() - d) / 86400000)) : 0;
}

/** Applique période + recherche à une liste d'avis, quelle que soit sa forme. */
export function filtrerAvis<T extends Record<string, any>>(
  avis: T[], periode: Periode, recherche: string,
): T[] {
  const seuil = periode === '7j' ? 7 : periode === '30j' ? 30 : periode === '90j' ? 90 : Infinity;
  const q = recherche.trim().toLowerCase();
  return avis.filter(a => {
    if (joursDepuis(a.date) > seuil) return false;
    if (!q) return true;
    return `${a.author || ''} ${a.text || ''} ${a.replyText || ''}`.toLowerCase().includes(q);
  });
}

function Etoiles({ note, taille = 'text-sm' }: { note: number; taille?: string }) {
  const pleines = Math.round(note);
  return (
    <span className={`${taille} tracking-tight`} aria-label={`${note} sur 5`}>
      <span className="text-amber-400">{'★'.repeat(pleines)}</span>
      <span className="text-white/20">{'★'.repeat(Math.max(0, 5 - pleines))}</span>
    </span>
  );
}

/** La carte de la fiche : ce que Google affiche, et ce que Théo y entretient. */
export function CarteFiche({
  fiche, messageBlocage,
}: {
  fiche?: Fiche | null;
  /** Ce que Google a répondu quand la fiche n'a pas pu être lue. */
  messageBlocage?: string | null;
}) {
  const exemple = !fiche?.nom;
  const f = exemple ? FICHE_EXEMPLE : (fiche as Fiche);

  return (
    <div className={`rounded-2xl border p-4 mb-4 ${
      exemple ? 'border-amber-400/25 bg-amber-500/[0.04]' : 'border-white/10 bg-white/[0.03]'
    }`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-white font-bold text-lg leading-tight">{f.nom}</h3>
            {exemple && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-300 border border-amber-400/30">
                Exemple
              </span>
            )}
          </div>
          {f.categorie && <p className="text-white/50 text-xs mt-0.5">{f.categorie}</p>}
        </div>
        {typeof f.note === 'number' && (
          <div className="text-right flex-shrink-0">
            <div className="text-white font-bold text-lg leading-none">{f.note.toFixed(1)}</div>
            <Etoiles note={f.note} taille="text-xs" />
            {typeof f.nombreAvis === 'number' && (
              <div className="text-white/40 text-[11px] mt-0.5">{f.nombreAvis} avis</div>
            )}
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
        {f.adresse && <div className="text-white/70">📍 {f.adresse}</div>}
        {f.telephone && <div className="text-white/70">📞 {f.telephone}</div>}
        {f.site && <div className="text-white/70 truncate">🔗 {f.site}</div>}
      </div>

      {f.horaires?.length ? (
        <div className="mt-3 pt-3 border-t border-white/10">
          <div className="text-white/40 text-[11px] uppercase tracking-wider font-semibold mb-1.5">Horaires</div>
          {f.horaires.map((h, i) => <div key={i} className="text-white/60 text-[13px]">{h}</div>)}
        </div>
      ) : null}

      {/* La question que se pose le client juste après avoir vu sa fiche. */}
      <div className="mt-3 pt-3 border-t border-white/10">
        <div className="text-white/40 text-[11px] uppercase tracking-wider font-semibold mb-1.5">
          Ce que Théo tient à jour
        </div>
        <ul className="text-white/60 text-[13px] space-y-1">
          <li>· Répond aux nouveaux avis, chaque jour</li>
          <li>· Réécrit la description avec les mots que cherchent tes clients</li>
          <li>· Te signale un horaire ou une info qui ne correspond plus</li>
        </ul>
      </div>

      {exemple && (
        <p className="mt-3 pt-3 border-t border-white/10 text-amber-100/70 text-[12px] leading-relaxed">
          {messageBlocage
            || "Voici à quoi ressemblera ton panneau. Connecte ta fiche Google Business et Théo la remplacera par la tienne."}
        </p>
      )}
    </div>
  );
}

/** Filtre de période + recherche. Rendu contrôlé : le panneau garde ses cartes. */
export function FiltresAvis({
  periode, setPeriode, recherche, setRecherche, sansReponse,
}: {
  periode: Periode;
  setPeriode: (p: Periode) => void;
  recherche: string;
  setRecherche: (r: string) => void;
  sansReponse?: number;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        {sansReponse ? (
          <span className="text-[11px] font-semibold text-amber-300">
            {sansReponse} avis sans réponse
          </span>
        ) : <span />}
        <div className="flex gap-1 ml-auto">
          {([['tous', 'Tout'], ['7j', '7 j'], ['30j', '30 j'], ['90j', '90 j']] as [Periode, string][]).map(([cle, libelle]) => (
            <button
              key={cle}
              onClick={() => setPeriode(cle)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                periode === cle ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70'
              }`}
            >
              {libelle}
            </button>
          ))}
        </div>
      </div>
      <input
        type="search"
        value={recherche}
        onChange={e => setRecherche(e.target.value)}
        placeholder="Rechercher dans les avis — un mot, un nom…"
        className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/25"
      />
    </div>
  );
}

/** Regroupe l'état des filtres, pour que le panneau n'ait qu'un hook à appeler. */
export function useFiltresAvis<T extends Record<string, any>>(avis: T[]) {
  const [periode, setPeriode] = useState<Periode>('tous');
  const [recherche, setRecherche] = useState('');
  const avisFiltres = useMemo(() => filtrerAvis(avis, periode, recherche), [avis, periode, recherche]);
  return { periode, setPeriode, recherche, setRecherche, avisFiltres };
}
