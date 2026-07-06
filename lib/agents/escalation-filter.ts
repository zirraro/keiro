/**
 * Filtre de compétences / escalade par mots-clés pour les agents en AUTO
 * (Jade DM + commentaires, Hugo emails). Founder 06/07.
 *
 * Principe : l'agent répond en auto, MAIS pour certains messages il ne finalise
 * pas — il prépare un brouillon et NOTIFIE le client qui reprend la main. Deux
 * sources de déclenchement :
 *   1. Mots-clés définis PAR LE CLIENT (« je gère moi-même ») — ex: réservation,
 *      devis, partenariat… (config.escalation_keywords).
 *   2. Triggers SENSIBLES intégrés (toujours actifs sauf désactivation) —
 *      client mécontent, menace/intégrité, insulte, légal/RGPD/santé.
 *
 * On garde TOUJOURS le lien + la tâche (jamais 0 action) : l'agent prépare une
 * réponse, mais la finalisation revient au client sur ces messages.
 */

export interface EscalationConfig {
  /** Mots-clés que le client veut gérer lui-même. */
  keywords?: string[];
  /** Triggers sensibles intégrés (défaut: true). */
  sensitiveOn?: boolean;
}

export interface EscalationResult {
  escalate: boolean;
  category?: 'client_keyword' | 'unhappy' | 'threat' | 'insult' | 'legal_health';
  reason?: string;
  matched?: string;
}

// Triggers sensibles intégrés (FR + EN). Bornés, sûrs (pas de faux positifs
// agressifs : on vise des signaux forts, pas un simple "non").
const SENSITIVE: Record<Exclude<EscalationResult['category'], 'client_keyword' | undefined>, RegExp> = {
  unhappy: /\b(m[ée]content|d[ée][çc]u|insatisfait|inadmissible|scandale|honte(?:ux)?|arnaque|arnaqueur|rembours|plainte|avocat|jamais plus|tromp[ée]|nul(?:le)? à|catastrophe|inacceptable|angry|refund|scam|disappointed|unacceptable|worst|terrible service)\b/i,
  threat: /\b(menace|je vais te|violence|frapper|tuer|agress|repr[ée]sailles|harc[èe]l|porter plainte|police|threat|kill you|hurt you|assault|harass|sue you)\b/i,
  insult: /\b(connard|conne|salaud|salope|pute|encul[ée]|fdp|fils de|batard|b[âa]tard|merde|ta gueule|incomp[ée]tent|abruti|imb[ée]cile|débile|fuck|shit|asshole|bitch|moron|idiot|incompetent)\b/i,
  legal_health: /\b(rgpd|gdpr|donn[ée]es personnelles|droit [àa] l['’]effacement|tribunal|juridique|mise en demeure|m[ée]dical|sant[ée]|ordonnance|diagnostic|allergi|lawyer|legal action|medical|prescription|lawsuit)\b/i,
};

/**
 * Vérifie si un message entrant doit être escaladé (brouillon + notif client
 * au lieu d'un envoi auto). Retourne la 1ʳᵉ raison trouvée.
 */
export function checkEscalation(text: string, config?: EscalationConfig | null): EscalationResult {
  const t = (text || '').toLowerCase();
  if (!t.trim()) return { escalate: false };

  // 1. Mots-clés client (priorité : c'est SON choix explicite).
  const keywords = (config?.keywords || []).map(k => String(k || '').toLowerCase().trim()).filter(Boolean);
  for (const k of keywords) {
    if (k.length >= 2 && t.includes(k)) {
      return { escalate: true, category: 'client_keyword', matched: k, reason: `Sujet géré par le client : « ${k} »` };
    }
  }

  // 2. Triggers sensibles intégrés (sauf désactivés).
  if (config?.sensitiveOn !== false) {
    for (const [cat, re] of Object.entries(SENSITIVE) as [Exclude<EscalationResult['category'], 'client_keyword' | undefined>, RegExp][]) {
      const m = t.match(re);
      if (m) {
        const reason = cat === 'unhappy' ? 'Client mécontent / réclamation'
          : cat === 'threat' ? 'Menace / atteinte à l’intégrité'
          : cat === 'insult' ? 'Message insultant'
          : 'Sujet légal / RGPD / santé';
        return { escalate: true, category: cat, matched: m[0], reason };
      }
    }
  }

  return { escalate: false };
}

/** Lit la config d'escalade d'un agent pour un client depuis org_agent_configs. */
export async function loadEscalationConfig(supabase: any, userId: string, agentId: string): Promise<EscalationConfig> {
  try {
    const { data } = await supabase.from('org_agent_configs')
      .select('config').eq('user_id', userId).eq('agent_id', agentId).maybeSingle();
    const c = data?.config || {};
    // Les settings client stockent une chaîne « réservation, devis » → on
    // accepte string (split virgule) OU array.
    const raw = c.escalation_keywords;
    const keywords = Array.isArray(raw)
      ? raw
      : String(raw || '').split(/[,;\n]/).map((s: string) => s.trim()).filter(Boolean);
    return { keywords, sensitiveOn: c.escalation_sensitive !== false };
  } catch { return { keywords: [], sensitiveOn: true }; }
}
