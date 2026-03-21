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

// KeiroAI style: modern tech, clean 3D, NOT cartoon
const BASE_STYLE = `Hyper-realistic 3D rendered portrait, modern tech startup style, clean lighting, soft shadows, professional corporate headshot aesthetic. Upper body visible, slight 3/4 angle, confident expression, looking at camera. Solid gradient background. Ultra high quality, 4K render, clean edges, no text, no watermark.`;

const AGENTS = [
  {
    id: 'ceo',
    name: 'Noah',
    prompt: `${BASE_STYLE} Young man, early 30s, sharp jawline, short dark brown hair styled neatly, wearing a dark navy suit jacket over a white crew neck, confident and strategic expression, slight smirk, warm brown eyes. Background: deep purple to indigo gradient.`,
  },
  {
    id: 'commercial',
    name: 'Leo',
    prompt: `${BASE_STYLE} Athletic young man, late 20s, medium-length wavy chestnut hair, wearing a fitted blue henley shirt, friendly and approachable smile, hazel green eyes, slight stubble. Background: blue to cyan gradient.`,
  },
  {
    id: 'email',
    name: 'Hugo',
    prompt: `${BASE_STYLE} Intellectual young man, early 30s, round glasses with thin black frames, short light brown hair, wearing a forest green pullover, thoughtful and precise expression, blue-grey eyes. Background: emerald to teal gradient.`,
  },
  {
    id: 'content',
    name: 'Lena',
    prompt: `${BASE_STYLE} Creative young woman, mid 20s, shoulder-length auburn hair with subtle waves, wearing a trendy rose pink blazer, bright and energetic smile, green eyes, small earrings. Background: magenta to rose gradient.`,
  },
  {
    id: 'seo',
    name: 'Oscar',
    prompt: `${BASE_STYLE} Focused young man, late 20s, undercut hairstyle with dark blonde hair on top, wearing an amber-orange bomber jacket, analytical and determined expression, steel blue eyes. Background: amber to orange gradient.`,
  },
  {
    id: 'onboarding',
    name: 'Clara',
    prompt: `${BASE_STYLE} Warm young woman, late 20s, medium bob cut dark hair, wearing a sky blue button-up blouse, welcoming and reassuring smile, dark brown eyes, minimal makeup. Background: cyan to blue gradient.`,
  },
  {
    id: 'retention',
    name: 'Theo',
    prompt: `${BASE_STYLE} Caring young man, early 30s, curly dark hair medium length, wearing a lavender crew neck sweater, empathetic and attentive expression, warm brown eyes, gentle smile. Background: violet to purple gradient.`,
  },
  {
    id: 'marketing',
    name: 'Ami',
    prompt: `${BASE_STYLE} Sharp young woman, late 20s, sleek straight black hair pulled back, wearing a teal structured blazer, intelligent and strategic expression, dark eyes, minimal gold jewelry. Background: teal to emerald gradient.`,
  },
  {
    id: 'ads',
    name: 'Felix',
    prompt: `${BASE_STYLE} Dynamic young man, mid 20s, messy styled dark hair with a fade, wearing a red leather jacket over black tee, bold and creative expression, brown eyes, slight grin. Background: crimson to orange gradient.`,
  },
  {
    id: 'rh',
    name: 'Sara',
    prompt: `${BASE_STYLE} Professional young woman, early 30s, neat bun with loose strands, wearing a slate grey tailored blazer, calm and authoritative expression, light brown eyes, pearl earrings. Background: slate to charcoal gradient.`,
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
