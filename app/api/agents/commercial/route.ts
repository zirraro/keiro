import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getCommercialSystemPrompt } from '@/lib/agents/commercial-prompt';
import { callGemini, callGeminiWithSearch } from '@/lib/agents/gemini';
import { loadSharedContext, formatContextForPrompt } from '@/lib/agents/shared-context';
import { calculateScore, calculateTemperature } from '@/lib/agents/scoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

const MAX_PROSPECTS_PER_RUN = 15;
const MAX_SEARCH_ENRICHMENT = 10;

/**
 * Helper: verify admin auth or CRON_SECRET.
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
 * Valid business types for KeiroAI prospects.
 */
const VALID_TYPES = [
  'restaurant', 'boutique', 'coach', 'coiffeur', 'caviste', 'fleuriste',
  'traiteur', 'freelance', 'services', 'professionnel', 'agence', 'pme',
];

interface EnrichmentResult {
  type: string | null;
  type_confidence: number;
  quartier: string | null;
  quartier_confidence: number;
  email_valid: boolean;
  email_flags: string[];
  data_completeness_score: number;
  ready_to_contact: boolean;
  disqualification_reason: string | null;
  priority_score: number;
  reasoning: string;
}

interface SocialSearchResult {
  instagram: string | null;
  tiktok: string | null;
  website: string | null;
  google_rating: number | null;
  google_reviews: number | null;
  phone: string | null;
  address: string | null;
  description: string | null;
  confidence: number;
}

/**
 * Search Google for a prospect's social media profiles, website, and Google Maps data.
 * Uses Gemini with Google Search grounding.
 */
async function searchSocialProfiles(prospect: {
  company: string | null;
  quartier: string | null;
  type: string | null;
  email: string | null;
}): Promise<SocialSearchResult | null> {
  if (!prospect.company) return null;

  const location = prospect.quartier || 'Paris';
  const businessType = prospect.type || 'commerce';

  try {
    const rawText = await callGeminiWithSearch({
      system: `Tu es un assistant de recherche commerciale. Tu dois trouver les informations en ligne d'un commerce local français.

RECHERCHE EXACTEMENT CES INFORMATIONS :
1. Compte Instagram (handle exact avec @, pas un lien)
2. Compte TikTok (handle exact avec @)
3. Site web officiel (URL complète)
4. Note Google Maps et nombre d'avis
5. Numéro de téléphone
6. Adresse physique
7. Description courte de l'activité

RÈGLES :
- Ne retourne QUE des informations TROUVÉES et VÉRIFIÉES via la recherche
- Si tu ne trouves pas un champ, mets null
- Pour Instagram/TikTok, donne UNIQUEMENT le handle (ex: @restaurant_paris) sans le lien
- La note Google doit être un nombre entre 1.0 et 5.0
- Ne confonds pas avec des homonymes — vérifie que c'est bien le commerce dans la bonne ville

Réponds UNIQUEMENT en JSON valide :
{
  "instagram": "@handle" | null,
  "tiktok": "@handle" | null,
  "website": "https://..." | null,
  "google_rating": 4.5 | null,
  "google_reviews": 123 | null,
  "phone": "+33..." | null,
  "address": "12 rue..." | null,
  "description": "..." | null,
  "confidence": 0-100
}`,
      message: `Recherche les informations en ligne de ce commerce :
- Nom : ${prospect.company}
- Type : ${businessType}
- Localisation : ${location}
- Email : ${prospect.email || '(inconnu)'}

Cherche sur Google Maps, Instagram, TikTok, et le web en général.`,
      maxTokens: 600,
    });

    // Strip markdown code fences if present
    const cleanText = rawText.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/gi, '');
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const result: SocialSearchResult = JSON.parse(jsonMatch[0]);

    // Validate handles format
    if (result.instagram && !result.instagram.startsWith('@')) {
      result.instagram = '@' + result.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '');
    }
    if (result.tiktok && !result.tiktok.startsWith('@')) {
      result.tiktok = '@' + result.tiktok.replace(/^https?:\/\/(www\.)?tiktok\.com\/@?/, '').replace(/\/$/, '');
    }

    // Clean Instagram handle (remove @ for DB storage)
    if (result.instagram) {
      result.instagram = result.instagram.replace(/^@/, '');
    }
    if (result.tiktok) {
      result.tiktok = result.tiktok.replace(/^@/, '');
    }

    return result;
  } catch (error: any) {
    console.error(`[CommercialAgent] Google search error for ${prospect.company}:`, error.message);
    return null;
  }
}

/**
 * Enrich a single prospect using Gemini (data analysis, no web search).
 */
async function enrichProspect(prospect: {
  id: string;
  email: string | null;
  first_name: string | null;
  company: string | null;
  type: string | null;
  quartier: string | null;
  note_google: number | null;
}): Promise<EnrichmentResult | null> {
  if (!process.env.GEMINI_API_KEY) return null;

  const prospectAnalysisPrompt = `Analyse ce prospect et enrichis les données manquantes :

Données actuelles :
- Entreprise : ${prospect.company || '(vide)'}
- Email : ${prospect.email || '(vide)'}
- Prénom : ${prospect.first_name || '(vide)'}
- Type de commerce : ${prospect.type || '(vide - À DÉTERMINER)'}
- Quartier : ${prospect.quartier || '(vide - À DÉTERMINER SI POSSIBLE)'}
- Note Google : ${prospect.note_google ?? '(vide)'}

${!prospect.type ? 'PRIORITÉ : détermine le type de commerce à partir du nom de l\'entreprise et de l\'email.' : ''}
${!prospect.quartier ? 'Si possible, déduis le quartier/ville à partir du nom ou de l\'email.' : ''}
${prospect.email ? 'Vérifie la validité de l\'email (format, domaine jetable, patterns suspects).' : 'ATTENTION : pas d\'email fourni, email_valid = false.'}

Réponds UNIQUEMENT en JSON valide, sans markdown, sans explication hors du JSON.`;

  try {
    const rawText = await callGemini({
      system: getCommercialSystemPrompt(),
      message: prospectAnalysisPrompt,
      maxTokens: 500,
    });

    // Strip markdown code fences if present
    const cleanText = rawText.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/gi, '');
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[CommercialAgent] No JSON found in response:', rawText.substring(0, 200));
      return null;
    }

    const result: EnrichmentResult = JSON.parse(jsonMatch[0]);
    return result;
  } catch (error: any) {
    console.error(`[CommercialAgent] Error enriching prospect ${prospect.id}:`, error.message);
    return null;
  }
}

/**
 * GET /api/agents/commercial
 * - Cron (CRON_SECRET): run enrichment pipeline
 * - Admin: return last enrichment report
 */
export async function GET(request: NextRequest) {
  const { authorized, isCron } = await verifyAuth(request);
  if (!authorized) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (isCron) {
    console.log('[CommercialAgent] Cron triggered — running enrichment + social search pipeline');
    return runEnrichment();
  }

  // Admin UI: return last enrichment report
  try {
    const supabase = getSupabaseAdmin();
    const { data: report, error } = await supabase
      .from('agent_logs')
      .select('*')
      .eq('agent', 'commercial')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !report) {
      return NextResponse.json({ ok: false, error: 'Aucun rapport disponible' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, report: report.data, created_at: report.created_at });
  } catch (error: any) {
    console.error('[CommercialAgent] GET error:', error);
    return NextResponse.json({ ok: false, error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * POST /api/agents/commercial — manual trigger
 */
export async function POST(request: NextRequest) {
  const { authorized } = await verifyAuth(request);
  if (!authorized) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  return runEnrichment();
}

/**
 * Core: fetch incomplete prospects, enrich via Gemini + Google Search, update DB.
 */
async function runEnrichment(): Promise<NextResponse> {
  try {
    const supabase = getSupabaseAdmin();
    const nowISO = new Date().toISOString();

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ ok: false, error: 'GEMINI_API_KEY non configuree' }, { status: 500 });
    }

    // Load shared context from all agents (see what email/DM/content agents have done)
    const sharedCtx = await loadSharedContext(supabase, 'commercial');
    const ctxText = formatContextForPrompt(sharedCtx);
    console.log(`[CommercialAgent] CRM: ${sharedCtx.crmStats.total} prospects, ${sharedCtx.crmStats.hot} hot, ${sharedCtx.crmStats.withInstagram} IG`);

    // === PHASE 1: Data enrichment (type, quartier, email validation) ===
    const { data: prospects, error: fetchError } = await supabase
      .from('crm_prospects')
      .select('id, email, first_name, company, type, quartier, note_google, email_sequence_status, temperature, status, instagram, tiktok_handle, website, google_rating, google_reviews')
      .or('type.is.null,quartier.is.null,email_sequence_status.is.null,email_sequence_status.eq.not_started,status.eq.new,status.eq.identifie,status.is.null')
      .or('temperature.is.null,temperature.neq.dead')
      .order('created_at', { ascending: true })
      .limit(MAX_PROSPECTS_PER_RUN);

    if (fetchError) {
      console.error('[CommercialAgent] Error fetching prospects:', fetchError);
      return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
    }

    let enrichedCount = 0;
    let flaggedDeadCount = 0;
    let skippedCount = 0;
    let advancedToContactCount = 0;
    let socialEnrichedCount = 0;
    const enrichmentDetails: Array<{
      prospect_id: string;
      company: string | null;
      updates: Record<string, any>;
      reasoning: string;
    }> = [];

    if (!prospects || prospects.length === 0) {
      console.log('[CommercialAgent] No prospects to enrich in phase 1');
    } else {
      console.log(`[CommercialAgent] Phase 1: ${prospects.length} prospects to enrich`);

      for (const prospect of prospects) {
        const result = await enrichProspect(prospect);

        if (!result) {
          skippedCount++;
          continue;
        }

        const updates: Record<string, any> = {};

        if (!prospect.type && result.type && VALID_TYPES.includes(result.type) && result.type_confidence >= 70) {
          updates.type = result.type;
        }

        if (!prospect.quartier && result.quartier && result.quartier_confidence >= 70) {
          updates.quartier = result.quartier;
        }

        // Flag bad emails as dead
        if (!result.email_valid || (result.email_flags && result.email_flags.length > 0)) {
          const hasCriticalFlag = result.email_flags?.some(f =>
            ['disposable_domain', 'bad_format'].includes(f)
          );

          if (!result.email_valid || hasCriticalFlag) {
            updates.temperature = 'dead';
            updates.status = 'perdu';
            flaggedDeadCount++;
            console.log(`[CommercialAgent] Flagged ${prospect.id} as dead (email: ${prospect.email})`);
          }
        }

        // Auto-score calculation based on all data
        const prospectWithUpdates = { ...prospect, ...updates };
        const autoScore = calculateScore(prospectWithUpdates);
        const autoTemp = calculateTemperature(autoScore);
        if (autoScore > 0) {
          updates.score = Math.max(autoScore, result.priority_score || 0);
          updates.temperature = autoTemp;
        }

        // GO/NO-GO for contact
        if (result.ready_to_contact && prospect.email && result.email_valid) {
          if (!prospect.email_sequence_status || prospect.email_sequence_status === 'not_started') {
            updates.status = 'contacte';
            updates.email_sequence_status = 'not_started';
            updates.email_sequence_step = 0;
            advancedToContactCount++;
          }
        } else if (result.ready_to_contact === false && result.disqualification_reason) {
          updates.status = 'perdu';
          updates.temperature = 'dead';
          updates.score = 0;
          flaggedDeadCount++;
          console.log(`[CommercialAgent] Disqualified ${prospect.id}: ${result.disqualification_reason}`);
        }

        if (Object.keys(updates).length > 0) {
          updates.updated_at = nowISO;

          const { error: updateError } = await supabase
            .from('crm_prospects')
            .update(updates)
            .eq('id', prospect.id);

          if (updateError) {
            console.error(`[CommercialAgent] Error updating ${prospect.id}:`, updateError);
            skippedCount++;
            continue;
          }

          enrichedCount++;
          enrichmentDetails.push({
            prospect_id: prospect.id,
            company: prospect.company,
            updates,
            reasoning: result.reasoning,
          });
        } else {
          skippedCount++;
        }
      }
    }

    // === PHASE 2: Social media enrichment via Google Search ===
    // Find prospects with company name but missing social data
    const { data: socialProspects } = await supabase
      .from('crm_prospects')
      .select('id, company, type, quartier, email, instagram, tiktok_handle, website, google_rating, google_reviews, score, temperature')
      .not('company', 'is', null)
      .or('temperature.is.null,temperature.neq.dead')
      .or('status.is.null,status.not.in.("perdu","client","sprint")')
      .or('instagram.is.null,tiktok_handle.is.null,website.is.null,google_rating.is.null')
      .order('score', { ascending: false })
      .limit(MAX_SEARCH_ENRICHMENT);

    if (socialProspects && socialProspects.length > 0) {
      console.log(`[CommercialAgent] Phase 2: ${socialProspects.length} prospects for social search`);

      for (const prospect of socialProspects) {
        // Skip if already has all social data
        if (prospect.instagram && prospect.tiktok_handle && prospect.website && prospect.google_rating) {
          continue;
        }

        const searchResult = await searchSocialProfiles(prospect);
        if (!searchResult || searchResult.confidence < 50) continue;

        const socialUpdates: Record<string, any> = {};

        // Only update fields that are currently missing
        if (!prospect.instagram && searchResult.instagram) {
          socialUpdates.instagram = searchResult.instagram;
        }
        if (!prospect.tiktok_handle && searchResult.tiktok) {
          socialUpdates.tiktok_handle = searchResult.tiktok;
        }
        if (!prospect.website && searchResult.website) {
          socialUpdates.website = searchResult.website;
        }
        if (!prospect.google_rating && searchResult.google_rating) {
          socialUpdates.google_rating = searchResult.google_rating;
          socialUpdates.note_google = searchResult.google_rating;
        }
        if (!prospect.google_reviews && searchResult.google_reviews) {
          socialUpdates.google_reviews = searchResult.google_reviews;
        }
        if (searchResult.phone) {
          socialUpdates.phone = searchResult.phone;
        }
        if (searchResult.address) {
          socialUpdates.address = searchResult.address;
        }

        if (Object.keys(socialUpdates).length > 0) {
          socialUpdates.updated_at = nowISO;

          // Recalculate score with new social data (having Instagram/TikTok/website boosts value)
          const enrichedProspect = { ...prospect, ...socialUpdates };
          const newScore = calculateScore(enrichedProspect);
          const newTemp = calculateTemperature(newScore);
          if (newScore > (prospect.score || 0)) {
            socialUpdates.score = newScore;
            socialUpdates.temperature = newTemp;
          }

          const { error: socialError } = await supabase
            .from('crm_prospects')
            .update(socialUpdates)
            .eq('id', prospect.id);

          if (!socialError) {
            socialEnrichedCount++;
            console.log(`[CommercialAgent] Social enriched ${prospect.company}: +${Object.keys(socialUpdates).filter(k => k !== 'updated_at' && k !== 'score' && k !== 'temperature').join(', ')} (score: ${newScore})`);
          }
        }

        // Rate limit: wait 500ms between searches
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // === Reporting ===
    const { count: totalProspects } = await supabase
      .from('crm_prospects')
      .select('id', { count: 'exact', head: true });

    const { count: readyToContact } = await supabase
      .from('crm_prospects')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'contacte');

    const { count: withInstagram } = await supabase
      .from('crm_prospects')
      .select('id', { count: 'exact', head: true })
      .not('instagram', 'is', null);

    const { count: withTiktok } = await supabase
      .from('crm_prospects')
      .select('id', { count: 'exact', head: true })
      .not('tiktok_handle', 'is', null);

    const runReport = {
      phase1_enrichment: {
        prospects_found: prospects?.length || 0,
        enriched: enrichedCount,
        advanced_to_contact: advancedToContactCount,
        flagged_dead: flaggedDeadCount,
        skipped: skippedCount,
      },
      phase2_social_search: {
        searched: socialProspects?.length || 0,
        enriched: socialEnrichedCount,
      },
      crm_stats: {
        total: totalProspects || 0,
        ready_to_contact: readyToContact || 0,
        with_instagram: withInstagram || 0,
        with_tiktok: withTiktok || 0,
      },
      details: enrichmentDetails,
      timestamp: nowISO,
    };

    await supabase.from('agent_logs').insert({
      agent: 'commercial',
      action: 'enrichment_run',
      data: runReport,
      created_at: nowISO,
    });

    // Report to CEO
    await supabase.from('agent_logs').insert({
      agent: 'commercial',
      action: 'report_to_ceo',
      data: {
        phase: 'completed',
        message: `Commercial: ${enrichedCount} enrichis, ${socialEnrichedCount} réseaux sociaux trouvés, ${advancedToContactCount} → contacté, ${flaggedDeadCount} disqualifiés | CRM: ${totalProspects} total, ${withInstagram} IG, ${withTiktok} TikTok`,
      },
      created_at: nowISO,
    });

    console.log(`[CommercialAgent] Done: ${enrichedCount} enriched, ${socialEnrichedCount} social, ${advancedToContactCount} → contacté, ${flaggedDeadCount} dead | CRM: ${totalProspects} total`);

    return NextResponse.json({
      ok: true,
      enriched: enrichedCount,
      social_enriched: socialEnrichedCount,
      advanced_to_contact: advancedToContactCount,
      flagged_dead: flaggedDeadCount,
      skipped: skippedCount,
      crm_total: totalProspects || 0,
      crm_instagram: withInstagram || 0,
      crm_tiktok: withTiktok || 0,
    });
  } catch (error: any) {
    console.error('[CommercialAgent] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
