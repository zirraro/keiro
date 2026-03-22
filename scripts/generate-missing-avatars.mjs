import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const SEEDREAM_API_KEY = '341cd095-2c11-49da-82e7-dc2db23c565c';
const SEEDREAM_API_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations';

const BASE_STYLE = 'Cinematic 3D rendered portrait with strong depth of field, volumetric lighting, dramatic shadows. Realistic skin texture, subsurface scattering, studio-quality render. Upper body and shoulders visible, natural 3/4 pose, looking at camera. Smooth gradient background. Ultra high quality, 8K render, photorealistic details, no text, no watermark, no logo. Natural realistic eye colors only. Eyes must look natural and human. Face proportions must be realistic.';

const MISSING = [
  {
    id: 'gmaps',
    name: 'Theo',
    prompt: `${BASE_STYLE} French man, late 20s, Mediterranean features, warm olive skin, short dark brown curly hair, friendly open smile, wearing a casual emerald green polo shirt, natural dark brown eyes. Bright green-to-teal background with soft light.`,
  },
  {
    id: 'dm_instagram',
    name: 'Jade',
    prompt: `${BASE_STYLE} Korean woman, mid 20s, fair skin with a subtle glow, sleek long straight black hair with a few highlights, wearing a trendy coral-pink oversized blazer over white crop top, playful confident smile, dark brown almond eyes, minimal gold jewelry. Vibrant rose-to-magenta background with soft bokeh.`,
  },
  {
    id: 'tiktok_comments',
    name: 'Axel',
    prompt: `${BASE_STYLE} Black man, early 20s, dark brown skin, short buzz cut with clean line-up, wearing a black technical streetwear jacket with subtle neon accents, energetic creative expression with wide grin, dark brown eyes, small diamond stud earring. Dark charcoal-to-midnight background with subtle neon teal rim light.`,
  },
  {
    id: 'chatbot',
    name: 'Max',
    prompt: `${BASE_STYLE} Caucasian man, late 20s, light skin, neat medium-length brown hair slightly wavy, wearing a deep purple tech hoodie, friendly approachable expression with warm smile, hazel eyes, slight stubble. Rich violet-to-indigo volumetric background.`,
  },
  {
    id: 'comptable',
    name: 'Louis',
    prompt: `${BASE_STYLE} French man, mid 30s, fair skin, neatly combed dark brown hair parted to the side, clean shaven, rectangular thin-frame glasses, wearing a navy blue fitted suit jacket over crisp white dress shirt, composed analytical expression with slight confident smile, light brown hazel eyes. Deep cyan-to-teal volumetric background with studio lighting.`,
  },
];

const OUTPUT_DIR = path.join(process.cwd(), 'public', 'avatars-3d');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function main() {
  console.log('=== Generating 5 missing avatars ===\n');

  for (const agent of MISSING) {
    console.log(`[${agent.id}] Generating ${agent.name}...`);
    try {
      const res = await fetch(SEEDREAM_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SEEDREAM_API_KEY}` },
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
      const url = data.data?.[0]?.url;
      if (!url) {
        console.error(`[${agent.id}] No image:`, JSON.stringify(data).substring(0, 200));
        continue;
      }
      const imgRes = await fetch(url);
      const imgBuf = Buffer.from(await imgRes.arrayBuffer());
      const filePath = path.join(OUTPUT_DIR, `${agent.id}.png`);
      fs.writeFileSync(filePath, imgBuf);
      console.log(`[${agent.id}] OK: ${(imgBuf.length / 1024).toFixed(0)}KB`);
    } catch (e) {
      console.error(`[${agent.id}] Error:`, e.message);
    }
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log('\n=== Uploading to Supabase Storage ===\n');

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  for (const agent of MISSING) {
    const filePath = path.join(OUTPUT_DIR, `${agent.id}.png`);
    if (!fs.existsSync(filePath)) {
      console.log(`[${agent.id}] No file, skipping`);
      continue;
    }

    const fileBuffer = fs.readFileSync(filePath);
    const storagePath = `agent-avatars/${agent.id}-3d.png`;

    const { error: uploadError } = await sb.storage
      .from('public-assets')
      .upload(storagePath, fileBuffer, { contentType: 'image/png', upsert: true });

    if (uploadError) {
      console.error(`[${agent.id}] Upload error:`, uploadError.message);
      continue;
    }

    const { data: urlData } = sb.storage.from('public-assets').getPublicUrl(storagePath);
    const publicUrl = urlData.publicUrl;
    console.log(`[${agent.id}] Uploaded: ${publicUrl}`);

    const { error: dbError } = await sb.from('agent_avatars')
      .update({ avatar_3d_url: publicUrl })
      .eq('id', agent.id);

    if (dbError) console.error(`[${agent.id}] DB error:`, dbError.message);
    else console.log(`[${agent.id}] DB updated`);
  }

  // Verify final state
  const { data: final } = await sb.from('agent_avatars').select('id, display_name, avatar_3d_url').order('id');
  console.log('\n=== Final State ===');
  for (const a of final || []) {
    console.log(`  ${(a.id || '').padEnd(18)} ${a.avatar_3d_url ? '✅ 3D' : '❌ no 3D'}`);
  }
}

main().catch(console.error);
