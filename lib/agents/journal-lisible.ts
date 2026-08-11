/**
 * Traduit le journal technique des agents en phrases qu'un commerçant lit.
 *
 * ── Pourquoi ──
 *
 * 2026-08-10, le fondateur : « activité récente, ça sert à rien de dire
 * "google data access", le client s'en fiche. Enlève cette section et
 * améliore-la. »
 *
 * La section affichait la colonne `action` d'`agent_logs` telle quelle :
 * `google_data_access`, `tiktok_stats`, `scrape_enrich`, `prospect_scoring`.
 * Ce sont des noms de fonctions. Ils disent au développeur quel code a tourné ;
 * ils ne disent pas au commerçant ce qui a été fait POUR LUI.
 *
 * Deux traitements, donc. On tait ce qui ne le concerne pas — la mécanique
 * interne, les rafraîchissements de jetons, les sondes de santé — et on
 * reformule le reste à la première personne de l'agent, au passé, avec le
 * résultat quand on l'a.
 *
 * Le principe posé pour les agents s'applique ici : on écrit comme une
 * personne qui rend compte de son travail, pas comme un système qui déroule
 * ses appels.
 */

/**
 * Actions purement techniques : jamais montrées au client.
 *
 * Ce ne sont pas des échecs à cacher — c'est de la plomberie qui fonctionne.
 * Un client qui voit « rafraîchissement du jeton d'accès » n'apprend rien et
 * se demande s'il doit s'en inquiéter.
 */
const TECHNIQUES = new Set([
  'google_data_access', 'token_refresh', 'tiktok_token_refresh', 'health_check',
  'tiktok_health_check', 'security_check', 'diagnose_social', 'token_lifecycle',
  'process_ig_reauth', 'detect_anomalies', 'detect_error_patterns', 'brevo_health_check',
  'daily_cost_check', 'ai_budget_watch', 'compute_best_brief_day', 'collecte_outcomes',
  'prospect_pool_refresh', 'match_signups_to_prospects', 'refresh_trends',
  'refresh_trend_winners', 'admin_health_digest', 'admin_daily_cost_report',
]);

/**
 * Reformulations. La clé est l'action technique, la valeur une fonction qui
 * rend la phrase — les données du log servent à la rendre concrète.
 */
const PHRASES: Record<string, (d: any) => string> = {
  scrape_enrich: (d) => d?.enriched
    ? `${d.enriched} fiche${d.enriched > 1 ? 's' : ''} prospect complétée${d.enriched > 1 ? 's' : ''} (site web, réseaux, contact)`
    : 'Recherche de coordonnées sur les sites et réseaux des prospects',
  prospect_scoring: (d) => d?.scored
    ? `${d.scored} prospect${d.scored > 1 ? 's' : ''} reclassé${d.scored > 1 ? 's' : ''} par priorité`
    : 'Prospects reclassés par priorité',
  prospect_enrich: (d) => d?.enriched
    ? `${d.enriched} nouveau${d.enriched > 1 ? 'x' : ''} contact${d.enriched > 1 ? 's' : ''} trouvé${d.enriched > 1 ? 's' : ''}`
    : 'Recherche de nouveaux contacts',
  email_sent: (d) => d?.count ? `${d.count} email${d.count > 1 ? 's' : ''} envoyé${d.count > 1 ? 's' : ''}` : 'Email envoyé',
  email_daily: (d) => d?.sent ? `${d.sent} email${d.sent > 1 ? 's' : ''} de prospection partis` : 'Tournée d\'emails',
  email_reply: () => 'Réponse envoyée à un prospect',
  post_published: (d) => `Publication mise en ligne${d?.platform ? ` sur ${nomReseau(d.platform)}` : ''}`,
  content_generated: (d) => d?.count ? `${d.count} publication${d.count > 1 ? 's' : ''} préparée${d.count > 1 ? 's' : ''}` : 'Publications préparées',
  tiktok_stats: (d) => d?.total_views_recent != null
    ? `Audience TikTok relevée : ${d.total_views_recent} vue${d.total_views_recent > 1 ? 's' : ''} sur les dernières vidéos`
    : 'Audience TikTok relevée',
  dm_sent: (d) => d?.count ? `${d.count} message${d.count > 1 ? 's' : ''} privé${d.count > 1 ? 's' : ''} envoyé${d.count > 1 ? 's' : ''}` : 'Message privé envoyé',
  comment_replied: () => 'Réponse publiée sous un commentaire',
  review_replied: () => 'Réponse publiée sous un avis Google',
  qc_coherence_reecrit: () => 'Publication reprise avant mise en ligne (contrôle qualité)',
  qc_doublon: () => 'Publication écartée : contenu déjà publié',
  // Une correction faite dans le dos du client doit apparaître dans son
  // journal : il a le droit de savoir qu'on a touché à son texte, et pourquoi.
  fraicheur_reecriture: (d) => d?.motif
    ? `Publication remise à jour avant parution : ${String(d.motif).slice(0, 120)}`
    : 'Publication remise à jour avant parution (une date avait vieilli)',
  fraicheur_planifies: (d) => d?.reecrits || d?.ecartes
    ? `Calendrier relu : ${d.reecrits || 0} publication${(d.reecrits || 0) > 1 ? 's' : ''} remise${(d.reecrits || 0) > 1 ? 's' : ''} à jour, ${d.ecartes || 0} écartée${(d.ecartes || 0) > 1 ? 's' : ''}`
    : 'Calendrier relu : rien à corriger',
};

function nomReseau(p: string): string {
  const m: Record<string, string> = { instagram: 'Instagram', tiktok: 'TikTok', linkedin: 'LinkedIn', facebook: 'Facebook' };
  return m[String(p).toLowerCase()] || p;
}

export interface EntreeJournal {
  texte: string;
  statut: 'succes' | 'attention' | 'erreur';
  quand: string;
}

/**
 * Repli quand l'action n'a pas de reformulation dédiée : on rend le code
 * lisible plutôt que de l'afficher brut, et on garde l'aperçu s'il existe.
 *
 * `scrape_enrich` devient « Scrape enrich » : imparfait, mais lisible, et
 * surtout ça ne bloque pas l'affichage des actions récentes que personne
 * n'a encore traduites.
 */
function repli(action: string, apercu?: string | null): string {
  const lisible = String(action || '')
    .replace(/[_-]+/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());
  return apercu ? `${lisible} — ${apercu}` : lisible;
}

/**
 * Transforme les lignes brutes d'`agent_logs` en journal lisible.
 *
 * Les entrées techniques disparaissent, les doublons consécutifs sont
 * fusionnés — trois passages de scraping dans l'heure font une ligne, pas
 * trois — et il ne reste que ce qui a une valeur pour le commerçant.
 */
export function journalLisible(
  logs: Array<{ action: string; status?: string | null; preview?: string | null; data?: any; created_at: string }>,
  maximum = 8,
): EntreeJournal[] {
  const sorties: EntreeJournal[] = [];
  let precedent = '';

  for (const l of logs) {
    const action = String(l.action || '');
    if (TECHNIQUES.has(action)) continue;

    const phrase = PHRASES[action] ? PHRASES[action](l.data || {}) : repli(action, l.preview);
    if (!phrase || phrase === precedent) continue;   // deux fois la même chose de suite : une ligne suffit
    precedent = phrase;

    sorties.push({
      texte: phrase,
      statut: l.status === 'error' ? 'erreur' : l.status === 'success' || l.status === 'ok' ? 'succes' : 'attention',
      quand: l.created_at,
    });
    if (sorties.length >= maximum) break;
  }

  return sorties;
}
