/**
 * Client health score — synthétise plusieurs signaux en un score 0-100
 * + couleur RED/AMBER/GREEN pour visibilité instantanée admin.
 *
 * Composante (poids) :
 *   - Success rate sur 7j         (40%)
 *   - Activity recency            (20%)  — moins de 24h depuis dernier run = OK
 *   - Active anomalies (count×sev) (20%)  — chaque P0 = -30, P1 = -15, P2 = -5
 *   - Pause / suspension          (10%)  — paused = -10 fixe
 *   - Token health                (10%)  — TT expirant <12h sans refresh = -10
 *
 * Score :
 *   ≥80  → GREEN  (✅ tout va bien)
 *   60-79 → AMBER (⚠️ surveillance)
 *   <60   → RED   (🚨 action requise)
 */

export interface HealthInputs {
  runs_7d: number;
  errors_7d: number;
  last_run_at: string | null;
  paused: boolean;
  active_anomalies?: Array<{ severity: 'P0' | 'P1' | 'P2' }>;
  token_expiring_soon?: boolean;
}

export type HealthLevel = 'green' | 'amber' | 'red';

export interface HealthScore {
  score: number;        // 0-100
  level: HealthLevel;
  label: string;        // emoji + text
  reasons: string[];    // why the score is what it is
}

export function computeHealthScore(input: HealthInputs): HealthScore {
  let score = 100;
  const reasons: string[] = [];

  // Component 1 : success rate (40 pts)
  const total = input.runs_7d;
  if (total === 0) {
    // No activity in 7d — neutral on this axis but flag recency below
    reasons.push('Pas de run sur 7j');
  } else {
    const successRate = ((total - input.errors_7d) / total) * 100;
    if (successRate < 50) {
      score -= 40;
      reasons.push(`Success ${Math.round(successRate)}% (-40)`);
    } else if (successRate < 80) {
      score -= 25;
      reasons.push(`Success ${Math.round(successRate)}% (-25)`);
    } else if (successRate < 95) {
      score -= 10;
      reasons.push(`Success ${Math.round(successRate)}% (-10)`);
    }
  }

  // Component 2 : recency (20 pts)
  if (input.last_run_at) {
    const hoursSince = (Date.now() - new Date(input.last_run_at).getTime()) / 3600000;
    if (hoursSince > 72) {
      score -= 20;
      reasons.push(`Inactif depuis ${Math.round(hoursSince / 24)}j (-20)`);
    } else if (hoursSince > 24) {
      score -= 10;
      reasons.push(`Inactif depuis ${Math.round(hoursSince)}h (-10)`);
    }
  } else if (input.runs_7d === 0) {
    score -= 20;
    reasons.push('Aucune activité (-20)');
  }

  // Component 3 : active anomalies (20 pts hard cap, but anomalies are severe)
  let anomalyPenalty = 0;
  for (const a of input.active_anomalies || []) {
    if (a.severity === 'P0') anomalyPenalty += 30;
    else if (a.severity === 'P1') anomalyPenalty += 15;
    else anomalyPenalty += 5;
  }
  if (anomalyPenalty > 0) {
    score -= Math.min(40, anomalyPenalty); // cap at 40 even if many anomalies
    reasons.push(`${input.active_anomalies?.length} anomalie(s) actives (-${Math.min(40, anomalyPenalty)})`);
  }

  // Component 4 : paused
  if (input.paused) {
    score -= 10;
    reasons.push('Scheduling pausé (-10)');
  }

  // Component 5 : token expiring
  if (input.token_expiring_soon) {
    score -= 10;
    reasons.push('Token expire <12h (-10)');
  }

  // Bound to [0, 100]
  score = Math.max(0, Math.min(100, Math.round(score)));

  let level: HealthLevel;
  let label: string;
  if (score >= 80) { level = 'green'; label = '✅ OK'; }
  else if (score >= 60) { level = 'amber'; label = '⚠️ Surveillance'; }
  else { level = 'red'; label = '🚨 Action requise'; }

  return { score, level, label, reasons };
}

export function healthColorClass(level: HealthLevel): string {
  if (level === 'green') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
  if (level === 'amber') return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
  return 'text-red-400 bg-red-500/10 border-red-500/30';
}
