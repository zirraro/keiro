/**
 * Application du barème — la logique, séparée des valeurs.
 *
 * Le barème vit dans `scoring-config.ts` et se modifie sans toucher ici. Ce
 * module se contente de constater des faits et d'additionner : c'est ce qui
 * rend la recalibration triviale, comme demandé.
 *
 * ── Ce que produit `score_details` ──
 *
 * Le détail de chaque règle appliquée, avec ses points et son hypothèse. On
 * pourra donc, dans trois mois, croiser « quelles règles étaient actives » avec
 * « le prospect a-t-il signé » SANS rejouer le calcul sur des données qui,
 * elles, auront changé. C'est ce qui permet de jeter les signaux qui ne
 * prédisent rien plutôt que de les garder par habitude.
 */
import { BAREME, BAREME_VISION, ELIMINATOIRES, SEUILS, classeDepuisScore, type RegleScore } from './scoring-config';

export interface FaitsProspect {
  businessStatus?: string | null;
  /** Nombre d'occurrences du même nom dans le lot du client. */
  occurrencesNom?: number;
  derniereAvisLe?: string | null;
  nombreAvis?: number | null;
  note?: number | null;
  site?: string | null;
  igStatut?: string | null;
  igFollowers?: number | null;
  igMediaCount?: number | null;
  igJoursDepuisPost?: number | null;
  /** Verdict d'analyse visuelle, uniquement si activée. */
  vision?: { agence_probable?: boolean; qualite_visuelle?: string } | null;
}

export interface ResultatScore {
  score: number;
  classe: 'A' | 'B' | 'C';
  elimine: boolean;
  details: {
    elimine_par?: { cle: string; hypothese: string };
    regles: Array<{ cle: string; points: number; hypothese: string }>;
    calcule_le: string;
    version_bareme: string;
  };
}

/**
 * Version du barème, stockée avec chaque score.
 *
 * Sans elle, une recalibration rendrait incomparables les scores d'avant et
 * d'après, et la boucle d'apprentissage mélangerait deux systèmes de notation
 * sans s'en apercevoir. À incrémenter à chaque modification des valeurs.
 */
export const VERSION_BAREME = '2026-08-05.1';

function jours(depuis?: string | null): number | null {
  if (!depuis) return null;
  const t = new Date(depuis).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

/** Vérifie les éliminatoires. Renvoie la règle qui condamne, ou null. */
function eliminatoire(f: FaitsProspect): { cle: string; hypothese: string } | null {
  if (f.businessStatus && f.businessStatus !== 'OPERATIONAL') return ELIMINATOIRES.ferme;
  if ((f.occurrencesNom ?? 1) >= SEUILS.CHAINE_OCCURRENCES) return ELIMINATOIRES.chaine;

  const ageAvis = jours(f.derniereAvisLe);
  // Une date d'avis absente n'est PAS une preuve d'inactivité : beaucoup de
  // fiches n'exposent pas cette information. Condamner sur une donnée manquante
  // écarterait des prospects valables — l'erreur que le fondateur a déjà payée
  // avec les 1264 prospects jetés sur un « Invalid user id » ambigu.
  if (ageAvis !== null && ageAvis > SEUILS.AVIS_MAX_JOURS) return ELIMINATOIRES.dormant;

  if (typeof f.nombreAvis === 'number' && f.nombreAvis < SEUILS.AVIS_MINIMUM) return ELIMINATOIRES.trop_peu_avis;
  return null;
}

/** Les règles du barème qui s'appliquent à ces faits. */
function reglesActives(f: FaitsProspect): string[] {
  const actives: string[] = [];
  const j = f.igJoursDepuisPost;
  const aCompte = f.igStatut === 'professional';

  // ── Ancienneté du dernier post. Exclusives entre elles. ──
  if (aCompte && typeof j === 'number') {
    if (j > 90) actives.push('post_plus_90j');
    else if (j >= 60) actives.push('post_60_90j');
    else if (j >= 30) actives.push('post_30_60j');
    else if (j < 7) actives.push('post_moins_7j');

    if ((f.igMediaCount ?? 0) > 10 && j > 30) actives.push('a_essaye_puis_abandonne');
  } else if (!aCompte) {
    // Compte non résolu : personnel, privé ou inexistant. Dans tous les cas on
    // ne peut pas le travailler, ce qui est en soi le manque qu'on vend.
    actives.push('aucun_compte');
  }

  // ── Audience ──
  const fo = f.igFollowers;
  if (aCompte && typeof fo === 'number') {
    if (fo > 5000) actives.push('followers_plus_5000');
    else if (fo >= 100 && fo <= 1500) actives.push('followers_100_1500');
    else if (fo < 100) actives.push('followers_moins_100');
  }

  // ── Vitalité ──
  const ageAvis = jours(f.derniereAvisLe);
  if (ageAvis !== null && ageAvis < 30) actives.push('avis_moins_30j');
  if (typeof f.note === 'number' && f.note >= 4.0) actives.push('note_4_ou_plus');
  if (!f.site) actives.push('pas_de_site');

  return actives;
}

export function scorer(f: FaitsProspect, opts?: { avecVision?: boolean }): ResultatScore {
  const calcule_le = new Date().toISOString();
  const condamne = eliminatoire(f);

  if (condamne) {
    return {
      score: 0, classe: 'C', elimine: true,
      details: { elimine_par: condamne, regles: [], calcule_le, version_bareme: VERSION_BAREME },
    };
  }

  const index = new Map<string, RegleScore>(BAREME.map(r => [r.cle, r]));
  const appliquees = reglesActives(f)
    .map(cle => index.get(cle))
    .filter((r): r is RegleScore => !!r);

  // L'analyse visuelle n'entre dans le calcul que si elle a réellement tourné.
  if (opts?.avecVision && f.vision) {
    const iv = new Map<string, RegleScore>(BAREME_VISION.map(r => [r.cle, r]));
    if (f.vision.agence_probable && iv.has('agence_probable')) appliquees.push(iv.get('agence_probable')!);
    if (f.vision.qualite_visuelle === 'amateur' && iv.has('visuels_amateurs')) appliquees.push(iv.get('visuels_amateurs')!);
  }

  const score = appliquees.reduce((s, r) => s + r.points, 0);
  return {
    score,
    classe: classeDepuisScore(score),
    elimine: false,
    details: {
      regles: appliquees.map(r => ({ cle: r.cle, points: r.points, hypothese: r.hypothese })),
      calcule_le,
      version_bareme: VERSION_BAREME,
    },
  };
}

/**
 * Repère les chaînes dans un lot, par répétition du nom.
 *
 * On normalise avant de compter : « Le Pain Quotidien » et « LE PAIN QUOTIDIEN
 * - Bastille » doivent être reconnus comme la même enseigne, sans quoi le
 * garde-fou ne servirait à rien sur les données réelles.
 */
export function marquerChaines(noms: string[]): Map<string, number> {
  const compte = new Map<string, number>();
  for (const nom of noms) {
    const cle = String(nom || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      // On coupe au premier séparateur : les enseignes suffixent le point de vente.
      .split(/[-–—|(,]/)[0]
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cle.length < 3) continue;
    compte.set(cle, (compte.get(cle) || 0) + 1);
  }
  return compte;
}

export function occurrencesDe(nom: string, compte: Map<string, number>): number {
  const cle = String(nom || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[-–—|(,]/)[0]
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return compte.get(cle) ?? 1;
}
