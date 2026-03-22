/**
 * Pre-generate showcase example images for all 9 business types.
 * Uploads to Supabase Storage (public-assets/showcase/{type}/{index}.png)
 * and logs to agent_logs for the showcase UI to display.
 *
 * Run: node scripts/pre-generate-showcase.mjs
 *
 * Env vars required:
 *   SEEDREAM_API_KEY (or uses hardcoded fallback)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   NEXT_PUBLIC_SUPABASE_URL (optional, has default)
 */

import { createClient } from '@supabase/supabase-js';

const SEEDREAM_API_KEY = process.env.SEEDREAM_API_KEY || '341cd095-2c11-49da-82e7-dc2db23c565c';
const SEEDREAM_API_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://duxjdlzdfjrhyojjwnig.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'public-assets';

if (!SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY is required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── ELITE VISUAL PROMPTS PER BUSINESS TYPE ───
// Each prompt is crafted for maximum visual impact, scroll-stopping quality,
// and professional social media presence. Pure photographic, no text.
const BUSINESS_PROMPTS = {
  restaurant: {
    label: 'Restaurant',
    emoji: '\u{1F37D}\uFE0F',
    prompts: [
      'Exquisite fine dining signature dish on white porcelain plate, perfectly plated with microgreens and edible flowers, warm golden hour natural light streaming through restaurant window, shallow depth of field, food photography magazine quality, rich warm color palette',
      'Atmospheric outdoor restaurant terrace at golden hour, string lights glowing softly above elegantly set tables, happy diners in soft bokeh background, Mediterranean architecture, warm amber and violet twilight sky, cinematic composition',
      'Dynamic action shot of chef flambeing a pan in professional kitchen, dramatic fire and steam, stainless steel environment, focused concentration on chef face, motion blur on flames, editorial photography style',
      'Artisanal dessert masterpiece with chocolate ganache and fresh berries, overhead flat lay on marble surface, scattered petals and gold leaf accents, pastel tones, clean minimalist styling, premium patisserie quality',
      'Rustic wooden table covered with French cheese board, charcuterie, fresh bread, wine glasses, and seasonal fruits, warm candlelight ambiance, cozy bistro atmosphere, rich earthy color palette, epicurean lifestyle',
    ],
  },
  boutique: {
    label: 'Boutique',
    emoji: '\u{1F6CD}\uFE0F',
    prompts: [
      'Stunning fashion boutique storefront with curated window display, mannequins in spring collection, warm golden interior lighting spilling onto sidewalk, elegant Parisian architecture, dusk sky, premium retail aesthetic',
      'Flat lay arrangement of luxury fashion accessories on blush pink surface, designer handbag, sunglasses, silk scarf, gold jewelry, perfect symmetrical composition, soft directional light, editorial product photography',
      'Minimalist boutique interior with curated clothing racks, indoor plants, concrete floors, natural light from large windows, Scandinavian design elements, clean airy atmosphere, architectural interior photography',
      'Street style fashion portrait, model walking on cobblestone Parisian street wearing chic outfit, golden hour backlighting creating rim light on hair, blurred historic building background, confident stride',
      'Premium gift wrapping experience, hands tying satin ribbon on branded box, luxury tissue paper, dried flowers, marble counter, warm overhead light, unboxing moment, tactile luxury lifestyle',
    ],
  },
  coach: {
    label: 'Coach / Fitness',
    emoji: '\u{1F4AA}',
    prompts: [
      'Dynamic fitness coach mid-exercise in modern gym, powerful athletic pose, neon blue and purple ambient lighting, energy and determination visible, sweat glistening, wide angle capturing full gym environment, motivational energy',
      'Small group outdoor fitness bootcamp session in lush green park at sunrise, coach leading exercises, golden morning light, team camaraderie, active lifestyle, vibrant energy, cinematic wide shot with sun flares',
      'Beautifully arranged healthy rainbow buddha bowl, fresh superfoods artistically placed, quinoa, avocado, pomegranate, edamame, overhead view, clean white marble background, vibrant natural colors, nutrition lifestyle',
      'Personal trainer and client high-fiving after workout, genuine joy and achievement, modern functional training space, warm natural light, authentic connection, motivational moment, shallow depth of field on expressions',
      'Serene yoga practice at sunrise on rooftop terrace overlooking city skyline, silhouette against golden sky, peaceful meditation pose, mist in background, warm color gradient sky, wellness and balance',
    ],
  },
  coiffeur: {
    label: 'Coiffeur / Barbier',
    emoji: '\u{1F488}',
    prompts: [
      'Perfect men haircut result with precision fade, sharp side profile view, professional studio lighting with hair light, clean modern background, barbershop excellence, grooming magazine quality, sharp detail on hair texture',
      'Stunning natural balayage hair coloring result, woman with flowing wavy hair catching golden light, luminous golden and honey highlights, portrait with shallow depth of field, luxury salon quality, hair editorial',
      'Modern industrial-chic barbershop interior, leather chairs, exposed brick, vintage mirrors, warm Edison bulb lighting, barber tools neatly arranged, premium masculine atmosphere, architectural interior shot',
      'Master barber performing straight razor shave, extreme close-up on skilled hands and razor, vintage hot towel service, steam visible, dark moody lighting, artisan craftsmanship, dramatic editorial style',
      'Dramatic before and after hair transformation, side by side comparison showing stunning metamorphosis, same lighting and angle, professional salon result, confidence and beauty, editorial split composition',
    ],
  },
  caviste: {
    label: 'Caviste / Fleuriste',
    emoji: '\u{1F377}',
    prompts: [
      'Atmospheric wine cellar with premium bottles displayed on rustic oak shelving, warm amber candlelight creating long shadows, stone walls, rich burgundy and gold tones, intimate epicurean atmosphere, cinematic lighting',
      'Wine tasting moment, elegant hand holding glass of deep red wine, vineyard landscape in soft bokeh background, golden hour sunlight through wine creating ruby glow, lifestyle luxury, sommelier experience',
      'Lush artisanal flower arrangement with garden roses, peonies, eucalyptus and ranunculus, romantic countryside chic style, morning dew visible, natural side light, florist workshop atmosphere, botanical artistry',
      'Seasonal flower bouquet wrapped in craft paper on rustic wooden counter, morning light streaming through shop window, vintage scissors and ribbon nearby, charming artisan florist shop, warm pastel palette',
      'Elegant wine and cheese pairing board with artisanal cheeses, grapes, honey, walnuts, on olive wood board, two wine glasses, warm intimate dinner setting, rustic luxury, epicurean lifestyle photography',
    ],
  },
  freelance: {
    label: 'Freelance / Consultant',
    emoji: '\u{1F4BB}',
    prompts: [
      'Minimalist creative workspace with laptop, specialty coffee in ceramic cup, succulent plant, notebook with pen, warm natural window light casting soft shadows, clean oak desk, productive morning atmosphere, lifestyle photography',
      'Confident creative professional in modern urban setting, natural personal branding portrait, contemporary architecture background in soft bokeh, authentic expression, warm golden hour sidelight, editorial headshot quality',
      'Creative mood board and design materials laid out on desk, color swatches, material samples, sketches, tablet with design work, top-down flat lay, harmonious color palette, creative process documentation, studio lighting',
      'Modern video call setup with professional background, clean home office with plants and art, ring light reflection in eyes, contemporary remote work lifestyle, warm and professional atmosphere, shallow depth of field',
      'Creative portfolio materials arranged artistically, open sketchbook, graphic tablet with stylus, paint swatches, fabric samples, overhead flat lay on dark surface, creative professional tools, controlled studio lighting',
    ],
  },
  professionnel: {
    label: 'Professionnel (avocat, sante...)',
    emoji: '\u2696\uFE0F',
    prompts: [
      'Elegant professional office with rich wood desk, leather-bound books on shelving, warm natural light through tall windows, fresh flowers in vase, classic yet modern furnishing, trust and authority, architectural interior photography',
      'Confident professional portrait, doctor or lawyer in polished attire, warm genuine smile, neutral contemporary background, natural light from side creating gentle shadows, trustworthy and approachable, corporate headshot quality',
      'Modern medical consultation room with calming sage green walls, comfortable seating, indoor plants, large windows, clean minimalist design, reassuring healthcare environment, soft diffused natural light',
      'Professional team in collaborative meeting, glass-walled conference room, engaged discussion, modern office with city view, warm natural light, diversity and expertise, authentic corporate lifestyle photography',
      'Luxury professional detail shot, premium fountain pen on important documents, elegant wristwatch visible, soft background of mahogany desk and leather chair, warm shallow depth of field, prestige and precision',
    ],
  },
  services: {
    label: 'Artisan / Services',
    emoji: '\u{1F527}',
    prompts: [
      'Master artisan at work, close-up on skilled hands crafting with quality materials, workshop environment, warm directional light highlighting texture and detail, passion and expertise visible, documentary editorial style',
      'Stunning before and after home renovation transformation, split view of same room, dramatic improvement visible, clean modern design result, natural light flooding renovated space, wide angle architectural photography',
      'Artisan tools of the trade meticulously arranged on weathered workbench, vintage and modern tools, warm workshop lighting, editorial still life composition, craftsmanship heritage, rich earthy color palette',
      'Completed professional project with impeccable finishes, satisfied homeowner visible in doorway, golden hour light through new windows, pride in workmanship, authentic completion moment, lifestyle documentary',
      'Professional service vehicle with branding parked at job site, organized equipment visible, morning light, established business presence, reliability and professionalism conveyed, environmental portrait style',
    ],
  },
  pme: {
    label: 'PME / Startup',
    emoji: '\u{1F3E2}',
    prompts: [
      'Energetic startup team brainstorming in modern open-plan office, colorful sticky notes on glass wall, laptops open, natural light, collaborative energy, diverse team members engaged, authentic corporate culture photography',
      'Premium product displayed on clean gradient background, professional commercial product photography, dramatic studio lighting with rim light, sleek packaging design, hero shot composition, e-commerce quality',
      'Modern corporate office space with panoramic city view, designer furniture, abundant natural light, productive yet inspiring atmosphere, indoor greenery, contemporary workspace design, architectural photography',
      'Professional networking event, business people exchanging and connecting, branded elegant decor, warm ambient lighting, bokeh background with event setup, authentic business relationship building, event photography',
      'Dynamic data visualization displayed on large monitor in modern office, growth charts and analytics, vibrant colors on screen, blurred team members in background, tech-forward business success, shallow depth of field',
    ],
  },
};

// ─── HELPERS ───

async function generateImage(prompt) {
  const fullPrompt = `${prompt}.\nCRITICAL: Absolutely NO text, NO letters, NO words, NO numbers, NO writing, NO signs, NO labels, NO watermarks, NO logos anywhere in the image. Pure photographic visual only.`;
  const truncated = fullPrompt.length > 2000 ? fullPrompt.substring(0, 2000) : fullPrompt;

  const res = await fetch(SEEDREAM_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SEEDREAM_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'seedream-4-5-251128',
      prompt: truncated,
      negative_prompt: 'text, words, letters, numbers, writing, typography, signs, labels, captions, watermarks, logos, headlines, slogans, brand names, price tags, menus, screens with text, readable characters, digits, cartoon, anime, illustration, drawing, painting, blurry, low quality, deformed, ugly',
      response_format: 'url',
      watermark: false,
      size: '1920x1920',
      seed: -1,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Seedream HTTP ${res.status}: ${errBody.substring(0, 300)}`);
  }

  const data = await res.json();
  const url = data.data?.[0]?.url;
  if (!url) {
    throw new Error(`No image URL in response: ${JSON.stringify(data).substring(0, 300)}`);
  }
  return url;
}

async function uploadToStorage(tempUrl, businessType, index) {
  // Download the temp image
  const imgRes = await fetch(tempUrl);
  if (!imgRes.ok) throw new Error(`Failed to download image: HTTP ${imgRes.status}`);
  const buffer = await imgRes.arrayBuffer();
  if (buffer.byteLength === 0) throw new Error('Empty image buffer');

  const contentType = imgRes.headers.get('content-type') || 'image/png';
  const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png';
  const fileName = `showcase/${businessType}/${index}.${ext}`;

  const blob = new Blob([buffer], { type: contentType });

  // Ensure bucket exists
  try {
    await supabase.storage.createBucket(BUCKET, { public: true });
  } catch { /* already exists */ }

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(fileName, blob, { contentType, upsert: true });

  if (uploadError) throw new Error(`Upload error: ${uploadError.message}`);

  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(fileName);

  return publicUrl;
}

// ─── MAIN ───

async function main() {
  const types = Object.keys(BUSINESS_PROMPTS);
  const totalImages = types.length * 5;
  let generated = 0;
  let failed = 0;

  // Parse args: optionally specify types to generate
  const args = process.argv.slice(2);
  const selectedTypes = args.length > 0
    ? args.filter(a => types.includes(a))
    : types;

  if (args.length > 0 && selectedTypes.length === 0) {
    console.error(`Invalid types: ${args.join(', ')}`);
    console.error(`Valid types: ${types.join(', ')}`);
    process.exit(1);
  }

  console.log(`\n=== Pre-Generate Showcase Images ===`);
  console.log(`Types: ${selectedTypes.join(', ')}`);
  console.log(`Total images to generate: ${selectedTypes.length * 5}\n`);

  for (const type of selectedTypes) {
    const config = BUSINESS_PROMPTS[type];
    console.log(`\n--- ${config.emoji} ${config.label} (${type}) ---`);

    const items = [];

    for (let i = 0; i < config.prompts.length; i++) {
      const prompt = config.prompts[i];
      const shortDesc = prompt.substring(0, 70);

      try {
        process.stdout.write(`  [${i + 1}/5] Generating... `);

        // Generate with Seedream
        const tempUrl = await generateImage(prompt);
        process.stdout.write('uploading... ');

        // Upload to Supabase Storage for permanent URL
        const permanentUrl = await uploadToStorage(tempUrl, type, i);

        items.push({
          description: prompt,
          url: permanentUrl,
          generated_at: new Date().toISOString(),
        });

        generated++;
        console.log(`OK  ${shortDesc}...`);
      } catch (err) {
        failed++;
        console.log(`FAIL  ${shortDesc}...`);
        console.error(`    Error: ${err.message}`);
      }

      // Delay between requests to avoid rate limiting
      if (i < config.prompts.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    // Log to agent_logs so the showcase UI can find them
    if (items.length > 0) {
      const { error: logError } = await supabase.from('agent_logs').insert({
        agent: 'content',
        action: 'showcase_generate',
        status: 'success',
        data: {
          business_type: type,
          items,
          total: config.prompts.length,
          successful: items.length,
          source: 'pre-generate-script',
        },
      });

      if (logError) {
        console.error(`  Warning: Failed to log to agent_logs: ${logError.message}`);
      } else {
        console.log(`  Logged ${items.length} items to agent_logs`);
      }
    }

    // Delay between business types
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log(`\n=== DONE ===`);
  console.log(`Generated: ${generated}/${selectedTypes.length * 5}`);
  console.log(`Failed: ${failed}`);
  console.log(`\nImages stored in: Supabase Storage > ${BUCKET} > showcase/{type}/`);
  console.log(`Showcase UI will display them automatically.\n`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
