/**
 * Generate 3D avatars for all KeiroAI agents using Seedream 4.5
 * Run: node scripts/generate-avatars-3d.mjs
 *
 * Style: Modern 3D render, clean minimalist, NOT Pixar/Disney.
 * Think: Apple Memoji meets corporate tech illustration.
 * Transparent background, upper body, facing camera with slight angle.
 */

import fs from 'fs';
import path from 'path';

const SEEDREAM_API_KEY = '341cd095-2c11-49da-82e7-dc2db23c565c';
const SEEDREAM_API_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations';

const OUTPUT_DIR = path.join(process.cwd(), 'public', 'avatars-3d');

// KeiroAI style: cinematic 3D render with real depth and perspective
const BASE_STYLE = `Cinematic 3D rendered portrait with strong depth of field, volumetric lighting, dramatic shadows. Realistic skin texture, subsurface scattering, studio-quality render. Upper body and shoulders visible, natural 3/4 pose, looking at camera. Smooth gradient background that blends seamlessly into the figure lighting. No flat look, strong parallax and depth layers between foreground subject and background. Ultra high quality, 8K render, photorealistic details, no text, no watermark, no logo. IMPORTANT: Natural realistic eye colors only (brown, dark brown, hazel, grey-blue, light brown). NO bright green eyes, NO neon blue eyes, NO anime-style eyes. Eyes must look natural and human, never oversaturated or glowing. Face proportions must be realistic, NOT anime or cartoon-like.`;

const AGENTS = [
  {
    id: 'ceo',
    name: 'Noah',
    prompt: `${BASE_STYLE} Mediterranean man, early 30s, strong square jawline, thick dark eyebrows, short tapered dark brown hair with texture, olive skin, wearing a tailored charcoal suit jacket over a black turtleneck, confident leadership expression with subtle smirk, deep brown eyes. Dramatic purple-indigo volumetric background lighting wrapping around shoulders.`,
  },
  {
    id: 'commercial',
    name: 'Leo',
    prompt: `${BASE_STYLE} Nordic man, late 20s, light skin with freckles, sandy blonde medium-length hair swept to one side, strong cheekbones, clean shaven, wearing a premium blue fitted polo shirt, warm genuine smile showing teeth, natural grey-blue eyes. Soft blue-to-cyan ambient background glow.`,
  },
  {
    id: 'email',
    name: 'Hugo',
    prompt: `${BASE_STYLE} East Asian man, early 30s, slim face, modern rectangular glasses with tortoiseshell frames, neat black side-parted hair, wearing a forest green wool crewneck sweater over white collar shirt, thoughtful intellectual expression, dark brown eyes. Rich emerald-teal gradient background with soft bokeh.`,
  },
  {
    id: 'content',
    name: 'Lena',
    prompt: `${BASE_STYLE} Latina woman, mid 20s, warm golden-brown skin, long wavy dark auburn hair falling past shoulders, natural warm brown eyes, wearing a stylish dusty rose blazer over white top, radiant energetic smile, delicate gold necklace. Warm magenta-to-rose background with soft light flares.`,
  },
  {
    id: 'seo',
    name: 'Oscar',
    prompt: `${BASE_STYLE} Middle Eastern man, late 20s, well-groomed short dark beard, strong nose, thick black hair styled up with a modern fade on sides, wearing a rust-orange technical jacket, focused analytical expression, deep brown eyes. Warm amber-orange volumetric background lighting.`,
  },
  {
    id: 'onboarding',
    name: 'Clara',
    prompt: `${BASE_STYLE} South Asian woman, late 20s, warm brown skin, sleek shoulder-length dark hair with subtle highlights, round face with dimples, wearing an elegant sky-blue silk blouse, warm welcoming smile, large expressive dark brown eyes. Soft cyan-to-blue gradient background with gentle light.`,
  },
  {
    id: 'retention',
    name: 'Theo',
    prompt: `${BASE_STYLE} Black man, early 30s, dark skin, short tight curly hair with a high top fade, well-groomed short beard, broad shoulders, wearing a soft lavender cashmere sweater, gentle empathetic smile, warm dark brown eyes. Dreamy violet-to-purple background with volumetric light.`,
  },
  {
    id: 'marketing',
    name: 'Ami',
    prompt: `${BASE_STYLE} Japanese woman, late 20s, porcelain skin, sharp chin, sleek straight jet-black hair in a low professional ponytail, wearing a structured teal blazer with subtle texture, confident strategic expression, dark almond-shaped eyes, small silver earrings. Deep teal-to-emerald background with studio rim lighting.`,
  },
  {
    id: 'ads',
    name: 'Felix',
    prompt: `${BASE_STYLE} Mixed-race man, mid 20s, light brown skin, textured curly medium hair with natural volume, angular face with defined cheekbones, wearing a burgundy leather bomber jacket over black henley, bold creative expression with confident grin, amber-brown eyes. Dramatic crimson-to-orange background with cinematic lighting.`,
  },
  {
    id: 'rh',
    name: 'Sara',
    prompt: `${BASE_STYLE} Scandinavian woman, early 30s, fair skin with rosy cheeks, soft strawberry-blonde hair in a loose elegant updo with wisps framing face, wearing a tailored dove-grey blazer with white lapel pin, composed and authoritative yet warm expression, grey-blue eyes, small pearl earrings. Cool slate-to-silver background with soft professional lighting.`,
  },
  {
    id: 'comptable',
    name: 'Louis',
    prompt: `${BASE_STYLE} French man, mid 30s, fair skin, neatly combed dark brown hair parted to the side, clean shaven with subtle stubble shadow, rectangular thin-frame glasses, wearing a navy blue fitted suit jacket over crisp white dress shirt with no tie, composed analytical expression with slight confident smile, light brown hazel eyes. Deep cyan-to-teal volumetric background with studio lighting.`,
  },
];

async function generateAvatar(agent) {
  console.log(`\n[${agent.id}] Generating ${agent.name}...`);

  const res = await fetch(SEEDREAM_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SEEDREAM_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'seedream-4-5-251128',
      prompt: agent.prompt,
      negative_prompt: 'text, words, letters, cartoon, anime, pixar, disney, chibi, deformed, ugly, blurry, low quality, watermark, logo, extra fingers, extra limbs',
      response_format: 'url',
      watermark: false,
      size: '2K',
      seed: -1,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error(`[${agent.id}] Error:`, JSON.stringify(data).substring(0, 300));
    return null;
  }

  const url = data.data?.[0]?.url;
  if (!url) {
    console.error(`[${agent.id}] No image returned:`, JSON.stringify(data).substring(0, 300));
    return null;
  }

  // Download image
  const imgRes = await fetch(url);
  const imgBuf = Buffer.from(await imgRes.arrayBuffer());
  const filePath = path.join(OUTPUT_DIR, `${agent.id}.png`);
  fs.writeFileSync(filePath, imgBuf);
  console.log(`[${agent.id}] Saved: ${filePath} (${(imgBuf.length / 1024).toFixed(0)}KB)`);
  return filePath;
}

async function main() {
  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log('=== KeiroAI Avatar 3D Generator ===');
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`Agents: ${AGENTS.length}\n`);

  const results = [];

  // Generate sequentially to avoid rate limits
  for (const agent of AGENTS) {
    try {
      const result = await generateAvatar(agent);
      results.push({ id: agent.id, name: agent.name, success: !!result, path: result });
    } catch (err) {
      console.error(`[${agent.id}] Failed:`, err.message);
      results.push({ id: agent.id, name: agent.name, success: false, path: null });
    }
    // Small delay between requests
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\n=== RESULTS ===');
  for (const r of results) {
    console.log(`${r.success ? 'OK' : 'FAIL'} ${r.id} (${r.name})${r.path ? ` → ${r.path}` : ''}`);
  }

  const ok = results.filter(r => r.success).length;
  console.log(`\n${ok}/${results.length} avatars generated successfully.`);
  if (ok > 0) {
    console.log(`\nNext: Upload them via /admin/agents → Avatars tab → Upload 3D button`);
    console.log(`Or use the Supabase Storage upload directly.`);
  }
}

main().catch(console.error);
