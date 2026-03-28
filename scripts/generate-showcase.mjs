/**
 * Generate showcase images for each business type via Seedream API
 * Then upload to Supabase Storage and insert into showcase_images table
 *
 * Usage: node --env-file=.env.local scripts/generate-showcase.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SEEDREAM_API_KEY = process.env.SEEDREAM_API_KEY || '341cd095-2c11-49da-82e7-dc2db23c565c';
const SEEDREAM_API_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const BUSINESS_PROMPTS = {
  restaurant: [
    { title: 'Plat du jour gastronomique', prompt: 'Elegant restaurant dish on white plate, golden hour lighting, fresh herbs garnish, rustic wooden table, bokeh background, food photography, warm tones, professional quality, appetizing' },
    { title: 'Terrasse en soiree', prompt: 'Cozy French restaurant terrace at golden hour, warm string lights, couples dining, Mediterranean ambiance, soft focus background, inviting atmosphere, professional photography' },
    { title: 'Cuisine en action', prompt: 'Professional chef cooking in open kitchen, flames on pan, dynamic action shot, stainless steel kitchen, warm lighting, culinary art, behind the scenes restaurant' },
    { title: 'Dessert signature', prompt: 'Artisan French dessert, chocolate fondant with red berries, elegant plating, dark moody lighting, fine dining presentation, professional food photography' },
    { title: 'Menu saisonnier', prompt: 'Beautiful seasonal menu display with fresh ingredients, autumn vegetables, rustic presentation, warm natural lighting, farm to table concept, organic aesthetic' },
    { title: 'Brunch gourmand', prompt: 'Luxurious brunch spread flat lay, avocado toast, fresh orange juice, pastries, fruits, marble table, bright natural light, Instagram-worthy food photography' },
    { title: 'Cave a vin', prompt: 'Intimate wine cellar with bottle display, warm amber lighting, wine glass in foreground, wooden barrels background, sophisticated ambiance, premium feeling' },
    { title: 'Equipe en cuisine', prompt: 'Happy diverse restaurant team in white chef uniforms, kitchen background, team photo, smiling, professional yet warm, teamwork in restaurant' },
    { title: 'Table dressee', prompt: 'Beautifully set dinner table for two, white linen, candles, fresh flowers, elegant restaurant interior, romantic atmosphere, fine dining setup' },
    { title: 'Ingredient frais marche', prompt: 'Fresh market vegetables and herbs in basket, morning light, colorful produce, local market atmosphere, organic farming, farm fresh concept' },
  ],
  coiffeur: [
    { title: 'Avant/Apres coupe femme', prompt: 'Split image concept hair transformation, woman with beautiful styled hair, salon interior, professional lighting, hair care advertisement, glamorous result' },
    { title: 'Coupe homme tendance', prompt: 'Stylish mens haircut, barber shop atmosphere, fade cut, professional barbering, sharp lines, modern male grooming, confident look' },
    { title: 'Coloration tendance', prompt: 'Woman with vibrant hair color, balayage highlights, salon chair, professional salon lighting, hair transformation, beautiful color result' },
    { title: 'Salon moderne', prompt: 'Modern minimalist hair salon interior, clean lines, large mirrors, styling stations, natural light, premium salon design, welcoming atmosphere' },
    { title: 'Brushing parfait', prompt: 'Woman with perfect blowout hairstyle, flowing hair in motion, salon background, professional styling result, shiny healthy hair, beauty concept' },
    { title: 'Barber traditionnel', prompt: 'Classic barber chair with hot towel service, vintage barbershop atmosphere, straight razor, masculine grooming, premium experience' },
    { title: 'Soin capillaire', prompt: 'Hair treatment application at luxury salon, deep conditioning, professional care, relaxing atmosphere, hair wellness, premium products' },
    { title: 'Coiffure mariage', prompt: 'Bridal hairstyle updo with delicate flowers, elegant wedding hair, soft romantic lighting, bridal preparation, special occasion styling' },
    { title: 'Produits premium', prompt: 'Professional hair care products display, salon shelf, premium brands, clean aesthetic, beauty products, professional recommendation' },
    { title: 'Equipe salon', prompt: 'Happy salon team of hairdressers, diverse group, professional tools in hands, welcoming smiles, team photo, salon interior background' },
  ],
  coach: [
    { title: 'Seance coaching', prompt: 'Dynamic personal training session, trainer guiding client, modern gym, motivational atmosphere, fitness coaching, active lifestyle' },
    { title: 'Transformation resultat', prompt: 'Fitness transformation concept, confident athletic person, gym environment, achievement, progress, healthy lifestyle result' },
    { title: 'Cours collectif', prompt: 'Group fitness class in action, energetic atmosphere, modern studio, diverse participants, pilates or yoga, community workout' },
    { title: 'Espace entrainement', prompt: 'Modern boutique fitness studio, clean equipment, natural light, motivational space, premium gym interior, inviting workout environment' },
    { title: 'Nutrition saine', prompt: 'Healthy meal prep containers with colorful food, protein and vegetables, fitness nutrition, balanced diet, health coaching concept' },
    { title: 'Yoga serenite', prompt: 'Serene yoga pose in beautiful studio, natural light streaming in, mindfulness, wellness, peaceful atmosphere, meditation practice' },
    { title: 'Coaching business', prompt: 'Professional business coaching session, modern office, mentor and mentee, laptop on table, strategic planning, business growth' },
    { title: 'Objectifs atteints', prompt: 'Celebration of fitness achievement, happy confident person at finish line, sunrise, accomplishment, personal victory, motivation' },
    { title: 'Plan personnalise', prompt: 'Personal training plan on tablet, workout schedule, customized program, professional fitness planning, digital coaching tools' },
    { title: 'Communaute active', prompt: 'Group of fit people high-fiving after workout, community spirit, outdoor training, team motivation, active lifestyle community' },
  ],
  boutique: [
    { title: 'Vitrine elegante', prompt: 'Elegant boutique window display, fashion mannequins, warm lighting, luxury retail, inviting storefront, premium shopping experience' },
    { title: 'Nouvelle collection', prompt: 'Beautiful clothing rack with curated collection, soft lighting, fashion boutique interior, new arrivals, trendy pieces, retail display' },
    { title: 'Accessoires mode', prompt: 'Curated accessories display, jewelry and handbags, elegant arrangement, boutique counter, luxury accessories, premium quality' },
    { title: 'Experience shopping', prompt: 'Happy customer trying on clothes in fitting room, boutique shopping experience, personal styling, fashion consultation' },
    { title: 'Produit vedette', prompt: 'Single premium product on pedestal, clean white background, professional product photography, luxury item, attention to detail' },
    { title: 'Ambiance boutique', prompt: 'Warm inviting boutique interior, curated decor, plants, natural materials, concept store atmosphere, unique shopping experience' },
    { title: 'Emballage cadeau', prompt: 'Beautiful gift wrapping in boutique, kraft paper, ribbon, personalized packaging, premium unboxing experience, gift shopping' },
    { title: 'Mode durable', prompt: 'Sustainable fashion concept, organic fabrics, eco-friendly tags, natural materials, conscious shopping, ethical fashion display' },
    { title: 'Client satisfait', prompt: 'Happy customer with shopping bags leaving boutique, satisfied smile, street scene, successful shopping trip, brand loyalty' },
    { title: 'Details artisanal', prompt: 'Close-up of artisan craftsmanship, handmade details, quality stitching, premium materials, artisanal quality, made with care' },
  ],
  fleuriste: [
    { title: 'Bouquet du jour', prompt: 'Stunning fresh flower bouquet, seasonal blooms, wrapped in craft paper, natural light, florist shop, beautiful color palette, floral arrangement' },
    { title: 'Atelier floral', prompt: 'Florist workshop with flowers everywhere, creative workspace, tools and ribbons, natural light, artisan atmosphere, flower studio' },
    { title: 'Composition evenement', prompt: 'Elegant wedding floral centerpiece, white and blush roses, candles, romantic setup, event decoration, luxury floral design' },
    { title: 'Livraison surprise', prompt: 'Flower delivery at doorstep, beautiful wrapped bouquet, surprise gift moment, happy delivery, fresh flowers in hand' },
    { title: 'Plantes vertes', prompt: 'Green plant collection in beautiful pots, indoor garden, various sizes, modern planters, urban jungle aesthetic, plant shop' },
    { title: 'Fleurs sechees', prompt: 'Dried flower arrangement in minimalist vase, boho aesthetic, earth tones, sustainable floristry, lasting beauty, modern decor' },
    { title: 'Vitrine coloree', prompt: 'Colorful flower shop storefront, buckets of fresh flowers, Parisian street, charming display, inviting flower shop entrance' },
    { title: 'Couronne decorative', prompt: 'Handmade decorative wreath with seasonal flowers and greenery, door decoration, artisan craft, festive yet elegant' },
    { title: 'Bouquet mariee', prompt: 'Delicate bridal bouquet, white peonies and eucalyptus, bride holding flowers, soft romantic lighting, wedding floristry' },
    { title: 'Composition table', prompt: 'Table centerpiece with fresh flowers in low vase, dinner party setting, elegant entertaining, floral table decoration' },
  ],
  generic: [
    { title: 'Croissance business', prompt: 'Abstract business growth concept, upward arrows, modern gradient background, professional, success, digital marketing, clean design' },
    { title: 'Presence digitale', prompt: 'Smartphone showing social media feed with likes and comments, digital marketing concept, engagement, online presence, modern' },
    { title: 'IA marketing', prompt: 'AI artificial intelligence concept, neural network visualization, purple and blue gradient, technology, innovation, futuristic design' },
    { title: 'Engagement reseaux', prompt: 'Social media engagement icons floating, hearts likes comments shares, colorful, digital marketing, social proof concept' },
    { title: 'Resultats concrets', prompt: 'Business analytics dashboard on screen, growth charts, positive metrics, data-driven marketing, professional results display' },
  ],
};

async function generateImage(prompt) {
  const res = await fetch(SEEDREAM_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SEEDREAM_API_KEY}` },
    body: JSON.stringify({
      model: 'seedream-4-5-251128',
      prompt: prompt + '\nCRITICAL: Absolutely NO text, NO letters, NO words, NO numbers, NO writing anywhere in the image. Pure photographic visual only.',
      negative_prompt: 'text, words, letters, numbers, writing, watermarks, logos, signs',
      size: '1920x1920',
      response_format: 'url',
      seed: -1,
      watermark: false,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Seedream ${res.status}: ${err.substring(0, 200)}`);
  }
  const data = await res.json();
  return data.data?.[0]?.url || null;
}

async function cacheToStorage(tempUrl, fileName) {
  const imgRes = await fetch(tempUrl);
  const buffer = await imgRes.arrayBuffer();
  const { error } = await supabase.storage
    .from('generated-images')
    .upload(`showcase/${fileName}`, Buffer.from(buffer), { contentType: 'image/png', upsert: true });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from('generated-images').getPublicUrl(`showcase/${fileName}`);
  return data.publicUrl;
}

async function main() {
  console.log('=== Generating Showcase Images ===\n');

  let totalGenerated = 0;

  for (const [bizType, prompts] of Object.entries(BUSINESS_PROMPTS)) {
    console.log(`\n--- ${bizType.toUpperCase()} (${prompts.length} images) ---`);

    for (let i = 0; i < prompts.length; i++) {
      const { title, prompt } = prompts[i];
      try {
        console.log(`  [${i + 1}/${prompts.length}] ${title}...`);
        const tempUrl = await generateImage(prompt);
        if (!tempUrl) { console.log('    SKIP: no URL'); continue; }

        const fileName = `${bizType}_${i + 1}_${Date.now()}.png`;
        const permanentUrl = await cacheToStorage(tempUrl, fileName);

        await supabase.from('showcase_images').insert({
          business_type: bizType,
          image_url: permanentUrl,
          title,
          description: prompt.substring(0, 200),
          tags: [bizType],
          is_active: true,
        });

        totalGenerated++;
        console.log(`    OK: ${permanentUrl.substring(0, 80)}`);

        // Rate limit
        await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        console.error(`    ERROR: ${e.message.substring(0, 100)}`);
      }
    }
  }

  const { count } = await supabase.from('showcase_images').select('id', { count: 'exact', head: true });
  console.log(`\n=== DONE: ${totalGenerated} generated, ${count} total in DB ===`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
