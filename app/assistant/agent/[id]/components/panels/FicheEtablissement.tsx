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
  /** Vrai quand on ne connaît que le nom : Google n'a pas ouvert la lecture. */
  partielle?: boolean;
  adresse?: string | null;
  categorie?: string | null;
  note?: number | null;
  nombreAvis?: number | null;
  telephone?: string | null;
  site?: string | null;
  horaires?: string[] | null;
  /**
   * D'où vient la fiche affichée.
   *
   * 'places' = lue sur la fiche PUBLIQUE via l'API Places, en attendant que
   * Google ouvre l'accès en écriture au Business Profile. Le commerçant voit
   * son établissement, mais Théo ne peut pas encore répondre ni corriger — et
   * l'interface doit le dire, pas le laisser deviner.
   */
  source?: 'places' | 'business' | null;
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
  fiche, messageBlocage, connecte = false,
}: {
  fiche?: Fiche | null;
  /** Explication traduite, jamais l'erreur brute de Google. */
  messageBlocage?: string | null;
  /** Un compte connecté ne doit JAMAIS voir l'exemple. */
  connecte?: boolean;
}) {
  // Le 6 août, un client connecté voyait « La Table du Marché, 12 rue des
  // Halles, Lyon » à la place de son commerce. L'exemple est là pour montrer
  // le produit à quelqu'un qui n'a rien branché — le montrer à quelqu'un de
  // connecté lui fait croire qu'on a lu la mauvaise fiche.
  const exemple = !connecte && !fiche?.nom;
  /**
   * La fiche lue sur Maps, en attendant l'accès en écriture.
   *
   * Fondateur, 2026-08-15 : « fais bien qu'elle s'affiche dans l'espace Théo,
   * super important ».
   *
   * Tant que Google n'a pas ouvert l'API Business Profile, on ne peut ni
   * répondre aux avis ni corriger les horaires. Mais on peut LIRE la fiche
   * publique — celle que ses clients voient — via l'API Places, qu'on utilise
   * déjà tous les jours. Le commerçant retrouve donc son établissement à
   * l'écran au lieu d'un message d'attente.
   *
   * On le dit clairement plutôt que de laisser croire que tout marche : un
   * affichage qui ment sur ce qui est actif serait pire que le panneau vide.
   */
  const lueSurMaps = (fiche as any)?.source === 'places';

  if (connecte && !fiche?.nom) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 mb-4">
        <h3 className="text-white font-bold text-base mb-1">Ta fiche est connectée</h3>
        <p className="text-white/55 text-[13px] leading-relaxed">
          {messageBlocage
            || "Google n'a pas encore ouvert l'accès à tes données. Théo affichera ta fiche et tes avis dès que ce sera fait, sans rien te demander."}
        </p>
      </div>
    );
  }
  const f = exemple ? FICHE_EXEMPLE : (fiche as Fiche);

  return (
    <div className={`rounded-2xl border p-4 mb-4 ${
      exemple ? 'border-amber-400/25 bg-amber-500/[0.04]' : 'border-white/10 bg-white/[0.03]'
    }`}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-white font-bold text-lg leading-tight">{f.nom}</h3>
            {exemple && (
              <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-300 border border-amber-400/30">
                Exemple
              </span>
            )}
          </div>
          {f.categorie && <p className="text-white/50 text-xs mt-0.5">{Array.isArray(f.categorie) ? (f.categorie as any[])[0] : f.categorie}</p>}
        </div>
        {typeof f.note === 'number' && (
          <div className="text-left sm:text-right flex-shrink-0 flex sm:block items-baseline gap-2">
            <div className="text-white font-bold text-lg leading-none">{f.note.toFixed(1)}</div>
            <Etoiles note={f.note} taille="text-xs" />
            {typeof f.nombreAvis === 'number' && (
              <div className="text-white/40 text-xs sm:mt-0.5">{f.nombreAvis} avis</div>
            )}
          </div>
        )}
      </div>

      {lueSurMaps && (
        <div className="mb-3 rounded-lg border border-sky-400/25 bg-sky-500/[0.06] px-3 py-2">
          <p className="text-sky-200/90 text-[12px] leading-relaxed">
            Voici ta fiche telle que tes clients la voient sur Google Maps.
            Théo la lit déjà — il pourra <strong>répondre à tes avis</strong> et
            <strong> corriger tes infos</strong> dès que Google nous ouvre l'accès en écriture.
            La demande est déposée, tu n'as rien à faire.
          </p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
        {f.adresse && <div className="text-white/70">📍 {f.adresse}</div>}
        {f.telephone && <div className="text-white/70">📞 {f.telephone}</div>}
        {f.site && <div className="text-white/70 truncate">🔗 {f.site}</div>}
      </div>

      {f.horaires?.length ? (
        <div className="mt-3 pt-3 border-t border-white/10">
          <div className="text-white/40 text-xs uppercase tracking-wider font-semibold mb-1.5">Horaires</div>
          {f.horaires.map((h, i) => <div key={i} className="text-white/60 text-[13px]">{h}</div>)}
        </div>
      ) : null}

      {/* La question que se pose le client juste après avoir vu sa fiche. */}
      <div className="mt-3 pt-3 border-t border-white/10">
        <div className="text-white/40 text-xs uppercase tracking-wider font-semibold mb-1.5">
          Ce que Théo tient à jour
        </div>
        <ul className="text-white/60 text-[13px] space-y-1">
          <li>{lueSurMaps ? '· Répondra aux nouveaux avis dès l\'accès accordé' : '· Répond aux nouveaux avis, chaque jour'}</li>
          <li>· Réécrit la description avec les mots que cherchent tes clients</li>
          <li>· Te signale un horaire ou une info qui ne correspond plus</li>
        </ul>
      </div>

      {f.partielle && messageBlocage && (
        <p className="mt-3 pt-3 border-t border-white/10 text-white/50 text-[12px] leading-relaxed">
          {messageBlocage}
        </p>
      )}

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
          <span className="text-xs font-semibold text-amber-300">
            {sansReponse} avis sans réponse
          </span>
        ) : <span />}
        <div className="flex gap-1.5 w-full sm:w-auto sm:ml-auto">
          {([['tous', 'Tout'], ['7j', '7 j'], ['30j', '30 j'], ['90j', '90 j']] as [Periode, string][]).map(([cle, libelle]) => (
            <button
              key={cle}
              onClick={() => setPeriode(cle)}
              className={`flex-1 sm:flex-none min-h-[44px] px-3 rounded-lg text-xs font-semibold transition-colors ${
                periode === cle ? 'bg-white/15 text-white' : 'text-white/45 hover:text-white/70 active:bg-white/10'
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
        className="w-full min-h-[44px] bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2.5 text-base sm:text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/25"
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
