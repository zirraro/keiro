/**
 * Caption validator — fioritures objectives uniquement.
 *
 * Ce que ce validator FAIT :
 *   - block : claims interdits (RGPD/marketing), AI-tells génériques,
 *            mentions 'IA' dans la signature client-facing, captions
 *            quasi-identiques à un post récent (Levenshtein > 0.85).
 *   - warn  : densité hashtags > seuil plateforme, densité emojis
 *            excessive (visual noise), CTA générique répétitif, hook
 *            qui réutilise l'ouverture exacte d'un post < 7j.
 *   - info  : tendances stylistiques pour telemetry (long phrases,
 *            ponctuation excessive).
 *
 * Ce que ce validator NE FAIT PAS :
 *   - imposer un ton ou un style
 *   - imposer une longueur fixe (juste plage saine)
 *   - bloquer sur des choix éditoriaux subjectifs
 *
 * Founder rules respectées :
 *   - "jamais 'IA' dans la signature" (Personify agents) → block
 *   - "discret, no stress" → pas de "URGENT", "LIMITED", "FOMO"
 *   - "qualité constante + diversité" → anti-réplication exacte
 *     mais pas anti-similarité (laisse vivre les variations)
 */

import type { PostInput, ValidationContext, Finding } from './types';
import { aggregate, type ValidationResult } from './types';

// ─── Claims interdits ────────────────────────────────────────
// Marketing/RGPD : promesses absolues, comparatifs interdits,
// faux gratuits, attestations sans preuve.
const FORBIDDEN_CLAIMS: RegExp[] = [
  /\b(garanti|garantie)\s+\d+%/i,                         // "garanti 100%"
  /\b100\s*%\s*gratuit/i,                                  // 100% gratuit (RGPD trompeur)
  /\ble\s+(meilleur|seul|premier|n[°o]\s*1)\s+(restaurant|boutique|salon|commerce)/i,
  /\b(sans\s+engagement)\s+\b(garanti|à\s+vie|illimit[ée])/i,
  /\bclinic(ally|ment)\s+(prouv|test)/i,                   // claims santé
  /\b(perte\s+de\s+poids|amaigriss)/i,                     // claims santé
  /\bavant[\s-]?apr[èe]s\s+(garanti|prouv)/i,
];

// ─── AI-tells (formules qui crient "généré par IA") ──────────
// Ces tournures sont des dead giveaways. Block parce qu'elles
// dégradent la perception client SANS exception légitime.
const AI_TELLS: RegExp[] = [
  /^dans\s+ce\s+(post|article)/i,
  /^d[ée]couvrons\s+ensemble/i,
  /^voici\s+comment/i,
  /n[''’]h[ée]sitez\s+pas\s+à/i,
  /n[''’]attendez\s+plus/i,
  /^plongeons\s+dans/i,
  /\bdans\s+cet\s+article,?\s+nous\s+allons/i,
  /\bsans\s+plus\s+attendre/i,
  /\baujourd[''’]hui\s+je\s+vais\s+vous\s+parler/i,
  /\bil\s+est\s+important\s+de\s+(noter|comprendre)/i,
];

// ─── 'IA' dans signature (founder rule) ──────────────────────
// "Ton stratège" pas "Ton stratège IA". Block uniquement quand
// 'IA' figure dans une phrase de signature, pas dans le contenu
// éditorial.
const AI_SIGNATURE: RegExp[] = [
  /\b(ton|votre|notre|mon)\s+(coach|strat[ée]g[ei]?|assistant|conseiller|expert|guide)\s+IA\b/i,
  /\b(notre|une|cette|ton|votre)\s+IA\b/i,                // "notre IA", "votre IA" tout seul
  /\bg[ée]n[ée]r[ée]\s+par\s+IA\b/i,
  /\bs[ée]lectionn[ée]\s+par\s+(notre|une|votre)\s+IA\b/i,
];

// ─── Spam patterns ───────────────────────────────────────────
const SPAM_CTA: RegExp[] = [
  /\bsuivez[\s-]?nous\s+pour\s+plus/i,
  /\babonnez[\s-]?vous\s+!?\s*$/im,
  /\blike\s+(et|&|\+)\s+commente/i,
  /\bdouble[\s-]?tap\s+si/i,
];

// ─── Quality enrichments (warn-level only, never block) ──────
// "Très/super/incroyable/magnifique/génial" sans contexte = fluff.
// Pas un block — Léna peut les utiliser ponctuellement — mais
// 2+ occurrences = signal de paresse rédactionnelle.
const GENERIC_ADJECTIVES = /\b(super|g[ée]nial|incroyable|magnifique|extraordinaire|fantastique|top|cool|sympa|chouette|joli)\b/gi;

// Verbe-être / avoir / passive omniprésent = écriture molle.
const WEAK_VERBS = /\b(est|sont|était|étaient|a été|sera|seront|avoir|nous avons|on a|c'est|il y a)\b/gi;

// Signaux de specificity — au moins UN devrait apparaître pour
// donner du concret au lecteur :
//   - chiffre/quantité (3, 12h30, 5€, 30%)
//   - jour/date (lundi, vendredi, demain, 14 mars)
//   - lieu/quartier
//   - sens (texture, odeur, son, goût)
const SPECIFIC_NUMBERS = /\b(\d{1,4})(€|h|h\d{2}|\s*%|\s*(pers|min|sec|kg|g|cl|cm|m))\b/i;
const TIME_SPECIFIC   = /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|aujourd['']hui|demain|ce\s+(soir|matin|midi)|midi|\d{1,2}h\d{0,2})\b/i;
const SENSORY_WORDS   = /\b(croustillant|fondant|moelleux|crémeux|fumé|tiède|brûlant|glac[ée]|parfumé|épicé|sucré|salé|acidulé|amer|frais|texture|odeur|parfum|saveur|arôme)\b/i;
const PLACE_HINT      = /\b(quartier|rue|avenue|boulevard|place|métro|à\s+côté|en\s+face|près\s+de|en\s+plein\s+cœur)\b/i;

const PLATFORM_LIMITS: Record<string, { captionMax: number; hashtagMax: number; emojiMax: number }> = {
  instagram: { captionMax: 2200, hashtagMax: 10, emojiMax: 8 },
  tiktok:    { captionMax: 2200, hashtagMax: 8,  emojiMax: 6 },
  linkedin:  { captionMax: 3000, hashtagMax: 5,  emojiMax: 4 },
  twitter:   { captionMax: 280,  hashtagMax: 3,  emojiMax: 3 },
};

function countEmojis(s: string): number {
  // Rough but stable emoji counter — covers most Unicode emoji ranges
  const matches = s.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F0FF}]/gu);
  return matches ? matches.length : 0;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Cheap Levenshtein-ratio approximation (using Jaccard on tri-grams).
 * Faster than true Levenshtein on long strings, good enough to detect
 * "same caption with one comma changed" which is what we want to block.
 */
function similarityRatio(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.length < 8 || nb.length < 8) return 0;
  const trigrams = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 2; i++) set.add(s.substring(i, i + 3));
    return set;
  };
  const sa = trigrams(na);
  const sb = trigrams(nb);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function validateCaption(post: PostInput, ctx: ValidationContext): ValidationResult {
  const findings: Finding[] = [];
  const caption = (post.caption || '').trim();
  const hook = (post.hook || '').trim();
  const fullText = `${hook}\n${caption}`.trim();

  // Stories/photos sometimes have empty/short captions — that's fine.
  const isShortFormat = (post.format || '').toLowerCase() === 'story' || (post.format || '').toLowerCase() === 'photo';

  // ─── 1. FORBIDDEN CLAIMS (block) ─────────────────────────
  for (const rx of FORBIDDEN_CLAIMS) {
    const m = fullText.match(rx);
    if (m) {
      findings.push({
        code: 'forbidden_claim',
        severity: 'block',
        message: `Claim interdit détecté : "${m[0]}"`,
        evidence: { match: m[0], pattern: rx.source },
        suggestion: 'Reformuler sans promesse absolue / superlatif / claim santé.',
      });
    }
  }

  // ─── 2. AI-TELLS (block) ─────────────────────────────────
  for (const rx of AI_TELLS) {
    const m = fullText.match(rx);
    if (m) {
      findings.push({
        code: 'ai_tell',
        severity: 'block',
        message: `Formule IA-classique : "${m[0]}"`,
        evidence: { match: m[0] },
        suggestion: 'Démarrer par un détail concret, une question ou un fait précis.',
      });
    }
  }

  // ─── 3. 'IA' DANS SIGNATURE (block, founder rule) ────────
  for (const rx of AI_SIGNATURE) {
    const m = fullText.match(rx);
    if (m) {
      findings.push({
        code: 'ai_signature',
        severity: 'block',
        message: `Mention "IA" dans la signature client-facing interdite (règle founder).`,
        evidence: { match: m[0] },
        suggestion: 'Remplacer par le nom du persona ou retirer la mention.',
      });
    }
  }

  // ─── 4. PLATEFORME limits ────────────────────────────────
  const platform = (post.platform || ctx.platform || 'instagram').toLowerCase();
  const limits = PLATFORM_LIMITS[platform] || PLATFORM_LIMITS.instagram;

  if (!isShortFormat && caption.length > limits.captionMax) {
    findings.push({
      code: 'caption_too_long',
      severity: 'block',
      message: `Caption ${caption.length} car > limite ${limits.captionMax} pour ${platform}.`,
      evidence: { length: caption.length, max: limits.captionMax },
    });
  }
  if (!isShortFormat && caption.length > 0 && caption.length < 30) {
    findings.push({
      code: 'caption_too_short',
      severity: 'warn',
      message: `Caption très courte (${caption.length} car) — peu engageante pour ${platform}.`,
      evidence: { length: caption.length },
    });
  }

  const hashtagCount = (post.hashtags || []).length + (caption.match(/#\w+/g) || []).length;
  if (hashtagCount > limits.hashtagMax) {
    findings.push({
      code: 'hashtag_spam',
      severity: hashtagCount > limits.hashtagMax * 1.5 ? 'block' : 'warn',
      message: `${hashtagCount} hashtags > ${limits.hashtagMax} (perçu comme spam sur ${platform}).`,
      evidence: { count: hashtagCount, max: limits.hashtagMax },
      suggestion: `Garder les ${limits.hashtagMax} plus pertinents.`,
    });
  }

  const emojiCount = countEmojis(fullText);
  if (emojiCount > limits.emojiMax) {
    findings.push({
      code: 'emoji_excess',
      severity: emojiCount > limits.emojiMax * 1.6 ? 'block' : 'warn',
      message: `${emojiCount} emojis > seuil ${limits.emojiMax} (visual noise).`,
      evidence: { count: emojiCount, max: limits.emojiMax },
    });
  }

  // ─── 5. SPAM CTA (warn, pas block — peut être légitime sur LI) ─
  for (const rx of SPAM_CTA) {
    if (rx.test(fullText)) {
      findings.push({
        code: 'spam_cta',
        severity: 'warn',
        message: `CTA générique détecté ("suivez-nous", "abonnez-vous", "like & commente").`,
        evidence: { pattern: rx.source },
        suggestion: 'Remplacer par un CTA spécifique au contenu.',
      });
      break;
    }
  }

  // ─── 6. DUPLICATE / REPLICATION (block si > 0.85, warn si > 0.7) ─
  if (!isShortFormat && fullText.length >= 40 && (ctx.recent_posts || []).length > 0) {
    let maxSim = 0;
    let matchId: string | null = null;
    for (const rp of ctx.recent_posts || []) {
      const rpText = `${rp.hook || ''}\n${rp.caption || ''}`.trim();
      if (!rpText || rpText.length < 20) continue;
      // Only compare same platform — IG copy can be reused on LI safely
      if (rp.platform && platform && rp.platform.toLowerCase() !== platform) continue;
      const sim = similarityRatio(fullText, rpText);
      if (sim > maxSim) { maxSim = sim; matchId = rp.id; }
    }
    if (maxSim >= 0.85) {
      findings.push({
        code: 'duplicate_caption',
        severity: 'block',
        message: `Caption quasi-identique à un post récent (similarité ${Math.round(maxSim * 100)}%).`,
        evidence: { similarity: maxSim, match_post_id: matchId },
        suggestion: 'Reformuler complètement, garder le concept varier l\'écriture.',
      });
    } else if (maxSim >= 0.70) {
      findings.push({
        code: 'caption_too_similar',
        severity: 'warn',
        message: `Caption proche d'un post récent (${Math.round(maxSim * 100)}%) — risque feed monotone.`,
        evidence: { similarity: maxSim, match_post_id: matchId },
      });
    }
  }

  // ─── 7. HOOK REUSE (warn) ────────────────────────────────
  if (hook && hook.length >= 8 && (ctx.recent_posts || []).length >= 3) {
    const hookNorm = normalize(hook);
    const recent = (ctx.recent_posts || []).slice(0, 7);
    const hookHits = recent.filter(rp => normalize(rp.hook || '').substring(0, hookNorm.length) === hookNorm).length;
    if (hookHits >= 1) {
      findings.push({
        code: 'hook_reuse',
        severity: 'warn',
        message: `Hook identique à un post récent (×${hookHits + 1}).`,
        evidence: { hook, occurrences: hookHits + 1 },
        suggestion: 'Varier l\'ouverture — angle / question / image / chiffre.',
      });
    }
  }

  // ─── 8. QUALITY ENRICHMENTS (warn/info, jamais block) ─────
  // Founder rule : "augmenter qualité sans brider créativité".
  // Ces checks sont des SIGNAUX, pas des gardes-fous bloquants.
  if (!isShortFormat && caption.length >= 60) {
    // Specificity : un post fort cite AU MOINS un détail concret
    const hasNumbers = SPECIFIC_NUMBERS.test(caption);
    const hasTime    = TIME_SPECIFIC.test(caption);
    const hasSensory = SENSORY_WORDS.test(caption);
    const hasPlace   = PLACE_HINT.test(caption);
    const specHits = [hasNumbers, hasTime, hasSensory, hasPlace].filter(Boolean).length;
    if (specHits === 0) {
      findings.push({
        code: 'low_specificity',
        severity: 'warn',
        message: 'Aucun détail concret (chiffre, heure, lieu, sensoriel) — texte abstrait.',
        evidence: { hasNumbers, hasTime, hasSensory, hasPlace },
        suggestion: 'Ajouter un chiffre, une heure, un lieu ou un détail sensoriel pour ancrer le post.',
      });
    } else if (specHits === 1) {
      findings.push({
        code: 'specificity_thin',
        severity: 'info',
        message: 'Un seul ancrage concret — un 2ᵉ détail renforcerait l\'effet.',
        evidence: { specHits },
      });
    }

    // Generic adjectives — fluff signal
    const genericHits = (caption.match(GENERIC_ADJECTIVES) || []).length;
    if (genericHits >= 3) {
      findings.push({
        code: 'generic_adjectives',
        severity: 'warn',
        message: `${genericHits} adjectifs génériques (super/génial/incroyable...) — perçu comme fluff.`,
        evidence: { count: genericHits },
        suggestion: 'Remplacer par des descripteurs sensoriels précis (croustillant, fumé, tiède, ...).',
      });
    } else if (genericHits === 2) {
      findings.push({
        code: 'generic_adjectives_borderline',
        severity: 'info',
        message: `${genericHits} adjectifs génériques détectés — surveille la densité.`,
      });
    }

    // Weak verbs density — too many être/avoir/c'est = écriture molle
    const weakHits = (caption.match(WEAK_VERBS) || []).length;
    const wordsCount = caption.split(/\s+/).length;
    const weakRatio = wordsCount > 0 ? weakHits / wordsCount : 0;
    if (weakHits >= 4 && weakRatio > 0.12) {
      findings.push({
        code: 'weak_verbs_density',
        severity: 'warn',
        message: `${weakHits} verbes faibles (être/avoir/c'est) sur ${wordsCount} mots — texte mou.`,
        evidence: { weakHits, wordsCount, weakRatio: Math.round(weakRatio * 100) },
        suggestion: 'Remplacer par des verbes d\'action (croque, glisse, déborde, fume, mijote...).',
      });
    }

    // Caption all questions / no statement = lecteur n'a pas d'info
    const questionMarks = (caption.match(/\?/g) || []).length;
    const periods       = (caption.match(/[.!]/g) || []).length;
    if (questionMarks >= 3 && periods < questionMarks) {
      findings.push({
        code: 'questions_only',
        severity: 'warn',
        message: 'Caption composée uniquement de questions — donne du contenu, pas que de l\'interrogatif.',
        evidence: { questionMarks, periods },
      });
    }
  }

  // ─── 9. CAPTION ↔ HOOK COHERENCE (info) ───────────────────
  if (hook && caption && hook.length >= 10 && caption.length >= 50) {
    // Si le hook mentionne un mot-clé totalement absent du caption,
    // signal de décrochage. Ex: hook "23h47" mais caption parle de
    // matinée → incohérence narrative.
    const hookKeywords = hook.toLowerCase().match(/\b[a-zà-ÿ]{5,}\b/gi) || [];
    const captionLower = caption.toLowerCase();
    const orphan = hookKeywords.filter(kw => !captionLower.includes(kw.toLowerCase()));
    if (hookKeywords.length >= 2 && orphan.length === hookKeywords.length) {
      findings.push({
        code: 'hook_caption_disconnect',
        severity: 'info',
        message: 'Hook et caption ne partagent aucun mot-clé — risque de cohérence narrative.',
        evidence: { hookKeywords, orphan },
      });
    }
  }

  return aggregate(findings);
}
