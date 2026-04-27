/**
 * Tolerant JSON parser for LLM outputs.
 *
 * Why: Claude (and other models) sometimes produce JSON that's
 * technically invalid because of:
 *   - smart-quote characters inside strings ('Voilà' instead of "Voilà")
 *   - raw newlines inside strings ("hook 1\nhook 2" instead of \\n)
 *   - trailing commas
 *   - markdown ```json``` fencing
 *   - apostrophes inside double-quoted strings ("ce qu'on dit" — fine,
 *     but if next char is " it gets confused)
 *
 * In production we lost 13 weekly_plan runs in 24h to JSON.parse()
 * choking around char 20k-24k of long array outputs.
 *
 * This helper:
 *   1. Strips fences + leading/trailing text outside the JSON.
 *   2. Repairs common defects (newlines in strings, smart quotes,
 *      trailing commas, missing brackets).
 *   3. Falls back to incremental array parsing — when the whole
 *      response can't be parsed, we extract every well-formed
 *      object from a `[ {…}, {…}, ... ]` and ship the partial set.
 *
 * Used by content's weekly_plan, generateWeekWithVisuals, etc.
 */

export type TolerantParseResult<T> = {
  ok: boolean;
  data?: T;
  partial?: boolean;
  reason?: string;
};

/**
 * Strip any markdown fencing and leading/trailing prose around the JSON
 * payload, then try a best-effort repair before parsing.
 */
function preClean(raw: string): string {
  let s = raw;
  // Remove ```json fences (with or without lang tag).
  s = s.replace(/```[\w]*\s*/g, '').replace(/```/g, '');
  // Smart quotes that often slip in via the model copying news headlines.
  s = s
    .replace(/[\u2018\u2019]/g, "'")    // ' '
    .replace(/[\u201C\u201D]/g, '"')    // " "
    .replace(/[\u2013\u2014]/g, '-');   // – —
  return s.trim();
}

/**
 * Repair JSON that has raw line-breaks inside strings — a common LLM
 * defect that breaks JSON.parse(). We walk the string char-by-char
 * tracking whether we're inside a string literal, and replace any
 * literal LF/CR inside strings with their \\n / \\r escape.
 *
 * Also collapses trailing commas before } or ].
 */
function repairStringBreaks(json: string): string {
  let out = '';
  let inStr = false;
  let escape = false;
  for (let i = 0; i < json.length; i++) {
    const c = json[i];
    if (escape) { out += c; escape = false; continue; }
    if (c === '\\') { out += c; escape = true; continue; }
    if (c === '"') { inStr = !inStr; out += c; continue; }
    if (inStr) {
      if (c === '\n') { out += '\\n'; continue; }
      if (c === '\r') { out += '\\r'; continue; }
      if (c === '\t') { out += '\\t'; continue; }
    }
    out += c;
  }
  // Trailing commas before } or ]
  out = out.replace(/,\s*([}\]])/g, '$1');
  return out;
}

/**
 * Try to JSON.parse the input directly; if it fails, apply repairs
 * and retry. Returns the parsed value or undefined.
 */
export function tryParse<T = any>(raw: string): T | undefined {
  if (!raw) return undefined;
  const cleaned = preClean(raw);
  // Direct attempt
  try { return JSON.parse(cleaned) as T; } catch {}
  // Repaired attempt
  try { return JSON.parse(repairStringBreaks(cleaned)) as T; } catch {}
  return undefined;
}

/**
 * For arrays: when the whole array can't be parsed, walk through it
 * and extract every TOP-LEVEL object that DOES parse. Returns the
 * subset that parsed plus a `partial: true` marker so callers know
 * they may have lost some objects.
 *
 * Heuristic: track brace depth and string state, slice on each
 * top-level closing brace, attempt to parse each slice as an object.
 */
export function tolerantArrayParse<T = any>(raw: string): TolerantParseResult<T[]> {
  if (!raw) return { ok: false, reason: 'empty' };
  const cleaned = preClean(raw);
  // Try clean parse first
  const direct = tryParse<T[]>(cleaned);
  if (Array.isArray(direct)) return { ok: true, data: direct };

  // Find array bounds
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  if (firstBracket < 0) return { ok: false, reason: 'no array bracket' };
  const inside = cleaned.slice(firstBracket + 1, lastBracket >= 0 ? lastBracket : cleaned.length);

  // Walk the inside, splitting at top-level (depth=0 between objects).
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let escape = false;
  for (let i = 0; i < inside.length; i++) {
    const c = inside[i];
    if (escape) { escape = false; continue; }
    if (c === '\\' && inStr) { escape = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        objects.push(inside.slice(start, i + 1));
        start = -1;
      }
    }
  }
  if (objects.length === 0) return { ok: false, reason: 'no objects extracted' };

  const parsed: T[] = [];
  for (const objText of objects) {
    const obj = tryParse<T>(objText);
    if (obj !== undefined) parsed.push(obj);
  }
  if (parsed.length === 0) return { ok: false, reason: 'no objects parsed' };
  return { ok: true, data: parsed, partial: true };
}
