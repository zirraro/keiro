/**
 * Validator types — shared across all content validators.
 *
 * Founder rule 2026-06-09 : "attention au validator qu'il nous bloque
 * pas dans la créativité de nos générations ou réplique les mêmes
 * posts à chaque fois on veut de la diversité mais augmenter la
 * qualité et supprimer toutes les fioritures qui réduisent la qualité".
 *
 * Conséquence directe :
 *   - `block` = blocking. Réservé aux fioritures objectivement
 *     mauvaises : claims interdits, AI-tells, doublons exacts,
 *     spam manifeste. JAMAIS subjectif. JAMAIS stylistique.
 *   - `warn`  = laisse passer, log dans supervision pour
 *     visibilité humaine. Tendances/patterns à surveiller.
 *   - `info`  = telemetry only, utile pour metrics agrégées.
 *
 * Si un finding est `block`, le post est mis en
 * status='draft_qa_failed' avec les findings en `notes`. Léna
 * peut alors re-générer (sans rerun complet) OU le superviseur
 * peut décider d'approuver manuellement.
 */

export type Severity = 'block' | 'warn' | 'info';

export interface Finding {
  /** Stable machine code: 'forbidden_claim', 'ai_tell', 'duplicate_visual' */
  code: string;
  severity: Severity;
  /** 1-line human description */
  message: string;
  /** Numbers/strings backing the finding (for audit drill-down) */
  evidence?: Record<string, any>;
  /** Inline suggestion the LLM/admin can act on */
  suggestion?: string;
}

export interface ValidationResult {
  ok: boolean;                 // true if no `block` findings
  findings: Finding[];
  /** Aggregated severity: max(severity in findings) or 'info' if none */
  severity: Severity | 'clean';
  /** Score 0-100 ; tooling can decide quality ranking */
  quality_score: number;
}

export interface ValidationContext {
  user_id: string;
  business_type: string | null;
  platform: 'instagram' | 'tiktok' | 'linkedin' | 'twitter' | string;
  format: string; // 'post' | 'reel' | 'carrousel' | 'story' | 'photo' | 'video'
  // Caller may pre-fetch and pass recent posts so the validator
  // doesn't have to round-trip to Supabase. If undefined the
  // validator will fetch what it needs.
  recent_posts?: Array<{
    id: string;
    caption?: string | null;
    visual_url?: string | null;
    visual_description?: string | null;
    format?: string | null;
    platform?: string | null;
    hook?: string | null;
    published_at?: string | null;
    created_at?: string | null;
  }>;
}

export interface PostInput {
  caption?: string | null;
  hook?: string | null;
  hashtags?: string[];
  visual_url?: string | null;
  visual_description?: string | null;
  format?: string | null;
  platform?: string | null;
}

export function aggregate(findings: Finding[]): ValidationResult {
  const hasBlock = findings.some(f => f.severity === 'block');
  const hasWarn = findings.some(f => f.severity === 'warn');
  let severity: Severity | 'clean';
  if (hasBlock) severity = 'block';
  else if (hasWarn) severity = 'warn';
  else if (findings.length > 0) severity = 'info';
  else severity = 'clean';

  // Quality score: 100 - 25 per block - 8 per warn - 1 per info, floor 0
  let score = 100;
  for (const f of findings) {
    if (f.severity === 'block') score -= 25;
    else if (f.severity === 'warn') score -= 8;
    else score -= 1;
  }
  score = Math.max(0, Math.min(100, score));

  return {
    ok: !hasBlock,
    findings,
    severity,
    quality_score: score,
  };
}
