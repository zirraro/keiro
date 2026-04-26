/**
 * Reel QA — pre-publish sanity check for generated short-form videos.
 *
 * Why: AI video models (Seedance / etc) frequently produce nonsense
 * physical sequences. Examples we've seen ship:
 *   - hairdresser cuts scissors in EMPTY AIR (no hair anywhere near)
 *   - chef stirs a pan with NO ingredients
 *   - product demo where the action and the result don't match
 *   - bad frame transitions that show a discontinuity
 *
 * What this does: extracts 3 keyframes (early / middle / late),
 * sends them as a sequence to Sonnet vision, asks for a structured
 * verdict on physical/logical coherence. If verdict is "broken", the
 * caller can regenerate or fall back to a still post.
 *
 * This is cheap (~€0.01 per reel) and runs once per generated reel,
 * NOT on every frame.
 */
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile, unlink, readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const execAsync = promisify(exec);

export type ReelQaVerdict = {
  verdict: 'pass' | 'soft_fail' | 'hard_fail';
  // Top issue if any. Used for logs + retry prompt.
  issue?: string;
  // 0..1, how confident Sonnet is in the verdict.
  confidence?: number;
  // Detailed observation per frame (debugging).
  notes?: string[];
};

async function probeDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries stream=duration -of csv=p=0:s=x "${filePath}"`,
      { timeout: 10000 },
    );
    const d = parseFloat(stdout.trim().split('x')[0]);
    return Number.isFinite(d) ? d : 5;
  } catch {
    return 5;
  }
}

async function extractFrame(filePath: string, outPath: string, atSeconds: number): Promise<boolean> {
  try {
    await execAsync(
      `ffmpeg -y -ss ${atSeconds} -i "${filePath}" -frames:v 1 -q:v 2 "${outPath}"`,
      { timeout: 20000 },
    );
    return true;
  } catch (e: any) {
    console.warn('[reel-qa] frame extract failed:', e?.message);
    return false;
  }
}

async function uploadFrame(buf: Buffer, postId: string, label: string): Promise<string | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const path = `reel-qa/${postId}-${label}-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from('generated-images').upload(path, buf, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) return null;
  const { data: pub } = supabase.storage.from('generated-images').getPublicUrl(path);
  return pub?.publicUrl || null;
}

export async function reviewGeneratedReel(input: {
  videoUrl: string;
  postId: string;
  visualBrief?: string;        // what the reel was supposed to show
  businessType?: string;
}): Promise<ReelQaVerdict> {
  if (!process.env.ANTHROPIC_API_KEY) return { verdict: 'pass' };
  const tmp = tmpdir();
  const local = join(tmp, `qa-${input.postId}.mp4`);
  const f1 = join(tmp, `qa-${input.postId}-1.jpg`);
  const f2 = join(tmp, `qa-${input.postId}-2.jpg`);
  const f3 = join(tmp, `qa-${input.postId}-3.jpg`);

  try {
    const res = await fetch(input.videoUrl);
    if (!res.ok) return { verdict: 'pass' };
    await writeFile(local, Buffer.from(await res.arrayBuffer()));

    const dur = await probeDuration(local);
    const t1 = Math.max(0.4, dur * 0.20);
    const t2 = Math.max(0.5, dur * 0.50);
    const t3 = Math.max(0.6, dur * 0.80);

    const ok1 = await extractFrame(local, f1, t1);
    const ok2 = await extractFrame(local, f2, t2);
    const ok3 = await extractFrame(local, f3, t3);
    if (!ok1 || !ok2 || !ok3) return { verdict: 'pass' };

    const [b1, b2, b3] = await Promise.all([readFile(f1), readFile(f2), readFile(f3)]);
    const [u1, u2, u3] = await Promise.all([
      uploadFrame(b1, input.postId, 'early'),
      uploadFrame(b2, input.postId, 'mid'),
      uploadFrame(b3, input.postId, 'late'),
    ]);
    if (!u1 || !u2 || !u3) return { verdict: 'pass' };

    const system = `You are a senior video editor reviewing a generated short-form reel BEFORE it ships to the client's social media. You see 3 keyframes (early / middle / late) from the same reel.

Your single job: catch PHYSICAL or LOGICAL errors that would embarrass the client. NOT aesthetic preferences. Specific things to flag:

HARD FAILS (reel must NOT ship):
- An action and its effect don't match (scissors cutting empty air, chef stirring an empty pan, brush painting nothing).
- Body parts in impossible positions (hands with 7 fingers, two left feet, head detached).
- Subject IDENTITY changes between frames when it shouldn't (different person mid-clip).
- Critical text/branding visibly broken (gibberish letters where a brand sign should be).
- Severe motion artefacts: melting faces, morphing furniture, disintegrating tools.

SOFT FAILS (reviewable, may still ship):
- Slightly off proportions but the action reads.
- Background changes oddly but the foreground subject is intact.
- Minor continuity issues (shadow direction flips, but mid-action only).

PASS:
- Physically coherent action.
- Identity preserved.
- Minor AI quirks but the message lands.

Return STRICT JSON:
{
  "verdict": "pass" | "soft_fail" | "hard_fail",
  "issue": "<one short sentence describing the worst issue, or empty>",
  "confidence": 0..1,
  "notes": ["<one note per frame, what you saw>"]
}

JSON only. No preamble.`;

    const messageContent: any[] = [
      { type: 'text', text: `Brief: ${input.visualBrief || 'unknown'}\nBusiness: ${input.businessType || 'unknown'}\nReview these 3 keyframes for physical/logical errors. JSON.` },
      { type: 'image', source: { type: 'url', url: u1 } },
      { type: 'image', source: { type: 'url', url: u2 } },
      { type: 'image', source: { type: 'url', url: u3 } },
    ];

    const visionRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 400,
        system,
        messages: [{ role: 'user', content: messageContent }],
      }),
    });
    if (!visionRes.ok) return { verdict: 'pass' };
    const data = await visionRes.json();
    const txt = (data.content?.[0]?.text || '').trim();
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return { verdict: 'pass' };
    const parsed = JSON.parse(m[0]);

    const verdict: 'pass' | 'soft_fail' | 'hard_fail' =
      ['pass', 'soft_fail', 'hard_fail'].includes(parsed.verdict) ? parsed.verdict : 'pass';
    return {
      verdict,
      issue: typeof parsed.issue === 'string' ? parsed.issue.substring(0, 240) : undefined,
      confidence: Number.isFinite(parsed.confidence) ? parsed.confidence : undefined,
      notes: Array.isArray(parsed.notes) ? parsed.notes.slice(0, 4).map((n: any) => String(n).substring(0, 160)) : undefined,
    };
  } catch (e: any) {
    console.warn('[reel-qa] review failed:', e?.message);
    return { verdict: 'pass' };
  } finally {
    await unlink(local).catch(() => {});
    await unlink(f1).catch(() => {});
    await unlink(f2).catch(() => {});
    await unlink(f3).catch(() => {});
  }
}
