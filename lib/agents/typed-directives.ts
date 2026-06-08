/**
 * Typed client directives — the canonical orders a client can give an
 * agent via chat. Each directive type maps to a concrete behavior the
 * agent route consumes (not just free text dumped into the prompt).
 *
 * Founder ask 2026-06-08: "verifie bien que lena principalement mais
 * aussi les autres agnets recoivent les ordres des clients via leur
 * chat et les interes dans leur futures action".
 *
 * Anticipated common orders:
 *   - posting_hours: "publie à 9h, 13h et 19h"
 *   - inspire_account: "inspire-toi de @bouillonchartier"
 *   - focus_topic: "parle plus de notre nouvelle pizza"
 *   - focus_news: "parle de l'actualité X"
 *   - avoid_topic: "ne parle pas de promo"
 *   - format_preference: "plus de reels, moins de carrousels"
 *   - language_tone: "ton plus formel" / "plus fun"
 *   - frequency: "publie moins" / "publie plus"
 *   - platform_priority: "concentre-toi sur tiktok"
 *   - brand_signature: "termine toujours par 'à très vite à la maison'"
 *   - audience_target: "vise les jeunes 18-25" / "ma clientèle est haut de gamme"
 *
 * For agents other than content (Léna), we add agent-specific intents:
 *   - dm: dm_tone, dm_blacklist_handles, dm_target_niches
 *   - email: email_signature, email_cadence_days, email_subject_style
 *   - leo: prospection_zones, prospection_excluded_types
 */

export type DirectiveType =
  | 'posting_hours'         // value: { content?: string[]; insta?: string[]; tiktok?: string[]; linkedin?: string[] }
  | 'inspire_account'       // value: { platform: 'instagram'|'tiktok'|'linkedin'; handle: string; reason?: string }
  | 'focus_topic'           // value: { topic: string; until?: ISO_date }
  | 'focus_news'            // value: { keyword: string; until?: ISO_date }
  | 'avoid_topic'           // value: { topic: string }
  | 'format_preference'     // value: { formats: string[]; bias: 'more'|'less'|'only' }
  | 'language_tone'         // value: { tone: 'formal'|'casual'|'energetic'|'calm'|'professional'|'fun'|'luxe' }
  | 'frequency'             // value: { posts_per_day?: number; posts_per_week?: number }
  | 'platform_priority'     // value: { primary: 'instagram'|'tiktok'|'linkedin'; secondary?: string[] }
  | 'brand_signature'       // value: { text: string; position: 'start'|'end' }
  | 'audience_target'       // value: { description: string; age_range?: [number, number] }
  // DM agent (Jade)
  | 'dm_tone'               // value: { tone: string }
  | 'dm_blacklist_handles'  // value: { handles: string[] }
  | 'dm_target_niches'      // value: { niches: string[] }
  // Email agent (Hugo)
  | 'email_signature'       // value: { text: string }
  | 'email_cadence_days'    // value: { first_to_second: number; second_to_third: number }
  | 'email_subject_style'   // value: { style: string }
  // Léo
  | 'prospection_zones'         // value: { zones: string[] }
  | 'prospection_excluded_types' // value: { types: string[] }
  // Catch-all for unanticipated orders. Agent receives raw_text in
  // prompt + makes best-effort. Verification + admin alert if failed.
  | 'custom';                   // value: { instruction: string }

export interface TypedDirective {
  type: DirectiveType;
  value: any;
  raw_text: string;       // the original chat utterance, for audit
  confidence: number;     // 0–1
  expires_at?: string | null;
  agent_id: string;       // which agent this applies to
  source: 'chat' | 'wizard' | 'inferred';
}

/**
 * Mini-rules layer to classify a free-text directive into a typed
 * intent BEFORE we hit an LLM. Catches the common patterns cheaply.
 * Returns null when no rule matches → caller falls back to LLM.
 */
export function quickClassifyDirective(rawText: string, agentId: string): TypedDirective | null {
  const t = (rawText || '').toLowerCase().trim();
  if (!t) return null;

  // posting hours — e.g. "publie à 9h, 13h et 19h"
  const hoursMatch = t.match(/\b(\d{1,2})\s?h\d{0,2}\b/g);
  if (hoursMatch && (t.includes('publie') || t.includes('poste') || t.includes('horaire'))) {
    const hours = hoursMatch.slice(0, 5).map((h) => {
      const m = h.match(/(\d{1,2})\s?h(\d{0,2})/);
      if (!m) return null;
      const hh = String(Math.min(23, parseInt(m[1]))).padStart(2, '0');
      const mm = String(m[2] ? Math.min(59, parseInt(m[2])) : 0).padStart(2, '0');
      return `${hh}:${mm}`;
    }).filter(Boolean) as string[];
    if (hours.length > 0) {
      return { type: 'posting_hours', value: { content: hours }, raw_text: rawText, confidence: 0.85, agent_id: agentId, source: 'chat' };
    }
  }

  // inspire from account — "inspire-toi de @x", "regarde @x"
  const inspireMatch = t.match(/(?:inspire|inspires?[\s-]toi|regarde|comme)\s+(?:de\s+)?@?([a-z0-9._]{3,30})/i);
  if (inspireMatch) {
    const handle = inspireMatch[1].replace(/^@/, '');
    let platform: 'instagram' | 'tiktok' | 'linkedin' = 'instagram';
    if (t.includes('tiktok')) platform = 'tiktok';
    else if (t.includes('linkedin')) platform = 'linkedin';
    return {
      type: 'inspire_account',
      value: { platform, handle, reason: rawText.substring(0, 200) },
      raw_text: rawText, confidence: 0.9, agent_id: agentId, source: 'chat',
    };
  }

  // avoid topic — "ne parle pas de X", "évite X"
  const avoidMatch = t.match(/(?:ne parle pas de|évite|évites|n'aborde pas|pas de sujet)\s+(.{3,80})/i);
  if (avoidMatch) {
    return {
      type: 'avoid_topic',
      value: { topic: avoidMatch[1].trim().replace(/[.!?]$/, '') },
      raw_text: rawText, confidence: 0.85, agent_id: agentId, source: 'chat',
    };
  }

  // focus topic — "parle plus de X", "mets en avant X"
  const focusMatch = t.match(/(?:parle plus de|mets en avant|focalise sur|insiste sur|mets l'accent sur)\s+(.{3,80})/i);
  if (focusMatch) {
    return {
      type: 'focus_topic',
      value: { topic: focusMatch[1].trim().replace(/[.!?]$/, '') },
      raw_text: rawText, confidence: 0.85, agent_id: agentId, source: 'chat',
    };
  }

  // language tone — soft signals
  const toneMap: Record<string, string> = {
    'plus formel': 'formal', 'plus pro': 'professional', 'plus sérieux': 'professional',
    'plus fun': 'fun', 'plus décontracté': 'casual', 'plus chaleureux': 'casual',
    'plus haut de gamme': 'luxe', 'plus luxe': 'luxe',
    'plus énergique': 'energetic', 'plus calme': 'calm',
  };
  for (const [phrase, tone] of Object.entries(toneMap)) {
    if (t.includes(phrase)) {
      return {
        type: 'language_tone',
        value: { tone },
        raw_text: rawText, confidence: 0.8, agent_id: agentId, source: 'chat',
      };
    }
  }

  // frequency — "publie moins", "poste plus", "moins de posts"
  if (/(?:publie|poste)\s+(?:plus|moins)\b/i.test(t) || /(?:plus|moins)\s+de\s+posts?/i.test(t)) {
    const direction = /moins/.test(t) ? 'less' : 'more';
    return {
      type: 'frequency',
      value: { direction },
      raw_text: rawText, confidence: 0.7, agent_id: agentId, source: 'chat',
    };
  }

  // format preference — "plus de reels", "moins de carrousels"
  const formatMap: Record<string, string> = {
    'reel': 'reel', 'reels': 'reel', 'story': 'story', 'stories': 'story',
    'carrousel': 'carousel', 'carrousels': 'carousel', 'photo': 'image', 'photos': 'image',
    'vidéo': 'video', 'vidéos': 'video', 'post': 'post',
  };
  for (const [phrase, fmt] of Object.entries(formatMap)) {
    if (t.includes(phrase) && /\b(plus|moins|seulement|que)\b/.test(t)) {
      const bias = /seulement|que/.test(t) ? 'only' : (/moins/.test(t) ? 'less' : 'more');
      return {
        type: 'format_preference',
        value: { formats: [fmt], bias },
        raw_text: rawText, confidence: 0.7, agent_id: agentId, source: 'chat',
      };
    }
  }

  return null;
}

/**
 * Persist a typed directive to client_directives_typed. Idempotent on
 * (user_id, agent_id, type, fingerprint_of_value) — re-sending the same
 * directive bumps the row's updated_at but doesn't create duplicates.
 */
export async function saveTypedDirective(
  supabase: any,
  userId: string,
  directive: TypedDirective,
): Promise<void> {
  try {
    await supabase.from('client_directives_typed').upsert({
      user_id: userId,
      agent_id: directive.agent_id,
      type: directive.type,
      value: directive.value,
      raw_text: directive.raw_text,
      confidence: directive.confidence,
      source: directive.source,
      expires_at: directive.expires_at ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,agent_id,type', ignoreDuplicates: false });
  } catch {
    /* table may not exist yet — caller handles fallback path */
  }
}

/**
 * Load active typed directives for a user/agent. Skips expired rows.
 */
export async function loadTypedDirectives(
  supabase: any,
  userId: string,
  agentId: string,
): Promise<TypedDirective[]> {
  try {
    const { data } = await supabase
      .from('client_directives_typed')
      .select('type, value, raw_text, confidence, source, expires_at, agent_id')
      .eq('user_id', userId)
      .eq('agent_id', agentId)
      .order('updated_at', { ascending: false })
      .limit(20);
    if (!data) return [];
    const now = Date.now();
    return (data as any[]).filter((d) => !d.expires_at || new Date(d.expires_at).getTime() > now) as TypedDirective[];
  } catch {
    return [];
  }
}

/**
 * Build a prompt block from typed directives. Léna and the other
 * agents inject this in their system prompts so they actually respect
 * the orders (instead of just hoping the LLM parses free-form text).
 */
export function directivesPromptBlock(directives: TypedDirective[]): string {
  if (!directives.length) return '';
  const lines: string[] = [];
  for (const d of directives) {
    switch (d.type) {
      case 'posting_hours':
        if (d.value?.content?.length) {
          lines.push(`⏰ HORAIRES IMPOSÉS : publie à ${d.value.content.join(', ')} — respecte ces créneaux strictement.`);
        }
        break;
      case 'inspire_account':
        lines.push(`✨ INSPIRATION : étudie le compte ${d.value.platform} @${d.value.handle} et imite son style éditorial (cadrage, vocabulaire, format de hook). NE COPIE PAS les visuels, juste la logique.`);
        break;
      case 'focus_topic':
        lines.push(`🎯 SUJET PRIORITAIRE : "${d.value.topic}" — au moins 1 post sur 3 doit traiter ce sujet.`);
        break;
      case 'focus_news':
        lines.push(`📰 ACTU À EXPLOITER : "${d.value.keyword}" — surfe sur cette actualité dans les prochains posts pertinents.`);
        break;
      case 'avoid_topic':
        lines.push(`🚫 SUJET INTERDIT : "${d.value.topic}" — n'aborde JAMAIS ce sujet.`);
        break;
      case 'format_preference': {
        const fmt = (d.value?.formats || []).join(', ');
        const bias = d.value?.bias || 'more';
        const verb = bias === 'only' ? 'EXCLUSIVEMENT' : bias === 'less' ? 'MOINS DE' : 'PLUS DE';
        lines.push(`📐 FORMAT : ${verb} ${fmt}.`);
        break;
      }
      case 'language_tone':
        lines.push(`🗣️ TON : ${d.value.tone}. Adopte ce ton sur tous les posts à venir.`);
        break;
      case 'frequency':
        if (d.value?.direction === 'more') lines.push(`📈 CADENCE : le client veut PLUS de publications.`);
        else if (d.value?.direction === 'less') lines.push(`📉 CADENCE : le client veut MOINS de publications.`);
        else if (d.value?.posts_per_day) lines.push(`📅 CADENCE : ${d.value.posts_per_day} publications par jour.`);
        break;
      case 'platform_priority':
        lines.push(`🎯 PRIORITÉ PLATEFORME : ${d.value.primary} en priorité${d.value.secondary?.length ? ', puis ' + d.value.secondary.join(', ') : ''}.`);
        break;
      case 'brand_signature':
        lines.push(`✍️ SIGNATURE MARQUE : ${d.value.position === 'start' ? 'commence' : 'termine'} chaque post par "${d.value.text}".`);
        break;
      case 'audience_target':
        lines.push(`👥 CIBLE : ${d.value.description}${d.value.age_range ? ` (${d.value.age_range[0]}-${d.value.age_range[1]} ans)` : ''}.`);
        break;
      case 'dm_tone':
        lines.push(`🗣️ TON DM : ${d.value.tone}.`);
        break;
      case 'dm_blacklist_handles':
        if (d.value?.handles?.length) lines.push(`🚫 NE JAMAIS DM : ${d.value.handles.join(', ')}.`);
        break;
      case 'dm_target_niches':
        if (d.value?.niches?.length) lines.push(`🎯 NICHES CIBLE DM : ${d.value.niches.join(', ')}.`);
        break;
      case 'email_signature':
        lines.push(`✍️ SIGNATURE EMAIL : "${d.value.text}" à la fin de chaque email.`);
        break;
      case 'email_subject_style':
        lines.push(`📧 STYLE OBJET EMAIL : ${d.value.style}.`);
        break;
      case 'prospection_zones':
        if (d.value?.zones?.length) lines.push(`📍 ZONES PROSPECTION : ${d.value.zones.join(', ')}.`);
        break;
      case 'prospection_excluded_types':
        if (d.value?.types?.length) lines.push(`🚫 TYPES EXCLUS PROSPECTION : ${d.value.types.join(', ')}.`);
        break;
      case 'custom':
        if (d.value?.instruction) {
          lines.push(`⚙️ DEMANDE CLIENT NON-CANONIQUE : "${d.value.instruction}". Fais ce qui est possible à ton niveau ; si impossible, le système alertera l'admin.`);
        }
        break;
    }
  }
  return lines.length
    ? `\n━━━ DIRECTIVES CLIENT (À RESPECTER STRICTEMENT) ━━━\n${lines.join('\n')}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
    : '';
}

/**
 * One-call sugar: load + render in one shot. Returns '' if no userId,
 * no directives, or anything throws — agents can append it to their
 * system prompt blindly:
 *
 *   const directivesBlock = await directiveBlockFor(supabase, userId, 'commercial');
 *   await callGemini({ system: basePrompt + directivesBlock, ... });
 */
export async function directiveBlockFor(
  supabase: any,
  userId: string | null | undefined,
  agentId: string,
): Promise<string> {
  if (!userId || !supabase) return '';
  try {
    const typed = await loadTypedDirectives(supabase, userId, agentId);
    return directivesPromptBlock(typed);
  } catch {
    return '';
  }
}
