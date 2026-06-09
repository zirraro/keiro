/**
 * Video-prompt validator — vérifie le prompt Kling/Seedance AVANT l'appel.
 *
 * Économie majeure : un appel Seedance raté = 0,30 €/clip + 30-60s
 * de polling perdu. Catch les briefs faibles AVANT.
 *
 * Ce que ça FAIT :
 *   - block : prompt vide / trop court (< 30 char), prompt en français
 *            (Kling/Seedance T2V exigent EN), durée hors plage
 *            (1-15s), contenu interdit, markup leak.
 *   - warn  : pas de movement keyword (le brief est statique alors
 *            qu'on veut une vidéo), pas de lighting hint, pas de
 *            camera movement, longueur excessive (> 300 char dilue).
 *   - info  : telemetry.
 *
 * Important : ne PAS bloquer si le prompt est "audacieux" — block
 * uniquement sur des règles objectives (langue, longueur, markup).
 */

import type { Finding } from './types';
import { aggregate, type ValidationResult } from './types';

const FORBIDDEN_CONTENT: RegExp[] = [
  /\b(gore|graphic\s+violence|mutilation|blood\s+splatter)\b/i,
  /\b(nude|naked|nsfw|explicit\s+sexual)\b/i,
  /\b(child|minor|underage)\s+(model|portrait|actor)/i,
];

// Copyright — même règle que image-prompt : block uniquement
// reproduction directe d'IP, autorise référence ambiance.
const DIRECT_CHAR_REPRODUCTION = /\b(?:a|the|with|featuring|of|wearing|holding|as|like)\s+(?:little\s+|a\s+|the\s+)?(mickey\s+mouse|donald\s+duck|elsa|olaf|pikachu|charizard|mario|luigi|sonic|spider-?man|iron\s+man|batman|superman|hulk|harry\s+potter|hermione|yoda|darth\s+vader|simba|shrek|baby\s+yoda|grogu|peppa\s+pig|bluey)\b/i;

const TRADEMARK_LOGO_VIDEO = /\b(logo|emblem|trademark)\s+(?:of|du|de)\s+(apple|nike|adidas|coca-?cola|pepsi|mcdonald|starbucks|disney|netflix|amazon|tesla)|(?:apple|nike|adidas|coca-?cola|pepsi|mcdonald|starbucks|disney|netflix|amazon|tesla)\s+logo\b/i;

const CELEB_LIKENESS_VIDEO = /\b(?:portrait|face|photo|likeness|lookalike|standing|smiling|posing)\s+(?:of\s+)?(messi|ronaldo|mbapp[ée]|beyonc[ée]|taylor\s+swift|kim\s+kardashian|elon\s+musk|emmanuel\s+macron|donald\s+trump|barack\s+obama)\b/i;

const MARKUP_LEAK: RegExp[] = [
  /\{[a-z_]+\}/i,
  /\[[A-Z_]{3,}\]/,
  /```/,
  /^prompt\s*:/i,
];

// Movement keywords — un prompt vidéo SANS mouvement = on a payé une
// vidéo qui ressemble à une image animée. Anti-pattern majeur.
const MOVEMENT_KEYWORDS = /\b(motion|moving|movement|action|spinning|rotating|flowing|pouring|opening|closing|walking|running|dancing|gesturing|reaching|reveal|transition|cut|pan|zoom|tracking|dolly|orbit|drift|sweep|tilt|drop|rise|fall)\b/i;

// Camera movement — au moins un = vidéo cinematic, pas statique.
const CAMERA_MOVEMENT = /\b(dolly\s+(in|out)|pan(ning)?|tracking\s+shot|drone|aerial|orbit|push-?in|pull-?back|tilt|crane|gimbal|whip\s+pan|handheld)\b/i;

// Lighting/atmosphere cue.
const LIGHTING = /\b(golden\s+hour|sunset|sunrise|neon|backlit|rim\s+light|cinematic\s+light|soft\s+light|dramatic\s+lighting|moody|natural\s+light|studio\s+light|practical\s+light|ambient)\b/i;

// French detector — Kling/Seedance T2V veulent de l'EN.
// On compte les mots français courants ; > 3 = probablement FR.
const FR_INDICATORS = /\b(le|la|les|une|des|du|de|et|ou|avec|dans|sur|pour|par|sans|sous|chez|notre|votre|leur)\b/gi;

const ENGLISH_INDICATORS = /\b(the|a|an|of|and|or|with|in|on|for|by|without|under|our|your|their|this|that)\b/gi;

export function validateVideoPrompt(prompt: string, opts?: { duration?: number; format?: string }): ValidationResult {
  const findings: Finding[] = [];
  const trimmed = (prompt || '').trim();

  // ─── 1. EMPTY / TOO SHORT (block) ─────────────────────────
  if (trimmed.length < 30) {
    findings.push({
      code: 'video_prompt_too_short',
      severity: 'block',
      message: `Prompt vidéo trop court (${trimmed.length} car).`,
      evidence: { length: trimmed.length },
      suggestion: 'Décrire sujet + mouvement + lumière + caméra (~100-200 car idéal).',
    });
    return aggregate(findings);
  }

  // ─── 2. DURATION RANGE (block) ────────────────────────────
  if (opts?.duration !== undefined) {
    if (opts.duration < 1 || opts.duration > 15) {
      findings.push({
        code: 'duration_out_of_range',
        severity: 'block',
        message: `Durée ${opts.duration}s hors plage (1-15s).`,
        evidence: { duration: opts.duration },
        suggestion: 'Kling: 5/10s. Seedance: max 10s. Au-delà → multiple clips à concaténer.',
      });
    }
  }

  // ─── 3. MARKUP LEAK (block) ───────────────────────────────
  for (const rx of MARKUP_LEAK) {
    const m = trimmed.match(rx);
    if (m) {
      findings.push({
        code: 'markup_leak',
        severity: 'block',
        message: `Markup non résolu : "${m[0]}"`,
        evidence: { match: m[0] },
      });
    }
  }

  // ─── 4. FORBIDDEN (block) ─────────────────────────────────
  for (const rx of FORBIDDEN_CONTENT) {
    const m = trimmed.match(rx);
    if (m) {
      findings.push({
        code: 'forbidden_video_content',
        severity: 'block',
        message: `Contenu interdit : "${m[0]}"`,
        evidence: { match: m[0] },
      });
    }
  }

  const charM = trimmed.match(DIRECT_CHAR_REPRODUCTION);
  if (charM) {
    findings.push({
      code: 'direct_character_reproduction',
      severity: 'block',
      message: `Reproduction perso IP : "${charM[0]}"`,
      evidence: { match: charM[0] },
      suggestion: 'Évoquer l\'archétype sans nommer le perso.',
    });
  }
  const logoM = trimmed.match(TRADEMARK_LOGO_VIDEO);
  if (logoM) {
    findings.push({
      code: 'trademark_logo_reproduction',
      severity: 'block',
      message: `Logo marque : "${logoM[0]}"`,
      evidence: { match: logoM[0] },
    });
  }
  const celebM = trimmed.match(CELEB_LIKENESS_VIDEO);
  if (celebM) {
    findings.push({
      code: 'celebrity_likeness',
      severity: 'block',
      message: `Likeness célébrité : "${celebM[0]}"`,
      evidence: { match: celebM[0] },
    });
  }

  // ─── 5. FRENCH PROMPT (block) ─────────────────────────────
  // Kling et Seedance T2V sont anglophones. Un prompt FR donne
  // souvent du déchet ou une généralisation médiocre.
  const frCount = (trimmed.match(FR_INDICATORS) || []).length;
  const enCount = (trimmed.match(ENGLISH_INDICATORS) || []).length;
  if (frCount >= 3 && frCount >= enCount) {
    findings.push({
      code: 'video_prompt_not_english',
      severity: 'block',
      message: `Prompt vidéo en français détecté (${frCount} mots FR vs ${enCount} EN).`,
      evidence: { frCount, enCount, snippet: trimmed.substring(0, 100) },
      suggestion: 'Traduire en anglais — Kling/Seedance produisent un meilleur résultat.',
    });
  }

  // ─── 6. NO MOVEMENT (warn) ────────────────────────────────
  if (!MOVEMENT_KEYWORDS.test(trimmed)) {
    findings.push({
      code: 'video_no_movement',
      severity: 'warn',
      message: 'Aucun mot-clé de mouvement — risque de "vidéo statique" payée plein tarif.',
      suggestion: 'Ajouter au moins un verbe d\'action (pouring, walking, opening, rotating...).',
    });
  }

  // ─── 7. NO CAMERA MOVEMENT (warn) ─────────────────────────
  if (!CAMERA_MOVEMENT.test(trimmed)) {
    findings.push({
      code: 'video_no_camera_movement',
      severity: 'warn',
      message: 'Aucun mouvement caméra spécifié — résultat plus plat.',
      suggestion: 'Préciser : dolly in, pan, tracking shot, drone aerial...',
    });
  }

  // ─── 8. NO LIGHTING CUE (warn) ────────────────────────────
  if (!LIGHTING.test(trimmed)) {
    findings.push({
      code: 'video_no_lighting',
      severity: 'warn',
      message: 'Pas de cue d\'éclairage — atmosphère imprévisible.',
      suggestion: 'Indiquer golden hour, neon, soft light, cinematic lighting...',
    });
  }

  // ─── 9. LONG PROMPT (warn) ────────────────────────────────
  if (trimmed.length > 300) {
    findings.push({
      code: 'video_prompt_too_long',
      severity: 'warn',
      message: `Prompt long (${trimmed.length} car) — Seedance préfère ≤ 200 car.`,
      evidence: { length: trimmed.length },
      suggestion: 'Garder l\'essentiel — 1 scène, 1 mouvement, 1 ambiance.',
    });
  }

  return aggregate(findings);
}
