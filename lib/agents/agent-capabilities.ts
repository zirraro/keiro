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
  { key: 'custom_instructions', label: 'consigne libre à respecter durablement', type: 'string', example: '« on ferme du 1er au 20 août »' },
  { key: 'escalation_keywords', label: 'mots qui doivent te faire prévenir le client', type: 'list', example: '« préviens-moi si on parle de remboursement »' },
  { key: 'report_frequency', label: 'fréquence des comptes rendus', type: 'enum', values: ['daily', 'weekly', 'monthly'] },
  { key: 'email_notify', label: 'recevoir les notifications par email', type: 'boolean' },
];

export const AGENT_CAPABILITIES: Record<string, AgentCapability> = {
  content: {
    agentId: 'content', displayName: 'Léna',
    actions: [
      { tag: '{"type":"generate_post","platform":"instagram","format":"post"}', label: 'créer et publier un post', phrasings: ['publie', 'poste', 'fais un post', 'mets en ligne', 'balance un post'] },
      { tag: '{"type":"list_posts"}', label: 'montrer les posts planifiés', phrasings: ['montre le planning', 'qu\'est-ce qui est prévu', 'mes prochains posts'] },
    ],
    settings: [...CADENCE_SETTINGS, ...COMMON_SETTINGS],
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
      ...COMMON_SETTINGS,
    ],
  },
  commercial: {
    agentId: 'commercial', displayName: 'Léo',
    actions: [{ tag: '{"type":"prospect","query":"restaurant Paris"}', label: 'chercher des prospects', phrasings: ['trouve des prospects', 'prospecte', 'cherche des clients', 'remplis le CRM'] }],
    settings: [
      { key: 'prospection_sessions', label: 'nombre de sessions de prospection par jour', type: 'number' },
      ...COMMON_SETTINGS,
    ],
  },
  dm_instagram: {
    agentId: 'dm_instagram', displayName: 'Jade',
    actions: [
      { tag: '{"type":"scan_dms"}', label: 'traiter les DM en attente', phrasings: ['réponds aux DM', 'scanne les messages', 'regarde mes DM'] },
      { tag: '{"type":"reply_comments"}', label: 'répondre aux commentaires', phrasings: ['réponds aux commentaires', 'gère les commentaires'] },
    ],
    settings: COMMON_SETTINGS,
  },
  gmaps: {
    agentId: 'gmaps', displayName: 'Théo',
    actions: [{ tag: '{"type":"gmaps_run"}', label: 'répondre aux avis et optimiser la fiche', phrasings: ['réponds aux avis', 'optimise ma fiche google', 'gère ma réputation'] }],
    settings: [
      { key: 'auto_reply_reviews', label: 'répondre automatiquement aux avis', type: 'boolean' },
      { key: 'gbp_mode', label: 'modifier la fiche ou seulement proposer', type: 'enum', values: ['auto', 'suggest'] },
      ...COMMON_SETTINGS,
    ],
  },
  seo: {
    agentId: 'seo', displayName: 'Théo (SEO)',
    actions: [{ tag: '{"type":"seo_article"}', label: 'écrire un article de blog optimisé', phrasings: ['écris un article', 'fais un blog', 'travaille mon référencement'] }],
    settings: COMMON_SETTINGS,
  },
  whatsapp: {
    agentId: 'whatsapp', displayName: 'Stella',
    actions: [{ tag: '{"type":"whatsapp_send","phone":"33612345678","message":"..."}', label: 'envoyer un message WhatsApp', phrasings: ['envoie un whatsapp', 'confirme le rendez-vous', 'rappelle le client'] }],
    settings: COMMON_SETTINGS,
  },
  rh: {
    agentId: 'rh', displayName: 'Sara',
    actions: [{ tag: '{"type":"rh_document","doc":"cdd"}', label: 'générer un document RH', phrasings: ['fais-moi un contrat', 'génère un CDD', 'rédige une attestation'] }],
    settings: COMMON_SETTINGS,
  },
  comptable: {
    agentId: 'comptable', displayName: 'Louis',
    actions: [{ tag: '{"type":"finance_document","doc":"previsionnel"}', label: 'produire un document financier', phrasings: ['fais un prévisionnel', 'business plan', 'tableau de trésorerie'] }],
    settings: COMMON_SETTINGS,
  },
};

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
