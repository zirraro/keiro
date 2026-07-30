/**
 * État de connexion du client, injecté dans le chat de TOUS les agents.
 *
 * Pourquoi (règle fondateur 2026-07-29) : un client a demandé une action à Hugo
 * et s'est fait répondre « connecte-toi d'abord et dis-moi quand c'est fait ».
 * L'agent DOIT savoir seul ce qui est branché : le client ne doit jamais avoir
 * à confirmer un état que la base connaît déjà. Ça vaut pour tous les agents.
 *
 * On expose deux choses :
 *   - `getConnectionState()` : les faits, structurés ;
 *   - `connectionPromptBlock()` : le même état en bloc de prompt, avec les
 *     règles de conduite (agir si c'est branché, donner le chemin exact sinon).
 */

export interface ConnectionState {
  instagram: { connected: boolean; username?: string | null };
  tiktok: { connected: boolean; username?: string | null };
  linkedin: { connected: boolean; username?: string | null };
  /** Boîte mail : Gmail OAuth, Outlook, ou domaine perso (SMTP/IMAP). */
  mailbox: { connected: boolean; provider?: 'gmail' | 'outlook' | 'imap' | null; address?: string | null; canManage: boolean };
  googleBusiness: { connected: boolean; location?: string | null };
  whatsapp: { connected: boolean };
}

const PROFILE_COLUMNS = [
  'instagram_business_account_id', 'instagram_access_token', 'instagram_igaa_token', 'instagram_username',
  'facebook_page_access_token',
  'tiktok_access_token', 'tiktok_username', 'tiktok_display_name',
  'linkedin_access_token', 'linkedin_username', 'linkedin_user_id',
  'gmail_access_token', 'gmail_email',
  'outlook_access_token', 'outlook_email',
  'smtp_user', 'smtp_host', 'imap_host',
  'google_business_account_id', 'google_business_access_token', 'google_business_location_name',
].join(', ');

export async function getConnectionState(supabase: any, userId: string | null): Promise<ConnectionState | null> {
  if (!userId) return null;
  try {
    const { data: p } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', userId)
      .maybeSingle();
    if (!p) return null;

    const igConnected = !!p.instagram_business_account_id && (!!p.instagram_igaa_token || !!p.instagram_access_token || !!p.facebook_page_access_token);

    const mailProvider = p.gmail_access_token ? 'gmail' as const
      : p.outlook_access_token ? 'outlook' as const
        : (p.smtp_user && p.smtp_host) ? 'imap' as const
          : null;

    // WhatsApp passe par un numéro applicatif partagé (Cloud API) : la
    // disponibilité dépend de l'add-on/plan, pas d'un token dans profiles.
    let whatsappConnected = false;
    try {
      const { data: waCfg } = await supabase
        .from('org_agent_configs')
        .select('config')
        .eq('user_id', userId)
        .eq('agent_id', 'whatsapp')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      whatsappConnected = !!(waCfg?.config?.addon_active || waCfg?.config?.phone_number_id);
    } catch { /* pas bloquant */ }

    return {
      instagram: { connected: igConnected, username: p.instagram_username },
      tiktok: { connected: !!p.tiktok_access_token, username: p.tiktok_username || p.tiktok_display_name },
      linkedin: { connected: !!p.linkedin_access_token, username: p.linkedin_username },
      mailbox: {
        connected: !!mailProvider,
        provider: mailProvider,
        address: p.gmail_email || p.outlook_email || p.smtp_user || null,
        // Gestion complète (corbeille, dossiers, réponses) : Gmail Option B ou IMAP.
        canManage: mailProvider === 'imap' || (mailProvider === 'gmail' && process.env.GMAIL_OPTION_B === 'on'),
      },
      googleBusiness: { connected: !!p.google_business_account_id && !!p.google_business_access_token, location: p.google_business_location_name },
      whatsapp: { connected: whatsappConnected },
    };
  } catch {
    return null;
  }
}

/** Où le client va brancher chaque canal (chemin exact, pas « dans les réglages »). */
const CONNECT_PATHS: Record<string, string> = {
  instagram: 'Réglages → Connexions → Instagram',
  tiktok: 'Réglages → Connexions → TikTok',
  linkedin: 'Réglages → Connexions → LinkedIn',
  mailbox: 'Réglages → Email (Gmail en 1 clic, ou les identifiants de son domaine)',
  googleBusiness: 'Réglages → Connexions → Google Business',
  whatsapp: 'la page de Stella (bouton Activer)',
};

export function connectionPromptBlock(state: ConnectionState | null): string {
  if (!state) return '';

  const line = (label: string, ok: boolean, extra?: string | null, key?: string) =>
    ok
      ? `  • ${label} : CONNECTÉ${extra ? ` (${extra})` : ''}`
      : `  • ${label} : NON connecté → à brancher dans ${CONNECT_PATHS[key || ''] || 'les réglages'}`;

  const lines = [
    line('Instagram', state.instagram.connected, state.instagram.username, 'instagram'),
    line('TikTok', state.tiktok.connected, state.tiktok.username, 'tiktok'),
    line('LinkedIn', state.linkedin.connected, state.linkedin.username, 'linkedin'),
    line('Boîte mail', state.mailbox.connected, state.mailbox.address ? `${state.mailbox.address}${state.mailbox.canManage ? ', gestion complète autorisée' : ', envoi seulement'}` : null, 'mailbox'),
    line('Fiche Google Business', state.googleBusiness.connected, state.googleBusiness.location, 'googleBusiness'),
    line('WhatsApp (Stella)', state.whatsapp.connected, null, 'whatsapp'),
  ];

  return `\n━━━ ÉTAT DES CONNEXIONS DE CE CLIENT (tu le SAIS, ne le demande jamais) ━━━
${lines.join('\n')}

RÈGLES DE CONDUITE — NON NÉGOCIABLES :
1. Tu connais cet état. Tu ne demandes JAMAIS « es-tu connecté ? » et tu ne dis JAMAIS « connecte-toi puis dis-moi quand c'est fait ». Le client n'a pas à te confirmer ce que tu vois déjà.
2. Si le canal nécessaire est CONNECTÉ : tu lances l'action et tu annonces ce que tu fais, au présent. Pas de conditionnel, pas de demande de permission pour une action qu'il vient de demander.
3. Si le canal est NON connecté : tu le dis en UNE phrase, tu donnes le chemin exact ci-dessus, et tu enchaînes tout de suite avec ce que tu peux faire QUAND MÊME (préparer, rédiger, planifier). Tu ne bloques jamais la conversation sur une connexion manquante.
4. Tu ne renvoies jamais le client vers un tutoriel pour qu'il fasse lui-même ce que tu sais faire.\n`;
}
