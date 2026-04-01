import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getCommercialSystemPrompt } from '@/lib/agents/commercial-prompt';
import { callGemini, callGeminiWithSearch } from '@/lib/agents/gemini';
import { loadContextWithAvatar } from '@/lib/agents/shared-context';
import { saveLearning, saveAgentFeedback } from '@/lib/agents/learning';
import { calculateScore, calculateTemperature } from '@/lib/agents/scoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

const MAX_PROSPECTS_PER_RUN = 50;
const MAX_SEARCH_ENRICHMENT = 30;

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
  business_exists?: boolean;
  business_notes?: string;
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
      maxTokens: 1500,
    });

    // Strip ALL markdown code fences
    const cleanText = rawText.replace(/```[\w]*\s*/g, '').trim();
    let result: SocialSearchResult;
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        result = JSON.parse(jsonMatch[0]);
      } catch {
        console.error('[CommercialAgent] Invalid JSON from Google search:', rawText.substring(0, 300));
        return null;
      }
    } else {
      // Salvage truncated JSON
      const partialMatch = cleanText.match(/\{[\s\S]*/);
      if (!partialMatch) {
        console.error('[CommercialAgent] No JSON from Google search:', rawText.substring(0, 300));
        return null;
      }
      let partial = partialMatch[0].replace(/,?\s*"[^"]*$/, '').replace(/,?\s*$/, '');
      const open = (partial.match(/\{/g) || []).length;
      const close = (partial.match(/\}/g) || []).length;
      if (open > close) partial += '}'.repeat(open - close);
      try {
        result = JSON.parse(partial);
        console.log('[CommercialAgent] Salvaged truncated JSON for social search');
      } catch {
        console.error('[CommercialAgent] No JSON from Google search:', rawText.substring(0, 300));
        return null;
      }
    }

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

${!prospect.type ? `PRIORITÉ ABSOLUE : détermine le type de commerce. Analyse le nom d'entreprise, l'email (domaine), le prénom, et tout indice disponible.
Types valides : ${VALID_TYPES.join(', ')}.
Tu DOIS choisir un type parmi cette liste. Si tu hésites, choisis le plus probable. Ne laisse JAMAIS type à null.
Exemples : "Salon Léa" = coiffeur, "Le Petit Caveau" = caviste, "Studio Yoga" = coach, email "@boulangerie-xxx" = restaurant, domaine en ".restaurant" = restaurant.
Si vraiment aucun indice = "pme".` : ''}
${!prospect.quartier ? 'Si possible, déduis le quartier/ville à partir du nom ou de l\'email. MAIS seulement si tu es SÛR — NE DEVINE PAS. Si tu n\'es pas certain, laisse vide (confidence: 0).' : ''}
${prospect.email ? 'Vérifie la validité de l\'email (format, domaine jetable, patterns suspects).' : 'ATTENTION : pas d\'email fourni, email_valid = false.'}

VÉRIFICATION CRITIQUE DU NOM :
- Le nom d'entreprise "${prospect.company || ''}" est-il un vrai commerce qui EXISTE ?
- Si le nom semble inventé, trop générique, ou incohérent (ex: "Rôtisserie Antoine et Fils" qui n'existe pas sur internet), mets business_exists: false dans le JSON.
- Si le quartier que tu déduis ne correspond PAS au commerce réel, mets quartier_confidence: 0.
- Ajoute un champ "business_exists": true/false et "business_notes": "explication courte".

Réponds UNIQUEMENT en JSON valide, sans markdown, sans explication hors du JSON.`;

  try {
    const rawText = await callGemini({
      system: getCommercialSystemPrompt(),
      message: prospectAnalysisPrompt,
      maxTokens: 2000,
    });

    // Strip ALL markdown code fences and trim
    const cleanText = rawText.replace(/```[\w]*\s*/g, '').trim();
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const result: EnrichmentResult = JSON.parse(jsonMatch[0]);
        return result;
      } catch { /* fall through to salvage */ }
    }

    // Salvage truncated JSON: find opening brace, strip trailing garbage, close all open braces
    const partialMatch = cleanText.match(/\{[\s\S]*/);
    if (partialMatch) {
      let partial = partialMatch[0];
      // Remove trailing incomplete strings (e.g. "key": "value that got cut...)
      partial = partial.replace(/,?\s*"[^"]*$/, ''); // remove trailing incomplete key or value
      partial = partial.replace(/,?\s*$/, '');        // remove trailing comma
      // Count open vs close braces and add missing ones
      const openBraces = (partial.match(/\{/g) || []).length;
      const closeBraces = (partial.match(/\}/g) || []).length;
      const missing = openBraces - closeBraces;
      if (missing > 0) {
        partial += '}'.repeat(missing);
      }
      try {
        const result: EnrichmentResult = JSON.parse(partial);
        console.log('[CommercialAgent] Salvaged truncated JSON for prospect');
        return result;
      } catch { /* couldn't salvage */ }
    }

    console.error('[CommercialAgent] No JSON found in response:', rawText.substring(0, 300));
    return null;
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

  // Optional org_id passthrough for multi-tenant support
  const orgId = request.nextUrl.searchParams.get('org_id') || null;

  if (isCron) {
    console.log('[CommercialAgent] Cron triggered — running enrichment + social search pipeline');
    return runEnrichment('full', orgId);
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
 * Accepts optional body: { action: 'verify_crm' | 'prospect_external' | 'full' }
 * - verify_crm: Phase 1 only (audit/enrich existing prospects)
 * - prospect_external: Phase 2 only (Google Search for social data)
 * - full (default): Both phases
 */
export async function POST(request: NextRequest) {
  const { authorized } = await verifyAuth(request);
  if (!authorized) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  let action = 'full';
  let orgId: string | null = null;
  const clientUserId = request.nextUrl.searchParams.get('user_id') || null;
  try {
    const body = await request.json();
    if (body?.action) action = body.action;
    orgId = body?.org_id || null;
  } catch {}

  return runEnrichment(action as 'verify_crm' | 'prospect_external' | 'full', orgId, clientUserId);
}

/**
 * Core: fetch incomplete prospects, enrich via Gemini + Google Search, update DB.
 */
async function runEnrichment(mode: 'verify_crm' | 'prospect_external' | 'full' = 'full', orgId: string | null = null, clientUserId: string | null = null): Promise<NextResponse> {
  const runStartTime = Date.now();
  const MAX_RUN_MS = 250_000; // Hard limit: 250s to leave 50s margin for reporting

  try {
    const supabase = getSupabaseAdmin();
    const nowISO = new Date().toISOString();

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ ok: false, error: 'GEMINI_API_KEY non configuree' }, { status: 500 });
    }

    // Load shared context from all agents (see what email/DM/content agents have done)
    const { context: sharedCtx, prompt: ctxText } = await loadContextWithAvatar(supabase, 'commercial', orgId || undefined);
    console.log(`[CommercialAgent] CRM: ${sharedCtx.crmStats.total} prospects, ${sharedCtx.crmStats.hot} hot, ${sharedCtx.crmStats.withInstagram} IG — mode: ${mode}`);

    const runPhase1 = mode === 'verify_crm' || mode === 'full';
    const runPhase2Social = mode === 'full'; // Social enrichment only on full runs
    const runPhase3Discovery = mode === 'prospect_external' || mode === 'full';

    // === PHASE 1: Data enrichment (type, quartier, email validation) ===
    // Fetch prospects that need enrichment — filtered by client user_id
    let prospectQueryBuilder = supabase
      .from('crm_prospects')
      .select('id, email, first_name, company, type, quartier, note_google, email_sequence_status, temperature, status, instagram, tiktok_handle, website, google_rating, google_reviews')
      .not('temperature', 'eq', 'dead')
      .order('created_at', { ascending: true })
      .limit(500);
    if (clientUserId) prospectQueryBuilder = prospectQueryBuilder.eq('user_id', clientUserId);
    const { data: rawProspects, error: fetchError } = runPhase1
      ? await prospectQueryBuilder
      : { data: [] as any[], error: null };

    // Filter: prospects that need enrichment (missing type/quartier, or never processed, or old ones to re-verify)
    // PRIORITY: prospects without type come first (critical for email category stats)
    const prospects = (rawProspects || []).filter(p => {
      // Skip dead/perdu
      if (p.temperature === 'dead' || p.status === 'perdu') return false;
      // Needs enrichment if missing type, quartier, or hasn't been processed
      const needsType = !p.type;
      const needsQuartier = !p.quartier;
      const isNew = !p.status || p.status === 'new' || p.status === 'identifie';
      const neverProcessed = !p.email_sequence_status;
      return needsType || needsQuartier || isNew || neverProcessed;
    }).sort((a, b) => {
      // Prospects without type are highest priority
      const aNoType = !a.type ? 0 : 1;
      const bNoType = !b.type ? 0 : 1;
      return aNoType - bNoType;
    }).slice(0, MAX_PROSPECTS_PER_RUN);

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
      // Diagnostic: why no prospects?
      const { count: totalCount } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true });
      const { count: withEmail } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).not('email', 'is', null);
      const { count: withType } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).not('type', 'is', null);
      const { count: deadCount } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('temperature', 'dead');
      const { count: contacteCount } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('status', 'contacte');
      console.log(`[CommercialAgent] No prospects for phase 1. CRM: ${totalCount} total, ${withEmail} with email, ${withType} with type, ${deadCount} dead, ${contacteCount} contacté`);
    } else {
      console.log(`[CommercialAgent] Phase 1: ${prospects.length} prospects to enrich`);

      // Process in parallel batches of 10 for speed
      const BATCH_SIZE = 10;
      const enrichResults: Array<{ prospect: any; result: any }> = [];
      for (let b = 0; b < prospects.length; b += BATCH_SIZE) {
        if (Date.now() - runStartTime > MAX_RUN_MS) {
          console.warn(`[CommercialAgent] Phase 1 timeout guard: stopping after ${b} prospects`);
          break;
        }
        const batch = prospects.slice(b, b + BATCH_SIZE);
        const batchResults = await Promise.all(batch.map(async (p) => {
          const r = await enrichProspect(p);
          return { prospect: p, result: r };
        }));
        enrichResults.push(...batchResults);
      }

      for (const { prospect, result } of enrichResults) {
        if (!result) {
          skippedCount++;
          continue;
        }

        const updates: Record<string, any> = {};

        // If AI says business doesn't exist, flag it and don't contact
        if (result.business_exists === false) {
          updates.notes = `[commercial] Business douteux: ${result.business_notes || 'introuvable'}`;
          updates.temperature = 'dead';
          updates.status = 'perdu';
          flaggedDeadCount++;
          console.log(`[CommercialAgent] Flagged ${prospect.id} as dead (business doesn't exist: ${prospect.company})`);
          // Still apply update below, but skip contact readiness
          updates.updated_at = nowISO;
          await supabase.from('crm_prospects').update(updates).eq('id', prospect.id);
          await supabase.from('crm_activities').insert({
            prospect_id: prospect.id,
            type: 'commercial_verification',
            description: `Business invalide: ${result.business_notes || 'introuvable'} → marqué dead/perdu`,
            data: { action: 'flagged_dead', company: prospect.company, reason: result.business_notes, agent: 'commercial' },
            created_at: nowISO,
          });
          continue;
        }

        if (!prospect.type) {
          if (result.type && VALID_TYPES.includes(result.type)) {
            // Accept any valid type the AI found — even low confidence is better than null
            updates.type = result.type;
          }
          // If AI couldn't determine type → keep null so this prospect gets re-analyzed next run
          // Email sending uses getSequenceForProspect() which falls back to 'pme' for the template
        }

        if (!prospect.quartier && result.quartier && result.quartier_confidence >= 70) {
          updates.quartier = result.quartier;
        }

        // Flag bad emails — only mark dead for truly invalid formats, NOT for AI guesses
        if (result.email_flags && result.email_flags.length > 0) {
          const hasCriticalFlag = result.email_flags.some((f: string) =>
            ['bad_format'].includes(f)
          );
          // Only mark dead for objectively bad email format, not disposable/AI guesses
          if (hasCriticalFlag) {
            updates.temperature = 'dead';
            updates.status = 'perdu';
            flaggedDeadCount++;
            console.log(`[CommercialAgent] Flagged ${prospect.id} as dead (bad email format: ${prospect.email})`);
          }
        }

        // Auto-score calculation based on all data
        const prospectWithUpdates = { ...prospect, ...updates };
        const autoScore = calculateScore(prospectWithUpdates);
        const autoTemp = calculateTemperature(autoScore, prospectWithUpdates);
        if (autoScore > 0) {
          updates.score = Math.max(autoScore, result.priority_score || 0);
          updates.temperature = autoTemp;
        }

        // Mark as verified (safe — column may not exist yet)
        if (result.data_completeness_score >= 50 || (result.ready_to_contact && result.email_valid)) {
          updates.verified = true;
          updates.verified_at = nowISO;
          updates.verified_by = 'commercial';
        }

        // GO/NO-GO for contact
        if (result.ready_to_contact && prospect.email && result.email_valid) {
          if (!prospect.email_sequence_status || prospect.email_sequence_status === 'not_started') {
            // Don't set 'contacte' here — email agent will set it when first email is actually sent
            updates.email_sequence_status = 'not_started';
            updates.email_sequence_step = 0;
            advancedToContactCount++;
          }
        } else if (result.ready_to_contact === false && result.disqualification_reason) {
          // Don't mark as dead — just log the reason, keep prospect in pipeline for manual review
          console.log(`[CommercialAgent] Not ready to contact ${prospect.id}: ${result.disqualification_reason}`);
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

          // Log enrichment to crm_activities for CRM visibility
          const changedFields = Object.keys(updates).filter(k => k !== 'updated_at');
          if (changedFields.length > 0) {
            await supabase.from('crm_activities').insert({
              prospect_id: prospect.id,
              type: 'commercial_enrichment',
              description: `Enrichi: ${changedFields.join(', ')}`,
              data: { action: 'enriched', fields: changedFields, updates, confidence: result.type_confidence, agent: 'commercial' },
              created_at: nowISO,
            });
          }
        } else {
          skippedCount++;
        }
      }
    }

    // === PHASE 2: Social media enrichment via Google Search ===
    // Find prospects with company name but missing social data
    const { data: rawSocialProspects } = runPhase2Social
      ? await supabase
          .from('crm_prospects')
          .select('id, company, type, quartier, email, instagram, tiktok_handle, website, google_rating, google_reviews, score, temperature, status')
          .not('company', 'is', null)
          .order('score', { ascending: false, nullsFirst: false })
          .limit(200)
      : { data: [] as any[] };

    // Filter in JS: not dead/perdu/client + missing at least one social field
    const socialProspects = (rawSocialProspects || []).filter(p => {
      if (p.temperature === 'dead' || p.status === 'perdu' || p.status === 'client' || p.status === 'sprint') return false;
      // Must be missing at least one social field
      return !p.instagram || !p.tiktok_handle || !p.website || !p.google_rating;
    }).slice(0, MAX_SEARCH_ENRICHMENT);

    if (socialProspects && socialProspects.length > 0) {
      console.log(`[CommercialAgent] Phase 2: ${socialProspects.length} prospects for social search`);

      // Process in parallel batches of 5 for speed while respecting Gemini rate limits
      const SEARCH_BATCH_SIZE = 5;
      for (let b = 0; b < socialProspects.length; b += SEARCH_BATCH_SIZE) {
        // Check timeout guard (shared with Phase 1)
        if (Date.now() - runStartTime > MAX_RUN_MS) {
          console.warn(`[CommercialAgent] Phase 2 timeout guard: stopping after ${b} prospects (${Math.round((Date.now() - runStartTime) / 1000)}s elapsed)`);
          break;
        }

        const batch = socialProspects.slice(b, b + SEARCH_BATCH_SIZE);
        const batchResults = await Promise.all(batch.map(async (prospect) => {
          // Skip if already has all social data
          if (prospect.instagram && prospect.tiktok_handle && prospect.website && prospect.google_rating) {
            return null;
          }
          const searchResult = await searchSocialProfiles(prospect);
          return { prospect, searchResult };
        }));

        // Process batch results and update DB
        for (const item of batchResults) {
          if (!item || !item.searchResult || item.searchResult.confidence < 50) continue;
          const { prospect, searchResult } = item;

          const socialUpdates: Record<string, any> = {};

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

            const enrichedProspect = { ...prospect, ...socialUpdates };
            const newScore = calculateScore(enrichedProspect);
            const newTemp = calculateTemperature(newScore, enrichedProspect);
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
              const socialFields = Object.keys(socialUpdates).filter(k => !['updated_at', 'score', 'temperature'].includes(k));
              console.log(`[CommercialAgent] Social enriched ${prospect.company}: +${socialFields.join(', ')} (score: ${newScore})`);
              await supabase.from('crm_activities').insert({
                prospect_id: prospect.id,
                type: 'commercial_social_enrichment',
                description: `Profils sociaux trouvés: ${socialFields.join(', ')}`,
                data: { action: 'social_enriched', fields: socialFields, updates: socialUpdates, agent: 'commercial' },
                created_at: nowISO,
              });
            }
          }
        }

        // Small delay between batches to be safe with Gemini rate limits (15 req/min)
        if (b + SEARCH_BATCH_SIZE < socialProspects.length) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }

    // === PHASE 3: External prospection — find NEW businesses via Google Search ===
    let newProspectsCreated = 0;
    const MAX_NEW_PROSPECTS = 50;
    let allNewProspects: any[] = [];
    let dedupSkipped = 0;
    let skippedNoEmail = 0;
    let searchLogs: string[] = [];

    if (runPhase3Discovery && (Date.now() - runStartTime < MAX_RUN_MS)) {
      console.log('[CommercialAgent] Phase 3: Aggressive search for new qualified prospects...');

      const businessTypes = ['restaurant', 'boutique', 'coiffeur', 'coach sportif', 'fleuriste', 'caviste', 'traiteur', 'freelance graphiste', 'salon esthetique', 'boulangerie', 'photographe', 'agence immobiliere', 'pizzeria', 'bar a vin', 'institut de beaute', 'salle de sport', 'epicerie fine', 'fromagerie', 'chocolatier', 'bijouterie', 'opticien', 'veterinaire', 'cabinet dentaire', 'osteopathe'];
      const cities = ['Paris', 'Lyon', 'Marseille', 'Bordeaux', 'Lille', 'Nantes', 'Toulouse', 'Strasbourg', 'Nice', 'Montpellier', 'Rennes', 'Grenoble', 'Rouen', 'Toulon', 'Aix-en-Provence', 'Annecy', 'Clermont-Ferrand', 'Dijon', 'Metz', 'Tours', 'Reims', 'Le Mans', 'Brest', 'Perpignan', 'Cannes', 'Avignon', 'La Rochelle', 'Bayonne', 'Pau', 'Colmar'];
      const parisQuartiers = ['Marais', 'Montmartre', 'Saint-Germain', 'Bastille', 'Oberkampf', 'Batignolles', 'Belleville', 'Pigalle', 'République', 'Nation', 'Châtelet', 'Opéra', 'Ménilmontant', 'Butte-aux-Cailles', 'Passy'];

      const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
      const hourOfDay = new Date().getUTCHours();
      const minuteOfHour = new Date().getUTCMinutes();
      const runIdx = dayOfYear * 100 + hourOfDay * 10 + Math.floor(minuteOfHour / 10); // More unique per run

      // Generate 6 different search combinations for maximum coverage
      const searches: Array<{ type: string; location: string; searchQuery: string }> = [];
      for (let s = 0; s < 6; s++) {
        const tIdx = (runIdx + s * 7) % businessTypes.length;
        const cIdx = (runIdx + s * 11) % cities.length;
        const city = cities[cIdx];
        const type = businessTypes[tIdx];
        // For Paris, also search by quartier
        const location = city === 'Paris' ? `Paris ${parisQuartiers[(runIdx + s * 3) % parisQuartiers.length]}` : city;

        const searchVariants = [
          `"${type}" "${location}" email contact site`,
          `${type} ${location} pagesjaunes email telephone`,
          `meilleur ${type} ${location} avis google instagram`,
          `${type} ${location} "contact@" OR "info@" OR "hello@"`,
          `annuaire ${type} ${location} email adresse`,
          `${type} independant ${location} site web contact`,
        ];
        searches.push({
          type,
          location,
          searchQuery: searchVariants[s % searchVariants.length],
        });
      }

      const PROSPECTION_SYSTEM_PROMPT = `Tu es un agent commercial ELITE de KeiroAI. Ta mission : trouver des commerces locaux RÉELS en France pour les aider avec leur marketing digital.

TON OBJECTIF : retourner 8-12 prospects QUALIFIÉS avec EMAIL OBLIGATOIRE.
IMPORTANT : limite les champs texte (description, qualification_reason) à 30 caractères MAX. Pas de longues phrases.

MÉTHODE DE RECHERCHE (utilise Google Search grounding) :
1. Cherche "${'{type} {location}'}" sur Google → trouve les sites web
2. Sur chaque site web, cherche la page Contact pour trouver l'EMAIL
3. Cherche sur PagesJaunes "${'{type} {location}'}" → email + téléphone
4. Cherche sur Google Maps pour note + avis
5. Cherche sur Instagram pour le handle

CRITÈRE OBLIGATOIRE :
🔴 CHAQUE prospect DOIT avoir un EMAIL (contact@, info@, hello@, etc.)
🔴 Si tu ne trouves pas l'email d'un commerce, NE L'INCLUS PAS dans la liste
🔴 Construis l'email à partir du site web si nécessaire (ex: site=boulangerie-paris.fr → contact@boulangerie-paris.fr)

CRITÈRES DE QUALIFICATION SUPPLÉMENTAIRES (au moins 1) :
✅ A un compte Instagram
✅ A une note Google > 3.5
✅ A un site web

CE QUE TU DOIS REMPLIR pour chaque prospect (MAXIMUM d'info) :
- company : nom EXACT du commerce
- type : restaurant|boutique|coach|coiffeur|fleuriste|caviste|traiteur|freelance|services|boulangerie|photographe|agence
- quartier : ville + quartier si possible
- email : OBLIGATOIRE — adresse email trouvée ou construite depuis le site
- instagram : handle Instagram SANS @ (si trouvé)
- website : URL complète
- phone : numéro de téléphone
- google_rating : note Google (ex: 4.5)
- google_reviews : nombre d'avis Google
- description : ce que fait ce commerce (1 ligne)
- specialty : spécialité (ex: "cuisine japonaise", "coiffure homme")
- address : adresse physique complète
- qualification_reason : pourquoi ce prospect a besoin de KeiroAI

RETOURNE UNIQUEMENT un tableau JSON, PAS de markdown :
[{"company":"...","type":"...","quartier":"...","instagram":"...", ...}]

RÈGLES ABSOLUES :
- UNIQUEMENT des commerces RÉELS trouvés dans tes résultats de recherche
- REMPLIS UN MAXIMUM DE CHAMPS — ne laisse pas de null si tu peux trouver l'info
- Préfère les commerces indépendants (pas de chaînes type McDonald's, Starbucks)
- JAMAIS d'inventions — si tu ne trouves pas l'info, mets null`;

      // Run searches in PARALLEL (2 at a time to respect rate limits)

      for (let batch = 0; batch < searches.length; batch += 2) {
        if (Date.now() - runStartTime > MAX_RUN_MS) {
          searchLogs.push(`TIMEOUT after batch ${batch}`);
          break;
        }

        const batchSearches = searches.slice(batch, batch + 2);
        const batchResults = await Promise.all(batchSearches.map(async (s) => {
          try {
            console.log(`[CommercialAgent] Phase 3: Searching "${s.searchQuery}"...`);
            const result = await callGeminiWithSearch({
              system: PROSPECTION_SYSTEM_PROMPT,
              message: `Recherche Google : "${s.searchQuery}"

Trouve des ${s.type}s à ${s.location} qui sont actifs en ligne.
Cherche leur email (OBLIGATOIRE), Instagram, site web, note Google, téléphone.
Retourne 8-12 prospects qualifiés AVEC EMAIL en JSON. Sois TRÈS concis dans description/qualification_reason (30 car max).`,
              maxTokens: 6000,
            });
            return { search: s, result };
          } catch (e: any) {
            searchLogs.push(`FAIL ${s.type}@${s.location}: ${e.message}`);
            console.error(`[CommercialAgent] Search failed for ${s.type}@${s.location}:`, e.message);
            return null;
          }
        }));

        for (const br of batchResults) {
          if (!br) continue;
          const tag = `${br.search.type}@${br.search.location}`;
          try {
            const cleanText = br.result.replace(/```[\w]*\s*/g, '').trim();
            let parsed: any[] = [];

            // Method 1: try full JSON array
            const fullMatch = cleanText.match(/\[[\s\S]*\]/);
            if (fullMatch) {
              try { parsed = JSON.parse(fullMatch[0]); } catch { /* truncated */ }
            }

            // Method 2: extract each complete JSON object individually
            // This handles truncated arrays where some objects are complete
            if (parsed.length === 0) {
              // Match complete objects: find balanced { ... } blocks
              const objects: any[] = [];
              let depth = 0;
              let start = -1;
              let inString = false;
              let escaped = false;

              for (let i = 0; i < cleanText.length; i++) {
                const ch = cleanText[i];
                if (escaped) { escaped = false; continue; }
                if (ch === '\\') { escaped = true; continue; }
                if (ch === '"') { inString = !inString; continue; }
                if (inString) continue;
                if (ch === '{') {
                  if (depth === 0) start = i;
                  depth++;
                } else if (ch === '}') {
                  depth--;
                  if (depth === 0 && start >= 0) {
                    const objStr = cleanText.substring(start, i + 1);
                    try {
                      const obj = JSON.parse(objStr);
                      if (obj.company) objects.push(obj); // Must have company to be valid
                    } catch { /* malformed object, skip */ }
                    start = -1;
                  }
                }
              }

              if (objects.length > 0) {
                parsed = objects;
                console.log(`[CommercialAgent] Phase 3: EXTRACTED ${parsed.length} complete objects for ${tag}`);
                searchLogs.push(`EXTRACTED ${tag}: ${parsed.length} prospects`);
              }
            }

            if (parsed.length > 0) {
              if (!searchLogs.some(l => l.includes(tag))) {
                searchLogs.push(`OK ${tag}: ${parsed.length} prospects`);
              }
              console.log(`[CommercialAgent] Phase 3: ${parsed.length} prospects found for ${tag}`);
              allNewProspects.push(...parsed);
            } else {
              searchLogs.push(`NO_JSON ${tag}`);
              console.warn(`[CommercialAgent] Phase 3: No parseable JSON for ${tag}: ${cleanText.substring(0, 150)}`);
            }
          } catch (e: any) {
            searchLogs.push(`PARSE_FAIL ${tag}: ${e.message}`);
            console.error(`[CommercialAgent] Phase 3: Failed to parse ${tag}:`, e.message);
          }
        }

        // Rate limit pause between batches
        if (batch + 2 < searches.length) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      console.log(`[CommercialAgent] Phase 3: Total raw prospects found: ${allNewProspects.length} | Searches: ${searchLogs.join(' | ')}`);

      // Insert new prospects into CRM (strict deduplication)
      const insertedNames = new Set<string>(); // In-run dedup

      try {
        for (const np of allNewProspects) {
          if (!np.company || np.company.length < 2) continue;
          if (newProspectsCreated >= MAX_NEW_PROSPECTS) break;

          // PRIORITÉ: skip prospects sans email (l'email est essentiel pour la séquence)
          if (!np.email || !np.email.includes('@')) {
            skippedNoEmail++;
            continue;
          }

          // In-run dedup: skip if we already inserted this company name in this run
          const lowerName = np.company.toLowerCase().trim();
          if (insertedNames.has(lowerName)) {
            console.log(`[CommercialAgent] Skip in-run dup: ${np.company}`);
            dedupSkipped++;
            continue;
          }

          // Normalize for matching
          const igHandle = np.instagram ? np.instagram.replace(/^@/, '').toLowerCase().trim() : null;
          const normalizedName = np.company.trim();
          // Extract core words for fuzzy matching (drop "Le/La/Les/L'" prefix + "Restaurant/Boutique/Salon" generic prefix)
          const coreName = normalizedName
            .toLowerCase()
            .replace(/^(le |la |les |l'|l')/i, '')
            .replace(/^(restaurant |boutique |salon |café |cafe |bar |brasserie |atelier |studio |coach |coaching )/i, '')
            .trim();

          let isDuplicate = false;
          let duplicateReason = '';

          // 1. Check by Instagram handle (exact)
          if (igHandle && !isDuplicate) {
            const { data: existing } = await supabase
              .from('crm_prospects')
              .select('id, company')
              .eq('instagram', igHandle)
              .limit(1);
            if (existing && existing.length > 0) {
              isDuplicate = true;
              duplicateReason = `instagram @${igHandle} → ${existing[0].company}`;
            }
          }

          // 2. Check by email (exact)
          if (np.email && !isDuplicate) {
            const { data: existing } = await supabase
              .from('crm_prospects')
              .select('id, company')
              .ilike('email', np.email.trim())
              .limit(1);
            if (existing && existing.length > 0) {
              isDuplicate = true;
              duplicateReason = `email ${np.email} → ${existing[0].company}`;
            }
          }

          // 3. Check by phone (exact, normalized)
          if (np.phone && !isDuplicate) {
            const normalizedPhone = np.phone.replace(/[\s\-\.]/g, '');
            const { data: existing } = await supabase
              .from('crm_prospects')
              .select('id, company')
              .eq('phone', normalizedPhone)
              .limit(1);
            if (existing && existing.length > 0) {
              isDuplicate = true;
              duplicateReason = `phone ${np.phone} → ${existing[0].company}`;
            }
          }

          // 4. Check by website domain (exact)
          if (np.website && !isDuplicate) {
            try {
              const domain = new URL(np.website).hostname.replace(/^www\./, '');
              const { data: existing } = await supabase
                .from('crm_prospects')
                .select('id, company')
                .ilike('website', `%${domain}%`)
                .limit(1);
              if (existing && existing.length > 0) {
                isDuplicate = true;
                duplicateReason = `website ${domain} → ${existing[0].company}`;
              }
            } catch { /* invalid URL, skip */ }
          }

          // 5. Check by company name (exact case-insensitive)
          if (!isDuplicate) {
            const { data: existing } = await supabase
              .from('crm_prospects')
              .select('id, company')
              .ilike('company', normalizedName)
              .limit(1);
            if (existing && existing.length > 0) {
              isDuplicate = true;
              duplicateReason = `name exact "${normalizedName}" → ${existing[0].company}`;
            }
          }

          // 6. Fuzzy name check: search for core name within existing companies
          if (!isDuplicate && coreName.length >= 4) {
            const { data: existing } = await supabase
              .from('crm_prospects')
              .select('id, company')
              .ilike('company', `%${coreName}%`)
              .limit(3);
            if (existing && existing.length > 0) {
              // Verify it's truly a match (not just a substring coincidence for short names)
              const match = existing.find(e => {
                const existingCore = (e.company || '')
                  .toLowerCase()
                  .replace(/^(le |la |les |l'|l')/i, '')
                  .replace(/^(restaurant |boutique |salon |café |cafe |bar |brasserie |atelier |studio |coach |coaching )/i, '')
                  .trim();
                // Match if core names are very similar (one contains the other and length ratio > 0.6)
                const longer = Math.max(coreName.length, existingCore.length);
                const shorter = Math.min(coreName.length, existingCore.length);
                return (existingCore.includes(coreName) || coreName.includes(existingCore)) && shorter / longer > 0.6;
              });
              if (match) {
                isDuplicate = true;
                duplicateReason = `fuzzy name "${coreName}" → ${match.company}`;
              }
            }
          }

          if (isDuplicate) {
            dedupSkipped++;
            console.log(`[CommercialAgent] Skip duplicate: ${np.company} (${duplicateReason})`);
            continue;
          }

          // Create new prospect (igHandle already normalized above for dedup)
          const newProspectData = {
            email: np.email,
            instagram: igHandle,
            website: np.website,
            google_rating: np.google_rating,
            google_reviews: np.google_reviews,
            type: np.type,
          };
          const newScore = calculateScore(newProspectData);
          const newTemp = calculateTemperature(newScore, newProspectData);

          // Mark as verified if has enough data (email or instagram + company + type)
          const hasEnoughData = !!(np.email || igHandle) && !!np.company;

          const { error: insertError } = await supabase.from('crm_prospects').insert({
            company: np.company,
            type: VALID_TYPES.includes(np.type) ? np.type : 'pme',
            quartier: np.quartier || null,
            instagram: igHandle,
            website: np.website || null,
            email: np.email || null,
            phone: np.phone || null,
            google_rating: typeof np.google_rating === 'number' ? np.google_rating : (parseFloat(np.google_rating) || null),
            note_google: typeof np.google_rating === 'number' ? np.google_rating : (parseFloat(np.google_rating) || null),
            google_reviews: typeof np.google_reviews === 'number' ? np.google_reviews : (parseInt(np.google_reviews) || null),
            status: 'identifie',
            temperature: newTemp,
            score: newScore,
            address: np.address || null,
            source: 'prospection_commerciale',
            source_agent: 'commercial',
            notes: [np.specialty, np.description, np.qualification_reason].filter(Boolean).join(' — ') || null,
            verified: hasEnoughData,
            verified_at: hasEnoughData ? nowISO : null,
            verified_by: hasEnoughData ? 'commercial' : null,
            user_id: clientUserId || null,
            created_at: nowISO,
            updated_at: nowISO,
          });

          if (!insertError) {
            newProspectsCreated++;
            insertedNames.add(lowerName);
            console.log(`[CommercialAgent] New prospect: ${np.company} (${np.type}, ${np.quartier}, score: ${newScore}, email: ${np.email})`);
            // Log to crm_activities — fetch new prospect ID
            const { data: newP } = await supabase.from('crm_prospects').select('id').eq('company', np.company).eq('source', 'prospection_commerciale').order('created_at', { ascending: false }).limit(1).single();
            if (newP) {
              await supabase.from('crm_activities').insert({
                prospect_id: newP.id,
                type: 'prospect_discovered',
                description: `Nouveau prospect: ${np.company} (${np.type || 'type inconnu'})`,
                data: { action: 'discovered', company: np.company, type: np.type, quartier: np.quartier, email: np.email, instagram: igHandle, score: newScore, agent: 'commercial' },
                created_at: nowISO,
              });
            }
          } else if (insertError.message?.includes('verified') || insertError.message?.includes('schema cache')) {
            // Retry without verified fields (column may not exist yet)
            const { error: retryError } = await supabase.from('crm_prospects').insert({
              company: np.company,
              type: VALID_TYPES.includes(np.type) ? np.type : 'pme',
              quartier: np.quartier || null,
              instagram: igHandle,
              website: np.website || null,
              email: np.email || null,
              phone: np.phone || null,
              google_rating: typeof np.google_rating === 'number' ? np.google_rating : (parseFloat(np.google_rating) || null),
              note_google: typeof np.google_rating === 'number' ? np.google_rating : (parseFloat(np.google_rating) || null),
              google_reviews: typeof np.google_reviews === 'number' ? np.google_reviews : (parseInt(np.google_reviews) || null),
              status: 'identifie',
              temperature: newTemp,
              score: newScore,
              address: np.address || null,
              source: 'prospection_commerciale',
              source_agent: 'commercial',
              notes: [np.specialty, np.description, np.qualification_reason].filter(Boolean).join(' — ') || null,
              created_at: nowISO,
              updated_at: nowISO,
            });
            if (!retryError) {
              newProspectsCreated++;
              insertedNames.add(lowerName);
              const { data: newP2 } = await supabase.from('crm_prospects').select('id').eq('company', np.company).eq('source', 'prospection_commerciale').order('created_at', { ascending: false }).limit(1).single();
              if (newP2) {
                await supabase.from('crm_activities').insert({
                  prospect_id: newP2.id,
                  type: 'prospect_discovered',
                  description: `Nouveau prospect: ${np.company} (${np.type || 'type inconnu'})`,
                  data: { action: 'discovered', company: np.company, type: np.type, email: np.email, agent: 'commercial' },
                  created_at: nowISO,
                });
              }
              console.log(`[CommercialAgent] New prospect (retry): ${np.company} (${np.type}, score: ${newScore}, email: ${np.email})`);
            } else {
              console.warn(`[CommercialAgent] Insert retry error for ${np.company}:`, retryError.message);
            }
          } else {
            console.warn(`[CommercialAgent] Insert error for ${np.company}:`, insertError.message);
          }
        }
      } catch (e: any) {
        console.error('[CommercialAgent] Phase 3 error:', e.message);
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
      phase3_external_prospection: {
        raw_found: allNewProspects.length,
        skipped_no_email: skippedNoEmail,
        dedup_skipped: dedupSkipped,
        new_prospects_created: newProspectsCreated,
        search_logs: searchLogs,
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
        message: `Commercial: ${enrichedCount} enrichis, ${socialEnrichedCount} sociaux trouvés, ${newProspectsCreated} nouveaux prospects, ${advancedToContactCount} → contacté, ${flaggedDeadCount} disqualifiés | CRM: ${totalProspects} total, ${withInstagram} IG, ${withTiktok} TikTok`,
      },
      created_at: nowISO,
    });

    // ── Save learnings from enrichment ──
    try {
      if (enrichedCount > 0 || newProspectsCreated > 0) {
        await saveLearning(supabase, {
          agent: 'commercial',
          category: 'prospection',
          learning: `Enrichissement: ${enrichedCount} prospects enrichis, ${newProspectsCreated} nouveaux trouvés. Taux d'enrichissement: ${(prospects?.length || 0) > 0 ? Math.round(enrichedCount / (prospects?.length || 1) * 100) : 0}%`,
          evidence: `Run ${mode}: ${prospects?.length || 0} traités, ${enrichedCount} enrichis, ${newProspectsCreated} externes, ${skippedCount} skipped`,
          confidence: 20,
        }, orgId);
      }

      // Track which business types have best enrichment rates
      const typeStats: Record<string, { enriched: number; total: number }> = {};
      for (const detail of enrichmentDetails) {
        const pType = detail.updates?.type || 'unknown';
        if (!typeStats[pType]) typeStats[pType] = { enriched: 0, total: 0 };
        typeStats[pType].total++;
        typeStats[pType].enriched++;
      }
      // Also count new prospects by type
      for (const np of allNewProspects) {
        if (np.type) {
          if (!typeStats[np.type]) typeStats[np.type] = { enriched: 0, total: 0 };
          typeStats[np.type].total++;
        }
      }
      const bestTypes = Object.entries(typeStats).sort((a, b) => b[1].enriched - a[1].enriched);
      if (bestTypes.length > 0) {
        const [topType, topData] = bestTypes[0];
        if (topData.enriched > 2) {
          await saveLearning(supabase, {
            agent: 'commercial',
            category: 'prospection',
            learning: `Type "${topType}" enrichit le mieux: ${topData.enriched} prospects avec données complètes`,
            evidence: `Top type this run: ${topType} with ${topData.enriched} enriched out of ${topData.total}`,
            confidence: 15,
          }, orgId);
        }
      }
    } catch (learnErr: any) {
      console.warn('[CommercialAgent] Learning save error:', learnErr.message);
    }

    // ── Feedback to CEO ──
    try {
      if (enrichedCount > 0 || newProspectsCreated > 0) {
        await saveAgentFeedback(supabase, {
          from_agent: 'commercial',
          to_agent: 'ceo',
          feedback: `Enrichissement: ${enrichedCount} prospects enrichis, ${newProspectsCreated} nouveaux découverts. ${socialEnrichedCount} profils sociaux trouvés. ${flaggedDeadCount > 0 ? `${flaggedDeadCount} prospects marqués dead.` : ''} Pipeline CRM: ${totalProspects || 0} total, ${withInstagram || 0} avec IG.`,
          category: 'prospection',
        }, orgId);
      }
    } catch (fbErr: any) {
      console.warn('[CommercialAgent] Feedback save error:', fbErr.message);
    }

    console.log(`[CommercialAgent] Done: ${enrichedCount} enriched, ${socialEnrichedCount} social, ${newProspectsCreated} NEW, ${advancedToContactCount} → contacté | CRM: ${totalProspects} total`);

    return NextResponse.json({
      ok: true,
      enriched: enrichedCount,
      social_enriched: socialEnrichedCount,
      new_prospects: newProspectsCreated,
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
