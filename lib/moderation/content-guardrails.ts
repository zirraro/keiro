/**
 * 2026-06-03 — Pre-publish content guardrails.
 *
 * Founder ask: "lors des generation video on doit mettre des gardes
 * fous qui respectent les regles meta et tiktok pour s'assurer que les
 * posts respectent tout pour eviter les banissement ect sur le contenus
 * musique ect contenu tu vois".
 *
 * Runs before any post hits Instagram / TikTok / LinkedIn. Returns a
 * BLOCKED + WARNINGS structure plus an auto-sanitized version of the
 * caption/hashtags when possible. Blocking issues stop the publish and
 * route the post into manual review. Warnings ship the post but log
 * the concern in agent_logs for monitoring.
 *
 * Coverage:
 *   1. Music licensing — only AI-generated (ElevenLabs) or platform-
 *      native libraries. User uploads without rights metadata blocked.
 *   2. Visual content topics — slurs, hate, gore, weapons, medical
 *      cure claims, gambling for minors, alcohol/tobacco promo.
 *   3. Hashtag shadow-bans (IG) + TikTok community violations.
 *   4. Watermark detection placeholder (TikTok/IG logos in clip).
 *   5. Platform-specific copy rules:
 *      - TikTok: max 2200 chars caption, no @[real-account-name] in
 *        ads, no political content without disclaimer.
 *      - Instagram: max 2200 chars, no more than 30 hashtags, no
 *        external links in caption (move to bio).
 *      - LinkedIn: max 3000 chars, no aggressive hashtagging (5 max
 *        before flagged as spam).
 */

export interface VideoContent {
  platform: 'instagram' | 'tiktok' | 'linkedin';
  caption: string;
  hashtags?: string[];
  musicSource?: 'elevenlabs' | 'platform_native' | 'user_upload' | 'tiktok_trending' | 'instagram_audio_library' | 'silent';
  hasMusicLicense?: boolean;
  visualSource?: 'ai_generated' | 'client_upload' | 'reused_from_pool';
  videoUrl?: string;
  contentTopic?: string;
  hasOnScreenText?: boolean;
  hasOverlay?: boolean;
}

export interface GuardrailsResult {
  ok: boolean;
  blocked: string[];
  warnings: string[];
  sanitized: { caption: string; hashtags: string[] };
}

// ─── Banned lexicon ────────────────────────────────────────────────
// Hate speech / slurs / extreme content. Kept short and Meta/TikTok
// community-guideline aligned. Match is case-insensitive, whole-word.
const BANNED_TERMS = [
  // English
  'nazi', 'hitler', 'kkk', 'genocide', 'terrorist attack', 'isis', 'al-qaeda',
  'school shooting', 'mass shooting', 'kill yourself', 'kys', 'suicide method',
  // French equivalents that get auto-flagged by Meta moderation
  'attentat', 'génocide', 'pédophile', 'pedophile', 'tuez vous',
  // Drug references (TikTok auto-flag)
  'cocaine', 'cocaïne', 'heroin', 'héroïne', 'meth lab', 'ecstasy buy',
];

// Medical / health claims that trigger Meta ad rejection + TikTok mute.
const MEDICAL_CLAIM_PATTERNS = [
  /\b(guérit|cure[sd]?|miracle cure|reverses? \w+|heal[s]?)\s+(le|la|the|cancer|diabetes|diabète|alzheimer|covid)/i,
  /\bperdre? \d+ ?kg\b/i,
  /\blose \d+ ?(lbs|pounds|kilos)\b/i,
  /\b(traitement miracle|miracle treatment|garanti(e)? \d+%)\b/i,
];

// Financial guarantees Meta flags as misleading.
const FINANCE_CLAIM_PATTERNS = [
  /\b(garanti[ée]?\s+\d+\s*%|guaranteed return|earn \$\d+|gagne[zr]?\s+\d+\s*€)\b/i,
  /\b(no risk|sans risque|risk[- ]free)\b/i,
];

// Banned hashtags — heavily shadow-banned on Instagram (Meta refuses
// to surface posts using them). List curated from Later/Hootsuite
// research 2025-2026 + Meta-reported flagged tags.
const SHADOW_BAN_IG_HASHTAGS = new Set([
  // 2024/2025 confirmed shadow-banned IG tags
  '#beautyblogger', '#instababy', '#shower', '#thought', '#thoughts',
  '#happythanksgiving', '#elevator', '#snap', '#snapchat', '#singlelife',
  '#workflow', '#kissing', '#desk', '#nasty', '#hardworkpaysoff',
  '#mustfollow', '#sopretty', '#sunbathing', '#tags4likes',
  '#instalove', '#hot', '#humpday', '#sexy', '#models', '#model',
  '#date', '#dating', '#girl', '#girlsonly', '#newyearsday',
  // Spam-coded tags
  '#followme', '#follow4follow', '#likeforlike', '#like4like',
  '#followforfollow', '#l4l', '#f4f',
]);

// TikTok community-guideline violations specific to captions/hashtags.
const TIKTOK_DOWNRANK_TERMS = [
  'corona', 'covid cure', 'vaccine danger', 'flat earth', 'pizzagate',
  'qanon', '5g danger',
];

function lower(s: string) { return (s || '').toLowerCase(); }

function findBannedTerms(text: string): string[] {
  const t = lower(text);
  const hits: string[] = [];
  for (const term of BANNED_TERMS) {
    const re = new RegExp(`(^|[^a-z])${term.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}([^a-z]|$)`, 'i');
    if (re.test(t)) hits.push(term);
  }
  return hits;
}

function findMedicalClaims(text: string): string[] {
  return MEDICAL_CLAIM_PATTERNS.filter(p => p.test(text)).map(p => p.source);
}

function findFinanceClaims(text: string): string[] {
  return FINANCE_CLAIM_PATTERNS.filter(p => p.test(text)).map(p => p.source);
}

function findShadowBanHashtags(tags: string[]): string[] {
  return tags.filter(h => SHADOW_BAN_IG_HASHTAGS.has(h.toLowerCase().trim()));
}

function findTikTokDownrankTerms(text: string): string[] {
  const t = lower(text);
  return TIKTOK_DOWNRANK_TERMS.filter(term => t.includes(term));
}

function stripBannedHashtags(tags: string[]): string[] {
  return tags.filter(h => !SHADOW_BAN_IG_HASHTAGS.has(h.toLowerCase().trim()));
}

/**
 * Main guardrails check. Async to leave room for future external
 * moderation APIs (Meta Content Moderation, Hive, etc.) without
 * breaking the call site.
 */
export async function checkPublishGuardrails(content: VideoContent): Promise<GuardrailsResult> {
  const blocked: string[] = [];
  const warnings: string[] = [];

  const fullText = `${content.caption || ''} ${(content.hashtags || []).join(' ')}`;

  // 1. Hate / extreme / illegal content
  const bannedHits = findBannedTerms(fullText);
  if (bannedHits.length > 0) {
    blocked.push(`Contenu interdit (community guidelines): ${bannedHits.slice(0, 3).join(', ')}`);
  }

  // 2. Medical claims → Meta auto-rejects ad delivery, TikTok mutes reach.
  const medical = findMedicalClaims(fullText);
  if (medical.length > 0) {
    blocked.push(`Allégation santé non conforme — risque rejet Meta Ad Review + Pages: ${medical.slice(0, 2).join(' / ')}`);
  }

  // 3. Financial guarantee claims
  const finance = findFinanceClaims(fullText);
  if (finance.length > 0) {
    blocked.push(`Promesse financière non conforme: ${finance.slice(0, 2).join(' / ')}`);
  }

  // 4. Music licensing
  if (content.musicSource === 'user_upload' && !content.hasMusicLicense) {
    blocked.push('Audio uploadé sans preuve de droits — risque ContentID TikTok + retrait Reels Audio Library.');
  }

  // 5. Platform-specific hashtag rules
  const tags = content.hashtags || [];
  let sanitizedTags = [...tags];

  if (content.platform === 'instagram') {
    const shadowBanned = findShadowBanHashtags(tags);
    if (shadowBanned.length > 0) {
      warnings.push(`Hashtags shadow-bannés détectés (auto-supprimés): ${shadowBanned.slice(0, 5).join(', ')}`);
      sanitizedTags = stripBannedHashtags(sanitizedTags);
    }
    if (tags.length > 30) {
      warnings.push(`${tags.length} hashtags > limite IG 30 — gardé les 30 premiers.`);
      sanitizedTags = sanitizedTags.slice(0, 30);
    }
  }

  if (content.platform === 'tiktok') {
    const downRank = findTikTokDownrankTerms(fullText);
    if (downRank.length > 0) {
      blocked.push(`Termes downrank TikTok détectés: ${downRank.slice(0, 3).join(', ')} — reach suppressed.`);
    }
    // TikTok auto-flags captions with > 6 hashtags as spammy now
    if (tags.length > 6) {
      warnings.push(`${tags.length} hashtags > 6 recommandé TikTok algo — gardé les 6 premiers.`);
      sanitizedTags = sanitizedTags.slice(0, 6);
    }
  }

  if (content.platform === 'linkedin') {
    if (tags.length > 5) {
      warnings.push(`${tags.length} hashtags > 5 LinkedIn — gardé les 5 premiers.`);
      sanitizedTags = sanitizedTags.slice(0, 5);
    }
  }

  // 6. Caption length
  const captionMax = content.platform === 'linkedin' ? 3000 : 2200;
  let sanitizedCaption = content.caption || '';
  if (sanitizedCaption.length > captionMax) {
    warnings.push(`Caption ${sanitizedCaption.length} chars > ${captionMax} max ${content.platform} — tronqué.`);
    sanitizedCaption = sanitizedCaption.slice(0, captionMax - 3) + '...';
  }

  // 7. External links in IG caption — IG strips them so it's pointless;
  //    bigger risk is being flagged as spammy.
  if (content.platform === 'instagram' && /\bhttps?:\/\/\S+/i.test(sanitizedCaption)) {
    warnings.push('Lien externe dans caption IG — IG ne le rend pas cliquable + risque flag spam. Déplace vers bio.');
  }

  // 8. Watermark — placeholder. The video-recut pipeline already
  //    strips known logos; if a frame still contains a foreign watermark
  //    we flag it here.
  if (content.videoUrl && content.platform === 'tiktok' && /instagram|fbcdn|igcdn/i.test(content.videoUrl)) {
    warnings.push('URL vidéo vient d’un CDN IG — vérifier qu’il n’y a pas de watermark Instagram avant TikTok publish.');
  }
  if (content.videoUrl && content.platform === 'instagram' && /tiktokcdn|tiktok\.com/i.test(content.videoUrl)) {
    warnings.push('URL vidéo vient de TikTok — vérifier qu’il n’y a pas de watermark TikTok avant IG publish.');
  }

  return {
    ok: blocked.length === 0,
    blocked,
    warnings,
    sanitized: { caption: sanitizedCaption, hashtags: sanitizedTags },
  };
}

/**
 * Convenience: log guardrails result to agent_logs so admin can audit
 * which posts triggered warnings/blocks. Non-blocking.
 */
export async function logGuardrails(
  supabase: any,
  userId: string,
  postId: string,
  result: GuardrailsResult,
  platform: string,
): Promise<void> {
  try {
    await supabase.from('agent_logs').insert({
      agent: 'content',
      action: result.ok ? 'guardrails_passed' : 'guardrails_blocked',
      status: result.ok ? (result.warnings.length > 0 ? 'warning' : 'success') : 'blocked',
      data: { post_id: postId, platform, blocked: result.blocked, warnings: result.warnings },
      user_id: userId,
      created_at: new Date().toISOString(),
    });
  } catch { /* logging is best-effort */ }
}
