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
import { fetchModele } from '../agents/anthropic-avec-repli';
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

/**
 * Le cadre — mesuré, pas jugé.
 *
 * ── Ce qui est arrivé le 14 août ──
 *
 * Un reel destiné à TikTok est sorti en 1280 × 720, horizontal. Le contrôle de
 * reel l'a laissé passer sans une remarque : il regarde des images extraites,
 * et une image extraite d'une vidéo horizontale ne dit rien de travers — les
 * mains sont à leur place, il n'y a pas de texte, l'action est cohérente.
 *
 * ── Pourquoi on le mesure au lieu de le demander au modèle ──
 *
 * Un rapport de dimensions est un nombre. Le demander à un modèle de vision,
 * c'est payer un appel pour obtenir une réponse moins fiable que `ffprobe`, et
 * accepter qu'il se trompe un jour sur deux. La règle est absolue et objective
 * — reel, story, TikTok : tout est vertical — donc elle se vérifie, elle ne se
 * juge pas.
 *
 * C'est la même leçon que partout ailleurs aujourd'hui : ce qui peut être
 * constaté ne doit pas être confié à une opinion.
 */
async function probeCadre(filePath: string): Promise<{ largeur: number; hauteur: number } | null> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${filePath}"`,
      { timeout: 10000 },
    );
    const [l, h] = stdout.trim().split(',').map((n) => parseInt(n, 10));
    if (!Number.isFinite(l) || !Number.isFinite(h)) return null;
    return { largeur: l, hauteur: h };
  } catch {
    return null;
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
  clientLanguage?: string;     // 2026-06-08: 'fr' | 'en' | etc — used to flag foreign-script text
  /**
   * Le réseau de destination.
   *
   * Fondateur, 2026-08-15 : « c'est pour ça, les formats et spécificités, qu'on
   * a des prompts par réseau social ».
   *
   * Le contrôle jugeait sans savoir où le reel allait partir. Or les codes ne
   * sont pas les mêmes : TikTok récompense le brut, tenu à la main, tourné vite
   * — un plan trop léché y sonne faux. Instagram accepte, et attend même, une
   * finition plus soignée. Une seule grille pour les deux sanctionne l'un ou
   * laisse passer chez l'autre.
   */
  plateforme?: string | null;
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

    // Le cadre d'abord : inutile de payer un appel de vision pour une vidéo
    // qu'on ne publiera pas de toute façon.
    const cadre = await probeCadre(local);
    if (cadre && cadre.largeur >= cadre.hauteur) {
      const ratio = `${cadre.largeur}×${cadre.hauteur}`;
      console.warn(`[reel-qa] cadre horizontal ${ratio} — refusé avant même l'analyse d'image`);
      return {
        verdict: 'hard_fail',
        issue: `vidéo horizontale (${ratio}) — sur TikTok et en reel elle s'affiche en timbre-poste entre deux bandes noires`,
        confidence: 1,
      };
    }

    /**
     * Un reel MUET ne part pas.
     *
     * Fondateur, 2026-08-15 : « en plus y'avait pas de son, 0 ! Il faut une
     * musique, au minimum un son, quelque chose ! »
     *
     * Sur Instagram et TikTok, le son porte l'attention : une vidéo silencieuse
     * se fait dépasser dans le fil. Et le silence ne se voit pas — il ne
     * ressemble à rien, aucune image extraite ne le montre, aucune erreur ne le
     * signale. C'est exactement pour ça qu'un reel muet a été publié.
     *
     * Comme le cadre, ça se mesure : une piste audio est là ou elle n'est pas.
     */
    const pisteAudio = await execAsync(
      `ffprobe -v error -select_streams a -show_entries stream=codec_name -of csv=p=0 "${local}"`,
      { timeout: 10000 },
    ).then(({ stdout }) => stdout.trim()).catch(() => '');
    if (!pisteAudio) {
      console.warn('[reel-qa] aucune piste audio — refusé avant l\'analyse d\'image');
      return {
        verdict: 'hard_fail',
        issue: 'reel muet : aucune piste audio. Sur Instagram et TikTok le son porte l\'attention, une vidéo silencieuse se fait dépasser',
        confidence: 1,
      };
    }

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

    const clientLang = (input.clientLanguage || 'fr').toLowerCase();
    const expectedScript = clientLang === 'fr' || clientLang === 'en' || clientLang === 'es' || clientLang === 'de' || clientLang === 'it' || clientLang === 'pt' ? 'Latin alphabet only' : 'client language script only';

    /**
     * Les codes ne sont pas les mêmes d'un réseau à l'autre.
     *
     * Fondateur, 2026-08-15 : « c'est pour ça, les formats et spécificités,
     * qu'on a des prompts par réseau social ».
     *
     * Le contrôle jugeait à l'aveugle. Il a refusé deux reels Instagram pour
     * « overly cinematic, looking like a film » — un motif qui n'aurait de sens
     * sur aucun des deux réseaux, et surtout pas sur TikTok où le brut fait
     * l'authenticité. Une seule grille pour deux réseaux sanctionne l'un ou
     * laisse passer chez l'autre.
     */
    const reseau = String(input.plateforme || '').toLowerCase();
    const codeReseau = reseau.includes('tiktok')
      ? [
          'DESTINATION: TikTok.',
          'The codes here reward the RAW: handheld, filmed fast, imperfect framing, a real place with',
          'its mess left in. A shot that looks produced, lit by a crew and colour-graded, reads as an',
          'advert and gets scrolled past. Judge accordingly: roughness is not a defect here, polish is',
          'the suspicious thing.',
        ].join(' ')
      : [
          'DESTINATION: Instagram Reels.',
          'A more finished look is accepted and even expected — considered framing, controlled light,',
          'a clean edit. Craft is not a defect here. What still fails is the same as everywhere:',
          'the machine showing through.',
        ].join(' ');

    const system = `You are a senior video editor reviewing a generated short-form reel BEFORE it ships to the client's social media. You see 3 keyframes (early / middle / late) from the same reel.

${codeReseau}

Your single job: catch PHYSICAL or LOGICAL errors that would embarrass the client. NOT aesthetic preferences. Specific things to flag:

━━━ CE QUI DOIT BLOQUER, ET CE QUI NE DOIT PAS ━━━

Fondateur, 2026-08-15 : « ce qui doit bloquer, c'est le contenu — pertinent ou
pas, lien business, lien cible » et « looking like a film ce n'est pas
rédhibitoire, c'est tout ce qui ressemble à de l'IA qui l'est ».

Deux questions décident, et rien d'autre :

  1. EST-CE QUE ÇA PARLE DE CE COMMERCE, À SA CLIENTÈLE ? Un plan magnifique
     qui montre un autre métier que celui annoncé ne sert à rien. Un plan
     ordinaire qui montre le bon geste au bon public fait le travail.

  2. EST-CE QUE LA MACHINE SE VOIT ? Pas le style — la fabrication.

Ce qui ne bloque JAMAIS : l'ambiance, le contraste, l'étalonnage, un cadrage
audacieux, un plan sombre, un rythme lent. Ce sont des choix, et de bons
réalisateurs les font exprès. Ne juge pas le goût, juge la matière et le sens.

HARD FAILS (reel must NOT ship — ALL of these mean hard_fail):
- ⚠️ ANY VISIBLE TEXT, CHARACTER, GLYPH OR LETTER ANYWHERE IN THE FRAME. This includes: Chinese / Japanese / Korean / Cyrillic / Arabic / Devanagari / Thai / any non-Latin script when the client speaks ${clientLang}, gibberish words, broken neon signs, AI-hallucinated captions, watermarks, logos with readable text, menu boards. Even ONE foreign character = hard_fail. The brief explicitly required ZERO text. Expected script if any text accidentally appears: ${expectedScript}. Client language: ${clientLang.toUpperCase()}.
- An action and its effect don't match (scissors cutting empty air, chef stirring an empty pan, brush painting nothing).
- ⚠️ BROKEN PHYSICS ON LIQUIDS AND SMALL OBJECTS. Look closely at every drop, splash, pour and falling object. Flag as hard_fail when:
  · a droplet hangs off a glass or a bottle and stays attached by a visible thread or filament as it falls;
  · a drop lands and bounces, wobbles or settles slowly instead of splashing or spreading;
  · liquid moves like gel or elastic — stretching, snapping back, holding a shape it could not hold;
  · a stream of liquid detaches from its source, floats, or pours upward;
  · anything falls too slowly, drifts sideways with no cause, or lands without disturbing what it lands on.
  This is the single most recognisable AI tell in food and drink footage. A viewer who spots one drop behaving wrongly distrusts the whole video — and these clips are for shops selling real food and real drinks. Look at the LAST frames especially: artefacts accumulate as the clip goes on.
- Body parts in impossible positions (hands with 7 fingers, two left feet, head detached).
- Subject IDENTITY changes between frames when it shouldn't (different person mid-clip).
- Severe motion artefacts: melting faces, morphing furniture, disintegrating tools.
- A SCREEN is the subject: a laptop, phone or monitor fills the frame, or the shot is built around what is displayed on it. We sell to shopkeepers and craftspeople — the subject is their trade, their hands, their place. A screen may appear at the edge; it must never be what the shot is about.
- ⚠️ IT LOOKS GENERATED. This is the real disqualifier — not the style, the FAKENESS. A dramatic, high-contrast, cinematic shot is perfectly fine and often desirable: film-makers light like that on purpose. What is never acceptable is the machine showing through:
  · skin that is waxy, poreless or plastic; faces smoothed to porcelain;
  · hands or faces that morph, extra fingers, features that drift between frames;
  · light with no source, or shadows that contradict the light that is there;
  · everything impossibly clean, symmetrical and new — no wear, no crumbs, no fingerprints;
  · subjects that slide rather than walk, objects that float or hang without support;
  · that oversaturated neon-CGI sheen, or a blur that no lens produces.
  Judge the TEXTURE and the PHYSICS, never the mood. A moody, grainy, hard-lit shot with real skin and real weight is a good shot. A bright, cheerful, perfectly smooth one is the fake.

SPECIAL CARE ON FACES:
- A person AT WORK is welcome — hands kneading, a stylist mid-gesture, a mechanic under a bonnet. That is the trade, and it is what we want.
- A tight PORTRAIT of a generated face, staring at the camera or at a screen, with no work happening, is a hard fail. It reads as a stock model, the client cannot claim it is anyone in their shop, and viewers spot it instantly.

SOFT FAILS (reviewable, may still ship):
- Slightly off proportions but the action reads.
- Background changes oddly but the foreground subject is intact.
- Minor continuity issues (shadow direction flips, but mid-action only).

PASS:
- Physically coherent action.
- Identity preserved.
- ZERO visible text in any language.
- Minor AI quirks but the message lands.

Return STRICT JSON:
{
  "verdict": "pass" | "soft_fail" | "hard_fail",
  "issue": "<one short sentence describing the worst issue, or empty>",
  "confidence": 0..1,
  "notes": ["<one note per frame, what you saw>"],
  "has_text": true | false,
  "text_language": "<detected script if has_text, else 'none'>"
}

JSON only. No preamble.`;

    const messageContent: any[] = [
      { type: 'text', text: `Brief: ${input.visualBrief || 'unknown'}\nBusiness: ${input.businessType || 'unknown'}\nReview these 3 keyframes for physical/logical errors. JSON.` },
      { type: 'image', source: { type: 'url', url: u1 } },
      { type: 'image', source: { type: 'url', url: u2 } },
      { type: 'image', source: { type: 'url', url: u3 } },
    ];

    const visionRes = await fetchModele({
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        system,
        messages: [{ role: 'user', content: messageContent }],
      }),
    }, {
      // Étiquette de coût — convention `qc_` : ce qu'on paie pour VÉRIFIER,
      // séparé de ce qu'on paie pour PRODUIRE. Voir le rapport quotidien.
      etiquette: 'qc_reel', agent: 'content',
    });
    if (!visionRes.ok) return { verdict: 'pass' };
    const data = await visionRes.json();
    const txt = (data.content?.[0]?.text || '').trim();
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return { verdict: 'pass' };
    const parsed = JSON.parse(m[0]);

    let verdict: 'pass' | 'soft_fail' | 'hard_fail' =
      ['pass', 'soft_fail', 'hard_fail'].includes(parsed.verdict) ? parsed.verdict : 'pass';
    let issue = typeof parsed.issue === 'string' ? parsed.issue.substring(0, 240) : undefined;

    // 2026-06-08 — Defense in depth: even if Sonnet rated this 'pass',
    // any non-Latin text on a French/EN/ES/DE/IT/PT client = force
    // hard_fail. Founder rule: "0 text c'est 0 sauf si coherent et
    // dans la langue du client".
    const latinLangs = new Set(['fr', 'en', 'es', 'de', 'it', 'pt', 'nl', 'sv', 'da', 'no']);
    if (parsed.has_text === true && latinLangs.has(clientLang)) {
      const detectedScript = (parsed.text_language || '').toLowerCase();
      const foreignScripts = ['chinese', 'japanese', 'korean', 'hanzi', 'kanji', 'hiragana', 'katakana', 'hangul', 'cyrillic', 'arabic', 'devanagari', 'thai', 'hebrew', 'greek'];
      const isForeignScript = foreignScripts.some((s) => detectedScript.includes(s));
      // Also fail if text is "gibberish" (which often shows up as random
      // foreign-looking characters) for a Latin-language client.
      const isGibberish = /gibberish|broken|garbled|random/.test(detectedScript);
      if (isForeignScript || isGibberish) {
        verdict = 'hard_fail';
        issue = `Foreign-script text detected (${detectedScript}) — reject for ${clientLang.toUpperCase()} client`;
      }
    }

    return {
      verdict,
      issue,
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
