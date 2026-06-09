/**
 * Image-prompt validator — vérifie le prompt Seedream AVANT l'appel API.
 *
 * Économie : chaque appel Seedream raté = 0,04 € + 8-15s perdu. On
 * détecte les prompts visiblement faibles ou problématiques avant.
 *
 * Ce que ça FAIT (block réservé aux cas objectifs) :
 *   - block : prompt vide / trop court (< 25 char = LLM s'est trompé),
 *            prompt avec markup résiduel (code blocks, brackets non
 *            résolus), contenu interdit explicite (gore, NSFW, mineurs),
 *            mention de personnalités/marques copyrightées par nom.
 *   - warn  : pas de subject narratif (juste des couleurs/lighting),
 *            pas de hint composition (top-down, close-up, hero shot),
 *            longueur excessive (> 1000 char qui dilue le signal),
 *            absence de qualité (pas "professional", "studio",
 *            "cinematic" ou équivalent).
 *   - info  : telemetry sur diversité de styles (counts par mood).
 *
 * Ce que ça NE FAIT PAS :
 *   - imposer un style ou une palette
 *   - imposer une grammaire / structure fixe
 *   - bloquer la créativité du brief Léna
 */

import type { Finding } from './types';
import { aggregate, type ValidationResult } from './types';

// Forbidden content classes — Seedream rejette ou produit du déchet.
// Catalogue conservateur, on évite les false positives.
const FORBIDDEN_CONTENT: RegExp[] = [
  /\b(gore|blood\s+splatter|graphic\s+violence|mutilation)\b/i,
  /\b(nude|naked|nsfw|explicit\s+sexual|sexual\s+act)\b/i,
  /\b(child|minor|underage)\s+(model|portrait|photo)/i,
  /\bcopyright(ed)?\s+(character|logo|brand)/i,
];

// Copyright handling — founder rule 2026-06-09:
// "pas trop dur sur les copyrights, on veut surfer sur les grosses
// marques aussi, nos créations restent originales".
//
// → Block UNIQUEMENT la reproduction directe d'IP (l'image générée
//   reproduit littéralement le perso/logo) ET la likeness de
//   célébrités nommées (risque légal réel via droit à l'image).
// → Autorisé : référence ambiance, inspiration, vibes, mention
//   brand en contexte marketing. C'est de la culture visuelle
//   partagée, pas de la contrefaçon.
//
// Pattern de DIRECT REPRODUCTION : "(a|the|featuring|with) [CHARACTER]"
// suivi d'un nom propre IP. On capture le contexte qui dit "génère
// littéralement ce truc", pas "inspire-toi de".

// Characters dont Seedream produira une copie reconnaissable si on
// les nomme comme sujet. Block UNIQUEMENT si le contexte suggère
// reproduction (a/the/featuring/with/of/wearing/holding).
const COPYRIGHTED_CHARACTERS = /\b(?:a|the|with|featuring|of|wearing|holding|as|like)\s+(?:little\s+|a\s+|the\s+)?(mickey\s+mouse|donald\s+duck|elsa|anna(?!\s+wintour)|olaf|mois?ana|pikachu|charizard|mario|luigi|sonic|spider-?man|iron\s+man|batman|superman|hulk|thor|captain\s+america|harry\s+potter|hermione|gandalf|frodo|yoda|darth\s+vader|princess\s+leia|simba|nemo|woody|buzz\s+lightyear|shrek|elsa|stitch|baby\s+yoda|grogu|peppa\s+pig|bluey)\b/i;

// Logos / trademarks — block si "logo of X" ou "X logo on" sont
// littéralement dans le prompt (Seedream tentera de le reproduire).
const TRADEMARK_LOGO = /\b(logo|emblem|trademark|crest|wordmark)\s+(?:of|du|de)\s+(apple|nike|adidas|coca-?cola|pepsi|mcdonald|starbucks|disney|netflix|amazon|tesla|gucci|chanel|louis\s+vuitton|rolex|ferrari|bmw|mercedes)|(?:apple|nike|adidas|coca-?cola|pepsi|mcdonald|starbucks|disney|netflix|amazon|tesla|gucci|chanel|louis\s+vuitton|rolex|ferrari|bmw|mercedes)\s+logo\b/i;

// Celebrity likeness — droit à l'image, risque légal réel.
// Block si le nom est associé à un mot impliquant un portrait
// photographique (face, portrait, likeness, photo of, lookalike).
const CELEBRITY_LIKENESS = /\b(?:portrait|face|photo|photograph|likeness|lookalike|standing|smiling|posing|holding)\s+(?:of\s+)?(messi|ronaldo|mbapp[ée]|beyonc[ée]|taylor\s+swift|kim\s+kardashian|kanye|drake|rihanna|adele|elon\s+musk|mark\s+zuckerberg|steve\s+jobs|tim\s+cook|bill\s+gates|emmanuel\s+macron|joe\s+biden|donald\s+trump|barack\s+obama|kylie\s+jenner)\b|\b(messi|ronaldo|mbapp[ée]|beyonc[ée]|taylor\s+swift|kim\s+kardashian|kanye|drake|rihanna|adele|elon\s+musk|mark\s+zuckerberg|steve\s+jobs|tim\s+cook|bill\s+gates|emmanuel\s+macron|joe\s+biden|donald\s+trump|barack\s+obama|kylie\s+jenner)['']?s\s+(?:face|portrait|likeness)/i;

// Markup leakage — parfois le LLM laisse traîner des artifacts.
const MARKUP_LEAK: RegExp[] = [
  /\{[a-z_]+\}/i,                  // {placeholder}
  /\[[A-Z_]{3,}\]/,                // [PLACEHOLDER]
  /\$\{[^}]+\}/,                   // ${var}
  /```/,                            // code fence
  /<\/?[a-z]+>/i,                   // HTML tags
  /^prompt\s*:/i,                  // "Prompt: ..." preamble
  /^visual\s*(brief|description)\s*:/i, // "Visual brief:" preamble
];

// Composition cues — at least one should appear in a strong prompt.
const COMPOSITION_HINTS = /\b(close-?up|hero\s+shot|top-?down|wide\s+shot|portrait|landscape|aerial|low\s+angle|over-?the-?shoulder|macro|symmetrical|centered|rule\s+of\s+thirds|composition|framing)\b/i;

// Quality cues — adds professional/cinematic/editorial signal.
const QUALITY_HINTS = /\b(professional|editorial|magazine|cinematic|studio|hi(gh)?-?(end|res)|premium|luxe|luxury|crisp|sharp|detailed|4k|8k|photoreal(istic)?)\b/i;

// Subject hints — needs a noun (subject of the shot).
const HAS_SUBJECT = /\b[A-Za-z]{4,}\s+(of|in|on|with|near|at)\b/i;

export function validateImagePrompt(prompt: string, ctx?: { format?: string; business_type?: string | null }): ValidationResult {
  const findings: Finding[] = [];
  const trimmed = (prompt || '').trim();
  const lower = trimmed.toLowerCase();

  // ─── 1. EMPTY / TOO SHORT (block) ─────────────────────────
  if (trimmed.length < 25) {
    findings.push({
      code: 'prompt_too_short',
      severity: 'block',
      message: `Prompt trop court (${trimmed.length} car) — signal insuffisant pour Seedream.`,
      evidence: { length: trimmed.length },
      suggestion: 'Le brief doit décrire au minimum sujet + composition + ambiance.',
    });
    return aggregate(findings);
  }

  // ─── 2. MARKUP LEAK (block) ───────────────────────────────
  for (const rx of MARKUP_LEAK) {
    const m = trimmed.match(rx);
    if (m) {
      findings.push({
        code: 'markup_leak',
        severity: 'block',
        message: `Markup non résolu détecté : "${m[0]}"`,
        evidence: { match: m[0] },
        suggestion: 'Le LLM a laissé du markup. Re-générer le brief.',
      });
    }
  }

  // ─── 3. FORBIDDEN CONTENT (block) ─────────────────────────
  for (const rx of FORBIDDEN_CONTENT) {
    const m = trimmed.match(rx);
    if (m) {
      findings.push({
        code: 'forbidden_visual_content',
        severity: 'block',
        message: `Contenu interdit détecté : "${m[0]}"`,
        evidence: { match: m[0] },
        suggestion: 'Reformuler le brief sans cette mention.',
      });
    }
  }

  // ─── 4. COPYRIGHT — uniquement reproduction directe (block) ──
  // On laisse passer "Apple keynote vibes", "spirit of Disney magic",
  // "Black Friday energy" — c'est de l'inspiration marketing. Block
  // seulement si Seedream tenterait littéralement de reproduire un
  // perso/logo/visage.
  const charMatch = trimmed.match(COPYRIGHTED_CHARACTERS);
  if (charMatch) {
    findings.push({
      code: 'direct_character_reproduction',
      severity: 'block',
      message: `Reproduction directe d'un perso IP : "${charMatch[0]}"`,
      evidence: { match: charMatch[0] },
      suggestion: 'Remplacer par une description générique du concept (magie féérique, héros masqué, ambiance Noël Disney...).',
    });
  }
  const logoMatch = trimmed.match(TRADEMARK_LOGO);
  if (logoMatch) {
    findings.push({
      code: 'trademark_logo_reproduction',
      severity: 'block',
      message: `Logo/marque déposée à reproduire : "${logoMatch[0]}"`,
      evidence: { match: logoMatch[0] },
      suggestion: 'Évoquer le style sans nommer le logo. Utiliser des éléments visuels génériques.',
    });
  }
  const celebMatch = trimmed.match(CELEBRITY_LIKENESS);
  if (celebMatch) {
    findings.push({
      code: 'celebrity_likeness',
      severity: 'block',
      message: `Likeness de célébrité (droit à l'image) : "${celebMatch[0]}"`,
      evidence: { match: celebMatch[0] },
      suggestion: 'Décrire un archétype (un footballeur, une chanteuse pop, un CEO tech) sans nom propre.',
    });
  }

  // ─── 5. LONG PROMPT (warn) ────────────────────────────────
  if (trimmed.length > 1000) {
    findings.push({
      code: 'prompt_too_long',
      severity: 'warn',
      message: `Prompt très long (${trimmed.length} car) — le signal se dilue, Seedream perd les éléments clés.`,
      evidence: { length: trimmed.length },
      suggestion: 'Garder l\'essentiel : sujet, composition, lumière, palette. < 400 car idéal.',
    });
  }

  // ─── 6. NO SUBJECT (warn) ─────────────────────────────────
  if (!HAS_SUBJECT.test(trimmed)) {
    findings.push({
      code: 'no_subject',
      severity: 'warn',
      message: 'Pas de sujet narratif clair — uniquement des adjectifs/couleurs ?',
      evidence: { snippet: trimmed.substring(0, 120) },
      suggestion: 'Ajouter un nom-clé (le plat, le commerce, la personne, l\'objet) avec sa relation au décor.',
    });
  }

  // ─── 7. NO COMPOSITION (warn) ────────────────────────────
  if (!COMPOSITION_HINTS.test(trimmed)) {
    findings.push({
      code: 'no_composition_hint',
      severity: 'warn',
      message: 'Pas de hint composition (close-up, top-down, hero shot, etc.).',
      suggestion: 'Préciser le cadrage — Seedream produit des résultats plus prévisibles.',
    });
  }

  // ─── 8. NO QUALITY MARKER (warn) ─────────────────────────
  if (!QUALITY_HINTS.test(trimmed)) {
    findings.push({
      code: 'no_quality_marker',
      severity: 'warn',
      message: 'Pas de marqueur qualité (professional, cinematic, editorial...).',
      suggestion: 'Ajouter au moins un marqueur de niveau de finition.',
    });
  }

  // ─── 9. ALL-CAPS or all-lowercase noise (info) ───────────
  if (trimmed.length > 80) {
    const ucRatio = (trimmed.match(/[A-Z]/g) || []).length / trimmed.length;
    if (ucRatio > 0.4) {
      findings.push({
        code: 'all_caps_noise',
        severity: 'info',
        message: 'Beaucoup de majuscules — perçu comme bruit par Seedream.',
        evidence: { ucRatio },
      });
    }
  }

  return aggregate(findings);
}
