/**
 * Reel quality control (founder 2026-06-17: "met en place un standard control
 * de qualité"). Automated visual QC for generated montages: extract evenly
 * spaced frames from the final reel and have a vision model score them on the
 * axes that actually matter for a montage — continuity between scenes, link to
 * the business, and realism (anti "looks-AI"). The montage pipeline runs this
 * BEFORE publishing and gates on the score, so a bad reel never ships.
 *
 * Self-contained (own ffmpeg/ffprobe resolution + graceful failure) so it can
 * never break the montage path: if QC can't run, it returns null and the caller
 * decides (we publish on null rather than block on an infra hiccup).
 */
import { fetchModele } from '../agents/anthropic-avec-repli';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const execPromise = promisify(exec);

function getFfmpegPath(): string {
  try { const f = require('ffmpeg-static'); if (f && typeof f === 'string') return f; } catch {}
  try { const i = require('@ffmpeg-installer/ffmpeg'); if (i?.path) return i.path; } catch {}
  return 'ffmpeg';
}
function getFfprobePath(): string {
  try { const i = require('@ffprobe-installer/ffprobe'); if (i?.path) return i.path; } catch {}
  return 'ffprobe';
}

export interface ReelQCResult {
  score: number;          // 0-10 overall
  continuity: number;     // 0-10 — do scenes flow as one evolving shot?
  coherence: number;      // 0-10 — visual link to the business
  realism: number;        // 0-10 — natural photo vs obvious AI
  motion: number;         // 0-10 — real cinematic movement vs static slideshow
  hook: number;           // 0-10 — la 1re frame retient-elle le scroll ?
  flow: number;           // 0-10 — les plans se suivent-ils, le reel va-t-il au bout ?
  issues: string[];       // concrete defects found
  summary: string;        // one-line verdict (FR)
  pass: boolean;          // seuil global + réalisme + mouvement + cohérence + enchaînement + accroche
}

const QC_THRESHOLD = 6; // /10 — below this the reel is held, not published

async function fetchBuf(url: string, ms = 30_000): Promise<Buffer | null> {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(ms) }); if (!r.ok) return null; return Buffer.from(await r.arrayBuffer()); }
  catch { return null; }
}

/**
 * Extract up to `count` evenly spaced JPG frames from the video. Returns base64
 * strings (downscaled to keep the vision payload small). Empty on failure.
 */
async function extractFrames(videoPath: string, dur: number, count: number, tmp: string): Promise<string[]> {
  const ff = getFfmpegPath();
  const fps = Math.max(0.05, count / Math.max(dur, 1));
  const pattern = path.join(tmp, 'f_%02d.jpg');
  try {
    await execPromise(`"${ff}" -y -i "${videoPath}" -vf "fps=${fps.toFixed(4)},scale=480:-1" -frames:v ${count} -q:v 4 "${pattern}"`,
      { timeout: 90_000, maxBuffer: 1024 * 1024 * 60 });
  } catch { /* may still have produced some frames */ }
  const out: string[] = [];
  for (let i = 1; i <= count; i++) {
    const p = path.join(tmp, `f_${String(i).padStart(2, '0')}.jpg`);
    try {
      const b = await fs.readFile(p);
      if (b.length > 1500) out.push(b.toString('base64'));
    } catch { /* missing frame */ }
  }
  return out;
}

async function probeDur(videoPath: string): Promise<number> {
  try {
    const fp = getFfprobePath();
    const { stdout } = await execPromise(`"${fp}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`, { timeout: 20_000 });
    const d = parseFloat(String(stdout).trim());
    return Number.isFinite(d) && d > 0.5 ? d : 30;
  } catch { return 30; }
}

/**
 * Assess a generated reel. Returns null if QC could not run (caller publishes
 * anyway rather than block on infra). `apiKey` defaults to ANTHROPIC_API_KEY.
 */
export async function assessReelQuality(
  videoUrl: string,
  opts: { businessType?: string; subject?: string; apiKey?: string; lang?: 'fr' | 'en' } = {},
): Promise<ReelQCResult | null> {
  const langName = opts.lang === 'en' ? 'anglais' : 'français';
  const apiKey = opts.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !videoUrl) return null;
  const tmp = path.join(os.tmpdir(), `reel-qc-${Date.now()}`);
  try {
    const buf = await fetchBuf(videoUrl);
    if (!buf || buf.length < 5000) return null;
    await fs.mkdir(tmp, { recursive: true });
    const vid = path.join(tmp, 'in.mp4');
    await fs.writeFile(vid, buf);
    const dur = await probeDur(vid);

    // BARRIÈRE DÉTERMINISTE — le montage doit aller AU BOUT (founder 29/07).
    // Un rendu partiel (plans en échec) peut sortir un fichier de 2-3 s : ce
    // n'est pas un reel, c'est un déchet. On le refuse sans même appeler le
    // modèle de vision — pas la peine de payer pour juger un fichier tronqué.
    const MIN_PUBLISHABLE_SEC = 8;
    if (dur > 0 && dur < MIN_PUBLISHABLE_SEC) {
      return {
        score: 0, continuity: 0, coherence: 0, realism: 0, motion: 0, hook: 0, flow: 0,
        issues: [`Reel tronqué : ${dur.toFixed(1)}s seulement (minimum publiable ${MIN_PUBLISHABLE_SEC}s) — le montage n'est pas allé au bout`],
        summary: `Montage incomplet (${dur.toFixed(1)}s)`,
        pass: false,
      };
    }

    const frames = await extractFrames(vid, dur, 6, tmp);
    if (frames.length < 2) return null; // not enough to judge

    const imageBlocks = frames.map((data) => ({
      type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data },
    }));
    const sys = `Tu es un directeur artistique / chef opérateur vidéo TRÈS exigeant (niveau cinéaste). On te donne des frames ORDONNÉES (début → fin) d'un reel vertical monté pour le business: "${opts.businessType || 'commerce local'}". Sujet voulu: "${(opts.subject || '').slice(0, 200)}".
Juge UNIQUEMENT ce que tu vois. Note SÉVÈREMENT comme un pro qui décide si on publie. Deux exigences NON négociables du fondateur :
1. VRAI MOUVEMENT cinématique (caméra qui bouge OU sujet qui bouge réellement entre les frames) — surtout PAS un diaporama d'images quasi-figées.
2. AUCUN aspect "IA" : pas de plastique/cireux, pas de morphing/déformation, pas de lumière irréaliste, pas de perfection synthétique. Ça doit ressembler à une vraie captation filmée par un humain.
3. LANGUE : tout texte À L'ÉCRAN (hook, sous-titre) doit être en ${langName} (langue du client). Un texte dans une autre langue = défaut MAJEUR (réalisme ≤4).
4. ENCHAÎNEMENT ET ACCROCHE (founder 29/07) : les plans doivent SE SUIVRE — soit une logique claire (même scène qui progresse, avant→après, geste qui se termine), soit une montée d'intérêt qui donne envie de rester. La première frame doit à elle seule donner envie de ne pas scroller. Un montage qui part dans tous les sens, ou qui s'ouvre sur un plan mou/vide, est un échec même si chaque image est belle prise isolément.
Ce reel dure ${dur.toFixed(1)}s : juge aussi s'il va au BOUT de son idée (fin nette, pas une coupure brutale au milieu d'un geste ou d'une phrase).`;
    const res = await fetchModele({
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 700,
        system: sys,
        tools: [{ name: 'qc', description: 'reel quality verdict', input_schema: {
          type: 'object', properties: {
            continuity: { type: 'number', description: '0-10: les frames s\'enchaînent-elles comme UNE scène qui évolue (même lieu/sujet), pas des plans random ? Un PRODUIT/OBJET qui CHANGE d\'une frame à l\'autre (ex: bocal→vase, framboise→viennoiserie) = continuité BASSE (≤3).' },
            coherence: { type: 'number', description: '0-10: lien visuel évident avec le business ? Un objet/fruit/accessoire qui APPARAÎT DE NULLE PART, sans rapport avec le commerce, = cohérence BASSE (≤3). Tout ce qui est à l\'écran doit appartenir au vrai univers du business.' },
            realism: { type: 'number', description: '0-10: VRAIE photo/vidéo filmée par un humain (10) vs ça FAIT IA — plastique/cireux, morphing, déformations, lumière/perfection synthétique (0). Sois DUR : au moindre doute que ça fasse IA, note ≤4.' },
            motion: { type: 'number', description: '0-10: VRAI mouvement cinématique entre les frames — caméra ou sujet qui bouge réellement (10) vs images quasi-figées qui défilent façon diaporama (0).' },
            hook: { type: 'number', description: '0-10: la PREMIÈRE frame donne-t-elle envie de ne pas scroller ? Mouvement déjà engagé, gros plan texturé, tension visuelle (10) vs plan large mou, lieu vide, image de mise en place (0).' },
            flow: { type: 'number', description: '0-10: les plans SE SUIVENT-ils ? Progression logique (même scène qui évolue, avant→après, geste qui se termine) OU montée d\'intérêt qui retient (10) vs plans décousus, ordre interchangeable, montage qui part dans tous les sens (0). Une fin coupée en plein milieu d\'un geste = ≤3.' },
            score: { type: 'number', description: '0-10: note globale de publiabilité' },
            issues: { type: 'array', items: { type: 'string' }, description: 'défauts concrets vus (FR), vide si rien' },
            summary: { type: 'string', description: 'verdict en une phrase (FR)' },
          }, required: ['continuity', 'coherence', 'realism', 'motion', 'hook', 'flow', 'score', 'issues', 'summary'], additionalProperties: false,
        } as any }],
        tool_choice: { type: 'tool', name: 'qc' },
        messages: [{ role: 'user', content: [
          { type: 'text', text: `Voici ${frames.length} frames du reel, dans l'ordre. Évalue : continuité, cohérence business, RÉALISME (est-ce que ça fait IA ? sois dur), MOUVEMENT (vrai mouvement cinématique ou diaporama figé ?), HOOK (la 1re frame retient-elle ?), ENCHAÎNEMENT (les plans se suivent-ils, le reel va-t-il au bout de son idée ?), + note globale et défauts concrets.` },
          ...imageBlocks,
        ] }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const tu = (data.content || []).find((b: any) => b.type === 'tool_use');
    const v = tu?.input;
    if (!v) return null;
    const clamp = (n: any) => Math.max(0, Math.min(10, Math.round(Number(n) || 0)));
    const score = clamp(v.score);
    const realism = clamp(v.realism);
    const motion = clamp(v.motion);
    const coherence = clamp(v.coherence);
    const continuity = clamp(v.continuity);
    const hook = clamp(v.hook);
    const flow = clamp(v.flow);
    return {
      score,
      continuity,
      coherence,
      realism,
      motion,
      hook,
      flow,
      issues: Array.isArray(v.issues) ? v.issues.map((x: any) => String(x).slice(0, 200)).slice(0, 8) : [],
      summary: String(v.summary || '').slice(0, 300),
      // BARRIÈRES DURES : anti-IA (realism<5, founder 09/07) + anti-diaporama
      // (motion<4) + anti-INCOHÉRENCE (founder 21/07 : "pas d'objet/fruit qui
      // apparaît de nulle part, clips pertinents"). Un reel avec un objet random
      // ou des plans décousus NE PUBLIE PAS, peu importe la note globale.
      // + ENCHAÎNEMENT/ACCROCHE (founder 29/07) : un montage décousu ou qui
      // s'ouvre sur un plan mou ne publie pas non plus — c'est là que se joue
      // la rétention, donc la portée.
      pass: score >= QC_THRESHOLD && realism >= 5 && motion >= 4 && coherence >= 6 && continuity >= 5 && flow >= 5 && hook >= 5,
    };
  } catch {
    return null;
  } finally {
    try { await fs.rm(tmp, { recursive: true, force: true }); } catch {}
  }
}
