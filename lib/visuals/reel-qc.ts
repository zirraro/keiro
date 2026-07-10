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
  issues: string[];       // concrete defects found
  summary: string;        // one-line verdict (FR)
  pass: boolean;          // score>=threshold AND realism>=5 (anti-AI) AND motion>=4
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
    const frames = await extractFrames(vid, dur, 6, tmp);
    if (frames.length < 2) return null; // not enough to judge

    const imageBlocks = frames.map((data) => ({
      type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data },
    }));
    const sys = `Tu es un directeur artistique / chef opérateur vidéo TRÈS exigeant (niveau cinéaste). On te donne des frames ORDONNÉES (début → fin) d'un reel vertical monté pour le business: "${opts.businessType || 'commerce local'}". Sujet voulu: "${(opts.subject || '').slice(0, 200)}".
Juge UNIQUEMENT ce que tu vois. Note SÉVÈREMENT comme un pro qui décide si on publie. Deux exigences NON négociables du fondateur :
1. VRAI MOUVEMENT cinématique (caméra qui bouge OU sujet qui bouge réellement entre les frames) — surtout PAS un diaporama d'images quasi-figées.
2. AUCUN aspect "IA" : pas de plastique/cireux, pas de morphing/déformation, pas de lumière irréaliste, pas de perfection synthétique. Ça doit ressembler à une vraie captation filmée par un humain.
3. LANGUE : tout texte À L'ÉCRAN (hook, sous-titre) doit être en ${langName} (langue du client). Un texte dans une autre langue = défaut MAJEUR (réalisme ≤4).`;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 700,
        system: sys,
        tools: [{ name: 'qc', description: 'reel quality verdict', input_schema: {
          type: 'object', properties: {
            continuity: { type: 'number', description: '0-10: les frames s\'enchaînent-elles comme UNE scène qui évolue (même lieu/sujet), pas des plans random ?' },
            coherence: { type: 'number', description: '0-10: lien visuel évident avec le business ?' },
            realism: { type: 'number', description: '0-10: VRAIE photo/vidéo filmée par un humain (10) vs ça FAIT IA — plastique/cireux, morphing, déformations, lumière/perfection synthétique (0). Sois DUR : au moindre doute que ça fasse IA, note ≤4.' },
            motion: { type: 'number', description: '0-10: VRAI mouvement cinématique entre les frames — caméra ou sujet qui bouge réellement (10) vs images quasi-figées qui défilent façon diaporama (0).' },
            score: { type: 'number', description: '0-10: note globale de publiabilité' },
            issues: { type: 'array', items: { type: 'string' }, description: 'défauts concrets vus (FR), vide si rien' },
            summary: { type: 'string', description: 'verdict en une phrase (FR)' },
          }, required: ['continuity', 'coherence', 'realism', 'motion', 'score', 'issues', 'summary'], additionalProperties: false,
        } as any }],
        tool_choice: { type: 'tool', name: 'qc' },
        messages: [{ role: 'user', content: [
          { type: 'text', text: `Voici ${frames.length} frames du reel, dans l'ordre. Évalue : continuité, cohérence business, RÉALISME (est-ce que ça fait IA ? sois dur), MOUVEMENT (vrai mouvement cinématique entre les frames, ou diaporama figé ?), + note globale et défauts concrets.` },
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
    return {
      score,
      continuity: clamp(v.continuity),
      coherence: clamp(v.coherence),
      realism,
      motion,
      issues: Array.isArray(v.issues) ? v.issues.map((x: any) => String(x).slice(0, 200)).slice(0, 8) : [],
      summary: String(v.summary || '').slice(0, 300),
      // BARRIÈRE DURE anti-IA (founder 09/07 : "ne doit pas faire IA du tout") :
      // même avec une bonne note globale, on NE publie PAS si ça fait IA
      // (realism < 5) ou si c'est un diaporama sans vrai mouvement (motion < 4).
      pass: score >= QC_THRESHOLD && realism >= 5 && motion >= 4,
    };
  } catch {
    return null;
  } finally {
    try { await fs.rm(tmp, { recursive: true, force: true }); } catch {}
  }
}
