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

/**
 * ⚠️ La colonne s'appelle content_html, PAS content.
 *
 * Erreur commise le 14 août au matin : en ajoutant le corps de l'article au
 * select, j'ai écrit  de mémoire. PostgREST répond alors 42703 sur la
 * requête ENTIÈRE — pickBlogArticleForType rendait null, et le bloc « guide
 * gratuit » avait purement disparu de tous les mails. Le mail partait quand
 * même, sans sa valeur : la panne était invisible côté expéditeur.
 *
 * Vérifié en base : id, slug, title, meta_title, meta_description,
 * content_html, excerpt, keywords_*, schema_faq, internal_links, status,
 * published_at, views, org_id.
 */
export interface BlogMatch { title: string; slug: string; excerpt?: string; content_html?: string }

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
    const { data, error } = await supabase
      .from('blog_posts')
      .select('title, slug, excerpt, content_html')
      .eq('status', 'published')
      .ilike('slug', `%${tok}%`)
      .order('published_at', { ascending: false })
      .limit(1);
    // On LIT l'erreur. Une requête refusée rend data=null, exactement comme
    // « aucun résultat » — c'est ainsi qu'un nom de colonne faux a fait
    // disparaître le bloc article de tous les mails sans qu'aucun log ne le
    // dise. Un silence de la base n'est pas une absence de données.
    if (error) console.error('[blogMatch] requête refusée :', error.code, error.message);
    if (data && data[0]) return data[0] as BlogMatch;
  }

  // 2. Match par mot-clé primaire.
  for (const tok of tokens) {
    const { data, error } = await supabase
      .from('blog_posts')
      .select('title, slug, excerpt, content_html')
      .eq('status', 'published')
      .ilike('keywords_primary', `%${tok}%`)
      .order('published_at', { ascending: false })
      .limit(1);
    // On LIT l'erreur. Une requête refusée rend data=null, exactement comme
    // « aucun résultat » — c'est ainsi qu'un nom de colonne faux a fait
    // disparaître le bloc article de tous les mails sans qu'aucun log ne le
    // dise. Un silence de la base n'est pas une absence de données.
    if (error) console.error('[blogMatch] requête refusée :', error.code, error.message);
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
/**
 * Le début de l'article DANS le mail, et le bouton qui mène au reste.
 *
 * ── Pourquoi ──
 *
 * Fondateur, 2026-08-13 : « plutôt que de mettre un lien du blog en bas,
 * peut-être qu'on peut mettre 1/3 du blog dans le mail avec un bouton
 * "continuer la lecture de l'article", et ça amène sur Keiro pour lire. »
 *
 * Le bloc précédent montrait 140 caractères de résumé et un lien. Un lien
 * demande un acte de foi : le lecteur doit cliquer pour savoir si ça vaut le
 * coup. Un tiers d'article ne demande rien — il donne d'abord, et le clic vient
 * parce que la lecture a commencé et qu'on veut la finir.
 *
 * C'est aussi la seule façon de rendre le clic MESURABLE comme un signal
 * d'intérêt : quelqu'un qui clique après avoir lu trois paragraphes est
 * réellement intéressé par le sujet, là où un clic sur un titre peut n'être que
 * de la curiosité.
 *
 * ── Pourquoi un tiers, et pas la moitié ──
 *
 * Assez pour que le conseil ait commencé à servir, assez peu pour que la suite
 * garde de la valeur. Au-delà, plus personne ne clique : on a tout donné.
 */
function premierTiers(contenu: string, mots = 180): string {
  const texte = String(contenu || '')
    .replace(/<[^>]*>/g, ' ')          // le HTML du blog ne s'invite pas dans le mail
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!texte) return '';
  const tous = texte.split(' ');
  const tiers = Math.min(mots, Math.max(60, Math.floor(tous.length / 3)));
  let extrait = tous.slice(0, tiers).join(' ');
  // On coupe à une fin de phrase quand il y en a une à portée : une phrase
  // tranchée au milieu donne l'impression d'un mail cassé, pas d'un extrait.
  const dernierPoint = extrait.lastIndexOf('. ');
  if (dernierPoint > extrait.length * 0.6) extrait = extrait.slice(0, dernierPoint + 1);
  return extrait;
}

export function blogValueBlockHtml(article: BlogMatch): string {
  const url = `https://keiroai.com/blog/${article.slug}`;
  const extrait = premierTiers(article.content_html || article.excerpt || '');
  const paragraphes = extrait
    .split(/(?<=\.)\s+(?=[A-ZÀ-Ü])/)
    .reduce((acc: string[], phrase, i) => {
      // Deux phrases par paragraphe : un pavé ne se lit pas dans un mail.
      const idx = Math.floor(i / 2);
      acc[idx] = (acc[idx] ? acc[idx] + ' ' : '') + phrase;
      return acc;
    }, [])
    .map(par => `<p style="margin:0 0 12px;font-size:14px;line-height:1.65;color:#374151;">${par}</p>`)
    .join('');

  return `<div style="margin:22px 0;padding:20px 22px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;">
<div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px;">Guide gratuit</div>
<div style="font-size:17px;font-weight:700;color:#0c1a3a;line-height:1.35;margin-bottom:12px;">${article.title}</div>
${paragraphes || `<p style="margin:0 0 12px;font-size:14px;line-height:1.65;color:#374151;">${(article.excerpt || '').slice(0, 200)}</p>`}
<a href="${url}" style="display:inline-block;margin-top:6px;padding:11px 20px;background:#0c1a3a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:7px;">Continuer la lecture →</a>
${BLOC_PREUVE_CADENCE}
</div>`;
}

/**
 * La preuve chiffrée, sous l'extrait d'article.
 *
 * Fondateur, 19 août : « on met bien en avant les études qui prouvent la valeur
 * de publier sur les réseaux, sur la page d'accueil et dans les blogs, en plus
 * on les envoie par email. »
 *
 * Le bloc existe déjà sur l'accueil. Ici il fait un travail différent : le
 * prospect qui reçoit ce mail n'a pas demandé de conseil, il découvre. Une
 * donnée mesurée sur 2,1 millions de publications répond à la seule objection
 * qui compte à ce stade — « est-ce que ça sert vraiment à quelque chose ? » —
 * et elle y répond sans rien vendre.
 *
 * Court à dessein : deux lignes sous l'extrait. Un mail de prospection qui
 * déroule un tableau se ferme avant d'être lu. La donnée appuie l'article,
 * elle ne le remplace pas.
 *
 * On cite la source : un chiffre sans provenance se lit comme un argument
 * commercial, un chiffre sourcé se lit comme un fait.
 */
const BLOC_PREUVE_CADENCE = `<div style="margin-top:16px;padding-top:14px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.6;color:#6b7280;">
<strong style="color:#374151;">Ce que disent les données :</strong> sur 2,1 millions de publications analysées par Buffer, un compte qui publie tous les jours obtient <strong style="color:#0c1a3a;">24 % de portée en plus par publication</strong> qu'un compte qui publie deux fois par semaine — et 5,5 fois plus de croissance d'abonnés. Publier plus souvent ne dilue pas l'audience, ça l'élargit.
</div>`;

/** Version texte brut du bloc (pour la partie textBody). */
export function blogValueBlockText(article: BlogMatch): string {
  return `\n\n📖 Guide gratuit — ${article.title}\nLire le guide complet : https://keiroai.com/blog/${article.slug}`;
}
