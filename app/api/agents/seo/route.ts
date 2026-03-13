import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getSeoWriterPrompt, getSeoCalendarPrompt } from '@/lib/agents/seo-prompt';
import { KEYWORD_CLUSTERS, pickNextKeyword } from '@/lib/agents/seo-keywords';
import { callGemini } from '@/lib/agents/gemini';
import { loadSharedContext, formatContextForPrompt } from '@/lib/agents/shared-context';

export const runtime = 'nodejs';
export const maxDuration = 120;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * Verify admin auth or CRON_SECRET.
 */
async function verifyAuth(request: NextRequest): Promise<{ authorized: boolean; isCron?: boolean; isAdmin?: boolean }> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return { authorized: true, isCron: true };
  }

  try {
    const { user, error } = await getAuthUser();
    if (error || !user) return { authorized: false };

    const supabase = getSupabaseAdmin();
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (profile?.is_admin) return { authorized: true, isAdmin: true };
  } catch {
    // Auth failed
  }

  return { authorized: false };
}

/**
 * GET /api/agents/seo
 * - CRON: generate a new article automatically
 * - Admin UI: return latest SEO report
 */
export async function GET(request: NextRequest) {
  const { authorized, isCron } = await verifyAuth(request);
  if (!authorized) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Cron trigger: auto-generate next article
  if (isCron) {
    console.log('[SEOAgent] Cron triggered — generating next article');
    return generateArticle(null);
  }

  // Admin UI: return latest SEO logs
  try {
    const supabase = getSupabaseAdmin();
    const { data: logs, error } = await supabase
      .from('agent_logs')
      .select('*')
      .eq('agent', 'seo')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Also get article stats
    const { count: totalArticles } = await supabase
      .from('blog_posts')
      .select('id', { count: 'exact', head: true });

    const { count: publishedArticles } = await supabase
      .from('blog_posts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published');

    const { count: draftArticles } = await supabase
      .from('blog_posts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'draft');

    return NextResponse.json({
      ok: true,
      stats: {
        total: totalArticles ?? 0,
        published: publishedArticles ?? 0,
        drafts: draftArticles ?? 0,
      },
      logs: logs || [],
    });
  } catch (error: any) {
    console.error('[SEOAgent] GET error:', error);
    return NextResponse.json({ ok: false, error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * POST /api/agents/seo
 * - action=generate_article: generate a blog post
 * - action=calendar: generate weekly editorial calendar
 * - action=publish: publish a draft article
 * - action=update_article: manually update article fields
 * - action=revise_article: ask Gemini to revise an article based on instructions
 */
export async function POST(request: NextRequest) {
  const { authorized } = await verifyAuth(request);
  if (!authorized) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ ok: false, error: 'GEMINI_API_KEY non configuree' }, { status: 500 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action;

    switch (action) {
      case 'generate_article':
        return generateArticle(body.keyword || null);

      case 'calendar':
        return generateCalendar();

      case 'publish':
        return publishArticle(body.article_id);

      case 'update_article':
        return updateArticle(body.article_id, body.updates);

      case 'revise_article':
        return reviseArticle(body.article_id, body.instructions);

      default:
        return NextResponse.json({ ok: false, error: `Action inconnue: ${action}` }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[SEOAgent] POST error:', error);
    return NextResponse.json({ ok: false, error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * Generate a blog article using Claude Haiku.
 * If no keyword is provided, picks the next best one from clusters.
 */
async function generateArticle(keyword: string | null): Promise<NextResponse> {
  try {
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    // Find which keywords have already been used
    const { data: existingPosts } = await supabase
      .from('blog_posts')
      .select('keywords_primary');

    const usedPrimaries = (existingPosts || [])
      .map((p: any) => p.keywords_primary)
      .filter(Boolean);

    // Pick keyword
    let targetKeyword = keyword;
    if (!targetKeyword) {
      const next = pickNextKeyword(usedPrimaries);
      if (!next) {
        return NextResponse.json({ ok: false, error: 'Tous les mots-cles ont deja ete utilises' }, { status: 400 });
      }
      targetKeyword = next.primary;
    }

    console.log(`[SEOAgent] Generating article for: "${targetKeyword}"`);

    // Load shared CRM context for data-driven content
    const sharedCtx = await loadSharedContext(supabase, 'seo');
    const crmContext = formatContextForPrompt(sharedCtx);

    // Call Gemini 2.0 Flash with elite prompt + CRM data
    const rawText = await callGemini({
      system: getSeoWriterPrompt(),
      message: `Ecris un article de blog SEO optimise pour le mot-cle principal : "${targetKeyword}"

DONNÉES BUSINESS EN TEMPS RÉEL (utilise-les pour rendre l'article crédible et data-driven) :
${crmContext}

Contexte supplementaire :
- KeiroAI permet de generer des visuels marketing en quelques secondes grace a l'IA
- La plateforme cible les commerces locaux et entrepreneurs (restaurants, boutiques, coaches, coiffeurs, freelances, artisans, pros, agences, PME)
- URL du site : https://www.keiroai.com
- Plans : Sprint 4.99€/3j, Pro 89€/mois, Fondateurs 149€/mois (offre limitée), Business 349€, Elite 999€
- L'article sera publie sur le blog de KeiroAI
- Date : ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}

Genere le JSON complet comme specifie dans tes instructions.`,
      maxTokens: 6000,
    });
    console.log('[SEOAgent] Raw response length:', rawText.length);

    // Parse JSON
    let article: any;
    try {
      const cleanArticleText = rawText.replace(/```[\w]*\s*/g, '');
      const jsonMatch = cleanArticleText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        article = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('[SEOAgent] Failed to parse article JSON:', parseError);

      await supabase.from('agent_logs').insert({
        agent: 'seo',
        action: 'article_generation_failed',
        data: { keyword: targetKeyword, raw: rawText.substring(0, 500), error: String(parseError) },
        status: 'error',
        error_message: String(parseError),
        created_at: now,
      });

      return NextResponse.json({ ok: false, error: 'Echec du parsing JSON de l\'article' }, { status: 500 });
    }

    // Store in blog_posts
    const { data: inserted, error: insertError } = await supabase
      .from('blog_posts')
      .insert({
        slug: article.slug,
        title: article.h1 || article.meta_title,
        meta_title: article.meta_title,
        meta_description: article.meta_description,
        content_html: article.content_html,
        excerpt: article.excerpt || article.meta_description,
        keywords_primary: article.keywords?.primary || targetKeyword,
        keywords_secondary: article.keywords?.secondary || [],
        schema_faq: article.schema_faq || [],
        internal_links: article.internal_links || [],
        status: 'draft',
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[SEOAgent] DB insert error:', insertError);

      await supabase.from('agent_logs').insert({
        agent: 'seo',
        action: 'article_generation_failed',
        data: { keyword: targetKeyword, slug: article.slug, error: insertError.message },
        status: 'error',
        error_message: insertError.message,
        created_at: now,
      });

      return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
    }

    // Log success
    await supabase.from('agent_logs').insert({
      agent: 'seo',
      action: 'article_generated',
      data: {
        article_id: inserted.id,
        slug: article.slug,
        keyword: targetKeyword,
        meta_title: article.meta_title,
        word_count: article.content_html?.split(/\s+/).length || 0,
      },
      status: 'success',
      created_at: now,
    });

    console.log(`[SEOAgent] Article generated: "${article.slug}" (${inserted.id})`);

    return NextResponse.json({
      ok: true,
      article: {
        id: inserted.id,
        slug: article.slug,
        title: article.h1,
        meta_title: article.meta_title,
        status: 'draft',
      },
    });
  } catch (error: any) {
    console.error('[SEOAgent] generateArticle error:', error);
    return NextResponse.json({ ok: false, error: error.message || 'Erreur generation article' }, { status: 500 });
  }
}

/**
 * Generate a weekly editorial calendar.
 */
async function generateCalendar(): Promise<NextResponse> {
  try {
    const supabase = getSupabaseAdmin();
    const now = new Date();
    const nowISO = now.toISOString();

    // Get existing articles to avoid duplicate topics
    const { data: existingPosts } = await supabase
      .from('blog_posts')
      .select('keywords_primary, slug')
      .order('created_at', { ascending: false })
      .limit(20);

    const existingKeywords = (existingPosts || []).map((p: any) => p.keywords_primary).filter(Boolean);

    // Get available keywords summary
    const allKeywords = [
      ...KEYWORD_CLUSTERS.how_to.map((k) => `[how_to] ${k.primary} (vol:${k.volume}, diff:${k.difficulty})`),
      ...KEYWORD_CLUSTERS.comparison.map((k) => `[comparison] ${k.primary} (vol:${k.volume}, diff:${k.difficulty})`),
      ...Object.entries(KEYWORD_CLUSTERS.by_business).flatMap(([biz, kws]) =>
        kws.map((k) => `[${biz}] ${k.primary} (vol:${k.volume}, diff:${k.difficulty})`)
      ),
      ...KEYWORD_CLUSTERS.paa.map((k) => `[paa] ${k.primary} (vol:${k.volume}, diff:${k.difficulty})`),
    ];

    const rawText = await callGemini({
      system: getSeoCalendarPrompt(),
      message: `Planifie le calendrier editorial pour la semaine du ${now.toISOString().split('T')[0]}.

Mots-cles disponibles :
${allKeywords.join('\n')}

Mots-cles deja couverts (a eviter) :
${existingKeywords.length > 0 ? existingKeywords.join('\n') : 'Aucun article encore publie'}

Genere le JSON comme specifie.`,
      maxTokens: 1500,
    });

    let calendar: any;
    try {
      const cleanCalText = rawText.replace(/```[\w]*\s*/g, '');
      const jsonMatch = cleanCalText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        calendar = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found');
      }
    } catch (parseError) {
      console.error('[SEOAgent] Calendar parse error:', parseError);

      await supabase.from('agent_logs').insert({
        agent: 'seo',
        action: 'calendar_failed',
        data: { raw: rawText.substring(0, 500), error: String(parseError) },
        status: 'error',
        error_message: String(parseError),
        created_at: nowISO,
      });

      return NextResponse.json({ ok: false, error: 'Echec parsing calendrier' }, { status: 500 });
    }

    // Store calendar entries in blog_editorial_calendar
    const weekStart = calendar.week_start || now.toISOString().split('T')[0];
    const articles = calendar.articles || [];

    for (const entry of articles) {
      await supabase.from('blog_editorial_calendar').insert({
        week_start: weekStart,
        day: entry.day,
        keyword_primary: entry.keyword_primary,
        angle: entry.angle,
        target_business: entry.target_business,
        status: 'planned',
        created_at: nowISO,
      });
    }

    // Log
    await supabase.from('agent_logs').insert({
      agent: 'seo',
      action: 'calendar_planned',
      data: {
        week_start: weekStart,
        articles_planned: articles.length,
        strategy_note: calendar.strategy_note,
        entries: articles,
      },
      status: 'success',
      created_at: nowISO,
    });

    console.log(`[SEOAgent] Calendar planned: ${articles.length} articles for week of ${weekStart}`);

    return NextResponse.json({
      ok: true,
      calendar: {
        week_start: weekStart,
        articles,
        strategy_note: calendar.strategy_note,
      },
    });
  } catch (error: any) {
    console.error('[SEOAgent] generateCalendar error:', error);
    return NextResponse.json({ ok: false, error: error.message || 'Erreur calendrier' }, { status: 500 });
  }
}

/**
 * Publish a draft article.
 */
async function publishArticle(articleId: string): Promise<NextResponse> {
  if (!articleId) {
    return NextResponse.json({ ok: false, error: 'article_id requis' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    const { data: article, error: fetchError } = await supabase
      .from('blog_posts')
      .select('*')
      .eq('id', articleId)
      .single();

    if (fetchError || !article) {
      return NextResponse.json({ ok: false, error: 'Article non trouve' }, { status: 404 });
    }

    if (article.status === 'published') {
      return NextResponse.json({ ok: false, error: 'Article deja publie' }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from('blog_posts')
      .update({
        status: 'published',
        published_at: now,
        updated_at: now,
      })
      .eq('id', articleId);

    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    // Update calendar entry if linked
    await supabase
      .from('blog_editorial_calendar')
      .update({ status: 'published', article_id: articleId })
      .eq('keyword_primary', article.keywords_primary)
      .eq('status', 'planned');

    // Log
    await supabase.from('agent_logs').insert({
      agent: 'seo',
      action: 'article_published',
      data: {
        article_id: articleId,
        slug: article.slug,
        title: article.title,
        keyword: article.keywords_primary,
      },
      status: 'success',
      created_at: now,
    });

    console.log(`[SEOAgent] Article published: "${article.slug}"`);

    return NextResponse.json({
      ok: true,
      article: {
        id: articleId,
        slug: article.slug,
        title: article.title,
        published_at: now,
      },
    });
  } catch (error: any) {
    console.error('[SEOAgent] publishArticle error:', error);
    return NextResponse.json({ ok: false, error: error.message || 'Erreur publication' }, { status: 500 });
  }
}

/**
 * Manually update article fields (title, content_html, meta_description, etc.)
 */
async function updateArticle(articleId: string, updates: Record<string, any>): Promise<NextResponse> {
  if (!articleId) {
    return NextResponse.json({ ok: false, error: 'article_id requis' }, { status: 400 });
  }

  if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, error: 'updates requis (objet non vide)' }, { status: 400 });
  }

  // Only allow safe fields
  const allowedFields = ['title', 'content_html', 'meta_title', 'meta_description', 'excerpt'];
  const sanitized: Record<string, any> = {};
  for (const key of Object.keys(updates)) {
    if (allowedFields.includes(key)) {
      sanitized[key] = updates[key];
    }
  }

  if (Object.keys(sanitized).length === 0) {
    return NextResponse.json({ ok: false, error: `Champs autorises: ${allowedFields.join(', ')}` }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    // Verify article exists
    const { data: article, error: fetchError } = await supabase
      .from('blog_posts')
      .select('id, slug, title')
      .eq('id', articleId)
      .single();

    if (fetchError || !article) {
      return NextResponse.json({ ok: false, error: 'Article non trouve' }, { status: 404 });
    }

    const { data: updated, error: updateError } = await supabase
      .from('blog_posts')
      .update({ ...sanitized, updated_at: now })
      .eq('id', articleId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    // Log
    await supabase.from('agent_logs').insert({
      agent: 'seo',
      action: 'article_updated',
      data: {
        article_id: articleId,
        slug: article.slug,
        fields_updated: Object.keys(sanitized),
      },
      status: 'success',
      created_at: now,
    });

    console.log(`[SEOAgent] Article updated: "${article.slug}" — fields: ${Object.keys(sanitized).join(', ')}`);

    return NextResponse.json({ ok: true, article: updated });
  } catch (error: any) {
    console.error('[SEOAgent] updateArticle error:', error);
    return NextResponse.json({ ok: false, error: error.message || 'Erreur mise a jour' }, { status: 500 });
  }
}

/**
 * Ask Gemini to revise an article based on user instructions.
 */
async function reviseArticle(articleId: string, instructions: string): Promise<NextResponse> {
  if (!articleId) {
    return NextResponse.json({ ok: false, error: 'article_id requis' }, { status: 400 });
  }

  if (!instructions || typeof instructions !== 'string' || instructions.trim().length === 0) {
    return NextResponse.json({ ok: false, error: 'instructions requises' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    // Fetch current article
    const { data: article, error: fetchError } = await supabase
      .from('blog_posts')
      .select('*')
      .eq('id', articleId)
      .single();

    if (fetchError || !article) {
      return NextResponse.json({ ok: false, error: 'Article non trouve' }, { status: 404 });
    }

    // Call Gemini to revise
    const rawText = await callGemini({
      system: `Tu es un rédacteur SEO expert. L'utilisateur veut modifier un article existant. Applique ses instructions et retourne le JSON complet mis à jour avec les mêmes champs.

Les champs attendus dans le JSON de sortie :
- title (string)
- content_html (string, HTML complet de l'article)
- meta_title (string)
- meta_description (string)
- excerpt (string)

Retourne UNIQUEMENT le JSON, sans texte avant ou après.`,
      message: `Voici l'article actuel :

Titre : ${article.title}
Meta title : ${article.meta_title}
Meta description : ${article.meta_description}
Excerpt : ${article.excerpt}

Contenu HTML :
${article.content_html}

---

Instructions de modification :
${instructions}

Retourne le JSON complet mis à jour.`,
      maxTokens: 6000,
    });

    // Parse revised JSON
    let revised: any;
    try {
      const cleanText = rawText.replace(/```[\w]*\s*/g, '');
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        revised = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in Gemini response');
      }
    } catch (parseError) {
      console.error('[SEOAgent] Revise parse error:', parseError);

      await supabase.from('agent_logs').insert({
        agent: 'seo',
        action: 'article_revise_failed',
        data: { article_id: articleId, raw: rawText.substring(0, 500), error: String(parseError) },
        status: 'error',
        error_message: String(parseError),
        created_at: now,
      });

      return NextResponse.json({ ok: false, error: 'Echec du parsing JSON de la revision' }, { status: 500 });
    }

    // Update article with revised content
    const updateFields: Record<string, any> = { updated_at: now };
    if (revised.title) updateFields.title = revised.title;
    if (revised.content_html) updateFields.content_html = revised.content_html;
    if (revised.meta_title) updateFields.meta_title = revised.meta_title;
    if (revised.meta_description) updateFields.meta_description = revised.meta_description;
    if (revised.excerpt) updateFields.excerpt = revised.excerpt;

    const { data: updated, error: updateError } = await supabase
      .from('blog_posts')
      .update(updateFields)
      .eq('id', articleId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    // Log
    await supabase.from('agent_logs').insert({
      agent: 'seo',
      action: 'article_revised',
      data: {
        article_id: articleId,
        slug: article.slug,
        instructions: instructions.substring(0, 200),
        fields_updated: Object.keys(updateFields).filter((k) => k !== 'updated_at'),
      },
      status: 'success',
      created_at: now,
    });

    console.log(`[SEOAgent] Article revised: "${article.slug}" — instructions: "${instructions.substring(0, 80)}"`);

    return NextResponse.json({ ok: true, article: updated });
  } catch (error: any) {
    console.error('[SEOAgent] reviseArticle error:', error);
    return NextResponse.json({ ok: false, error: error.message || 'Erreur revision article' }, { status: 500 });
  }
}
