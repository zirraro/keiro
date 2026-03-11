import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getCommercialSystemPrompt } from '@/lib/agents/commercial-prompt';
import { getAgentContext, reportLearning } from '@/lib/agents/agent-memory';
import { generateAIResponse, isAIConfigured, AI_API_KEY_NAME } from '@/lib/ai-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

const MAX_PROSPECTS_PER_RUN = 200;

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
  reasoning: string;
}

/**
 * Enrich a single prospect using Claude Haiku.
 */
async function enrichProspect(prospect: {
  id: string;
  email: string | null;
  first_name: string | null;
  company: string | null;
  type: string | null;
  quartier: string | null;
  note_google: number | null;
}, directive?: string): Promise<EnrichmentResult | null> {
  if (!isAIConfigured()) return null;

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
    const aiResponse = await generateAIResponse({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: getCommercialSystemPrompt() + (directive ? `\n\n--- DIRECTIVE STRATEGIQUE DU CEO ---\n${directive}\n--- FIN DIRECTIVE ---` : ''),
      messages: [{ role: 'user', content: prospectAnalysisPrompt }],
    });
    const rawText = aiResponse.text;

    // Parse JSON from response
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
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
    console.log('[CommercialAgent] Cron triggered — running enrichment pipeline');
    return runEnrichment();
  }

  // Admin UI: return last enrichment report
  try {
    const supabase = getSupabaseAdmin();
    const { data: report, error } = await supabase
      .from('agent_logs')
      .select('*')
      .eq('agent', 'commercial')
      .eq('action', 'enrichment_run')
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
 * Core: fetch incomplete prospects, enrich via Claude, update DB.
 */
async function runEnrichment(): Promise<NextResponse> {
  try {
    const supabase = getSupabaseAdmin();
    const nowISO = new Date().toISOString();

    if (!isAIConfigured()) {
      return NextResponse.json({ ok: false, error: `${AI_API_KEY_NAME} non configuree` }, { status: 500 });
    }

    // --- Read CEO directive for commercial agent ---
    let agentDirective = '';
    try {
      agentDirective = await getAgentContext('commercial');
      if (agentDirective) {
        console.log(`[CommercialAgent] Active directive: ${agentDirective.substring(0, 100)}...`);
      }
    } catch {}

    // --- Diagnostic: log CRM state before filtering ---
    const { count: totalAll } = await supabase
      .from('crm_prospects').select('id', { count: 'exact', head: true });
    const { count: totalDead } = await supabase
      .from('crm_prospects').select('id', { count: 'exact', head: true })
      .eq('temperature', 'dead');
    const { count: totalNoType } = await supabase
      .from('crm_prospects').select('id', { count: 'exact', head: true })
      .is('type', null);
    const { count: totalNoQuartier } = await supabase
      .from('crm_prospects').select('id', { count: 'exact', head: true })
      .is('quartier', null);
    const { count: totalNew } = await supabase
      .from('crm_prospects').select('id', { count: 'exact', head: true })
      .eq('status', 'new');
    const { count: totalIdentifie } = await supabase
      .from('crm_prospects').select('id', { count: 'exact', head: true })
      .eq('status', 'identifie');
    const { count: totalNotStarted } = await supabase
      .from('crm_prospects').select('id', { count: 'exact', head: true })
      .eq('email_sequence_status', 'not_started');
    const { count: totalNoSequence } = await supabase
      .from('crm_prospects').select('id', { count: 'exact', head: true })
      .is('email_sequence_status', null);
    const { count: totalContacte } = await supabase
      .from('crm_prospects').select('id', { count: 'exact', head: true })
      .eq('status', 'contacte');
    const { count: totalWithEmail } = await supabase
      .from('crm_prospects').select('id', { count: 'exact', head: true })
      .not('email', 'is', null);

    console.log(`[CommercialAgent] === CRM DIAGNOSTIC ===`);
    console.log(`[CommercialAgent] Total prospects: ${totalAll ?? 0}`);
    console.log(`[CommercialAgent] Dead (excluded): ${totalDead ?? 0}`);
    console.log(`[CommercialAgent] No type: ${totalNoType ?? 0}`);
    console.log(`[CommercialAgent] No quartier: ${totalNoQuartier ?? 0}`);
    console.log(`[CommercialAgent] Status 'new': ${totalNew ?? 0}`);
    console.log(`[CommercialAgent] Status 'identifie': ${totalIdentifie ?? 0}`);
    console.log(`[CommercialAgent] Status 'contacte': ${totalContacte ?? 0}`);
    console.log(`[CommercialAgent] Email sequence null: ${totalNoSequence ?? 0}`);
    console.log(`[CommercialAgent] Email sequence not_started: ${totalNotStarted ?? 0}`);
    console.log(`[CommercialAgent] With email: ${totalWithEmail ?? 0}`);
    console.log(`[CommercialAgent] === END DIAGNOSTIC ===`);

    // Fetch prospects that need enrichment OR need to be advanced to 'contacte'
    // Includes: missing data, status 'new'/'identifie' not yet in email sequence
    const { data: prospects, error: fetchError } = await supabase
      .from('crm_prospects')
      .select('id, email, first_name, company, type, quartier, note_google, email_sequence_status, temperature, status')
      .or('type.is.null,quartier.is.null,email_sequence_status.is.null,email_sequence_status.eq.not_started,status.eq.new,status.eq.identifie')
      .neq('temperature', 'dead')
      .order('created_at', { ascending: true })
      .limit(MAX_PROSPECTS_PER_RUN);

    if (fetchError) {
      console.error('[CommercialAgent] Error fetching prospects:', fetchError);
      return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
    }

    console.log(`[CommercialAgent] Query returned ${prospects?.length ?? 0} prospects after filters`);

    if (!prospects || prospects.length === 0) {
      console.log('[CommercialAgent] No prospects to enrich — all prospects are either enriched+in_sequence or dead');

      // Report learning about empty pipeline
      try {
        await reportLearning('commercial', {
          insight: `Pipeline vide: 0 prospects a enrichir. CRM total: ${totalAll ?? 0}, dead: ${totalDead ?? 0}, contacte: ${totalContacte ?? 0}, avec email: ${totalWithEmail ?? 0}`,
          metric_name: 'pipeline_status',
          metric_before: 0,
          metric_after: 0,
          recommendation: (totalAll ?? 0) === 0
            ? 'CRM vide. Besoin de lancer l\'agent GMaps ou d\'importer des prospects.'
            : (totalDead ?? 0) > (totalAll ?? 0) * 0.5
              ? 'Plus de 50% des prospects sont dead. La source de prospection genere des donnees de mauvaise qualite. Lancer GMaps avec de nouveaux criteres.'
              : 'Tous les prospects actifs sont deja en sequence email. Besoin de nouvelles sources.',
        });
      } catch {}

      await supabase.from('agent_logs').insert({
        agent: 'commercial',
        action: 'enrichment_run',
        data: {
          prospects_found: 0,
          enriched: 0,
          flagged_dead: 0,
          skipped: 0,
          crm_total: totalAll ?? 0,
          crm_dead: totalDead ?? 0,
          crm_contacte: totalContacte ?? 0,
          crm_with_email: totalWithEmail ?? 0,
          diagnostic: 'No prospects match enrichment criteria',
          timestamp: nowISO,
        },
        created_at: nowISO,
      });

      // Report to CEO
      await supabase.from('agent_logs').insert({
        agent: 'commercial',
        action: 'report_to_ceo',
        data: {
          message: `Pipeline enrichissement vide. CRM: ${totalAll ?? 0} total, ${totalDead ?? 0} dead, ${totalContacte ?? 0} prets, ${totalWithEmail ?? 0} avec email. Besoin de nouvelles sources (GMaps, import).`,
          phase: 'enrichment_complete',
        },
        status: 'success',
        created_at: nowISO,
      });

      return NextResponse.json({ ok: true, enriched: 0, message: 'Aucun prospect a enrichir', diagnostic: {
        crm_total: totalAll ?? 0,
        crm_dead: totalDead ?? 0,
        crm_contacte: totalContacte ?? 0,
        crm_with_email: totalWithEmail ?? 0,
        crm_no_type: totalNoType ?? 0,
        crm_status_new: totalNew ?? 0,
        crm_status_identifie: totalIdentifie ?? 0,
      }});
    }

    console.log(`[CommercialAgent] Found ${prospects.length} prospects to enrich`);
    // Log first 3 prospects for debugging
    for (const p of prospects.slice(0, 3)) {
      console.log(`[CommercialAgent] Sample prospect: id=${p.id}, email=${p.email}, type=${p.type}, status=${p.status}, seq_status=${p.email_sequence_status}`);
    }

    let enrichedCount = 0;
    let flaggedDeadCount = 0;
    let skippedCount = 0;
    let advancedToContactCount = 0;
    const enrichmentDetails: Array<{
      prospect_id: string;
      company: string | null;
      updates: Record<string, any>;
      reasoning: string;
    }> = [];

    for (const prospect of prospects) {
      const result = await enrichProspect(prospect, agentDirective || undefined);

      if (!result) {
        skippedCount++;
        continue;
      }

      // Build update object — only update fields that are currently missing
      // and where the AI has sufficient confidence
      const updates: Record<string, any> = {};

      // Update type if missing and AI is confident
      if (!prospect.type && result.type && VALID_TYPES.includes(result.type) && result.type_confidence >= 70) {
        updates.type = result.type;
      }

      // Update quartier if missing and AI is confident
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
          updates.status = 'disqualified';
          flaggedDeadCount++;
          console.log(`[CommercialAgent] Flagged prospect ${prospect.id} as dead (email: ${prospect.email}, flags: ${result.email_flags?.join(', ')})`);
        }
      }

      // Flag fake company names — not ready for email outreach
      const hasCompanyNameFake = result.email_flags?.includes('company_name_fake');
      if (hasCompanyNameFake) {
        console.log(`[CommercialAgent] Fake company name detected for ${prospect.id}: "${prospect.company}" — blocking from email sequence`);
      }

      // Determine if prospect is ready to be contacted
      // Needs: email + type + data completeness >= 60% + real company name
      const isReadyForEmail = prospect.email && result.email_valid
        && (prospect.type || (result.type && result.type_confidence >= 70))
        && result.data_completeness_score >= 60
        && !hasCompanyNameFake;

      if (isReadyForEmail && !prospect.email_sequence_status) {
        updates.status = 'contacte';
        updates.email_sequence_status = 'not_started';
        updates.email_sequence_step = 0;
        advancedToContactCount++;
      }

      // Always update updated_at if we have any changes
      if (Object.keys(updates).length > 0) {
        updates.updated_at = nowISO;

        const { error: updateError } = await supabase
          .from('crm_prospects')
          .update(updates)
          .eq('id', prospect.id);

        if (updateError) {
          console.error(`[CommercialAgent] Error updating prospect ${prospect.id}:`, updateError);
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

    // Get total CRM count for reporting
    const { count: totalProspects } = await supabase
      .from('crm_prospects')
      .select('id', { count: 'exact', head: true });

    const { count: readyToContact } = await supabase
      .from('crm_prospects')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'contacte');

    // Log the enrichment run
    const runReport = {
      prospects_found: prospects.length,
      enriched: enrichedCount,
      advanced_to_contact: advancedToContactCount,
      flagged_dead: flaggedDeadCount,
      skipped: skippedCount,
      crm_total: totalProspects || 0,
      crm_ready_to_contact: readyToContact || 0,
      details: enrichmentDetails,
      timestamp: nowISO,
    };

    await supabase.from('agent_logs').insert({
      agent: 'commercial',
      action: 'enrichment_run',
      data: runReport,
      created_at: nowISO,
    });

    console.log(`[CommercialAgent] Enrichment complete: ${enrichedCount} enriched, ${advancedToContactCount} → contacté, ${flaggedDeadCount} flagged dead, ${skippedCount} skipped | CRM total: ${totalProspects}`);

    // --- Auto-learning: report insights to CEO ---
    try {
      const enrichRate = prospects.length > 0 ? Math.round((enrichedCount / prospects.length) * 100) : 0;
      await reportLearning('commercial', {
        insight: `Enrichissement: ${enrichedCount}/${prospects.length} prospects enrichis (${enrichRate}%). ${advancedToContactCount} prets a contacter, ${flaggedDeadCount} disqualifies.`,
        metric_name: 'enrichment_rate',
        metric_after: enrichRate,
        recommendation: flaggedDeadCount > enrichedCount
          ? 'Beaucoup de prospects disqualifies. La source de prospection genere des donnees de mauvaise qualite.'
          : advancedToContactCount === 0
            ? 'Aucun prospect pret a contacter. Verifier les criteres de qualification (email, type, completeness).'
            : `${advancedToContactCount} prospects prets pour la sequence email.`,
      });
    } catch {}

    return NextResponse.json({
      ok: true,
      enriched: enrichedCount,
      advanced_to_contact: advancedToContactCount,
      flagged_dead: flaggedDeadCount,
      skipped: skippedCount,
      total: prospects.length,
      crm_total: totalProspects || 0,
    });
  } catch (error: any) {
    console.error('[CommercialAgent] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
