/**
 * Le maillon manquant : traduire les directives en contraintes D'EXÉCUTION.
 *
 * Demande du fondateur (2026-08-05) : « bien sûr que les agents se mettent à
 * jour dans leur exécution effective — faut tout vérifier, de l'émission des
 * datas à l'analyse à l'exécution de la nouvelle stratégie ».
 *
 * ── Le trou constaté ──
 *
 * Les directives typées étaient rendues en texte et injectées dans le prompt
 * (`directivesPromptBlock`). Or le format et la plateforme d'un post ne sont
 * PAS choisis par le modèle : ils sont décidés en amont, dans le code, par le
 * planning et le classement de performance. Le modèle recevait donc « publie
 * moins de carrousels » alors que le carrousel lui avait déjà été imposé — il
 * ne pouvait qu'obéir sur le ton, jamais sur la décision.
 *
 * Autrement dit, un ordre pouvait être écrit en base, lu, affiché… et sans
 * effet. C'est le pire cas de figure : Ami en jugeait ensuite l'effet et
 * concluait que le levier ne marchait pas, alors qu'il n'avait jamais été
 * appliqué.
 *
 * Ce module ferme la boucle du côté exécution. Il ne remplace pas le bloc de
 * prompt — les deux sont complémentaires : le code contraint le CHOIX, le
 * prompt oriente la RÉDACTION.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadTypedDirectives, type TypedDirective } from './typed-directives';

export interface ContraintesExecution {
  /** Formats à éviter — vidés si la contrainte ne laisserait aucun choix. */
  formatsEvites: string[];
  /** Formats à privilégier quand le créneau les autorise. */
  formatsPrivilegies: string[];
  /** Formats imposés à l'exclusion de tout autre. */
  formatsExclusifs: string[];
  plateformePrioritaire: string | null;
  plateformesSecondaires: string[];
  /** Heures imposées, au format HH:MM. */
  heures: string[];
  postsParSemaine: number | null;
  /** Trace lisible de ce qui a été appliqué, pour les logs et l'audit. */
  appliquees: string[];
}

const VIDE: ContraintesExecution = {
  formatsEvites: [], formatsPrivilegies: [], formatsExclusifs: [],
  plateformePrioritaire: null, plateformesSecondaires: [],
  heures: [], postsParSemaine: null, appliquees: [],
};

/** « carousel » et « carrousel » coexistent dans les données historiques. */
function normaliserFormat(f: string): string {
  const v = String(f || '').toLowerCase().trim();
  return v === 'carousel' ? 'carrousel' : v;
}

/**
 * Convertit les directives d'un agent en contraintes exploitables par le code.
 */
export function contraintesDepuisDirectives(directives: TypedDirective[]): ContraintesExecution {
  const c: ContraintesExecution = { ...VIDE, formatsEvites: [], formatsPrivilegies: [], formatsExclusifs: [], plateformesSecondaires: [], heures: [], appliquees: [] };

  for (const d of directives) {
    switch (d.type) {
      case 'format_preference': {
        const formats = (d.value?.formats || []).map(normaliserFormat).filter(Boolean);
        if (!formats.length) break;
        if (d.value?.bias === 'less') { c.formatsEvites.push(...formats); c.appliquees.push(`moins de ${formats.join('/')}`); }
        else if (d.value?.bias === 'only') { c.formatsExclusifs.push(...formats); c.appliquees.push(`uniquement ${formats.join('/')}`); }
        else { c.formatsPrivilegies.push(...formats); c.appliquees.push(`plus de ${formats.join('/')}`); }
        break;
      }
      case 'platform_priority':
        if (d.value?.primary) {
          c.plateformePrioritaire = String(d.value.primary).toLowerCase();
          c.plateformesSecondaires = (d.value.secondary || []).map((p: string) => String(p).toLowerCase());
          c.appliquees.push(`priorité ${c.plateformePrioritaire}`);
        }
        break;
      case 'posting_hours': {
        const h = d.value?.content || d.value?.insta || d.value?.tiktok || [];
        if (Array.isArray(h) && h.length) { c.heures = h.map(String); c.appliquees.push(`heures ${c.heures.join(', ')}`); }
        break;
      }
      case 'frequency': {
        const n = Number(d.value?.posts_per_week)
          || (Number(d.value?.posts_per_day) ? Number(d.value.posts_per_day) * 7 : 0);
        if (n > 0) { c.postsParSemaine = n; c.appliquees.push(`${n} posts/semaine`); }
        break;
      }
    }
  }
  return c;
}

export async function chargerContraintes(
  supabase: SupabaseClient, userId: string | null | undefined, agentId: string,
): Promise<ContraintesExecution> {
  if (!userId) return { ...VIDE };
  try {
    return contraintesDepuisDirectives(await loadTypedDirectives(supabase, userId, agentId));
  } catch {
    return { ...VIDE };
  }
}

/**
 * Applique les contraintes de format au format déjà choisi par le planning.
 *
 * `autorises` est la liste que le créneau accepte : on ne la contourne jamais,
 * un ordre ne doit pas pouvoir produire une story à un créneau qui n'en publie
 * pas.
 *
 * Règle de sécurité : si la contrainte ne laisse aucun format possible, on
 * conserve le format d'origine. Un ordre mal formulé ne doit jamais bloquer la
 * publication — le client paie pour un volume, et un compte qui cesse de
 * publier est un problème bien plus grave qu'un format non optimal.
 */
export function appliquerContrainteFormat(
  formatChoisi: string,
  contraintes: ContraintesExecution,
  autorises: string[],
): { format: string; motif: string | null } {
  const courant = normaliserFormat(formatChoisi);
  const permis = autorises.map(normaliserFormat);

  if (contraintes.formatsExclusifs.length) {
    const possible = contraintes.formatsExclusifs.filter(f => permis.includes(f));
    if (possible.length) {
      return possible.includes(courant)
        ? { format: courant, motif: null }
        : { format: possible[0], motif: `format imposé (${possible[0]})` };
    }
  }

  if (contraintes.formatsEvites.includes(courant)) {
    const repli = permis.find(f => !contraintes.formatsEvites.includes(f)
      && (!contraintes.formatsPrivilegies.length || contraintes.formatsPrivilegies.includes(f)))
      ?? permis.find(f => !contraintes.formatsEvites.includes(f));
    if (repli) return { format: repli, motif: `${courant} évité → ${repli}` };
    // Aucun repli : on publie quand même plutôt que de sauter le créneau.
    return { format: courant, motif: null };
  }

  if (contraintes.formatsPrivilegies.length && !contraintes.formatsPrivilegies.includes(courant)) {
    const prefere = contraintes.formatsPrivilegies.find(f => permis.includes(f));
    if (prefere) return { format: prefere, motif: `${courant} → ${prefere} (privilégié)` };
  }

  return { format: courant, motif: null };
}

/**
 * Arbitre la plateforme, uniquement entre celles que l'ordre nomme.
 *
 * Deux garde-fous, tirés d'un cas de test qui a mal tourné.
 *
 * 1. Une plateforme que l'ordre ne cite pas est laissée telle quelle. Un ordre
 *    « priorité TikTok, Instagram en second » est né d'une comparaison entre
 *    ces deux réseaux : il ne dit RIEN de LinkedIn, dont l'audience est
 *    professionnelle et les métriques incomparables. Sans cette règle, le test
 *    basculait les créneaux LinkedIn vers TikTok — le client aurait purement
 *    disparu d'un réseau sur la foi d'un chiffre qui ne le concernait pas.
 *
 * 2. Une plateforme citée en secondaire garde ses créneaux. « Priorité à X »
 *    ne veut pas dire « abandonne Y » : un compte qui cesse de publier là où
 *    il a bâti son audience la perd, et le jour où la plateforme reine bride
 *    le compte, il ne reste rien.
 *
 * En pratique la priorité sert donc à départager, pas à évincer.
 */
export function appliquerContraintePlateforme(
  plateformeChoisie: string,
  contraintes: ContraintesExecution,
  plateformesDisponibles: string[],
): { plateforme: string; motif: string | null } {
  const courante = String(plateformeChoisie || '').toLowerCase();
  const prioritaire = contraintes.plateformePrioritaire;
  if (!prioritaire || prioritaire === courante) return { plateforme: courante, motif: null };
  if (!plateformesDisponibles.map(p => p.toLowerCase()).includes(prioritaire)) {
    return { plateforme: courante, motif: null };
  }
  const citees = [prioritaire, ...contraintes.plateformesSecondaires];
  if (!citees.includes(courante)) return { plateforme: courante, motif: null };
  if (contraintes.plateformesSecondaires.includes(courante)) return { plateforme: courante, motif: null };
  return { plateforme: prioritaire, motif: `${courante} → ${prioritaire} (priorité)` };
}
