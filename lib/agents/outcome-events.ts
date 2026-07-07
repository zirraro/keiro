/**
 * OUTCOME EVENTS — le socle du data moat (Fable 5, plan 20M).
 *
 * Différent d'`auto-improve` (qui apprend de l'EXÉCUTION : l'agent a-t-il réussi
 * sa tâche). Ici on capture l'OUTCOME RÉEL DANS LE MONDE — un post publié a fait
 * X vues, un DM a converti, un avis a remonté la note — avec un CONTEXTE
 * NORMALISÉ (secteur, format, famille de hook, créneau, événement). C'est ce qui
 * permet, à l'échelle et cross-clients :
 *   20+ clients/segment  → BENCHMARKS sectoriels
 *   100+                 → recommandations PRÉDICTIVES (Ami)
 *   1000+                → API INSIGHTS (produit vendable, indépendant des plateformes)
 *
 * Propriété stratégique : cette couche est INDÉPENDANTE des API Meta/TikTok. Si
 * une permission saute, le moat data reste. On la câble AVANT le 1er client.
 *
 * Confidentialité (RGPD + data charter) : agrégation anonymisée + k-anonymat —
 * aucun insight servi depuis moins de K_ANON clients distincts d'un segment.
 *
 * Résilient : recordOutcome ne throw jamais et fonctionne même si la table
 * n'existe pas encore (best-effort) — on peut donc le câbler sans risque.
 */
import { SupabaseClient } from '@supabase/supabase-js';

export const K_ANON = 10; // aucun insight en-dessous de 10 clients distincts

export type OutcomeType =
  | 'post_published'    // Léna : un contenu publié
  | 'dm_handled'        // Jade : un DM traité/converti
  | 'comment_handled'   // Jade : un commentaire traité
  | 'review_replied'    // Théo : un avis répondu
  | 'email_step'        // Hugo : une étape de séquence
  | 'prospect_added'    // Léo : un prospect qualifié
  | 'studio_created';   // Suite : une création manuelle (nourrit les mêmes playbooks)

export interface OutcomeInput {
  userId: string;
  orgId?: string | null;
  agent: string;
  type: OutcomeType;
  sector?: string | null;          // ICP normalisé (beauty/resto/coach/retail…)
  platform?: string | null;        // instagram/tiktok/linkedin/email/google
  // Contexte normalisé pour l'apprentissage :
  format?: string | null;          // reel/carousel/story/static/video
  hookFamily?: string | null;      // famille du référentiel hook-knowledge.ts
  eventContext?: string | null;    // holiday/trend/live_event/none
  dayOfWeek?: number | null;       // 0-6 (dérivé si absent)
  hourOfDay?: number | null;       // 0-23 (dérivé si absent)
  // Résultats mesurés (peuvent être mis à jour à +24h/+72h/+7j) :
  metrics?: Record<string, number> | null; // {views,likes,comments,shares,saves,reach,conversion,rating_delta}
  measuredAt?: 'submit' | '24h' | '72h' | '7d';
  refId?: string | null;           // content_calendar.id / prospect id… (idempotence upsert)
}

/** Normalise le secteur (ICP) vers un petit set stable. */
export function normalizeSector(raw?: string | null): string {
  const s = (raw || '').toLowerCase();
  if (/beaut|coiff|ongle|esth|institut|spa|barb/.test(s)) return 'beauty';
  if (/resto|restaurant|bistro|caf|food|trait|boulang|pizz/.test(s)) return 'resto';
  if (/coach|sport|fitness|yoga|pilat|nutri/.test(s)) return 'coach';
  if (/immo|agent|real.?estate/.test(s)) return 'immo';
  if (/boutiq|shop|magasin|retail|concept|mode/.test(s)) return 'retail';
  if (/artisan|plomb|elec|menuis|bâtiment|batiment|garage/.test(s)) return 'artisan';
  return 'other';
}

/**
 * Enregistre un outcome normalisé. Best-effort : ne throw jamais.
 * Idempotent si refId fourni (upsert sur user_id+type+ref_id+measured_at).
 */
export async function recordOutcome(supabase: SupabaseClient, input: OutcomeInput): Promise<void> {
  try {
    const now = new Date();
    const row = {
      user_id: input.userId,
      org_id: input.orgId ?? null,
      agent: input.agent,
      event_type: input.type,
      sector: normalizeSector(input.sector),
      platform: input.platform ?? null,
      format: input.format ?? null,
      hook_family: input.hookFamily ?? null,
      event_context: input.eventContext ?? null,
      day_of_week: input.dayOfWeek ?? now.getUTCDay(),
      hour_of_day: input.hourOfDay ?? now.getUTCHours(),
      metrics: input.metrics ?? {},
      measured_at: input.measuredAt ?? 'submit',
      ref_id: input.refId ?? null,
      created_at: now.toISOString(),
    };
    if (input.refId) {
      // upsert idempotent : une même création mesurée à la même fenêtre = 1 ligne
      await supabase.from('outcome_events').upsert(row, { onConflict: 'user_id,event_type,ref_id,measured_at' });
    } else {
      await supabase.from('outcome_events').insert(row);
    }
  } catch { /* best-effort : table absente / réseau → on n'interrompt jamais l'agent */ }
}

export interface SectorBenchmark {
  sector: string;
  eventType: OutcomeType;
  metric: string;
  sample: number;      // nb de lignes
  clients: number;     // nb de clients distincts (pour k-anonymat)
  avg: number;
  p50: number;
  p90: number;
  byFormat?: Record<string, number>;    // moyenne du metric par format
  byHookFamily?: Record<string, number>;
  byHour?: Record<string, number>;
}

/**
 * Benchmark sectoriel agrégé + k-anonyme. Retourne null si < K_ANON clients
 * distincts (jamais d'insight sur un segment trop petit). Gate produit :
 * n'appeler qu'une fois qu'on a assez de clients dans le segment.
 */
export async function getSectorBenchmark(
  supabase: SupabaseClient,
  opts: { sector: string; eventType: OutcomeType; metric: string; sinceDays?: number }
): Promise<SectorBenchmark | null> {
  try {
    const since = new Date(Date.now() - (opts.sinceDays ?? 90) * 86400000).toISOString();
    const { data } = await supabase
      .from('outcome_events')
      .select('user_id, format, hook_family, hour_of_day, metrics')
      .eq('sector', opts.sector)
      .eq('event_type', opts.eventType)
      .gte('created_at', since)
      .limit(5000);
    const rows = (data || []).filter((r: any) => r?.metrics && typeof r.metrics[opts.metric] === 'number');
    const clients = new Set(rows.map((r: any) => r.user_id)).size;
    if (clients < K_ANON) return null; // k-anonymat : pas d'insight sous le seuil

    const vals = rows.map((r: any) => Number(r.metrics[opts.metric])).sort((a, b) => a - b);
    const at = (p: number) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] || 0;
    const avgOf = (subset: any[]) =>
      subset.length ? subset.reduce((s, r) => s + Number(r.metrics[opts.metric] || 0), 0) / subset.length : 0;
    const groupAvg = (key: string) => {
      const g: Record<string, any[]> = {};
      for (const r of rows) { const k = (r as any)[key] || 'unknown'; (g[k] ||= []).push(r); }
      const out: Record<string, number> = {};
      for (const k of Object.keys(g)) out[k] = Math.round(avgOf(g[k]) * 100) / 100;
      return out;
    };

    return {
      sector: opts.sector, eventType: opts.eventType, metric: opts.metric,
      sample: rows.length, clients,
      avg: Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100,
      p50: at(0.5), p90: at(0.9),
      byFormat: groupAvg('format'),
      byHookFamily: groupAvg('hook_family'),
      byHour: groupAvg('hour_of_day'),
    };
  } catch { return null; }
}
