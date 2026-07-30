/**
 * Créneaux de publication calculés sur les PERFORMANCES RÉELLES du client.
 *
 * Règle fondateur (2026-07-30) : 6 publications/jour sur Instagram, 2 sur
 * TikTok, « des heures calculées optimisées selon les vues et l'audience »,
 * qui « évoluent selon les performances » — et JAMAIS deux posts à la même
 * heure, toutes plateformes confondues.
 *
 * Méthode : on regarde ce qui a réellement marché sur les 90 derniers jours
 * (vues / portée / likes par heure de publication), on classe les heures, on
 * impose un espacement minimum pour ne pas empiler 6 posts dans la même
 * tranche, puis on complète avec les heures expertes du métier si l'historique
 * ne suffit pas. Le calcul est refait à chaque planification : les heures
 * suivent donc les performances sans intervention.
 */

import { getDefaultOptimalHour } from './default-timing';

export type Platform = 'instagram' | 'tiktok' | 'linkedin';

/** Espacement minimum entre deux publications, en minutes. */
const MIN_GAP_MIN = 70;

/** Plage horaire admissible (on ne publie pas la nuit). */
// 07:00 est une heure légitime (et mesurée comme performante) pour un commerce
// qui ouvre tôt — boulangerie, café, salle de sport. On ne la rejette pas.
const EARLIEST_MIN = 7 * 60;        // 07:00
const LATEST_MIN = 21 * 60 + 30;    // 21:30

/**
 * Heures de repli, larges et plausibles, utilisées quand l'historique ne
 * suffit pas. Ordonnées par valeur généralement observée sur les comptes de
 * commerce local (matin avant l'ouverture, pause déjeuner, fin de journée,
 * soirée).
 */
const FALLBACK_ORDER = [
  '08:15', '12:15', '18:45', '13:30', '19:45', '09:45',
  '11:15', '17:30', '20:30', '10:30', '16:15', '21:00',
];

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

function toHHMMSS(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

export interface SlotPerformance {
  /** Heure au format HH:MM. */
  hour: string;
  /** Score moyen d'engagement observé à cette heure. */
  score: number;
  /** Nombre de publications observées à cette heure. */
  samples: number;
}

/**
 * Classe les heures de publication de ce client par performance réelle.
 * Renvoie [] si l'historique est trop mince pour conclure.
 */
export async function rankHoursByPerformance(
  supabase: any,
  userId: string,
  platform: Platform,
): Promise<SlotPerformance[]> {
  try {
    const since = new Date(Date.now() - 90 * 86400000).toISOString();
    const { data } = await supabase
      .from('content_calendar')
      .select('published_at, scheduled_time, engagement_data')
      .eq('user_id', userId)
      .eq('platform', platform)
      .eq('status', 'published')
      .gte('published_at', since)
      .not('engagement_data', 'is', null)
      .limit(500);

    const buckets = new Map<number, { total: number; n: number }>();
    for (const row of data || []) {
      const e = (row.engagement_data as any) || {};
      const score = (Number(e.views) || 0) + (Number(e.reach) || 0) + (Number(e.impressions) || 0)
        + 3 * (Number(e.like_count) || 0) + 5 * (Number(e.comments_count) || 0) + 5 * (Number(e.saved) || 0);
      // Une publication sans aucune mesure n'apprend rien : on l'ignore plutôt
      // que de la compter comme un zéro, ce qui pénaliserait l'heure à tort.
      const measured = e.synced_at !== undefined || e.views !== undefined || e.reach !== undefined || e.impressions !== undefined;
      if (!measured) continue;

      const stamp = row.published_at || null;
      const hour = stamp ? new Date(stamp).getUTCHours() : (row.scheduled_time ? Number(String(row.scheduled_time).slice(0, 2)) : null);
      if (hour == null || Number.isNaN(hour)) continue;

      const b = buckets.get(hour) || { total: 0, n: 0 };
      b.total += score; b.n++;
      buckets.set(hour, b);
    }

    return [...buckets.entries()]
      .filter(([, b]) => b.n >= 2)          // une seule mesure = anecdote, pas une tendance
      .map(([h, b]) => ({ hour: `${String(h).padStart(2, '0')}:00`, score: b.total / b.n, samples: b.n }))
      .sort((a, b) => b.score - a.score);
  } catch {
    return [];
  }
}

/** Ajoute une heure candidate si elle respecte plage + espacement. */
function tryAdd(chosen: number[], candidateMin: number): boolean {
  if (candidateMin < EARLIEST_MIN || candidateMin > LATEST_MIN) return false;
  if (chosen.some(m => Math.abs(m - candidateMin) < MIN_GAP_MIN)) return false;
  chosen.push(candidateMin);
  return true;
}

export interface OptimalSlots {
  instagram: string[];
  tiktok: string[];
  /** D'où viennent les heures, pour pouvoir l'expliquer au client. */
  source: 'performances' | 'mixte' | 'defaut';
  detail: SlotPerformance[];
}

/**
 * Créneaux du jour, tous distincts, toutes plateformes confondues.
 *
 * L'unicité est garantie globalement : TikTok ne peut pas tomber sur une heure
 * déjà prise par Instagram, et inversement — deux posts à la même minute se
 * cannibalisent et donnent l'impression d'un robot.
 */
export async function computeOptimalSlots(
  supabase: any,
  userId: string | null,
  opts: { igPerDay?: number; ttPerDay?: number; businessType?: string | null } = {},
): Promise<OptimalSlots> {
  const igCount = opts.igPerDay ?? 6;
  const ttCount = opts.ttPerDay ?? 2;

  const [igRanked, ttRanked] = userId
    ? await Promise.all([
      rankHoursByPerformance(supabase, userId, 'instagram'),
      rankHoursByPerformance(supabase, userId, 'tiktok'),
    ])
    : [[], []];

  const chosen: number[] = [];   // toutes plateformes — garantit l'unicité globale
  const ig: number[] = [];
  const tt: number[] = [];

  // 1. Les heures qui ont réellement performé, meilleures d'abord.
  for (const s of igRanked) {
    if (ig.length >= igCount) break;
    if (tryAdd(chosen, toMinutes(s.hour))) ig.push(toMinutes(s.hour));
  }
  for (const s of ttRanked) {
    if (tt.length >= ttCount) break;
    if (tryAdd(chosen, toMinutes(s.hour))) tt.push(toMinutes(s.hour));
  }
  const fromPerf = ig.length + tt.length;

  // 2. Les heures expertes du métier (matin / midi / soir).
  for (const slot of ['morning', 'midday', 'evening'] as const) {
    const h = getDefaultOptimalHour(opts.businessType, slot);
    if (ig.length < igCount && tryAdd(chosen, toMinutes(h))) ig.push(toMinutes(h));
  }

  // 3. Repli large pour compléter ce qui manque.
  for (const h of FALLBACK_ORDER) {
    if (ig.length >= igCount && tt.length >= ttCount) break;
    const m = toMinutes(h);
    if (ig.length < igCount) { if (tryAdd(chosen, m)) { ig.push(m); continue; } }
    if (tt.length < ttCount) { if (tryAdd(chosen, m)) tt.push(m); }
  }

  // 4. Dernier recours : on écarte mécaniquement dans la plage autorisée pour
  // atteindre le compte demandé, sans jamais créer de collision.
  let cursor = EARLIEST_MIN;
  while ((ig.length < igCount || tt.length < ttCount) && cursor <= LATEST_MIN) {
    if (tryAdd(chosen, cursor)) {
      if (ig.length < igCount) ig.push(cursor); else tt.push(cursor);
    }
    cursor += 15;
  }

  ig.sort((a, b) => a - b);
  tt.sort((a, b) => a - b);

  return {
    instagram: ig.map(toHHMMSS),
    tiktok: tt.map(toHHMMSS),
    source: fromPerf === 0 ? 'defaut' : (fromPerf >= igCount + ttCount ? 'performances' : 'mixte'),
    detail: [...igRanked.slice(0, 6), ...ttRanked.slice(0, 3)],
  };
}
