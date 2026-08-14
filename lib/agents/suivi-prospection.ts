import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Ce que les mails de prospection ont provoqué : ouvertures, clics, réponses.
 *
 * ── Pourquoi ce fichier existe ──
 *
 * Fondateur, 2026-08-14 : « pour le suivi des mails, je veux le suivi ouverture
 * de mails et clic sur le lien, et je veux suivre cette donnée dans le mail que
 * je reçois quotidiennement. »
 *
 * ── Pourquoi on lit la fiche prospect et pas l'historique ──
 *
 * Le réflexe était de compter les lignes de crm_activities (email_opened,
 * email_clicked). En allant chercher les chiffres : 467 mails envoyés sur la
 * semaine, ZÉRO ouverture, ZÉRO clic. Depuis toujours.
 *
 * Le suivi marchait pourtant — 305 prospects portaient une date d'ouverture,
 * mise à jour le jour même. C'est la ligne d'historique qui était refusée par
 * une contrainte CHECK périmée (40 des 51 types du code rejetés ; corrigé par
 * la migration 20260814_crm_activities_types.sql).
 *
 * On lit donc les COMPTEURS DE LA FICHE, pour deux raisons qui tiennent même
 * après la correction :
 *   · ils ont survécu, ils portent tout l'historique — l'activité, elle,
 *     repart de zéro aujourd'hui et ne dirait rien avant une semaine ;
 *   · ils comptent des PROSPECTS, pas des événements. « 13 prospects ont
 *     ouvert » est ce qu'on veut savoir ; « 40 ouvertures » mélange une
 *     personne qui a relu six fois avec six personnes intéressées.
 *
 * ── Pourquoi le clic compte plus que l'ouverture ──
 *
 * Depuis qu'un tiers de l'article est DANS le mail, le clic a changé de sens :
 * on ne clique plus sur un titre par curiosité, on clique pour finir une lecture
 * déjà commencée. C'est un intérêt réel. Une ouverture, elle, dépend de
 * l'affichage des images — Apple Mail et Gmail en bloquent une bonne part, donc
 * le taux d'ouverture est toujours sous-estimé, jamais surestimé.
 *
 * ── Une seule implémentation, deux mails ──
 *
 * Le rapport du matin et le digest unifié du soir affichent le même bloc. Deux
 * copies auraient divergé au premier ajustement de seuil, et le fondateur aurait
 * lu deux chiffres différents pour la même chose le même jour.
 */

export interface SuiviProspection {
  /** Prospects touchés sur les 24 dernières heures. */
  jour: { envoyes: number; ouverts: number; cliques: number };
  /** Sur 7 jours : les volumes, puis les taux qui en découlent. */
  semaine: { envoyes: number; ouverts: number; cliques: number };
  taux: { ouverture: number; clic: number };
  /** Réponses reçues sur 24 h / 7 j, depuis l'historique (repart du 14/08). */
  reponses: { jour: number; semaine: number } | null;
}

export async function mesurerProspection(supabase: SupabaseClient): Promise<SuiviProspection | null> {
  try {
    const depuis = (heures: number) => new Date(Date.now() - heures * 3600 * 1000).toISOString();

    // On compte côté base (head: true) au lieu de rapatrier les lignes : à 500
    // envois par jour, une requête qui ramène les lignes se ferait tronquer en
    // silence par PostgREST et le rapport mentirait sans prévenir — exactement
    // le genre de panne qui se lit comme un bon résultat.
    const compterProspects = async (colonne: string, heures: number) => {
      const { count, error } = await supabase
        .from('crm_prospects')
        .select('id', { count: 'exact', head: true })
        .gte(colonne, depuis(heures));
      if (error) throw new Error(`${colonne}/${heures}h — ${error.message}`);
      return count || 0;
    };

    const [envJ, ouvJ, cliJ, envS, ouvS, cliS] = await Promise.all([
      compterProspects('last_email_sent_at', 24),
      compterProspects('last_email_opened_at', 24),
      compterProspects('last_email_clicked_at', 24),
      compterProspects('last_email_sent_at', 168),
      compterProspects('last_email_opened_at', 168),
      compterProspects('last_email_clicked_at', 168),
    ]);

    // Les réponses n'ont pas de colonne dédiée sur la fiche : elles vivent dans
    // l'historique, qui vient tout juste d'être débloqué. On les affiche donc
    // seulement quand il y en a — un « 0 réponse » issu d'une table qui repart
    // de zéro serait un mensonge par omission.
    let reponses: { jour: number; semaine: number } | null = null;
    try {
      const compterReponses = async (heures: number) => {
        const { count } = await supabase
          .from('crm_activities')
          .select('id', { count: 'exact', head: true })
          .eq('type', 'email_replied')
          .gte('created_at', depuis(heures));
        return count || 0;
      };
      const [rj, rs] = await Promise.all([compterReponses(24), compterReponses(168)]);
      if (rs > 0) reponses = { jour: rj, semaine: rs };
    } catch { /* les réponses sont un bonus, pas une condition */ }

    const taux = (x: number) => (envS > 0 ? Math.round((x / envS) * 1000) / 10 : 0);
    return {
      jour: { envoyes: envJ, ouverts: ouvJ, cliques: cliJ },
      semaine: { envoyes: envS, ouverts: ouvS, cliques: cliS },
      taux: { ouverture: taux(ouvS), clic: taux(cliS) },
      reponses,
    };
  } catch (e: any) {
    // Le rapport part quand même : ces chiffres sont un plus, pas une condition
    // d'envoi. Mais on trace, sinon le bloc disparaîtrait sans qu'on sache.
    console.error('[SuiviProspection] mesure indisponible:', e?.message);
    return null;
  }
}

/**
 * Le bloc HTML, prêt à insérer dans l'un ou l'autre des mails admin.
 * Renvoie une chaîne vide si rien n'a été envoyé — un tableau de zéros n'apprend
 * rien et allonge un mail déjà long.
 */
export function blocProspectionHtml(m: SuiviProspection | null): string {
  if (!m) return '';
  const { jour, semaine, taux, reponses } = m;
  if (semaine.envoyes === 0 && jour.envoyes === 0) return '';

  // Des repères, sinon un pourcentage ne se lit pas : en prospection froide B2B,
  // 25 % d'ouverture et 3 % de clic sont les moyennes du secteur.
  const couleur = (v: number, bon: number, moyen: number) =>
    v >= bon ? '#16a34a' : v >= moyen ? '#ca8a04' : '#dc2626';

  const ligne = (nom: string, n24: number, n7: number, t: number, repere: string, c: string) => `
        <tr>
          <td style="padding:5px 0;color:#374151;">${nom}</td>
          <td style="padding:5px 0;text-align:right;font-variant-numeric:tabular-nums;">${n24}</td>
          <td style="padding:5px 0;text-align:right;font-variant-numeric:tabular-nums;">${n7}</td>
          <td style="padding:5px 0;text-align:right;font-weight:700;color:${c};font-variant-numeric:tabular-nums;">${t} %</td>
          <td style="padding:5px 0;text-align:right;color:#9ca3af;font-size:11px;">${repere}</td>
        </tr>`;

  // Les diagnostics ne s'affichent qu'avec assez d'envois pour que le taux veuille
  // dire quelque chose : sur 5 mails, 0 clic n'est pas un signal, c'est du hasard.
  const assezDeVolume = semaine.envoyes > 30;
  const alertes = [
    assezDeVolume && taux.ouverture < 15
      ? `<div style="margin-top:6px;color:#b91c1c;"><strong>Ouverture à ${taux.ouverture} %, très en dessous des 25 % du secteur.</strong> Ce n'est pas le contenu qui bloque, c'est l'objet — ou la délivrabilité : un mail classé indésirable n'est jamais ouvert.</div>`
      : '',
    assezDeVolume && taux.clic < 1
      ? `<div style="margin-top:6px;color:#b91c1c;"><strong>Clic à ${taux.clic} %.</strong> L'extrait d'article ne donne pas envie de lire la suite, ou l'article ne colle pas au métier du prospect.</div>`
      : '',
    assezDeVolume && semaine.ouverts > 0 && semaine.cliques / semaine.ouverts > 0.4
      ? `<div style="margin-top:6px;color:#166534;"><strong>${Math.round((semaine.cliques / semaine.ouverts) * 100)} % de ceux qui ouvrent cliquent.</strong> Le contenu convainc ; c'est le nombre d'ouvertures qu'il faut aller chercher, pas le mail lui-même.</div>`
      : '',
  ].join('');

  return `
      <h3 style="color:#111;font-size:14px;margin:20px 0 8px;">📧 Prospection — ce que les mails ont provoqué</h3>
      <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr style="color:#9ca3af;font-size:10px;text-transform:uppercase;letter-spacing:.4px;">
            <td style="padding-bottom:6px;">Prospects</td>
            <td style="padding-bottom:6px;text-align:right;">24 h</td>
            <td style="padding-bottom:6px;text-align:right;">7 j</td>
            <td style="padding-bottom:6px;text-align:right;">taux</td>
            <td style="padding-bottom:6px;text-align:right;">repère</td>
          </tr>
          <tr>
            <td style="padding:5px 0;color:#374151;">Contactés</td>
            <td style="padding:5px 0;text-align:right;font-variant-numeric:tabular-nums;">${jour.envoyes}</td>
            <td style="padding:5px 0;text-align:right;font-variant-numeric:tabular-nums;">${semaine.envoyes}</td>
            <td style="padding:5px 0;text-align:right;color:#9ca3af;">—</td>
            <td style="padding:5px 0;text-align:right;color:#9ca3af;font-size:11px;">—</td>
          </tr>
          ${ligne('Ont ouvert', jour.ouverts, semaine.ouverts, taux.ouverture, '25 %', couleur(taux.ouverture, 25, 15))}
          ${ligne("Ont cliqué sur l'article", jour.cliques, semaine.cliques, taux.clic, '3 %', couleur(taux.clic, 3, 1))}
          ${(() => {
            /**
             * Le clic RAPPORTÉ AUX OUVREURS, demandé par le fondateur le 15 août.
             *
             * Les deux taux précédents se calculent sur les envois. Celui-ci se
             * calcule sur les gens qui ont OUVERT — et il répond à une question
             * différente : une fois qu'on est lu, est-ce qu'on convainc ?
             *
             * C'est le seul chiffre qui isole la qualité du CONTENU de celle de
             * l'objet. Un taux d'ouverture à 3 % avec un clic-sur-ouvreurs à
             * 60 % ne dit pas « nos mails sont mauvais » : il dit « ceux qui
             * les lisent y vont, il faut aller chercher les ouvertures ». Sans
             * cette ligne, les deux problèmes se confondent et on corrige le
             * mauvais.
             *
             * Repère : 10 à 15 % en prospection froide B2B.
             */
            if (semaine.ouverts === 0) return '';
            const parmiOuvreurs = Math.round((semaine.cliques / semaine.ouverts) * 1000) / 10;
            const c = couleur(parmiOuvreurs, 15, 8);
            return `
          <tr style="border-top:1px solid #e5e7eb;">
            <td style="padding:7px 0 5px;color:#111;font-weight:600;">Clics parmi ceux qui ouvrent</td>
            <td style="padding:7px 0 5px;text-align:right;color:#9ca3af;font-size:11px;">—</td>
            <td style="padding:7px 0 5px;text-align:right;font-variant-numeric:tabular-nums;">${semaine.cliques}&nbsp;/&nbsp;${semaine.ouverts}</td>
            <td style="padding:7px 0 5px;text-align:right;font-weight:700;color:${c};font-variant-numeric:tabular-nums;">${parmiOuvreurs} %</td>
            <td style="padding:7px 0 5px;text-align:right;color:#9ca3af;font-size:11px;">repère 10–15 %</td>
          </tr>`;
          })()}
          ${reponses ? `<tr><td style="padding:5px 0;color:#166534;font-weight:600;">Ont répondu</td><td style="padding:5px 0;text-align:right;font-weight:700;color:#166534;">${reponses.jour}</td><td style="padding:5px 0;text-align:right;font-weight:700;color:#166534;">${reponses.semaine}</td><td colspan="2" style="padding:5px 0;text-align:right;color:#9ca3af;font-size:11px;">le seul qui compte vraiment</td></tr>` : ''}
        </table>
        <div style="font-size:11px;color:#6b7280;margin-top:10px;line-height:1.55;border-top:1px solid #e5e7eb;padding-top:8px;">
          On compte des <strong>prospects</strong>, pas des événements : une personne qui relit six fois compte une fois.
          Le taux d'ouverture est structurellement sous-estimé (Gmail et Apple Mail bloquent le pixel de suivi) ; le <strong>clic</strong>, lui, est mesuré à coup sûr — et depuis qu'un tiers de l'article est dans le mail, on clique pour finir une lecture, plus par curiosité.${alertes}
        </div>
      </div>`;
}

/** Le chemin court : mesurer puis rendre, pour les appelants qui n'ont besoin que du HTML. */
export async function blocSuiviProspection(supabase: SupabaseClient): Promise<string> {
  return blocProspectionHtml(await mesurerProspection(supabase));
}
