import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getSeoWriterPrompt, getSeoCalendarPrompt } from '@/lib/agents/seo-prompt';
import { KEYWORD_CLUSTERS, pickNextKeyword } from '@/lib/agents/seo-keywords';
import { callGemini } from '@/lib/agents/gemini';
import { loadContextWithAvatar } from '@/lib/agents/shared-context';
import { getGscReport } from '@/lib/agents/gsc';
import { saveLearning, saveAgentFeedback } from '@/lib/agents/learning';

export const runtime = 'nodejs';
export const maxDuration = 300;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

const SEEDREAM_API_KEY = process.env.SEEDREAM_API_KEY || '341cd095-2c11-49da-82e7-dc2db23c565c';
const SEEDREAM_API_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations';

/**
 * Cache a temporary image URL to Supabase Storage for a permanent public URL.
 */
async function cacheImageToStorage(tempUrl: string, slug: string, index: number): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();

    // Download the temporary image
    const imgResponse = await fetch(tempUrl);
    if (!imgResponse.ok) {
      console.error('[SEOAgent] Failed to download image for caching:', imgResponse.status);
      return null;
    }

    const buffer = await imgResponse.arrayBuffer();
    if (buffer.byteLength === 0) {
      console.error('[SEOAgent] Empty image buffer');
      return null;
    }

    const contentType = imgResponse.headers.get('content-type') || 'image/png';
    const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png';
    const fileName = `seo/${slug || 'article'}/${Date.now()}-${index}.${ext}`;

    const blob = new Blob([buffer], { type: contentType });

    const { error: uploadError } = await supabase.storage
      .from('generated-images')
      .upload(fileName, blob, { contentType, upsert: false });

    if (uploadError) {
      console.error('[SEOAgent] Storage upload error:', uploadError.message);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('generated-images')
      .getPublicUrl(fileName);

    console.log('[SEOAgent] Image cached to storage:', publicUrl?.substring(0, 80));
    return publicUrl || null;
  } catch (error: any) {
    console.error('[SEOAgent] Image caching failed:', error.message);
    return null;
  }
}

/**
 * Generate an image using Seedream for SEO articles (internal, no credits).
 * Returns a permanent Supabase Storage URL (not the temporary Seedream CDN URL).
 */
async function generateSeoImage(prompt: string, slug?: string, index: number = 0): Promise<string | null> {
  try {
    const optimizedPrompt = `Ultra high quality professional photograph for a premium blog article. ${prompt}. Shot on Canon EOS R5, 85mm f/1.4 lens, natural lighting, cinematic color grading. Editorial magazine style, clean composition, rich colors, sharp details. Absolutely no text, no letters, no words, no numbers, no writing, no signs, no labels, no watermarks, no logos in the image. Pure visual only. Wide horizontal format.`;

    const response = await fetch(SEEDREAM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SEEDREAM_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'seedream-4-5-251128',
        prompt: optimizedPrompt,
        size: '2560x1440',
        response_format: 'url',
        seed: -1,
        watermark: false,
      }),
    });

    if (!response.ok) {
      console.error('[SEOAgent] Seedream error:', response.status, await response.text().catch(() => ''));
      return null;
    }

    const data = await response.json();
    const tempUrl = data?.data?.[0]?.url;
    if (!tempUrl) return null;

    console.log('[SEOAgent] Seedream image generated, caching to storage...');

    // Cache to Supabase Storage for permanent URL
    const permanentUrl = await cacheImageToStorage(tempUrl, slug || 'article', index);
    if (permanentUrl) return permanentUrl;

    // Fallback to temporary URL if caching fails
    console.warn('[SEOAgent] Caching failed, using temporary URL (will expire)');
    return tempUrl;
  } catch (error: any) {
    console.error('[SEOAgent] Seedream generation failed:', error.message);
    return null;
  }
}

/**
 * Post-process article HTML: find <img data-seo-generate="true"> tags and generate real images.
 */
async function processArticleImages(contentHtml: string, imagePrompts?: Array<{ alt: string; prompt: string }>, slug?: string): Promise<string> {
  let html = contentHtml;

  // STEP 0: Convert any markdown images ![alt](url) or ![alt] to HTML <img> placeholders
  // Gemini sometimes outputs markdown instead of HTML despite instructions
  // Pattern 1: ![alt text](url) — replace with <img src="url" alt="alt text">
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
    if (url.startsWith('http')) {
      return `<img src="${url}" alt="${alt}" style="width:100%;border-radius:8px;margin:16px 0;" loading="lazy" />`;
    }
    return `<img data-seo-generate="true" alt="${alt}" />`;
  });
  // Pattern 2: ![alt text] alone (no URL) — treat as placeholder for generation
  html = html.replace(/!\[([^\]]{10,})\](?!\()/g, (_, alt) => {
    return `<img data-seo-generate="true" alt="${alt}" />`;
  });

  // STEP 1: Use explicit image_prompts from the article JSON
  const seoImgRegex = /<img\s+[^>]*data-seo-generate\s*=\s*"true"[^>]*\/?>/gi;

  if (imagePrompts && imagePrompts.length > 0) {
    let match;
    let promptIndex = 0;

    while ((match = seoImgRegex.exec(html)) !== null && promptIndex < imagePrompts.length) {
      const fullTag = match[0];
      const imgPrompt = imagePrompts[promptIndex];

      console.log(`[SEOAgent] Generating image ${promptIndex + 1}/${imagePrompts.length}: "${imgPrompt.prompt.substring(0, 80)}..."`);
      const imageUrl = await generateSeoImage(imgPrompt.prompt, slug, promptIndex);

      if (imageUrl) {
        const newTag = `<img src="${imageUrl}" alt="${imgPrompt.alt}" style="width:100%;border-radius:8px;margin:16px 0;" loading="lazy" />`;
        html = html.replace(fullTag, newTag);
        seoImgRegex.lastIndex = 0;
      }
      promptIndex++;
    }
  }

  // STEP 2: Handle remaining placeholder tags (use alt as prompt)
  const remainingRegex = /<img\s+[^>]*data-seo-generate\s*=\s*"true"[^>]*\/?>/gi;
  let remainingMatch;
  let fallbackIndex = 10;
  while ((remainingMatch = remainingRegex.exec(html)) !== null) {
    const fullTag = remainingMatch[0];
    const altMatch = fullTag.match(/alt\s*=\s*"([^"]*)"/i);
    const altText = altMatch ? altMatch[1] : 'professional commercial photo for blog article';

    console.log(`[SEOAgent] Generating fallback image from alt: "${altText.substring(0, 80)}..."`);
    const imageUrl = await generateSeoImage(altText, slug, fallbackIndex++);

    if (imageUrl) {
      const newTag = `<img src="${imageUrl}" alt="${altText}" style="width:100%;border-radius:8px;margin:16px 0;" loading="lazy" />`;
      html = html.replace(fullTag, newTag);
      remainingRegex.lastIndex = 0;
    }
  }

  return html;
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

  // Optional org_id passthrough for multi-tenant support
  const orgId = request.nextUrl.searchParams.get('org_id') || null;

  // Cron trigger: auto-generate next article
  if (isCron) {
    console.log('[SEOAgent] Cron triggered — generating next article');
    // Generate article first
    const articleResult = await generateArticle(null, orgId);
    // Then execute any pending orders
    try {
      await executeOrders();
    } catch (e) {
      console.warn('[SEOAgent] Order execution after cron failed:', e);
    }
    return articleResult;
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

    // Optional org_id passthrough for multi-tenant support
    const orgId = body?.org_id || null;

    switch (action) {
      case 'generate_article':
        return generateArticle(body.keyword || null, orgId);

      case 'calendar':
        return generateCalendar();

      case 'publish':
        return publishArticle(body.article_id);

      case 'update_article':
        return updateArticle(body.article_id, body.updates);

      case 'revise_article':
        return reviseArticle(body.article_id, body.instructions);

      case 'execute_orders':
        return executeOrders();

      case 'regenerate_images':
        return regenerateArticleImages(body.article_id);

      case 'delete_article': {
        if (!body.article_id) return NextResponse.json({ ok: false, error: 'article_id requis' }, { status: 400 });
        const supabase = getSupabaseAdmin();
        const { error } = await supabase.from('blog_posts').delete().eq('id', body.article_id);
        if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true, deleted: true });
      }

      case 'refresh_all_articles':
        return refreshAllArticles(body.limit || 5);

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
async function generateArticle(keyword: string | null, orgId: string | null = null): Promise<NextResponse> {
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
    const { prompt: crmContext } = await loadContextWithAvatar(supabase, 'seo', orgId || undefined);

    // Fetch Google Search Console data for data-driven SEO
    let gscContext = '';
    try {
      const gscReport = await getGscReport();
      if (gscReport.topKeywords.length > 0) {
        gscContext = `\n\nDONNÉES GOOGLE SEARCH CONSOLE (données réelles des 28 derniers jours) :
TOP MOTS-CLÉS (par clics) :
${gscReport.topKeywords.slice(0, 15).map(k => `- "${k.query}" → ${k.clicks} clics, ${k.impressions} impressions, CTR ${(k.ctr * 100).toFixed(1)}%, position ${k.position.toFixed(1)}`).join('\n')}

OPPORTUNITÉS (haute impression, faible CTR — à cibler) :
${gscReport.opportunities.slice(0, 10).map(k => `- "${k.query}" → position ${k.position.toFixed(1)}, ${k.impressions} impressions, CTR ${(k.ctr * 100).toFixed(1)}% (AMÉLIORER)`).join('\n')}

PERFORMANCE GLOBALE : ${gscReport.summary.totalClicks} clics, ${gscReport.summary.totalImpressions} impressions, CTR moyen ${(gscReport.summary.avgCtr * 100).toFixed(1)}%, position moyenne ${gscReport.summary.avgPosition.toFixed(1)}`;
        console.log(`[SEOAgent] GSC data loaded: ${gscReport.topKeywords.length} keywords, ${gscReport.opportunities.length} opportunities`);
      }
    } catch (gscError: any) {
      console.warn('[SEOAgent] GSC data unavailable:', gscError.message);
    }

    // Call Gemini 2.0 Flash with elite prompt + CRM data
    const rawText = await callGemini({
      system: getSeoWriterPrompt(),
      message: `Ecris un article de blog SEO optimise pour le mot-cle principal : "${targetKeyword}"

DONNÉES BUSINESS EN TEMPS RÉEL (utilise-les pour rendre l'article crédible et data-driven) :
${crmContext}
${gscContext}

Contexte supplementaire :
- KeiroAI permet de generer des visuels marketing en quelques secondes grace a l'IA
- La plateforme cible les commerces locaux et entrepreneurs (restaurants, boutiques, coaches, coiffeurs, freelances, artisans, pros, agences, PME)
- URL du site : https://www.keiroai.com
- Plans : Essai gratuit 30j (tous les agents, carte requise, 0€ débité), puis Créateur 49€/mois, Pro 99€/mois, Fondateurs 149€/mois, Business 199€, Elite 999€
- L'article sera publie sur le blog de KeiroAI
- Date : ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}

IMPORTANT: Le JSON doit etre COMPLET. Ne tronque pas content_html. Si tu manques de place, ecris un article plus court (1200 mots min) plutot que de tronquer le JSON.

Genere le JSON complet comme specifie dans tes instructions.`,
      maxTokens: 12000,
    });
    console.log('[SEOAgent] Raw response length:', rawText.length);

    // Parse JSON — robust parser that handles truncated responses
    let article: any;
    try {
      const cleanArticleText = rawText.replace(/```[\w]*\s*/g, '').trim();

      // Method 1: standard regex match
      const jsonMatch = cleanArticleText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          article = JSON.parse(jsonMatch[0]);
        } catch {
          // JSON is truncated — try to salvage
          console.warn('[SEOAgent] JSON truncated, attempting salvage...');
        }
      }

      // Method 2: balanced brace extraction (handles truncated content_html)
      if (!article) {
        let depth = 0, start = -1, inString = false, escaped = false;
        let lastComplete = -1;

        for (let i = 0; i < cleanArticleText.length; i++) {
          const ch = cleanArticleText[i];
          if (escaped) { escaped = false; continue; }
          if (ch === '\\') { escaped = true; continue; }
          if (ch === '"') { inString = !inString; continue; }
          if (inString) continue;
          if (ch === '{') { if (depth === 0) start = i; depth++; }
          else if (ch === '}') {
            depth--;
            if (depth === 0 && start >= 0) { lastComplete = i; break; }
          }
        }

        if (lastComplete >= 0 && start >= 0) {
          try {
            article = JSON.parse(cleanArticleText.substring(start, lastComplete + 1));
            console.log('[SEOAgent] Salvaged complete JSON object');
          } catch { /* still broken */ }
        }
      }

      // Method 3: truncation repair — close unclosed strings and braces
      if (!article) {
        const firstBrace = cleanArticleText.indexOf('{');
        if (firstBrace >= 0) {
          let partial = cleanArticleText.substring(firstBrace);

          // If content_html is truncated mid-value, close the string
          // Find last complete key-value pair
          const fieldOrder = ['image_prompts', 'internal_links', 'schema_faq', 'keywords', 'excerpt', 'content_html', 'h1', 'slug', 'meta_description', 'meta_title'];
          for (const field of fieldOrder) {
            const fieldIdx = partial.lastIndexOf(`"${field}"`);
            if (fieldIdx > 0) {
              // Check if this field's value is complete
              const colonIdx = partial.indexOf(':', fieldIdx);
              if (colonIdx < 0) continue;

              // Try truncating after this field and closing
              const beforeField = partial.substring(0, fieldIdx).replace(/,\s*$/, '');
              try {
                const repaired = beforeField + '}';
                article = JSON.parse(repaired);
                console.log(`[SEOAgent] Repaired JSON by truncating at "${field}"`);
                break;
              } catch { /* try next field */ }
            }
          }
        }
      }

      if (!article) {
        throw new Error('Could not parse article JSON after all salvage attempts');
      }
    } catch (parseError) {
      console.error('[SEOAgent] Failed to parse article JSON:', parseError);
      console.error('[SEOAgent] Raw text preview:', rawText.substring(0, 300), '...', rawText.substring(rawText.length - 300));

      await supabase.from('agent_logs').insert({
        agent: 'seo',
        action: 'article_generation_failed',
        data: { keyword: targetKeyword, raw_start: rawText.substring(0, 500), raw_end: rawText.substring(rawText.length - 500), error: String(parseError) },
        status: 'error',
        error_message: String(parseError),
        created_at: now,
      });

      return NextResponse.json({ ok: false, error: 'Echec du parsing JSON de l\'article' }, { status: 500 });
    }

    // Validate required fields before insert
    if (!article.content_html || article.content_html.length < 100) {
      console.error('[SEOAgent] Article content_html is missing or too short:', article.content_html?.length || 0);
      await supabase.from('agent_logs').insert({
        agent: 'seo',
        action: 'article_generation_failed',
        data: { keyword: targetKeyword, error: 'content_html missing or too short', parsed_keys: Object.keys(article) },
        status: 'error',
        error_message: 'content_html is null or too short',
        created_at: now,
      });
      return NextResponse.json({ ok: false, error: 'L\'article genere n\'a pas de contenu HTML valide. Reessayez.' }, { status: 500 });
    }

    if (!article.slug) {
      article.slug = (targetKeyword || 'article')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 60);
    }

    // Ensure slug uniqueness — append -2, -3, etc. if already taken
    {
      const baseSlug = article.slug;
      let suffix = 1;
      let maxAttempts = 10;
      while (maxAttempts-- > 0) {
        const { data: existing } = await supabase
          .from('blog_posts')
          .select('id')
          .eq('slug', article.slug)
          .limit(1)
          .maybeSingle();
        if (!existing) break;
        suffix++;
        article.slug = `${baseSlug}-${suffix}`.substring(0, 63);
      }
      // Extra safety: append timestamp if still colliding
      if (maxAttempts <= 0) {
        article.slug = `${baseSlug}-${Date.now().toString(36)}`.substring(0, 63);
      }
    }

    // Store in blog_posts
    const { data: inserted, error: insertError } = await supabase
      .from('blog_posts')
      .insert({
        slug: article.slug,
        title: article.h1 || article.meta_title || targetKeyword,
        meta_title: article.meta_title || article.h1 || targetKeyword,
        meta_description: article.meta_description || article.excerpt || '',
        content_html: article.content_html,
        excerpt: article.excerpt || article.meta_description || '',
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

    // Generate Seedream images for the article
    let finalHtml = article.content_html;
    try {
      console.log('[SEOAgent] Processing article images with Seedream...');
      finalHtml = await processArticleImages(article.content_html, article.image_prompts, article.slug);

      if (finalHtml !== article.content_html) {
        await supabase
          .from('blog_posts')
          .update({ content_html: finalHtml, updated_at: new Date().toISOString() })
          .eq('id', inserted.id);
        console.log('[SEOAgent] Article images generated and updated');
      }
    } catch (imgError: any) {
      console.warn('[SEOAgent] Image generation failed (article saved without images):', imgError.message);
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

    // ── Save learnings from SEO ──
    try {
      await saveLearning(supabase, {
        agent: 'seo',
        category: 'seo',
        learning: `Article SEO généré: "${article.meta_title || article.h1 || targetKeyword}" — ${article.content_html?.split(/\s+/).length || 'N/A'} mots, keyword: ${targetKeyword}`,
        evidence: `Article published: slug=${article.slug}, keyword=${targetKeyword}, cluster=${article.keywords?.primary || 'unknown'}`,
        confidence: 20,
      }, orgId);
    } catch (learnErr: any) {
      console.warn('[SEOAgent] Learning save error:', learnErr.message);
    }

    // ── Feedback to CEO ──
    try {
      await saveAgentFeedback(supabase, {
        from_agent: 'seo',
        to_agent: 'ceo',
        feedback: `Article SEO généré: "${article.meta_title || article.h1 || targetKeyword}" (${article.content_html?.split(/\s+/).length || 'N/A'} mots). Keyword: ${targetKeyword}. Slug: ${article.slug}. Statut: draft.`,
        category: 'seo',
      }, orgId);
    } catch (fbErr: any) {
      console.warn('[SEOAgent] Feedback save error:', fbErr.message);
    }

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
      // Upsert to avoid duplicate key errors when calendar is regenerated
      const { error: calError } = await supabase.from('blog_editorial_calendar').upsert({
        week_start: weekStart,
        day: entry.day,
        keyword_primary: entry.keyword_primary,
        angle: entry.angle,
        target_business: entry.target_business,
        status: 'planned',
        created_at: nowISO,
      }, { onConflict: 'week_start,day,keyword_primary', ignoreDuplicates: true });
      if (calError) {
        console.warn('[SEO] Calendar insert warning:', calError.message);
      }
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

    // Notify Google Indexing API (fire-and-forget)
    try {
      const articleUrl = `https://www.keiroai.com/blog/${article.slug}`;
      const googleClientId = process.env.GOOGLE_CLIENT_ID;
      const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const googleRefreshToken = process.env.GOOGLE_REFRESH_TOKEN;
      if (googleClientId && googleClientSecret && googleRefreshToken) {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: googleClientId,
            client_secret: googleClientSecret,
            refresh_token: googleRefreshToken,
            grant_type: 'refresh_token',
          }),
        });
        const tokenData = await tokenRes.json();
        if (tokenData.access_token) {
          const indexRes = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${tokenData.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: articleUrl, type: 'URL_UPDATED' }),
          });
          const indexData = await indexRes.json();
          console.log(`[SEOAgent] Google Indexing API notified for ${articleUrl}:`, indexData);
        }
      } else {
        console.log('[SEOAgent] Google credentials not configured — skipping Indexing API');
      }
    } catch (indexErr: any) {
      console.warn('[SEOAgent] Google Indexing API notification failed:', indexErr.message);
    }

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
- image_prompts (array, optionnel) : si tu ajoutes de NOUVELLES images, fournis un array [{alt: "description SEO", prompt: "prompt visuel détaillé pour Seedream"}]

IMAGES — TRÈS IMPORTANT :
- Si les instructions demandent plus d'images, AJOUTE des balises <img data-seo-generate="true" alt="description visuelle détaillée de 30+ mots pour Seedream" /> dans le content_html
- Place les images APRÈS chaque section <h2> et après l'intro pour un rendu très visuel style Medium/Substack
- Le alt doit être ultra descriptif (30+ mots) car il sert de prompt pour la génération d'image IA
- JAMAIS de texte dans les descriptions d'images (le générateur ne gère pas le texte)
- Style : photos réalistes, éditorial magazine, lumière naturelle, composition cinématique
- Les images existantes (avec src=) doivent être CONSERVÉES telles quelles
- Minimum 5-7 images pour un article complet et visuellement riche

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
      maxTokens: 12000,
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
    if (revised.meta_title) updateFields.meta_title = revised.meta_title;
    if (revised.meta_description) updateFields.meta_description = revised.meta_description;
    if (revised.excerpt) updateFields.excerpt = revised.excerpt;

    // Process images in revised content — generate Seedream images for new placeholders
    if (revised.content_html) {
      let finalHtml = revised.content_html;
      const hasPlaceholders = /<img\s+[^>]*data-seo-generate\s*=\s*"true"[^>]*\/?>/i.test(finalHtml);
      if (hasPlaceholders) {
        console.log('[SEOAgent] Revision contains image placeholders, generating Seedream images...');
        try {
          finalHtml = await processArticleImages(finalHtml, revised.image_prompts, article.slug);
          console.log('[SEOAgent] Revision images generated successfully');
        } catch (imgError: any) {
          console.warn('[SEOAgent] Revision image generation failed:', imgError.message);
        }
      }
      updateFields.content_html = finalHtml;
    }

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

/**
 * Refresh all published articles: make them more airy/visual, improve SEO, add internal links.
 * Processes articles one by one via Gemini revision, regenerates new images.
 */
async function refreshAllArticles(limit: number): Promise<NextResponse> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  // Fetch all published articles, oldest first
  const { data: articles, error } = await supabase
    .from('blog_posts')
    .select('id, title, slug, content_html, meta_title, meta_description, keywords_primary, updated_at')
    .eq('status', 'published')
    .order('updated_at', { ascending: true })
    .limit(limit);

  if (error || !articles?.length) {
    return NextResponse.json({ ok: true, message: 'Aucun article à rafraîchir', refreshed: 0 });
  }

  // Fetch all article slugs/titles for internal links
  const { data: allPosts } = await supabase
    .from('blog_posts')
    .select('slug, title, keywords_primary')
    .eq('status', 'published');

  const internalLinksContext = (allPosts || [])
    .map((p: any) => `- /blog/${p.slug} : "${p.title}" (mot-clé: ${p.keywords_primary || ''})`)
    .join('\n');

  // Get GSC data for keyword context
  let gscContext = '';
  try {
    const gscData = await getGscReport();
    if (gscData) {
      gscContext = `\nDonnées Google Search Console :\n${JSON.stringify(gscData).substring(0, 2000)}`;
    }
  } catch { /* ignore */ }

  const results: { id: string; title: string; ok: boolean; error?: string }[] = [];

  for (const article of articles) {
    try {
      console.log(`[SEOAgent] Refreshing article: "${article.title}" (${article.id})`);

      const rawText = await callGemini({
        system: `Tu es un rédacteur SEO expert et designer éditorial. Ta mission : AMÉLIORER un article existant pour le rendre :

1. PLUS AÉRÉ VISUELLEMENT :
   - Paragraphes courts (3-4 lignes max)
   - Espacement généreux entre sections
   - Sous-titres h2 et h3 clairs et engageants
   - Listes à puces quand pertinent
   - Blockquotes pour les stats ou insights clés
   - AJOUTER des balises <img data-seo-generate="true" alt="description ultra détaillée de 30+ mots pour Seedream, style photo magazine"> après chaque h2 et après l'intro
   - Minimum 5-7 images dans l'article

2. OPTIMISÉ SEO :
   - Mot-clé principal naturellement intégré (titre, h2, intro, conclusion)
   - Meta title < 60 chars, meta description < 155 chars avec CTA
   - Questions dans les h2 (People Also Ask)
   - Schema FAQ : 3-5 questions/réponses pertinentes

3. LIENS INTERNES vers les autres articles du blog :
${internalLinksContext}
   - Ajoute 2-4 liens internes pertinents dans le texte (balises <a href="/blog/slug">ancre naturelle</a>)
   - Ancres naturelles, pas "cliquez ici"

4. STYLE :
   - Ton professionnel mais accessible, tutoiement
   - Phrases d'accroche engageantes
   - CTA vers keiroai.com dans la conclusion
   - Style Medium/Substack : agréable à lire, aéré, visuel
${gscContext}

IMAGES — TRÈS IMPORTANT :
- Les images existantes avec src= Supabase (supabase.co) doivent être CONSERVÉES
- Les images avec src= ark.ap-southeast.bytepluses.com sont EXPIRÉES → remplace-les par <img data-seo-generate="true" alt="...">
- Le alt DOIT être ultra descriptif (30+ mots) car il sert de PROMPT pour le générateur d'image IA
- JAMAIS de texte/lettres/mots dans les descriptions d'images
- Style : photo réaliste éditoriale, lumière naturelle, Canon EOS R5

Retourne UNIQUEMENT un JSON :
{
  "title": "...",
  "content_html": "...",
  "meta_title": "...",
  "meta_description": "...",
  "excerpt": "...",
  "schema_faq": [{"question": "...", "answer": "..."}]
}`,
        message: `Article à améliorer :

Titre : ${article.title}
Mot-clé principal : ${article.keywords_primary || ''}
Meta title : ${article.meta_title || ''}
Meta description : ${article.meta_description || ''}

Contenu HTML actuel :
${article.content_html}

Améliore cet article : plus aéré, plus visuel, mieux optimisé SEO, avec des liens internes.`,
        maxTokens: 12000,
      });

      // Parse JSON
      let revised: any;
      const cleanText = rawText.replace(/```[\w]*\s*/g, '');
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        revised = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON in Gemini response');
      }

      // Process images
      let finalHtml = revised.content_html || article.content_html;
      const hasPlaceholders = /<img\s+[^>]*data-seo-generate\s*=\s*"true"[^>]*\/?>/i.test(finalHtml);
      if (hasPlaceholders) {
        console.log(`[SEOAgent] Generating images for "${article.title}"...`);
        try {
          finalHtml = await processArticleImages(finalHtml, revised.image_prompts, article.slug);
        } catch (imgErr: any) {
          console.warn(`[SEOAgent] Image gen failed for "${article.title}":`, imgErr.message);
        }
      }

      // Update
      const updateFields: Record<string, any> = {
        content_html: finalHtml,
        updated_at: now,
      };
      if (revised.title) updateFields.title = revised.title;
      if (revised.meta_title) updateFields.meta_title = revised.meta_title;
      if (revised.meta_description) updateFields.meta_description = revised.meta_description;
      if (revised.excerpt) updateFields.excerpt = revised.excerpt;
      if (revised.schema_faq?.length) updateFields.schema_faq = revised.schema_faq;

      await supabase.from('blog_posts').update(updateFields).eq('id', article.id);
      results.push({ id: article.id, title: article.title, ok: true });
      console.log(`[SEOAgent] ✅ Refreshed "${article.title}"`);

    } catch (err: any) {
      console.error(`[SEOAgent] ❌ Failed to refresh "${article.title}":`, err.message);
      results.push({ id: article.id, title: article.title, ok: false, error: err.message });
    }
  }

  await supabase.from('agent_logs').insert({
    agent: 'seo',
    action: 'refresh_all_articles',
    data: { total: articles.length, succeeded: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results },
    status: results.every(r => r.ok) ? 'success' : 'partial',
    created_at: now,
  });

  return NextResponse.json({
    ok: true,
    refreshed: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    results,
  });
}

/**
 * Regenerate broken/expired images in an article.
 * Finds images with temporary Seedream CDN URLs and replaces them with permanent Supabase Storage URLs.
 */
async function regenerateArticleImages(articleId: string): Promise<NextResponse> {
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

    let html = article.content_html || '';
    let fixed = 0;
    let failed = 0;

    // Find all img tags with temporary Seedream/BytePlus URLs
    const tempImgRegex = /<img\s+[^>]*src=["'](https:\/\/ark\.ap-southeast\.bytepluses\.com[^"']+)["'][^>]*\/?>/gi;
    let match;
    const replacements: Array<{ fullTag: string; newTag: string }> = [];

    while ((match = tempImgRegex.exec(html)) !== null) {
      const fullTag = match[0];
      const tempUrl = match[1];
      const altMatch = fullTag.match(/alt=["']([^"']*)["']/);
      const alt = altMatch ? altMatch[1] : article.title;

      console.log(`[SEOAgent] Re-caching expired image: ${tempUrl.substring(0, 80)}...`);

      // Try to re-cache the existing URL first (in case it hasn't expired yet)
      let permanentUrl = await cacheImageToStorage(tempUrl, article.slug, fixed);

      if (!permanentUrl) {
        // URL expired — regenerate from alt text
        console.log(`[SEOAgent] URL expired, regenerating from alt: "${alt.substring(0, 60)}"`);
        permanentUrl = await generateSeoImage(alt, article.slug, fixed + 100);
      }

      if (permanentUrl) {
        const newTag = fullTag.replace(tempUrl, permanentUrl);
        replacements.push({ fullTag, newTag });
        fixed++;
      } else {
        failed++;
      }
    }

    // Also handle placeholder tags that were never replaced (flexible attribute order)
    const placeholderRegex = /<img\s+[^>]*data-seo-generate\s*=\s*"true"[^>]*\/?>/gi;
    while ((match = placeholderRegex.exec(html)) !== null) {
      const fullTag = match[0];
      const altMatch = fullTag.match(/alt\s*=\s*"([^"]*)"/i);
      const alt = altMatch ? altMatch[1] : article.title;
      console.log(`[SEOAgent] Generating missing image: "${alt.substring(0, 60)}"`);
      const imageUrl = await generateSeoImage(alt, article.slug, fixed + 200);
      if (imageUrl) {
        const newTag = `<img src="${imageUrl}" alt="${alt}" style="width:100%;border-radius:8px;margin:16px 0;" loading="lazy" />`;
        replacements.push({ fullTag, newTag });
        fixed++;
      } else {
        failed++;
      }
    }

    // Apply replacements
    for (const r of replacements) {
      html = html.replace(r.fullTag, r.newTag);
    }

    if (fixed > 0) {
      await supabase.from('blog_posts').update({ content_html: html, updated_at: now }).eq('id', articleId);
    }

    await supabase.from('agent_logs').insert({
      agent: 'seo',
      action: 'images_regenerated',
      data: { article_id: articleId, slug: article.slug, fixed, failed },
      status: fixed > 0 ? 'success' : 'error',
      created_at: now,
    });

    console.log(`[SEOAgent] Images regenerated for "${article.slug}": ${fixed} fixed, ${failed} failed`);

    return NextResponse.json({ ok: true, fixed, failed, article_id: articleId });
  } catch (error: any) {
    console.error('[SEOAgent] regenerateArticleImages error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

/**
 * Execute pending orders directed at the SEO agent.
 * Orders come from CEO/Marketing agents (e.g., "more visuals", "target keyword X").
 */
async function executeOrders(): Promise<NextResponse> {
  try {
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    // Get pending orders for SEO agent
    const { data: orders } = await supabase
      .from('agent_orders')
      .select('*')
      .eq('target_agent', 'seo')
      .eq('status', 'pending')
      .order('priority', { ascending: true })
      .limit(5);

    if (!orders || orders.length === 0) {
      return NextResponse.json({ ok: true, message: 'Aucun ordre en attente', executed: 0 });
    }

    const results: Array<{ order_id: string; action: string; ok: boolean; detail?: string }> = [];

    for (const order of orders) {
      const instruction = (order.instruction || order.description || '').toLowerCase();
      console.log(`[SEOAgent] Executing order: "${instruction.substring(0, 100)}"`);

      try {
        if (instruction.includes('visuel') || instruction.includes('image') || instruction.includes('photo')) {
          // Order: generate more visuals for existing articles
          const { data: articlesWithoutImages } = await supabase
            .from('blog_posts')
            .select('id, slug, content_html, title')
            .eq('status', 'published')
            .order('updated_at', { ascending: true })
            .limit(3);

          let imagesGenerated = 0;
          for (const art of (articlesWithoutImages || [])) {
            if (!art.content_html) continue;
            // Check if article has few images
            const imgCount = (art.content_html.match(/<img/gi) || []).length;
            if (imgCount < 2) {
              const imageUrl = await generateSeoImage(`Professional editorial photo for blog article about: ${art.title}. Marketing, business, local commerce, modern and vibrant.`, art.slug, imagesGenerated);
              if (imageUrl) {
                const imgTag = `<img src="${imageUrl}" alt="${art.title}" style="width:100%;border-radius:8px;margin:16px 0;" loading="lazy" />`;
                // Insert image after first h2
                const updatedHtml = art.content_html.replace(/<\/h2>/, `</h2>${imgTag}`);
                await supabase.from('blog_posts').update({ content_html: updatedHtml, updated_at: now }).eq('id', art.id);
                imagesGenerated++;
              }
            }
          }
          results.push({ order_id: order.id, action: 'add_visuals', ok: true, detail: `${imagesGenerated} images ajoutées` });
        } else if (instruction.includes('article') || instruction.includes('keyword') || instruction.includes('mot-cl')) {
          // Order: generate a new article (optionally with a specific keyword)
          const keywordMatch = instruction.match(/(?:keyword|mot-cl[ée]s?)\s*:?\s*["']?([^"'\n,]+)/i);
          const keyword = keywordMatch ? keywordMatch[1].trim() : null;
          const articleResult = await generateArticle(keyword);
          const articleData = await articleResult.json();
          results.push({ order_id: order.id, action: 'generate_article', ok: articleData.ok, detail: articleData.article?.slug || articleData.error });
        } else {
          // Generic order: try to interpret as article revision
          results.push({ order_id: order.id, action: 'unknown', ok: false, detail: `Instruction non reconnue: ${instruction.substring(0, 100)}` });
        }

        // Mark order as completed
        await supabase.from('agent_orders').update({
          status: 'completed',
          completed_at: now,
          result: results[results.length - 1],
        }).eq('id', order.id);
      } catch (orderError: any) {
        results.push({ order_id: order.id, action: 'error', ok: false, detail: orderError.message });
        await supabase.from('agent_orders').update({
          status: 'failed',
          completed_at: now,
          result: { error: orderError.message },
        }).eq('id', order.id);
      }
    }

    // Log execution
    await supabase.from('agent_logs').insert({
      agent: 'seo',
      action: 'orders_executed',
      data: { total: orders.length, results },
      status: results.every(r => r.ok) ? 'success' : 'partial',
      created_at: now,
    });

    return NextResponse.json({ ok: true, executed: results.length, results });
  } catch (error: any) {
    console.error('[SEOAgent] executeOrders error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
