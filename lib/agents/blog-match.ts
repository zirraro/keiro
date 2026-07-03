/**
 * Matche un article de blog KeiroAI (publié) au métier d'un prospect, pour
 * donner de la VRAIE valeur gratuite dans le démarchage : le mail teaser →
 * l'article complet à lire sur keiroai.com/blog → puis l'essai des agents.
 *
 * Founder (03/07) : « donner de la valeur gratuite en mode newsletter/blog —
 * ils lisent l'article complet sur notre site + un accès pour essayer 7 jours ».
 *
 * ⚠️ Doctrine : PAS de lien dans le 1er email → n'injecter le bloc article
 * qu'à partir du step 2 (géré côté appelant).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface BlogMatch { title: string; slug: string; excerpt?: string }

/** Mots-clés métier → aide au matching des slugs/keywords d'articles. */
function typeTokens(type: string | null | undefined): string[] {
  const t = (type || '').toLowerCase();
  const map: Record<string, string[]> = {
    restaurant: ['restaurant', 'resto', 'traiteur', 'food'],
    coiffeur: ['coiffeur', 'coiffure', 'salon', 'barber'],
    beaute: ['beaute', 'institut', 'esthetique', 'spa', 'ongles', 'nail'],
    fleuriste: ['fleuriste', 'fleur'],
    caviste: ['caviste', 'vin', 'cave'],
    artisan: ['artisan', 'artisanat', 'menuisier', 'plombier', 'electricien'],
    boulangerie: ['boulanger', 'boulangerie', 'patisserie'],
    immobilier: ['immobilier', 'agence-immo', 'agent-immobilier'],
    coach: ['coach', 'coaching', 'sport', 'fitness', 'salle'],
    freelance: ['freelance', 'independant', 'consultant'],
  };
  // token direct + éventuel mapping
  const tokens = new Set<string>();
  if (t) tokens.add(t.replace(/\s+/g, '-'));
  for (const [k, arr] of Object.entries(map)) {
    if (t.includes(k) || arr.some(a => t.includes(a))) arr.forEach(a => tokens.add(a));
  }
  return [...tokens].filter(Boolean);
}

/**
 * Renvoie l'article publié le plus pertinent pour le type de prospect, sinon
 * un article générique récent. null si le blog est vide.
 */
export async function pickBlogArticleForType(
  supabase: SupabaseClient,
  type: string | null | undefined,
): Promise<BlogMatch | null> {
  const tokens = typeTokens(type);

  // 1. Match par slug (les slugs contiennent le métier : ...-fleuriste-...).
  for (const tok of tokens) {
    const { data } = await supabase
      .from('blog_posts')
      .select('title, slug, excerpt')
      .eq('status', 'published')
      .ilike('slug', `%${tok}%`)
      .order('published_at', { ascending: false })
      .limit(1);
    if (data && data[0]) return data[0] as BlogMatch;
  }

  // 2. Match par mot-clé primaire.
  for (const tok of tokens) {
    const { data } = await supabase
      .from('blog_posts')
      .select('title, slug, excerpt')
      .eq('status', 'published')
      .ilike('keywords_primary', `%${tok}%`)
      .order('published_at', { ascending: false })
      .limit(1);
    if (data && data[0]) return data[0] as BlogMatch;
  }

  // 3. Fallback : un article générique récent (stratégie marketing digital).
  const { data: generic } = await supabase
    .from('blog_posts')
    .select('title, slug, excerpt')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(1);
  return (generic && generic[0]) ? (generic[0] as BlogMatch) : null;
}

/**
 * Bloc HTML élégant "guide complet" à injecter dans un mail (valeur gratuite).
 * Teaser + lien vers l'article complet sur le blog + accroche essai.
 */
export function blogValueBlockHtml(article: BlogMatch): string {
  const url = `https://keiroai.com/blog/${article.slug}`;
  const teaser = (article.excerpt || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 140);
  return `<div style="margin:18px 0;padding:16px 18px;background:#f8fafc;border:1px solid #e5e7eb;border-left:3px solid #0c1a3a;border-radius:8px;">
<div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Guide gratuit</div>
<a href="${url}" style="font-size:15px;font-weight:bold;color:#0c1a3a;text-decoration:none;">${article.title}</a>
${teaser ? `<div style="font-size:13px;color:#555;margin-top:6px;line-height:1.5;">${teaser}…</div>` : ''}
<a href="${url}" style="display:inline-block;margin-top:10px;font-size:13px;color:#0c1a3a;font-weight:600;text-decoration:none;">Lire le guide complet →</a>
</div>`;
}

/** Version texte brut du bloc (pour la partie textBody). */
export function blogValueBlockText(article: BlogMatch): string {
  return `\n\n📖 Guide gratuit — ${article.title}\nLire le guide complet : https://keiroai.com/blog/${article.slug}`;
}
