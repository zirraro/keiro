/**
 * Génère l'image manquante des articles de blog qui n'en ont aucune.
 *
 * Constat (2026-08-05) : sur 89 articles publiés, les 511 images en ligne
 * répondent toutes correctement — aucune n'est cassée. En revanche 5 articles
 * n'ont AUCUNE image, et la liste affiche alors une icône d'image sur fond
 * dégradé. Visuellement, cette icône se lit exactement comme une image cassée :
 * c'est ce que le fondateur voyait.
 *
 * Le script suit la convention des images existantes :
 *   bucket `generated-images`, chemin `seo/<slug>/<timestamp>-0.jpg`
 * et insère l'image en tête d'article, avec un `alt` descriptif — le blog est
 * un actif SEO, une image sans alt est une occasion perdue.
 *
 * Usage : node scripts/blog-images-manquantes.mjs [--dry]
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
);
for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v;

const dry = process.argv.includes('--dry');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

/**
 * Décrit l'image à produire à partir du titre.
 *
 * On reste sur des scènes réelles de commerce — personnes au travail, lieux
 * vivants — plutôt que sur des illustrations abstraites : c'est la ligne suivie
 * par les 511 images déjà en place, et changer de style sur 5 articles se
 * verrait immédiatement dans la grille.
 */
function briefVisuel(titre) {
  const t = titre.toLowerCase();
  if (t.includes('restaurant')) return "Un restaurateur souriant en salle, tables dressées et lumière chaude, ambiance conviviale d'un bistrot de quartier plein à midi";
  if (t.includes('fleuriste')) return "Une fleuriste dans sa boutique lumineuse, entourée de compositions florales colorées, en train de préparer un bouquet";
  if (t.includes('canva') || t.includes('ia et marketing') || t.includes('ia '))
    return "Une commerçante concentrée devant son ordinateur portable dans son commerce, en train de préparer sa communication, lumière naturelle";
  return "Un commerçant indépendant souriant dans son commerce, en pleine activité, lumière naturelle et ambiance chaleureuse";
}

const { data: articles } = await supabase
  .from('blog_posts').select('id, slug, title, content_html').eq('status', 'published');

const sansImage = (articles || []).filter(a => !/<img[^>]*src=/i.test(a.content_html || ''));
console.log(`${articles?.length} articles publiés · ${sansImage.length} sans image\n`);
if (!sansImage.length) process.exit(0);

const { generateImage } = await import('../lib/visuals/image-provider.ts');

let ok = 0;
for (const a of sansImage) {
  const brief = briefVisuel(a.title || '');
  console.log(`▶ ${a.slug}\n   ${brief.slice(0, 90)}…`);
  if (dry) { continue; }

  const img = await generateImage({ prompt: brief, size: '1024x1024', complexity: 'standard' });
  if (!img?.url) { console.log('   ✗ génération impossible (fournisseurs à sec ?)'); continue; }

  const bin = await fetch(img.url).then(r => r.arrayBuffer()).catch(() => null);
  if (!bin) { console.log('   ✗ téléchargement impossible'); continue; }

  const chemin = `seo/${a.slug}/${Date.now()}-0.jpg`;
  const { error: upErr } = await supabase.storage
    .from('generated-images')
    .upload(chemin, Buffer.from(bin), { contentType: 'image/jpeg', upsert: true });
  if (upErr) { console.log('   ✗ upload refusé :', upErr.message); continue; }

  const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/generated-images/${chemin}`;
  const balise = `<img src="${url}" alt="${brief.replace(/"/g, '')}" loading="lazy" style="width:100%;border-radius:12px;margin:0 0 24px" />\n`;

  const { error: majErr } = await supabase
    .from('blog_posts')
    .update({ content_html: balise + (a.content_html || ''), updated_at: new Date().toISOString() })
    .eq('id', a.id);
  if (majErr) { console.log('   ✗ mise à jour refusée :', majErr.message); continue; }

  console.log('   ✓ image en ligne');
  ok++;
}
console.log(`\n${ok}/${sansImage.length} articles complétés`);
