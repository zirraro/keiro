/**
 * Catalogue des capacités par agent : ce qu'un client peut lui DEMANDER dans le
 * chat, et ce qu'il peut RÉGLER durablement.
 *
 * Règle fondateur (2026-07-30) : « pour tous les agents, les réglages demandés
 * dans le chat doivent être intégrés dans les paramètres de l'agent ; il faut
 * anticiper par agent quelles actions peuvent être demandées ».
 *
 * Source unique : le prompt de chaque agent est construit à partir d'ici, et la
 * liste blanche de `set_settings` aussi. Impossible qu'un agent annonce un
 * réglage que le code refuse, ou qu'il ignore une demande qu'il sait traiter.
 */

export interface SettingSpec {
  key: string;
  /** Ce que le client dit, en clair. */
  label: string;
  /** Valeurs acceptées, pour guider le modèle ET valider côté serveur. */
  type: 'number' | 'boolean' | 'string' | 'enum' | 'list';
  values?: string[];
  /** Exemple de formulation client → valeur attendue. */
  example?: string;
}

export interface AgentCapability {
  /** Agent propriétaire des réglages (agent_id dans org_agent_configs). */
  agentId: string;
  displayName: string;
  /** Actions exécutables immédiatement depuis le chat. */
  actions: Array<{ tag: string; label: string; phrasings: string[] }>;
  settings: SettingSpec[];
}

const CADENCE_SETTINGS: SettingSpec[] = [
  { key: 'posts_per_day_ig', label: 'nombre de publications Instagram par jour', type: 'number', example: '« poste 3 fois par jour sur insta » → 3' },
  { key: 'posts_per_day_tt', label: 'nombre de publications TikTok par jour', type: 'number', example: '« 2 TikTok par jour » → 2' },
  { key: 'posts_per_day_li', label: 'nombre de publications LinkedIn par jour', type: 'number' },
  { key: 'ig_enabled', label: 'activer/couper Instagram', type: 'boolean', example: '« arrête Instagram » → false' },
  { key: 'tt_enabled', label: 'activer/couper TikTok', type: 'boolean' },
  { key: 'li_enabled', label: 'activer/couper LinkedIn', type: 'boolean' },
  { key: 'formats_ig', label: 'format privilégié', type: 'enum', values: ['stories', 'reels', 'carrousels', 'posts', 'mix'], example: '« plus de reels » → reels' },
  { key: 'video_ratio', label: 'part de vidéo dans le mix (0-100)', type: 'number', example: '« plus de vidéo » → 70' },
  { key: 'content_frequency_mode', label: 'rythme global', type: 'enum', values: ['low', 'normal', 'high'] },
  { key: 'auto_mode', label: 'publier seul ou attendre validation', type: 'boolean', example: '« je veux valider avant » → false' },
];

const COMMON_SETTINGS: SettingSpec[] = [
  { key: 'personality', label: 'ton de voix', type: 'string', example: '« parle moins commercial » → "plus humain, moins commercial"' },
  { key: 'tutoiement', label: 'tutoyer ou vouvoyer les interlocuteurs', type: 'enum', values: ['tu', 'vous'], example: '« vouvoie mes clients » → vous' },
  { key: 'langue', label: 'langue de travail', type: 'string', example: '« écris en anglais » → "en"' },
  { key: 'custom_instructions', label: 'consigne libre à respecter durablement', type: 'string', example: '« on ferme du 1er au 20 août »' },
  { key: 'sujets_interdits', label: 'sujets à ne jamais aborder', type: 'list', example: '« ne parle jamais politique »' },
  { key: 'escalation_keywords', label: 'mots qui doivent te faire prévenir le client', type: 'list', example: '« préviens-moi si on parle de remboursement »' },
  { key: 'horaires_travail', label: 'plage horaire pendant laquelle tu agis', type: 'string', example: '« n\'agis pas le week-end » → "lun-ven 8h-19h"' },
  { key: 'report_frequency', label: 'fréquence des comptes rendus', type: 'enum', values: ['daily', 'weekly', 'monthly'] },
  { key: 'email_notify', label: 'recevoir les notifications par email', type: 'boolean' },
];

/** Réglages communs à TOUT agent qui produit un document livrable. */
const DOCUMENT_SETTINGS: SettingSpec[] = [
  { key: 'doc_format', label: 'format de sortie des documents', type: 'enum', values: ['pdf', 'docx', 'xlsx', 'pptx'], example: '« donne-moi du Word » → docx' },
  { key: 'doc_langue', label: 'langue des documents', type: 'string' },
  { key: 'doc_entete', label: 'en-tête : logo et coordonnées sur les documents', type: 'boolean', example: '« mets mon logo sur les contrats » → true' },
  { key: 'doc_signataire', label: 'nom et fonction de la personne qui signe', type: 'string', example: '« c\'est moi qui signe, gérant » → "Oussama Zirrar, gérant"' },
  { key: 'doc_mentions', label: 'mentions à ajouter en pied de page', type: 'string', example: '« ajoute mon SIRET »' },
  { key: 'doc_validation', label: 'faire valider avant de considérer le document final', type: 'boolean' },
];

export const AGENT_CAPABILITIES: Record<string, AgentCapability> = {
  content: {
    agentId: 'content', displayName: 'Léna',
    actions: [
      { tag: '{"type":"generate_post","platform":"instagram","format":"post"}', label: 'créer et publier un post', phrasings: ['publie', 'poste', 'fais un post', 'mets en ligne', 'balance un post'] },
      { tag: '{"type":"list_posts"}', label: 'montrer les posts planifiés', phrasings: ['montre le planning', 'qu\'est-ce qui est prévu', 'mes prochains posts'] },
    ],
    settings: [
      ...CADENCE_SETTINGS,
      { key: 'contenu_sujets_favoris', label: 'sujets à mettre en avant', type: 'list', example: '« parle plus de mes pains au levain »' },
      { key: 'contenu_hashtags', label: 'nombre de hashtags par post', type: 'number', example: '« moins de hashtags » → 5' },
      { key: 'contenu_emojis', label: 'usage des emojis', type: 'enum', values: ['aucun', 'sobre', 'genereux'] },
      { key: 'contenu_longueur_legende', label: 'longueur des légendes', type: 'enum', values: ['courte', 'moyenne', 'longue'] },
      { key: 'contenu_texte_sur_image', label: 'autoriser du texte incrusté sur les visuels', type: 'boolean', example: '« arrête d\'écrire sur mes photos » → false' },
      { key: 'contenu_visages', label: 'montrer des personnes sur les visuels', type: 'boolean' },
      { key: 'contenu_photos_client_only', label: 'n\'utiliser QUE les photos fournies par le client', type: 'boolean', example: '« utilise seulement mes vraies photos » → true' },
      { key: 'contenu_weekend', label: 'publier le week-end', type: 'boolean', example: '« ne poste pas le dimanche » → false' },
      { key: 'contenu_cta', label: 'appel à l\'action préféré', type: 'string', example: '« termine toujours par : réserve au 01 23 45 67 89 »' },
      { key: 'contenu_fermetures', label: 'périodes de fermeture à respecter', type: 'string', example: '« fermé du 1er au 20 août »' },
      ...COMMON_SETTINGS,
    ],
  },
  email: {
    agentId: 'email', displayName: 'Hugo',
    actions: [
      { tag: '{"type":"mailbox_triage"}', label: 'trier et nettoyer la boîte mail', phrasings: ['nettoie mes mails', 'nettoie mes emails des pubs', 'vire les newsletters', 'range ma boîte', 'fais le ménage', 'trie ma boîte'] },
      { tag: '{"type":"send_emails"}', label: 'envoyer les emails de prospection du jour', phrasings: ['envoie les mails', 'lance la prospection email', 'relance les prospects'] },
    ],
    settings: [
      { key: 'reply_mode', label: 'répondre directement ou préparer un brouillon', type: 'enum', values: ['auto_send', 'draft'], example: '« réponds directement » → auto_send' },
      { key: 'full_mailbox', label: 'autoriser la gestion complète de la boîte', type: 'boolean' },
      { key: 'email_signature', label: 'signature à mettre en bas des emails', type: 'string' },
      { key: 'email_dossiers', label: 'noms des dossiers de rangement', type: 'list', example: '« range plutôt en Devis / Commandes / Fournisseurs »' },
      { key: 'email_expediteurs_proteges', label: 'expéditeurs à ne JAMAIS mettre à la corbeille', type: 'list', example: '« ne touche jamais aux mails de mon comptable »' },
      { key: 'email_max_par_jour', label: 'nombre maximum d\'emails envoyés par jour', type: 'number' },
      { key: 'email_relances', label: 'nombre de relances par prospect', type: 'number', example: '« relance 2 fois maximum » → 2' },
      { key: 'email_delai_relance_jours', label: 'délai entre deux relances, en jours', type: 'number' },
      { key: 'email_plage_envoi', label: 'plage horaire d\'envoi', type: 'string', example: '« envoie seulement en journée » → "9h-18h"' },
      ...COMMON_SETTINGS,
    ],
  },
  commercial: {
    agentId: 'commercial', displayName: 'Léo',
    actions: [{ tag: '{"type":"prospect","query":"restaurant Paris"}', label: 'chercher des prospects', phrasings: ['trouve des prospects', 'prospecte', 'cherche des clients', 'remplis le CRM'] }],
    settings: [
      { key: 'prospection_sessions', label: 'nombre de sessions de prospection par jour', type: 'number' },
      { key: 'prospect_zones', label: 'zones géographiques ciblées', type: 'list', example: '« cherche seulement dans le 92 et le 78 »' },
      { key: 'prospect_metiers', label: 'types de commerce ciblés', type: 'list', example: '« vise les instituts de beauté »' },
      { key: 'prospect_rayon_km', label: 'rayon de recherche en km', type: 'number' },
      { key: 'prospect_note_min', label: 'note Google minimum', type: 'number', example: '« évite ceux sous 3,5 » → 3.5' },
      { key: 'prospect_avis_min', label: 'nombre d\'avis minimum', type: 'number' },
      { key: 'prospect_exclusions', label: 'entreprises ou domaines à exclure', type: 'list', example: '« jamais les franchises »' },
      { key: 'prospect_max_par_jour', label: 'nombre maximum de nouveaux prospects par jour', type: 'number' },
      ...COMMON_SETTINGS,
    ],
  },
  dm_instagram: {
    agentId: 'dm_instagram', displayName: 'Jade',
    actions: [
      { tag: '{"type":"scan_dms"}', label: 'traiter les DM en attente', phrasings: ['réponds aux DM', 'scanne les messages', 'regarde mes DM'] },
      { tag: '{"type":"reply_comments"}', label: 'répondre aux commentaires', phrasings: ['réponds aux commentaires', 'gère les commentaires'] },
    ],
    settings: [
      { key: 'dm_max_par_jour', label: 'nombre maximum de DM par jour', type: 'number' },
      { key: 'dm_style_ouverture', label: 'style d\'accroche en DM', type: 'string', example: '« sois plus direct, pas de blabla »' },
      { key: 'dm_negatifs', label: 'que faire d\'un commentaire négatif', type: 'enum', values: ['repondre', 'escalader'], example: '« ne réponds jamais seul à un négatif » → escalader' },
      { key: 'dm_criteres_follow', label: 'critères pour suivre un compte', type: 'string', example: '« suis seulement les comptes locaux »' },
      { key: 'dm_reseaux_actifs', label: 'réseaux sur lesquels tu interviens', type: 'list', example: '« DM seulement sur Instagram »' },
      ...COMMON_SETTINGS,
    ],
  },
  gmaps: {
    agentId: 'gmaps', displayName: 'Théo',
    actions: [{ tag: '{"type":"gmaps_run"}', label: 'répondre aux avis et optimiser la fiche', phrasings: ['réponds aux avis', 'optimise ma fiche google', 'gère ma réputation'] }],
    settings: [
      { key: 'auto_reply_reviews', label: 'répondre automatiquement aux avis', type: 'boolean' },
      { key: 'gbp_mode', label: 'modifier la fiche ou seulement proposer', type: 'enum', values: ['auto', 'suggest'] },
      { key: 'avis_seuil_escalade', label: 'note en dessous de laquelle tu me préviens avant de répondre', type: 'number', example: '« montre-moi les 2 étoiles et moins » → 2' },
      { key: 'avis_signature', label: 'signature des réponses aux avis', type: 'string', example: '« signe : Marie, la gérante »' },
      { key: 'avis_geste_commercial', label: 'proposer un geste commercial dans les réponses négatives', type: 'boolean' },
      { key: 'avis_delai_reponse_h', label: 'délai maximum de réponse à un avis, en heures', type: 'number' },
      { key: 'gbp_photos_auto', label: 'ajouter automatiquement des photos à la fiche', type: 'boolean' },
      ...COMMON_SETTINGS,
    ],
  },
  seo: {
    agentId: 'seo', displayName: 'Théo (SEO)',
    actions: [{ tag: '{"type":"seo_article"}', label: 'écrire un article de blog optimisé', phrasings: ['écris un article', 'fais un blog', 'travaille mon référencement'] }],
    settings: [
      { key: 'seo_mots_cles', label: 'mots-clés prioritaires', type: 'list', example: '« vise boulangerie bio Lille »' },
      { key: 'seo_zone', label: 'zone géographique à travailler', type: 'string' },
      { key: 'seo_longueur_article', label: 'longueur des articles', type: 'number', example: '« des articles plus courts » → 800' },
      { key: 'seo_frequence', label: 'nombre d\'articles par mois', type: 'number' },
      { key: 'seo_concurrents', label: 'concurrents à surveiller', type: 'list' },
      ...DOCUMENT_SETTINGS, ...COMMON_SETTINGS,
    ],
  },
  whatsapp: {
    agentId: 'whatsapp', displayName: 'Stella',
    actions: [{ tag: '{"type":"whatsapp_send","phone":"33612345678","message":"..."}', label: 'envoyer un message WhatsApp', phrasings: ['envoie un whatsapp', 'confirme le rendez-vous', 'rappelle le client'] }],
    settings: [
      { key: 'wa_rappel_avant_h', label: 'combien d\'heures avant le RDV envoyer le rappel', type: 'number', example: '« rappelle la veille » → 24' },
      { key: 'wa_plage_envoi', label: 'plage horaire d\'envoi', type: 'string', example: '« pas après 20h » → "9h-20h"' },
      { key: 'wa_max_par_jour', label: 'nombre maximum de messages par jour', type: 'number' },
      { key: 'wa_confirmation_auto', label: 'confirmer automatiquement les réservations', type: 'boolean' },
      { key: 'wa_langues', label: 'langues dans lesquelles répondre', type: 'list' },
      ...COMMON_SETTINGS,
    ],
  },
  rh: {
    agentId: 'rh', displayName: 'Sara',
    actions: [
      { tag: '{"type":"rh_document","doc":"cdi"}', label: 'rédiger un contrat de travail', phrasings: ['fais-moi un contrat', 'génère un CDI', 'un CDD pour un saisonnier'] },
      { tag: '{"type":"rh_document","doc":"avenant"}', label: 'rédiger un avenant', phrasings: ['fais un avenant', 'je change ses horaires'] },
      { tag: '{"type":"rh_document","doc":"attestation"}', label: 'rédiger une attestation', phrasings: ['une attestation de travail', 'un certificat de travail'] },
      { tag: '{"type":"rh_document","doc":"rupture"}', label: 'préparer une rupture conventionnelle', phrasings: ['rupture conventionnelle', 'je veux me séparer de quelqu\'un'] },
    ],
    settings: [
      // Sans ces réglages, un contrat sort générique et inutilisable.
      { key: 'rh_convention_collective', label: 'convention collective applicable (nom ou IDCC)', type: 'string', example: '« on est en HCR » → "HCR (IDCC 1979)"' },
      { key: 'rh_forme_juridique', label: 'forme juridique de l\'entreprise', type: 'string', example: 'SARL, SAS, micro-entreprise' },
      { key: 'rh_duree_hebdo', label: 'durée hebdomadaire de référence', type: 'string', example: '« on est à 39h » → "39h"' },
      { key: 'rh_periode_essai', label: 'durée de période d\'essai par défaut', type: 'string', example: '« 2 mois d\'essai »' },
      { key: 'rh_salaire_affichage', label: 'exprimer les salaires en brut ou en net', type: 'enum', values: ['brut', 'net'] },
      { key: 'rh_rappels_echeances', label: 'te prévenir avant une fin de période d\'essai ou de CDD', type: 'boolean', example: '« préviens-moi avant la fin des essais » → true' },
      { key: 'rh_niveau_prudence', label: 'niveau de prudence juridique', type: 'enum', values: ['standard', 'prudent'], example: '« sois très prudent, je crains les prud\'hommes » → prudent' },
      ...DOCUMENT_SETTINGS, ...COMMON_SETTINGS,
    ],
  },
  comptable: {
    agentId: 'comptable', displayName: 'Louis',
    actions: [
      { tag: '{"type":"finance_document","doc":"previsionnel"}', label: 'produire un prévisionnel', phrasings: ['fais un prévisionnel', 'projection sur 3 ans'] },
      { tag: '{"type":"finance_document","doc":"business_plan"}', label: 'produire un business plan', phrasings: ['business plan', 'dossier pour la banque'] },
      { tag: '{"type":"finance_document","doc":"tresorerie"}', label: 'produire un plan de trésorerie', phrasings: ['plan de trésorerie', 'je veux voir mes flux'] },
      { tag: '{"type":"finance_document","doc":"rentabilite"}', label: 'calculer le seuil de rentabilité', phrasings: ['seuil de rentabilité', 'à partir de combien je gagne'] },
    ],
    settings: [
      // Sans ces chiffres, un prévisionnel est une fiction.
      { key: 'fin_debut_exercice', label: 'date de début d\'exercice comptable', type: 'string', example: '« mon exercice démarre en avril » → "01-04"' },
      { key: 'fin_devise', label: 'devise', type: 'string', example: 'EUR' },
      { key: 'fin_regime_tva', label: 'régime de TVA', type: 'enum', values: ['franchise', 'reel_simplifie', 'reel_normal'], example: '« je suis en franchise de TVA » → franchise' },
      { key: 'fin_taux_tva', label: 'taux de TVA principal', type: 'number', example: '« TVA à 10% en restauration » → 10' },
      { key: 'fin_regime_fiscal', label: 'régime fiscal', type: 'enum', values: ['micro', 'bic_reel', 'bnc', 'is'] },
      { key: 'fin_horizon_mois', label: 'horizon par défaut des projections', type: 'number', example: '« projette sur 3 ans » → 36' },
      { key: 'fin_charges_fixes', label: 'charges fixes mensuelles', type: 'number', example: '« j\'ai 4200€ de charges fixes » → 4200' },
      { key: 'fin_ticket_moyen', label: 'panier moyen', type: 'number' },
      { key: 'fin_marge_cible', label: 'marge cible en %', type: 'number' },
      { key: 'fin_saisonnalite', label: 'saisonnalité de l\'activité', type: 'string', example: '« creux en janvier, pic en décembre »' },
      { key: 'fin_seuil_alerte_treso', label: 'te prévenir si la trésorerie passe sous ce montant', type: 'number', example: '« alerte-moi sous 5000€ » → 5000' },
      ...DOCUMENT_SETTINGS, ...COMMON_SETTINGS,
    ],
  },
};

/**
 * Réglages ACTUELS du client, injectés dans le prompt de l'agent.
 *
 * Sans ça, on aurait ajouté des dizaines de réglages que personne ne lit — le
 * client les fixerait et rien ne changerait, ce qui est le même mensonge sous
 * une autre forme. Ici l'agent voit ses propres réglages à chaque conversation
 * et à chaque génération, et doit les appliquer.
 */
export async function currentSettingsPromptBlock(
  supabase: any,
  userId: string | null,
  agentId: string,
): Promise<string> {
  if (!userId) return '';
  try {
    const { data } = await supabase
      .from('org_agent_configs')
      .select('config')
      .eq('user_id', userId)
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const cfg = (data?.config || {}) as Record<string, any>;
    const cap = AGENT_CAPABILITIES[agentId];
    const known = new Map((cap?.settings || []).map(s => [s.key, s.label]));

    const lines: string[] = [];
    for (const [k, v] of Object.entries(cfg)) {
      if (v === null || v === undefined || v === '') continue;
      if (['updated_at', 'schedule', 'setup_completed', 'avatar_url', 'display_name'].includes(k)) continue;
      const label = known.get(k) || k;
      const val = Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v).slice(0, 120) : String(v);
      lines.push(`  • ${label} : ${val}`);
    }
    if (lines.length === 0) return '';

    return `\n━━━ RÉGLAGES ACTUELS DE CE CLIENT (à appliquer, sans exception) ━━━
${lines.join('\n')}

Ces réglages ont été choisis par le client, dans l'interface ou en te le disant.
Tu les respectes dans TOUT ce que tu produis. Si l'un d'eux t'empêche de faire ce
qu'il demande à l'instant, tu le lui dis au lieu de l'ignorer.\n`;
  } catch {
    return '';
  }
}

/** Liste blanche des clés réellement acceptées pour un agent donné. */
export function allowedSettingKeys(agentId: string): Set<string> {
  const cap = AGENT_CAPABILITIES[agentId];
  const keys = new Set<string>((cap?.settings || COMMON_SETTINGS).map(s => s.key));
  // Un client parle souvent de cadence à n'importe quel agent : on l'accepte
  // partout et on la range chez l'agent contenu au moment d'écrire.
  for (const s of CADENCE_SETTINGS) keys.add(s.key);
  return keys;
}

/** Bloc de prompt : ce que CET agent sait faire et sait régler. */
export function capabilitiesPromptBlock(agentId: string): string {
  const cap = AGENT_CAPABILITIES[agentId];
  if (!cap) return '';

  const actions = cap.actions.map(a =>
    `  • ${a.label} → [ACTION:${a.tag}]\n     le client dira par exemple : ${a.phrasings.map(p => `« ${p} »`).join(', ')}`,
  ).join('\n');

  const settings = cap.settings.map(s => {
    const vals = s.values ? ` (${s.values.join(' | ')})` : s.type === 'boolean' ? ' (true|false)' : s.type === 'number' ? ' (nombre)' : '';
    return `  • ${s.key}${vals} — ${s.label}${s.example ? `\n     ex : ${s.example}` : ''}`;
  }).join('\n');

  return `\n━━━ CE QUE TU SAIS FAIRE ET RÉGLER (${cap.displayName}) ━━━
ACTIONS que tu peux lancer immédiatement :
${actions}

RÉGLAGES que tu peux appliquer durablement, via
[ACTION:{"type":"set_settings","agent":"${cap.agentId}","settings":{...}}] :
${settings}

RÈGLES :
1. Une demande qui correspond à une action ci-dessus → tu émets le tag, tu ne décris pas la procédure au client.
2. Une demande de réglage → tu émets set_settings avec la clé EXACTE. Un réglage demandé à l'oral vaut un réglage changé dans l'interface : il devient permanent.
3. Une demande qui ne correspond à aucune clé → tu la mets dans custom_instructions plutôt que d'inventer une clé.
4. Tu confirmes ce que tu as réglé, en clair et en français ordinaire (« ok, 3 posts par jour sur Instagram à partir de maintenant »).\n`;
}
