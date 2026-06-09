/**
 * Media-output validator — vérifie que la sortie Seedream/Seedance/Kling
 * est exploitable AVANT de la persister.
 *
 *   - block : URL invalide, dimensions hors specs plateforme, durée
 *            vidéo nulle / hors plage, signature d'erreur dans l'URL
 *            (e.g. providers retournent parfois un 200 avec une image
 *            "error placeholder").
 *   - warn  : URL accessible mais dimensions sub-optimales, ratio
 *            inhabituel, taille fichier > seuil (publication API rejette).
 *   - info  : telemetry (codec, taille).
 *
 * Pas de HEAD request réseau par défaut — on garde le validator pur
 * et synchrone. Si on veut un check 200 réseau, c'est `headProbe`
 * (async, opt-in pour usage hot path).
 */

import type { Finding } from './types';
import { aggregate, type ValidationResult } from './types';

interface SpecBucket {
  width: { min: number; max: number; ideal: [number, number] };
  height: { min: number; max: number; ideal: [number, number] };
  aspect: { min: number; max: number };
}

// IG/TT/LI specs (officiels Meta/TikTok/LinkedIn).
const SPECS_IMAGE: Record<string, SpecBucket> = {
  // 1:1 feed post (1080×1080 idéal, 320 min, 1440 max)
  'post':      { width: { min: 320, max: 2048, ideal: [1080, 1440] }, height: { min: 320, max: 2048, ideal: [1080, 1440] }, aspect: { min: 0.95, max: 1.05 } },
  'image':     { width: { min: 320, max: 2048, ideal: [1080, 1440] }, height: { min: 320, max: 2048, ideal: [1080, 1440] }, aspect: { min: 0.95, max: 1.05 } },
  'carrousel': { width: { min: 320, max: 2048, ideal: [1080, 1440] }, height: { min: 320, max: 2048, ideal: [1080, 1440] }, aspect: { min: 0.95, max: 1.05 } },
  // 9:16 vertical (story / reel cover / TT photo)
  'story':     { width: { min: 720, max: 2160, ideal: [1080, 1440] }, height: { min: 1280, max: 3840, ideal: [1920, 2560] }, aspect: { min: 0.50, max: 0.62 } },
  'photo':     { width: { min: 720, max: 2160, ideal: [1080, 1440] }, height: { min: 1280, max: 3840, ideal: [1920, 2560] }, aspect: { min: 0.50, max: 0.62 } },
  'reel':      { width: { min: 720, max: 2160, ideal: [1080, 1440] }, height: { min: 1280, max: 3840, ideal: [1920, 2560] }, aspect: { min: 0.50, max: 0.62 } },
  // 16:9 LinkedIn (1200×627 idéal)
  'text':      { width: { min: 800, max: 4096, ideal: [1200, 1920] }, height: { min: 400, max: 4096, ideal: [627, 1080] }, aspect: { min: 1.70, max: 2.20 } },
  'linkedin':  { width: { min: 800, max: 4096, ideal: [1200, 1920] }, height: { min: 400, max: 4096, ideal: [627, 1080] }, aspect: { min: 1.70, max: 2.20 } },
};

const SPECS_VIDEO_DURATION: Record<string, { min: number; max: number }> = {
  'reel':  { min: 3,  max: 90 },   // IG Reels
  'video': { min: 5,  max: 60 },   // TikTok / video posts
  'story': { min: 3,  max: 60 },
};

// Patterns d'erreur que les providers retournent parfois dans l'URL
// ou le nom de fichier.
const ERROR_URL_PATTERNS: RegExp[] = [
  /\berror[\w-]*\.(jpg|png|webp|mp4)/i,
  /\bplaceholder[\w-]*\.(jpg|png|webp|mp4)/i,
  /\bgenerating[\w-]*\.(jpg|png|webp|mp4)/i,
  /\/default[\w-]*\.(jpg|png|webp|mp4)/i,
];

export interface ImageOutputInput {
  url: string;
  width?: number;
  height?: number;
  format?: string;        // 'post' | 'story' | 'reel' | ...
  bytes?: number;
}

export interface VideoOutputInput {
  url: string;
  duration_sec?: number;
  format?: string;        // 'reel' | 'video' | 'story'
  bytes?: number;
}

function looksLikeUrl(u: string): boolean {
  return /^https?:\/\/[^\s]+/.test(u);
}

export function validateImageOutput(out: ImageOutputInput): ValidationResult {
  const findings: Finding[] = [];
  const url = (out.url || '').trim();

  if (!url || !looksLikeUrl(url)) {
    findings.push({
      code: 'invalid_url',
      severity: 'block',
      message: `URL image invalide ou manquante : "${url.substring(0, 80)}"`,
      evidence: { url: url.substring(0, 200) },
    });
    return aggregate(findings);
  }

  for (const rx of ERROR_URL_PATTERNS) {
    if (rx.test(url)) {
      findings.push({
        code: 'error_placeholder_url',
        severity: 'block',
        message: 'URL ressemble à un placeholder d\'erreur provider.',
        evidence: { url, pattern: rx.source },
      });
    }
  }

  const fmt = (out.format || 'post').toLowerCase();
  const spec = SPECS_IMAGE[fmt];
  if (spec && out.width && out.height) {
    if (out.width < spec.width.min || out.height < spec.height.min) {
      findings.push({
        code: 'dimensions_too_small',
        severity: 'block',
        message: `${out.width}×${out.height} en dessous des minima ${fmt}.`,
        evidence: { width: out.width, height: out.height, min: spec.width.min },
      });
    }
    if (out.width > spec.width.max || out.height > spec.height.max) {
      findings.push({
        code: 'dimensions_too_large',
        severity: 'warn',
        message: `${out.width}×${out.height} au-dessus des maxima ${fmt} — la plateforme va re-compresser.`,
        evidence: { width: out.width, height: out.height, max: spec.width.max },
        suggestion: 'Resize avant upload pour préserver la qualité.',
      });
    }
    const aspect = out.width / out.height;
    if (aspect < spec.aspect.min || aspect > spec.aspect.max) {
      findings.push({
        code: 'aspect_ratio_off',
        severity: 'block',
        message: `Aspect ratio ${aspect.toFixed(2)} hors ${spec.aspect.min}-${spec.aspect.max} pour ${fmt}.`,
        evidence: { width: out.width, height: out.height, aspect, expected: spec.aspect },
        suggestion: fmt === 'story' || fmt === 'reel' || fmt === 'photo' ? 'Doit être 9:16 (1080×1920).' : fmt === 'post' || fmt === 'image' || fmt === 'carrousel' ? 'Doit être 1:1 (1080×1080).' : 'Doit être 16:9 (1200×627).',
      });
    }
    const idealW = (out.width >= spec.width.ideal[0] && out.width <= spec.width.ideal[1]);
    if (!idealW && findings.filter(f => f.severity === 'block').length === 0) {
      findings.push({
        code: 'dimensions_suboptimal',
        severity: 'info',
        message: `${out.width}×${out.height} fonctionnel mais hors plage idéale ${spec.width.ideal[0]}-${spec.width.ideal[1]}.`,
      });
    }
  }

  if (out.bytes !== undefined && out.bytes > 8 * 1024 * 1024) {
    findings.push({
      code: 'file_too_large',
      severity: 'warn',
      message: `Fichier ${Math.round(out.bytes / 1024 / 1024)} Mo > 8 Mo (IG rejette à 8 Mo selon endpoint).`,
      evidence: { bytes: out.bytes },
      suggestion: 'Recompresser ou réduire dimensions avant publish.',
    });
  }

  return aggregate(findings);
}

export function validateVideoOutput(out: VideoOutputInput): ValidationResult {
  const findings: Finding[] = [];
  const url = (out.url || '').trim();

  if (!url || !looksLikeUrl(url)) {
    findings.push({
      code: 'invalid_video_url',
      severity: 'block',
      message: `URL vidéo invalide : "${url.substring(0, 80)}"`,
      evidence: { url: url.substring(0, 200) },
    });
    return aggregate(findings);
  }

  for (const rx of ERROR_URL_PATTERNS) {
    if (rx.test(url)) {
      findings.push({
        code: 'error_placeholder_video',
        severity: 'block',
        message: 'URL vidéo ressemble à un placeholder d\'erreur.',
        evidence: { url, pattern: rx.source },
      });
    }
  }

  if (out.duration_sec !== undefined) {
    if (out.duration_sec <= 0) {
      findings.push({
        code: 'video_zero_duration',
        severity: 'block',
        message: 'Durée vidéo = 0 — la génération a échoué.',
        evidence: { duration: out.duration_sec },
      });
    } else {
      const fmt = (out.format || 'reel').toLowerCase();
      const spec = SPECS_VIDEO_DURATION[fmt];
      if (spec) {
        if (out.duration_sec < spec.min) {
          findings.push({
            code: 'video_too_short',
            severity: 'warn',
            message: `Durée ${out.duration_sec}s < min ${spec.min}s pour ${fmt}.`,
            evidence: { duration: out.duration_sec, min: spec.min },
          });
        }
        if (out.duration_sec > spec.max) {
          findings.push({
            code: 'video_too_long',
            severity: 'warn',
            message: `Durée ${out.duration_sec}s > max ${spec.max}s pour ${fmt}.`,
            evidence: { duration: out.duration_sec, max: spec.max },
          });
        }
      }
    }
  }

  if (out.bytes !== undefined && out.bytes > 250 * 1024 * 1024) {
    findings.push({
      code: 'video_file_too_large',
      severity: 'warn',
      message: `Fichier ${Math.round(out.bytes / 1024 / 1024)} Mo > 250 Mo (IG/TT bornes).`,
      evidence: { bytes: out.bytes },
    });
  }

  return aggregate(findings);
}

/**
 * Probe HTTP HEAD en réseau — opt-in, async. Utile pour vérifier que
 * l'URL Seedream/Kling est encore live avant le publish (les URLs
 * expirent parfois à 24h).
 */
export async function headProbe(url: string, timeoutMs = 5000): Promise<{ ok: boolean; status: number; contentType: string | null; contentLength: number | null }> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(t);
    return {
      ok: res.ok,
      status: res.status,
      contentType: res.headers.get('content-type'),
      contentLength: res.headers.get('content-length') ? parseInt(res.headers.get('content-length')!, 10) : null,
    };
  } catch {
    return { ok: false, status: 0, contentType: null, contentLength: null };
  }
}
