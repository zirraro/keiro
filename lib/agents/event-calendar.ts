/**
 * Calendrier d'événements DATÉ — règle fondateur du 2026-07-29.
 *
 * Pourquoi ce module existe : le calendrier précédent ne connaissait que des
 * dates ponctuelles (`'6-28': 'Tour de France début'`) comparées sur ±5 jours
 * DANS LE MÊME MOIS. Trois conséquences observées en prod :
 *   1. un événement de 3 semaines n'avait aucune fenêtre "pendant" ;
 *   2. un événement à cheval sur deux mois devenait invisible ;
 *   3. aucune date de FIN n'existait → Léna a publié 39 posts sur le Festival
 *      de Cannes les 20 et 27 juillet, deux mois après la clôture, dont
 *      plusieurs disant littéralement "vient de se finir".
 * En parallèle, rien ne limitait la répétition : 42 hooks quasi identiques
 * ("Le Tour de France démarre…") le même jour.
 *
 * Règle fondateur, appliquée ici à la lettre :
 *   - on commence à communiquer 3 SEMAINES avant, jamais avant ;
 *   - on s'arrête 3 JOURS après la fin, jamais après ;
 *   - la cadence est ESPACÉE, pas quotidienne : 1er post à J-21, 2e à J-14,
 *     3e la dernière semaine, 4e pendant l'événement, puis au plus 1 par jour
 *     les 3 jours qui suivent la fin → 7 posts au grand maximum ;
 *   - CHAQUE post doit avoir un angle NEUF (jamais la même accroche) ;
 *   - on pondère selon l'ampleur : seuls les événements majeurs méritent la
 *     cadence complète.
 */

export type EventTier = 1 | 2 | 3;

export interface DatedEvent {
  key: string;
  label: string;
  /** Date de début incluse, format ISO 'YYYY-MM-DD'. */
  start: string;
  /** Date de fin incluse. Égale à `start` pour un événement d'un seul jour. */
  end: string;
  /**
   * Ampleur = combien de posts l'événement mérite.
   *   3 = majeur (audience nationale/mondiale) → cadence complète, 7 max
   *   2 = fort (grand public mais pas universel)  → 4 max
   *   1 = modeste (journée thématique, keynote)   → 1 seul post, le jour J
   */
  tier: EventTier;
  /**
   * Mots-clés servant à RECONNAÎTRE un post qui parle de cet événement,
   * pour compter le quota et bloquer les hors-fenêtre. Insensible à la casse.
   */
  matchers: string[];
}

/** Nombre de posts autorisés au total, par ampleur. */
export const MAX_POSTS_BY_TIER: Record<EventTier, number> = { 3: 7, 2: 4, 1: 1 };

/** Nombre de jours APRÈS la fin où l'on peut encore poster, par ampleur. */
const AFTER_DAYS_BY_TIER: Record<EventTier, number> = { 3: 3, 2: 1, 1: 0 };

/** Fenêtre d'anticipation en jours, par ampleur. */
const BEFORE_DAYS_BY_TIER: Record<EventTier, number> = { 3: 21, 2: 14, 1: 0 };

// ── Dates ────────────────────────────────────────────────────────────────
// ⚠️ Les événements mobiles (sport, culture) changent chaque année : cette
// liste est la SOURCE DE VÉRITÉ, elle doit être mise à jour tous les ans.
// Les événements à date fixe sont calculés plus bas.

const MOVING_EVENTS_BY_YEAR: Record<number, DatedEvent[]> = {
  2026: [
    // ── Sport ────────────────────────────────────────────────────────────
    { key: 'cdm_football_2026', label: 'Coupe du monde de football 2026 (USA/Canada/Mexique)', start: '2026-06-11', end: '2026-07-19', tier: 3, matchers: ['coupe du monde', 'mondial', 'les bleus', 'world cup'] },
    { key: 'tour_de_france_2026', label: 'Tour de France 2026', start: '2026-07-04', end: '2026-07-26', tier: 3, matchers: ['tour de france', 'maillot jaune', 'peloton', 'grande boucle'] },
    { key: 'roland_garros_2026', label: 'Roland-Garros 2026', start: '2026-05-24', end: '2026-06-07', tier: 3, matchers: ['roland-garros', 'roland garros', 'porte d\'auteuil'] },
    { key: 'jo_hiver_2026', label: 'JO d\'hiver Milan-Cortina 2026', start: '2026-02-06', end: '2026-02-22', tier: 3, matchers: ['jeux olympiques', 'jo d\'hiver', 'milan-cortina'] },
    { key: 'tour_de_france_femmes_2026', label: 'Tour de France Femmes 2026', start: '2026-08-01', end: '2026-08-09', tier: 2, matchers: ['tour de france femmes'] },
    { key: 'top14_finale_2026', label: 'Finale du Top 14 (rugby)', start: '2026-06-27', end: '2026-06-27', tier: 2, matchers: ['top 14', 'finale du top14'] },
    // ── Culture ──────────────────────────────────────────────────────────
    { key: 'cannes_2026', label: 'Festival de Cannes 2026', start: '2026-05-12', end: '2026-05-23', tier: 2, matchers: ['festival de cannes', 'palme d\'or', 'montée des marches'] },
    { key: 'cesar_2026', label: 'Cérémonie des César', start: '2026-02-27', end: '2026-02-27', tier: 1, matchers: ['césar du cinéma', 'les césars'] },
    { key: 'oscars_2026', label: 'Cérémonie des Oscars', start: '2026-03-15', end: '2026-03-15', tier: 1, matchers: ['oscars', 'academy awards'] },
    // ── Commerce ─────────────────────────────────────────────────────────
    { key: 'soldes_hiver_2026', label: 'Soldes d\'hiver', start: '2026-01-07', end: '2026-02-03', tier: 2, matchers: ['soldes d\'hiver'] },
    { key: 'soldes_ete_2026', label: 'Soldes d\'été', start: '2026-06-24', end: '2026-07-21', tier: 2, matchers: ['soldes d\'été'] },
    // ── Tech ─────────────────────────────────────────────────────────────
    { key: 'apple_keynote_2026', label: 'Keynote iPhone Apple', start: '2026-09-09', end: '2026-09-09', tier: 1, matchers: ['keynote apple', 'nouvel iphone'] },
  ],
};

/** Dimanche n° `n` du mois (1-indexé). */
function nthSundayOfMonth(year: number, month1: number, n: number): number {
  const first = new Date(Date.UTC(year, month1 - 1, 1));
  const firstSun = 1 + ((7 - first.getUTCDay()) % 7);
  return firstSun + (n - 1) * 7;
}

/** Dernier dimanche du mois. */
function lastSundayOfMonth(year: number, month1: number): number {
  const lastDay = new Date(Date.UTC(year, month1, 0)).getUTCDate();
  const lastDow = new Date(Date.UTC(year, month1 - 1, lastDay)).getUTCDay();
  return lastDay - lastDow;
}

function iso(year: number, month1: number, day: number): string {
  return `${year}-${String(month1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Événements à date fixe ou calculable, pour une année donnée. */
function fixedEvents(year: number): DatedEvent[] {
  // Black Friday = 4e vendredi de novembre.
  const firstNov = new Date(Date.UTC(year, 10, 1));
  const firstFriday = 1 + ((5 - firstNov.getUTCDay() + 7) % 7);
  const blackFriday = firstFriday + 21;

  return [
    { key: `nouvel_an_${year}`, label: 'Nouvel An', start: iso(year, 1, 1), end: iso(year, 1, 1), tier: 2, matchers: ['nouvel an', 'bonne année', 'réveillon du 31'] },
    { key: `saint_valentin_${year}`, label: 'Saint-Valentin', start: iso(year, 2, 14), end: iso(year, 2, 14), tier: 3, matchers: ['saint-valentin', 'saint valentin'] },
    { key: `journee_femmes_${year}`, label: 'Journée internationale des droits des femmes', start: iso(year, 3, 8), end: iso(year, 3, 8), tier: 1, matchers: ['droits des femmes', '8 mars'] },
    { key: `paques_poisson_${year}`, label: 'Poisson d\'avril', start: iso(year, 4, 1), end: iso(year, 4, 1), tier: 1, matchers: ['poisson d\'avril'] },
    { key: `fete_travail_${year}`, label: 'Fête du travail', start: iso(year, 5, 1), end: iso(year, 5, 1), tier: 1, matchers: ['fête du travail', '1er mai'] },
    { key: `fete_meres_${year}`, label: 'Fête des mères', start: iso(year, 5, lastSundayOfMonth(year, 5)), end: iso(year, 5, lastSundayOfMonth(year, 5)), tier: 3, matchers: ['fête des mères'] },
    { key: `fete_peres_${year}`, label: 'Fête des pères', start: iso(year, 6, nthSundayOfMonth(year, 6, 3)), end: iso(year, 6, nthSundayOfMonth(year, 6, 3)), tier: 2, matchers: ['fête des pères'] },
    { key: `fete_musique_${year}`, label: 'Fête de la musique', start: iso(year, 6, 21), end: iso(year, 6, 21), tier: 2, matchers: ['fête de la musique'] },
    { key: `fete_nationale_${year}`, label: 'Fête nationale du 14 juillet', start: iso(year, 7, 14), end: iso(year, 7, 14), tier: 2, matchers: ['14 juillet', 'fête nationale'] },
    { key: `rentree_${year}`, label: 'Rentrée scolaire', start: iso(year, 9, 1), end: iso(year, 9, 5), tier: 3, matchers: ['rentrée scolaire', 'la rentrée'] },
    { key: `halloween_${year}`, label: 'Halloween', start: iso(year, 10, 31), end: iso(year, 10, 31), tier: 2, matchers: ['halloween'] },
    { key: `black_friday_${year}`, label: 'Black Friday', start: iso(year, 11, blackFriday), end: iso(year, 11, blackFriday + 3), tier: 3, matchers: ['black friday', 'cyber monday'] },
    { key: `noel_${year}`, label: 'Noël', start: iso(year, 12, 24), end: iso(year, 12, 25), tier: 3, matchers: ['noël', 'réveillon de noël'] },
  ];
}

/** Tous les événements connus pour une année. */
export function eventsForYear(year: number): DatedEvent[] {
  return [...(MOVING_EVENTS_BY_YEAR[year] || []), ...fixedEvents(year)];
}

export type EventPhase = 'j21' | 'j14' | 'derniere_semaine' | 'pendant' | 'apres';

export interface ActiveEvent {
  event: DatedEvent;
  phase: EventPhase;
  /** Libellé lisible de la position dans le compte à rebours. */
  phaseLabel: string;
  /** Jours avant le début (>0) ; 0 pendant ; null après la fin. */
  daysToStart: number | null;
  /** Jours écoulés depuis la fin (>0) ; null avant/pendant. */
  daysAfterEnd: number | null;
  /** Plafond total de posts pour cet événement (selon l'ampleur). */
  maxPosts: number;
}

function toUtcDay(d: Date | string): number {
  const dt = typeof d === 'string' ? new Date(`${d}T00:00:00Z`) : d;
  return Math.floor(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()) / 86400000);
}

/**
 * Événements dont la fenêtre de communication est OUVERTE à la date donnée.
 * Hors de cette liste = interdiction de publier sur le sujet.
 */
export function getActiveEvents(today: Date = new Date()): ActiveEvent[] {
  const todayDay = toUtcDay(today);
  const year = today.getUTCFullYear();
  // On balaie l'année en cours + la suivante (un J-21 peut traverser le 31/12).
  const candidates = [...eventsForYear(year), ...eventsForYear(year + 1)];

  const active: ActiveEvent[] = [];
  for (const event of candidates) {
    const startDay = toUtcDay(event.start);
    const endDay = toUtcDay(event.end);
    const beforeWindow = BEFORE_DAYS_BY_TIER[event.tier];
    const afterWindow = AFTER_DAYS_BY_TIER[event.tier];

    if (todayDay >= startDay && todayDay <= endDay) {
      active.push({ event, phase: 'pendant', phaseLabel: 'EN COURS', daysToStart: 0, daysAfterEnd: null, maxPosts: MAX_POSTS_BY_TIER[event.tier] });
      continue;
    }
    if (todayDay < startDay) {
      const daysToStart = startDay - todayDay;
      if (daysToStart > beforeWindow) continue; // trop tôt : silence
      const phase: EventPhase = daysToStart > 14 ? 'j21' : daysToStart > 7 ? 'j14' : 'derniere_semaine';
      const phaseLabel = phase === 'j21' ? '3 semaines avant' : phase === 'j14' ? '2 semaines avant' : 'dernière semaine';
      active.push({ event, phase, phaseLabel: `${phaseLabel} (J-${daysToStart})`, daysToStart, daysAfterEnd: null, maxPosts: MAX_POSTS_BY_TIER[event.tier] });
      continue;
    }
    const daysAfterEnd = todayDay - endDay;
    if (daysAfterEnd >= 1 && daysAfterEnd <= afterWindow) {
      active.push({ event, phase: 'apres', phaseLabel: `bilan J+${daysAfterEnd}`, daysToStart: null, daysAfterEnd, maxPosts: MAX_POSTS_BY_TIER[event.tier] });
    }
  }
  return active;
}

/**
 * Événements INVENTÉS déjà observés en production. Un modèle sans calendrier
 * fiable affirme des choses fausses avec aplomb : on a retrouvé un post
 * approuvé annonçant "Les JO de Paris 2026, un afflux massif de touristes"
 * alors que Paris c'était 2024 et que les JO 2026 sont ceux d'hiver à
 * Milan-Cortina, terminés en février. Ces formulations sont rejetées quelle
 * que soit la date.
 */
const PHANTOM_CLAIMS: Array<{ label: string; matchers: string[] }> = [
  { label: 'JO de Paris 2026 (n\'existe pas — Paris c\'était 2024)', matchers: ['jo de paris 2026', 'jeux olympiques de paris 2026', 'jo paris 2026', 'olympiques de paris 2026'] },
];

/**
 * Normalise pour la reconnaissance : minuscules, accents retirés, apostrophes
 * typographiques ramenées à l'apostrophe simple. Le modèle écrit indifféremment
 * "Noël", "Noel" ou "NOËL", et "fête des pères" avec ou sans accents — sans
 * cette normalisation, la moitié des posts échappaient au garde-fou.
 */
function norm(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2019\u2018`]/g, "'");
}

/** Le texte affirme-t-il un événement qui n'existe pas ? */
export function detectPhantomClaim(text: string): string | null {
  const lowered = norm(text);
  if (!lowered) return null;
  for (const claim of PHANTOM_CLAIMS) {
    if (claim.matchers.some(m => lowered.includes(norm(m)))) return claim.label;
  }
  return null;
}

/** L'événement (s'il existe) dont parle un texte de post. */
export function detectEvent(text: string, pool?: DatedEvent[]): DatedEvent | null {
  const lowered = norm(text);
  if (!lowered) return null;
  const year = new Date().getUTCFullYear();
  const candidates = pool || [...eventsForYear(year - 1), ...eventsForYear(year), ...eventsForYear(year + 1)];
  for (const event of candidates) {
    if (event.matchers.some(m => lowered.includes(norm(m)))) return event;
  }
  return null;
}

/**
 * Un post qui parle d'un événement est-il DANS sa fenêtre à sa date de
 * publication ? C'est le garde-fou déterministe : on ne fait pas confiance au
 * modèle pour respecter les dates, on vérifie.
 */
export function isPostWithinEventWindow(event: DatedEvent, scheduledDate: Date | string): boolean {
  const day = toUtcDay(scheduledDate);
  const startDay = toUtcDay(event.start);
  const endDay = toUtcDay(event.end);
  return day >= startDay - BEFORE_DAYS_BY_TIER[event.tier] && day <= endDay + AFTER_DAYS_BY_TIER[event.tier];
}

export interface EventUsage {
  /** Nombre de posts déjà programmés/publiés sur cet événement. */
  used: number;
  /** Accroches déjà utilisées, pour forcer un angle neuf. */
  angles: string[];
}

/**
 * Compte, pour chaque événement actif, les posts déjà programmés ou publiés
 * sur ce sujet par CE client — et récupère les accroches déjà utilisées.
 *
 * La reconnaissance se fait par mots-clés sur hook + caption : pas de colonne
 * à ajouter, et ça marche rétroactivement sur l'historique existant.
 */
export async function getEventUsage(
  supabase: any,
  userId: string | null,
  active: ActiveEvent[],
): Promise<Record<string, EventUsage>> {
  const usage: Record<string, EventUsage> = {};
  if (!userId || active.length === 0) return usage;

  // On remonte jusqu'au début de la plus ancienne fenêtre encore ouverte.
  const oldestStart = active
    .map(a => new Date(`${a.event.start}T00:00:00Z`).getTime() - BEFORE_DAYS_BY_TIER[a.event.tier] * 86400000)
    .reduce((min, t) => Math.min(min, t), Date.now());

  try {
    const { data } = await supabase
      .from('content_calendar')
      .select('hook, caption, scheduled_date')
      .eq('user_id', userId)
      .in('status', ['draft', 'approved', 'publishing', 'published'])
      .gte('scheduled_date', new Date(oldestStart).toISOString().split('T')[0])
      .limit(500);

    for (const a of active) {
      const matched = (data || []).filter((row: any) => {
        const text = `${row.hook || ''} ${row.caption || ''}`.toLowerCase();
        return a.event.matchers.some(m => text.includes(m.toLowerCase()));
      });
      usage[a.event.key] = {
        used: matched.length,
        angles: matched.map((r: any) => r.hook || '').filter(Boolean),
      };
    }
  } catch {
    /* pas de quota lisible → on laisse le prompt sans historique */
  }
  return usage;
}

/**
 * Garde-fou déterministe appliqué APRÈS génération : retire les posts qui
 * parlent d'un événement hors de sa fenêtre, ou qui dépassent le quota.
 * On ne fait pas confiance au modèle pour respecter les dates — on vérifie.
 */
export function filterEventViolations<T extends { hook?: string | null; caption?: string | null; scheduled_date?: string | null }>(
  posts: T[],
  opts: { today?: Date; usage?: Record<string, EventUsage> } = {},
): { kept: T[]; rejected: Array<{ post: T; reason: string }> } {
  const today = opts.today || new Date();
  const usage = opts.usage || {};
  const kept: T[] = [];
  const rejected: Array<{ post: T; reason: string }> = [];
  // Compteur par événement pour cette fournée (empêche 42 posts d'un coup).
  const batchCount: Record<string, number> = {};
  const perDay: Record<string, Set<string>> = {};

  for (const post of posts) {
    const when = post.scheduled_date || today.toISOString().split('T')[0];
    const phantom = detectPhantomClaim(`${post.hook || ''} ${post.caption || ''}`);
    if (phantom) { rejected.push({ post, reason: `événement inventé : ${phantom}` }); continue; }

    const inHook = detectEvent(post.hook || '');
    const event = inHook || detectEvent(post.caption || '');
    if (!event) { kept.push(post); continue; }

    // Référence rétrospective en légende = légitime (cf. createEventGuard).
    if (!inHook && toUtcDay(when) > toUtcDay(event.end)) { kept.push(post); continue; }

    if (!isPostWithinEventWindow(event, when)) {
      rejected.push({ post, reason: `${event.label} : hors fenêtre le ${when} (${event.start} → ${event.end}, +3j max)` });
      continue;
    }

    const already = (usage[event.key]?.used || 0) + (batchCount[event.key] || 0);
    if (already >= MAX_POSTS_BY_TIER[event.tier]) {
      rejected.push({ post, reason: `${event.label} : quota atteint (${MAX_POSTS_BY_TIER[event.tier]} posts max)` });
      continue;
    }

    // Max 1 post par événement et par jour, toutes plateformes confondues.
    perDay[event.key] = perDay[event.key] || new Set<string>();
    if (perDay[event.key].has(when)) {
      rejected.push({ post, reason: `${event.label} : déjà un post ce jour-là (1/jour max)` });
      continue;
    }
    perDay[event.key].add(when);
    batchCount[event.key] = (batchCount[event.key] || 0) + 1;
    kept.push(post);
  }
  return { kept, rejected };
}

export interface EventGuardVerdict {
  ok: boolean;
  /** Événement détecté, s'il y en a un. */
  eventKey?: string;
  /** Raison du refus, à journaliser. */
  reason?: string;
}

/**
 * Garde-fou à état, à utiliser post par post au moment de l'insertion.
 * Il porte la mémoire de la fournée en cours (pour empêcher 42 posts d'un
 * coup) en plus de l'historique déjà en base.
 *
 * Usage :
 *   const guard = createEventGuard(await getEventUsage(sb, userId, active));
 *   const verdict = guard.check(hook, caption, '2026-07-20');
 *   if (!verdict.ok) { ...on n'insère pas... }
 */
export function createEventGuard(usage: Record<string, EventUsage> = {}) {
  const batchCount: Record<string, number> = {};
  const perDay: Record<string, Set<string>> = {};

  return {
    check(hook: string | null | undefined, caption: string | null | undefined, scheduledDate: string): EventGuardVerdict {
      const phantom = detectPhantomClaim(`${hook || ''} ${caption || ''}`);
      if (phantom) return { ok: false, reason: `événement inventé : ${phantom}` };

      const inHook = detectEvent(hook || '');
      const event = inHook || detectEvent(caption || '');
      if (!event) return { ok: true };

      // Un événement cité seulement DANS LA LÉGENDE, et déjà passé, est une
      // référence rétrospective légitime ("ses ventes ont doublé pour la fête
      // des pères") — pas un post d'actualité. On ne bloque que ce qui est
      // ANCRÉ sur l'événement (mention dans l'accroche) ou ce qui anticipe
      // trop tôt un événement à venir.
      const isRetroMention = !inHook && toUtcDay(scheduledDate) > toUtcDay(event.end);
      if (isRetroMention) return { ok: true };

      if (!isPostWithinEventWindow(event, scheduledDate)) {
        return { ok: false, eventKey: event.key, reason: `hors fenêtre : ${event.label} (${event.start} → ${event.end}, +${AFTER_DAYS_BY_TIER[event.tier]}j max) mais post prévu le ${scheduledDate}` };
      }

      const already = (usage[event.key]?.used || 0) + (batchCount[event.key] || 0);
      if (already >= MAX_POSTS_BY_TIER[event.tier]) {
        return { ok: false, eventKey: event.key, reason: `quota atteint : ${event.label} a déjà ${already} post(s) (max ${MAX_POSTS_BY_TIER[event.tier]})` };
      }

      perDay[event.key] = perDay[event.key] || new Set<string>();
      if (perDay[event.key].has(scheduledDate)) {
        return { ok: false, eventKey: event.key, reason: `1 post/jour max : ${event.label} a déjà un post le ${scheduledDate}` };
      }

      perDay[event.key].add(scheduledDate);
      batchCount[event.key] = (batchCount[event.key] || 0) + 1;
      return { ok: true, eventKey: event.key };
    },
  };
}

/**
 * Bloc de prompt : ce que Léna a le droit de faire aujourd'hui, événement par
 * événement. Volontairement directif — les règles molles ont produit 42 posts
 * identiques le même jour.
 */
export function buildEventPromptBlock(
  active: ActiveEvent[],
  usage: Record<string, EventUsage> = {},
): string {
  if (active.length === 0) {
    return `\n📅 ÉVÉNEMENTS — AUCUN en fenêtre aujourd'hui.
INTERDICTION ABSOLUE d'accrocher un post à un événement (sportif, culturel, festival, cérémonie) qui n'est pas listé ici. Pas de "Festival de Cannes", pas de "Tour de France", pas de "Coupe du monde" hors de leur fenêtre : ces événements sont TERMINÉS ou trop lointains. Si tu n'as pas d'actualité fraîche, fais un post evergreen (tips, preuve sociale, démo).\n`;
  }

  const lines = active.map(a => {
    const u = usage[a.event.key] || { used: 0, angles: [] };
    const remaining = Math.max(0, a.maxPosts - u.used);
    const quota = remaining === 0
      ? '❌ QUOTA ATTEINT — INTERDIT d\'en reparler.'
      : `✅ ${remaining} post(s) restant(s) sur ${a.maxPosts} au total.`;
    const anglesLine = u.angles.length
      ? `\n     Angles DÉJÀ utilisés (interdits, trouve autre chose) : ${u.angles.slice(0, 6).map(x => `"${x.substring(0, 70)}"`).join(' · ')}`
      : '';
    return `  • ${a.event.label} — du ${a.event.start} au ${a.event.end} — ${a.phaseLabel}
     ${quota}${anglesLine}`;
  });

  return `\n📅 ÉVÉNEMENTS EN FENÊTRE AUJOURD'HUI (les SEULS autorisés)
${lines.join('\n')}

RÈGLES ÉVÉNEMENTS — NON NÉGOCIABLES (règle fondateur 2026-07-29) :
1. On commence 3 SEMAINES avant, jamais plus tôt. On s'arrête 3 JOURS après la fin, jamais plus tard. Un événement terminé depuis plus de 3 jours n'existe plus : ne l'évoque sous AUCUN angle.
2. Cadence ESPACÉE, jamais quotidienne : 1 post à 3 semaines, 1 à 2 semaines, 1 la dernière semaine, 1 pendant l'événement, puis au plus 1 par jour les 3 jours suivant la fin. Maximum absolu : 7 posts pour un événement majeur, 4 pour un événement moyen, 1 pour un petit.
3. MAXIMUM 1 post par événement et par jour, toutes plateformes confondues. Deux hooks qui se ressemblent le même jour = échec.
4. CHAQUE post doit apporter un ANGLE NEUF (nouvelle approche, nouveau pilier, nouveau visuel). Répéter "L'événement X démarre, et ton commerce ?" en le reformulant ne compte pas comme un nouvel angle.
5. Seuls les gros événements méritent la cadence complète. Une journée thématique ou une keynote = 1 seul post, le jour même.
6. Lien business obligatoire dans le même visuel — l'actu seule ne suffit pas.\n`;
}
