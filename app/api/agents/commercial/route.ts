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
      maxTokens: 1000,
    });

    // Strip ALL markdown code fences
    const cleanText = rawText.replace(/```[\w]*\s*/g, '');
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[CommercialAgent] No JSON from Google search:', rawText.substring(0, 300));
      return null;
    }

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
      maxTokens: 1000,
    });

    // Strip ALL markdown code fences
    const cleanText = rawText.replace(/```[\w]*\s*/g, '');
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // Try to salvage truncated JSON by adding closing brace
      const partialMatch = cleanText.match(/\{[\s\S]*/);
      if (partialMatch) {
        try {
          const fixed = partialMatch[0].replace(/,?\s*$/, '') + '}';
          const result: EnrichmentResult = JSON.parse(fixed);
          console.log('[CommercialAgent] Salvaged truncated JSON for prospect');
          return result;
        } catch { /* couldn't salvage */ }
      }
      console.error('[CommercialAgent] No JSON found in response:', rawText.substring(0, 300));
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
 * Accepts optional body: { action: 'verify_crm' | 'prospect_external' | 'full' }
 * - verify_crm: Phase 1 only (audit/enrich existing prospects)
 * - prospect_external: Phase 2 only (Google Search for social data)
 * - full (default): Both phases
 */
export async function POST(request: NextRequest) {
  const { authorized } = await verifyAuth(request);
  if (!authorized) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  let action = 'full';
  try {
    const body = await request.json();
    if (body?.action) action = body.action;
  } catch {}

  return runEnrichment(action as 'verify_crm' | 'prospect_external' | 'full');
}

/**
 * Core: fetch incomplete prospects, enrich via Gemini + Google Search, update DB.
 */
async function runEnrichment(mode: 'verify_crm' | 'prospect_external' | 'full' = 'full'): Promise<NextResponse> {
  const runStartTime = Date.now();
  const MAX_RUN_MS = 250_000; // Hard limit: 250s to leave 50s margin for reporting

  try {
    const supabase = getSupabaseAdmin();
    const nowISO = new Date().toISOString();

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ ok: false, error: 'GEMINI_API_KEY non configuree' }, { status: 500 });
    }

    // Load shared context from all agents (see what email/DM/content agents have done)
    const sharedCtx = await loadSharedContext(supabase, 'commercial');
    const ctxText = formatContextForPrompt(sharedCtx);
    console.log(`[CommercialAgent] CRM: ${sharedCtx.crmStats.total} prospects, ${sharedCtx.crmStats.hot} hot, ${sharedCtx.crmStats.withInstagram} IG — mode: ${mode}`);

    const runPhase1 = mode === 'verify_crm' || mode === 'full';
    const runPhase2 = mode === 'prospect_external' || mode === 'full';

    // === PHASE 1: Data enrichment (type, quartier, email validation) ===
    // Fetch prospects that need enrichment — broad fetch, filter in JS for reliability
    const { data: rawProspects, error: fetchError } = runPhase1
      ? await supabase
          .from('crm_prospects')
          .select('id, email, first_name, company, type, quartier, note_google, email_sequence_status, temperature, status, instagram, tiktok_handle, website, google_rating, google_reviews')
          .not('temperature', 'eq', 'dead')
          .order('created_at', { ascending: true })
          .limit(500)
      : { data: [] as any[], error: null };

    // Filter: prospects that need enrichment (missing type/quartier, or never processed, or old ones to re-verify)
    const prospects = (rawProspects || []).filter(p => {
      // Skip dead/perdu
      if (p.temperature === 'dead' || p.status === 'perdu') return false;
      // Needs enrichment if missing type, quartier, or hasn't been processed
      const needsType = !p.type;
      const needsQuartier = !p.quartier;
      const isNew = !p.status || p.status === 'new' || p.status === 'identifie';
      const neverProcessed = !p.email_sequence_status;
      return needsType || needsQuartier || isNew || neverProcessed;
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

        if (!prospect.type && result.type && VALID_TYPES.includes(result.type) && result.type_confidence >= 70) {
          updates.type = result.type;
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
        } else {
          skippedCount++;
        }
      }
    }

    // === PHASE 2: Social media enrichment via Google Search ===
    // Find prospects with company name but missing social data
    const { data: rawSocialProspects } = runPhase2
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
        }

        // Small delay between batches to be safe with Gemini rate limits (15 req/min)
        if (b + SEARCH_BATCH_SIZE < socialProspects.length) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }

    // === PHASE 3: External prospection — find NEW businesses via Google Search ===
    let newProspectsCreated = 0;
    const MAX_NEW_PROSPECTS = 15;

    if (runPhase2 && (Date.now() - runStartTime < MAX_RUN_MS)) {
      console.log('[CommercialAgent] Phase 3: Searching for new qualified prospects...');

      // Rotate through business types and cities each run
      const businessTypes = ['restaurant', 'boutique', 'coiffeur', 'coach', 'fleuriste', 'caviste', 'traiteur', 'freelance'];
      const cities = ['Paris', 'Lyon', 'Marseille', 'Bordeaux', 'Lille', 'Nantes', 'Toulouse', 'Strasbourg', 'Nice', 'Montpellier', 'Rennes'];

      // Use day-of-year to rotate through combinations
      const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
      const hourOfDay = new Date().getUTCHours();
      const typeIdx = (dayOfYear * 3 + hourOfDay) % businessTypes.length;
      const cityIdx = (dayOfYear * 2 + hourOfDay) % cities.length;
      const targetType = businessTypes[typeIdx];
      const targetCity = cities[cityIdx];
      const targetType2 = businessTypes[(typeIdx + 1) % businessTypes.length];
      const targetCity2 = cities[(cityIdx + 1) % cities.length];

      try {
        const searchResult = await callGeminiWithSearch({
          system: `Tu es un agent commercial expert en prospection B2B pour KeiroAI, un outil IA de création de contenu marketing pour commerces locaux français.

TON OBJECTIF : trouver des VRAIS commerces locaux français qui existent réellement, avec leurs coordonnées vérifiées.

CRITÈRES DE QUALIFICATION :
- Commerces locaux ou PME en France (pas de grandes chaînes)
- Actifs sur Instagram ou ayant un site web (présence en ligne)
- De préférence entre 100 et 50K abonnés Instagram
- Avec une adresse physique vérifiable
- Secteurs : restaurants, boutiques, coachs, coiffeurs, fleuristes, cavistes, traiteurs, freelances

CE QUE TU DOIS CHERCHER :
- Comptes Instagram de commerces locaux dans la ville ciblée
- Pages Google Maps avec bonnes notes
- Sites web de commerces locaux
- Annuaires professionnels (PagesJaunes, etc.)

Retourne UNIQUEMENT un tableau JSON de prospects qualifiés :
[
  {
    "company": "Nom exact du commerce",
    "type": "restaurant|boutique|coach|coiffeur|fleuriste|caviste|traiteur|freelance|services",
    "quartier": "Ville ou quartier",
    "instagram": "handle_sans_arobase" | null,
    "website": "https://..." | null,
    "email": "contact@..." | null,
    "phone": "+33..." | null,
    "google_rating": 4.5 | null,
    "google_reviews": 123 | null,
    "description": "Description courte de l'activité",
    "qualification_reason": "Pourquoi ce prospect est qualifié pour KeiroAI"
  }
]

RÈGLES STRICTES :
- UNIQUEMENT des commerces RÉELS que tu as trouvés via la recherche
- JAMAIS d'inventions — chaque commerce doit exister
- Vérifie que le nom est correct et correspond au type
- Si tu ne trouves pas assez de résultats, retourne ce que tu as (même 3-4 c'est OK)
- UNIQUEMENT du JSON valide, pas de markdown`,
          message: `Recherche des commerces locaux qualifiés pour KeiroAI :

RECHERCHE 1 : ${targetType}s à ${targetCity} — trouve des ${targetType}s actifs sur Instagram ou ayant un site web
RECHERCHE 2 : ${targetType2}s à ${targetCity2} — trouve des ${targetType2}s avec présence en ligne

Cherche sur Google Maps, Instagram, PagesJaunes, et le web. Trouve ${MAX_NEW_PROSPECTS} commerces qualifiés au total.`,
          maxTokens: 4000,
        });

        // Parse results
        let newProspects: any[] = [];
        try {
          const cleanText = searchResult.replace(/```[\w]*\s*/g, '').trim();
          const jsonMatch = cleanText.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            newProspects = JSON.parse(jsonMatch[0]);
          }
        } catch (e) {
          console.error('[CommercialAgent] Phase 3: Failed to parse prospects:', e);
        }

        console.log(`[CommercialAgent] Phase 3: Found ${newProspects.length} new prospects (${targetType}@${targetCity} + ${targetType2}@${targetCity2})`);

        // Insert new prospects into CRM (skip duplicates)
        for (const np of newProspects) {
          if (!np.company || np.company.length < 2) continue;
          if (newProspectsCreated >= MAX_NEW_PROSPECTS) break;

          // Check for duplicates by company name OR instagram handle
          let isDuplicate = false;

          if (np.instagram) {
            const handle = np.instagram.replace(/^@/, '');
            const { data: existingIG } = await supabase
              .from('crm_prospects')
              .select('id')
              .eq('instagram', handle)
              .limit(1);
            if (existingIG && existingIG.length > 0) { isDuplicate = true; }
          }

          if (!isDuplicate) {
            const { data: existingName } = await supabase
              .from('crm_prospects')
              .select('id')
              .ilike('company', np.company)
              .limit(1);
            if (existingName && existingName.length > 0) { isDuplicate = true; }
          }

          if (isDuplicate) {
            console.log(`[CommercialAgent] Skip duplicate: ${np.company}`);
            continue;
          }

          // Create new prospect
          const igHandle = np.instagram ? np.instagram.replace(/^@/, '') : null;
          const newScore = calculateScore({
            email: np.email,
            instagram: igHandle,
            website: np.website,
            google_rating: np.google_rating,
            google_reviews: np.google_reviews,
            type: np.type,
          });
          const newTemp = calculateTemperature(newScore);

          const { error: insertError } = await supabase.from('crm_prospects').insert({
            company: np.company,
            type: VALID_TYPES.includes(np.type) ? np.type : 'pme',
            quartier: np.quartier || targetCity,
            instagram: igHandle,
            website: np.website || null,
            email: np.email || null,
            phone: np.phone || null,
            google_rating: np.google_rating || null,
            note_google: np.google_rating || null,
            google_reviews: np.google_reviews || null,
            status: 'identifie',
            temperature: newTemp,
            score: newScore,
            source: 'prospection_commerciale',
            source_agent: 'commercial',
            notes: np.qualification_reason || null,
            created_at: nowISO,
            updated_at: nowISO,
          });

          if (!insertError) {
            newProspectsCreated++;
            console.log(`[CommercialAgent] New prospect: ${np.company} (${np.type}, ${np.quartier}, score: ${newScore})`);
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
        new_prospects_created: newProspectsCreated,
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
