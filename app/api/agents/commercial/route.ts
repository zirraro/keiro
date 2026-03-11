import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getCommercialSystemPrompt } from '@/lib/agents/commercial-prompt';
import { getAgentContext, reportLearning } from '@/lib/agents/agent-memory';
import { generateAIResponse, isAIConfigured, AI_API_KEY_NAME } from '@/lib/ai-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// Reduced from 200 to 30 to avoid 504 timeouts — each prospect = 1 AI call (~2-3s)
const MAX_PROSPECTS_PER_RUN = 30;

// Timeout per AI enrichment call (15s max)
const ENRICHMENT_TIMEOUT_MS = 15_000;

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

/**
 * Try to extract email from a website's HTML.
 * Looks for mailto: links and email patterns in page content.
 */
async function findEmailFromWebsite(website: string): Promise<string | null> {
  try {
    const res = await fetch(website, { signal: AbortSignal.timeout(5000), redirect: 'follow' });
    if (!res.ok) return null;
    const html = await res.text();

    // 1. Check mailto: links first (most reliable)
    const mailtoRegex = /mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi;
    const mailtoMatch = mailtoRegex.exec(html);
    if (mailtoMatch) return mailtoMatch[1].toLowerCase();

    // 2. Look for email patterns in text
    const emailRegex = /\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b/gi;
    const allEmails: string[] = [];
    let match;
    while ((match = emailRegex.exec(html)) !== null) {
      const email = match[1].toLowerCase();
      // Skip common non-contact emails
      if (!email.endsWith('.png') && !email.endsWith('.jpg') && !email.endsWith('.svg')
          && !email.includes('example.com') && !email.includes('sentry.io')
          && !email.includes('webpack') && !email.includes('schema.org')) {
        allEmails.push(email);
      }
    }

    if (allEmails.length === 0) return null;

    // Prefer professional emails (contact@, info@, bonjour@) over generic ones
    const preferred = allEmails.find(e => {
      const local = e.split('@')[0];
      return ['contact', 'info', 'bonjour', 'hello', 'reservation', 'reservations'].includes(local);
    });
    return preferred || allEmails[0];
  } catch {
    return null;
  }
}

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
    // Race the AI call against a timeout to avoid hanging the entire run
    const aiPromise = generateAIResponse({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: getCommercialSystemPrompt() + (directive ? `\n\n--- DIRECTIVE STRATEGIQUE DU CEO ---\n${directive}\n--- FIN DIRECTIVE ---` : ''),
      messages: [{ role: 'user', content: prospectAnalysisPrompt }],
    });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('AI call timeout')), ENRICHMENT_TIMEOUT_MS)
    );
    const aiResponse = await Promise.race([aiPromise, timeoutPromise]);
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
    console.log('[CommercialAgent] Cron triggered — running enrichment pipeline + audit');
    // Run enrichment first, then audit existing prospects
    const enrichResult = await runEnrichment();

    // Also run a quick audit of existing CRM prospects (non-blocking)
    try {
      const supabase = getSupabaseAdmin();
      await runCRMAudit(supabase, new Date().toISOString());
      console.log('[CommercialAgent] Cron audit complete');
    } catch (e: any) {
      console.warn('[CommercialAgent] Cron audit failed (non-blocking):', e.message);
    }

    return enrichResult;
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

    // --- Fast diagnostic: single count query ---
    const { count: totalAll } = await supabase
      .from('crm_prospects').select('id', { count: 'exact', head: true });
    const { count: totalContacte } = await supabase
      .from('crm_prospects').select('id', { count: 'exact', head: true })
      .eq('status', 'contacte');
    const { count: totalWithEmail } = await supabase
      .from('crm_prospects').select('id', { count: 'exact', head: true })
      .not('email', 'is', null);
    const { count: totalDead } = await supabase
      .from('crm_prospects').select('id', { count: 'exact', head: true })
      .eq('temperature', 'dead');

    console.log(`[CommercialAgent] CRM: ${totalAll ?? 0} total, ${totalContacte ?? 0} contacte, ${totalWithEmail ?? 0} with email, ${totalDead ?? 0} dead`);

    // Fetch prospects that need enrichment OR need to be advanced to 'contacte'
    // Includes: missing data, status 'new'/'identifie' not yet in email sequence
    const { data: prospects, error: fetchError } = await supabase
      .from('crm_prospects')
      .select('id, email, first_name, company, type, quartier, note_google, email_sequence_status, temperature, status, website, source_agent')
      .or('type.is.null,quartier.is.null,email_sequence_status.is.null,email_sequence_status.eq.not_started,status.eq.new,status.eq.identifie,email.is.null')
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
      // --- Step 0: Try to find email from website if prospect has no email ---
      if (!prospect.email && prospect.website) {
        console.log(`[CommercialAgent] Prospect ${prospect.id} (${prospect.company}) has no email but has website — extracting...`);
        const extractedEmail = await findEmailFromWebsite(prospect.website);
        if (extractedEmail) {
          console.log(`[CommercialAgent] Found email for ${prospect.company}: ${extractedEmail}`);
          prospect.email = extractedEmail;
          // Update DB immediately so we don't lose the email if enrichment fails
          await supabase.from('crm_prospects').update({
            email: extractedEmail,
            updated_at: nowISO,
          }).eq('id', prospect.id);
        }
      }

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

      // Advance prospect to 'contacte' if ready and not already in email sequence
      const notYetInSequence = !prospect.email_sequence_status
        || prospect.email_sequence_status === 'not_started';
      if (isReadyForEmail && notYetInSequence && prospect.status !== 'contacte') {
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

const MAX_AUDIT_PER_RUN = 20;

/**
 * Audit existing CRM prospects: re-verify data quality, check websites, find missing emails.
 * Targets prospects already in 'contacte' or in email sequence that haven't been audited recently.
 */
async function runCRMAudit(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  nowISO: string
): Promise<NextResponse> {
  console.log('[CommercialAgent] Running CRM audit...');

  // Fetch active prospects that are already in sequence or contacte
  // Prioritize those without recent audit (updated_at > 7 days ago)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: prospects, error } = await supabase
    .from('crm_prospects')
    .select('id, email, company, type, quartier, website, phone, status, temperature, email_sequence_status, email_sequence_step, source_agent, updated_at')
    .neq('temperature', 'dead')
    .not('status', 'in', '("perdu","disqualified")')
    .lt('updated_at', sevenDaysAgo)
    .order('updated_at', { ascending: true })
    .limit(MAX_AUDIT_PER_RUN);

  if (error) {
    console.error('[CommercialAgent] Audit fetch error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!prospects || prospects.length === 0) {
    console.log('[CommercialAgent] Audit: all prospects audited recently');
    return NextResponse.json({ ok: true, audited: 0, message: 'Tous les prospects ont ete verifies recemment' });
  }

  console.log(`[CommercialAgent] Auditing ${prospects.length} prospects...`);

  let fixedEmail = 0;
  let fixedWebsite = 0;
  let flaggedDead = 0;
  let updatedCount = 0;
  const auditDetails: Array<{ id: string; company: string; actions: string[] }> = [];

  for (const prospect of prospects) {
    const actions: string[] = [];
    const updates: Record<string, any> = {};

    // 1. Check if website is still up (if we have one)
    if (prospect.website) {
      try {
        const res = await fetch(prospect.website, {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000),
          redirect: 'follow',
        });
        if (!res.ok && res.status >= 400) {
          actions.push(`website_down (HTTP ${res.status})`);
          // Don't kill the prospect, just note it
        }
      } catch {
        actions.push('website_unreachable');
      }
    }

    // 2. Try to find/update email if prospect has no email but has website
    if (!prospect.email && prospect.website) {
      const extractedEmail = await findEmailFromWebsite(prospect.website);
      if (extractedEmail) {
        updates.email = extractedEmail;
        updates.email_sequence_status = 'not_started';
        updates.email_sequence_step = 0;
        updates.status = 'contacte';
        fixedEmail++;
        actions.push(`email_found: ${extractedEmail}`);
      }
    }

    // 3. Verify email format for existing emails
    if (prospect.email) {
      const emailLower = prospect.email.toLowerCase();
      const disposableDomains = ['yopmail.com', 'guerrillamail.com', 'tempmail.com', 'mailinator.com', 'throwaway.email', 'trashmail.com', 'fakeinbox.com'];
      const domain = emailLower.split('@')[1];
      if (domain && disposableDomains.includes(domain)) {
        updates.temperature = 'dead';
        updates.status = 'disqualified';
        flaggedDead++;
        actions.push(`disposable_email: ${domain}`);
      }
    }

    // 4. Check company name coherence (flag generic names)
    if (prospect.company && prospect.type) {
      const companyLower = prospect.company.toLowerCase().trim();
      const typeLower = prospect.type.toLowerCase().trim();
      const genericPatterns = [
        new RegExp(`^${typeLower}\\s+(paris|lyon|marseille|bordeaux|lille|toulouse|nice)`, 'i'),
        new RegExp(`^(le |la |les )?${typeLower}$`, 'i'),
      ];
      for (const pattern of genericPatterns) {
        if (pattern.test(companyLower)) {
          updates.temperature = 'dead';
          updates.status = 'disqualified';
          flaggedDead++;
          actions.push(`generic_company_name: "${prospect.company}"`);
          break;
        }
      }
    }

    // Always bump updated_at to mark as audited
    updates.updated_at = nowISO;

    if (Object.keys(updates).length > 1 || actions.length > 0) {
      const { error: updateError } = await supabase
        .from('crm_prospects')
        .update(updates)
        .eq('id', prospect.id);

      if (!updateError) {
        updatedCount++;
        if (actions.length > 0) {
          auditDetails.push({ id: prospect.id, company: prospect.company || '?', actions });
        }
      }
    } else {
      // Just mark as audited
      await supabase.from('crm_prospects').update({ updated_at: nowISO }).eq('id', prospect.id);
    }
  }

  // Log audit
  const report = {
    audited: prospects.length,
    updated: updatedCount,
    emails_found: fixedEmail,
    websites_checked: fixedWebsite,
    flagged_dead: flaggedDead,
    details: auditDetails,
    timestamp: nowISO,
  };

  await supabase.from('agent_logs').insert({
    agent: 'commercial',
    action: 'crm_audit',
    data: report,
    created_at: nowISO,
  });

  // Report to CEO
  await supabase.from('agent_logs').insert({
    agent: 'commercial',
    action: 'report_to_ceo',
    data: {
      message: `Audit CRM: ${prospects.length} prospects verifies, ${fixedEmail} emails trouves, ${flaggedDead} disqualifies.${auditDetails.length > 0 ? ' Actions: ' + auditDetails.map(d => `${d.company}: ${d.actions.join(', ')}`).slice(0, 5).join('; ') : ''}`,
      phase: 'audit_complete',
    },
    status: 'success',
    created_at: nowISO,
  });

  console.log(`[CommercialAgent] Audit complete: ${prospects.length} checked, ${fixedEmail} emails found, ${flaggedDead} flagged dead`);

  return NextResponse.json({ ok: true, ...report });
}

/**
 * POST /api/agents/commercial
 * Source new qualified prospects into the CRM.
 * Accepts: { prospects: Array<{ company, email?, phone?, type?, quartier?, website?, instagram?, notes? }> }
 * Or: { action: "source_ai", query: "restaurants italiens Paris 11e", count?: number }
 * Or: { action: "audit" } — re-verify existing CRM prospects (website up, email valid, data coherence)
 */
export async function POST(request: NextRequest) {
  const { authorized } = await verifyAuth(request);
  if (!authorized) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const supabase = getSupabaseAdmin();
  const nowISO = new Date().toISOString();

  // --- Mode: Audit existing CRM prospects ---
  if (body.action === 'audit') {
    return runCRMAudit(supabase, nowISO);
  }

  // --- Mode 1: AI-assisted prospect generation ---
  if (body.action === 'source_ai') {
    if (!isAIConfigured()) {
      return NextResponse.json({ ok: false, error: `${AI_API_KEY_NAME} non configuree` }, { status: 500 });
    }

    const query = body.query || 'commerces locaux Paris';
    const count = Math.min(body.count || 10, 20);

    try {
      const aiResponse = await generateAIResponse({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 3000,
        system: `Tu es un agent commercial expert en prospection B2B pour KeiroAI, une plateforme SaaS pour commerces locaux (restaurants, boutiques, coaches, coiffeurs, etc.).

Tu dois generer des prospects REALISTES et QUALIFIES pour la requete donnee. Chaque prospect doit avoir:
- company: nom d'entreprise realiste et credible
- type: un de ${VALID_TYPES.join(', ')}
- quartier: quartier/zone geographique
- email: email professionnel plausible (format prenom@domaine.com ou contact@entreprise.com)
- phone: numero de telephone francais (06/07)
- score: score de qualification 0-100 (base sur la pertinence pour KeiroAI)

IMPORTANT: Genere UNIQUEMENT des prospects qui correspondent a la cible KeiroAI (commerces locaux qui beneficieraient d'une solution IA pour leur marketing/operations).

Reponds UNIQUEMENT avec un tableau JSON valide, sans markdown.`,
        messages: [{
          role: 'user',
          content: `Genere ${count} prospects qualifies pour: "${query}"`,
        }],
      });

      const jsonMatch = aiResponse.text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return NextResponse.json({ ok: false, error: 'AI n\'a pas genere de JSON valide' }, { status: 500 });
      }

      const aiProspects = JSON.parse(jsonMatch[0]);
      body.prospects = aiProspects;
    } catch (error: any) {
      return NextResponse.json({ ok: false, error: `AI sourcing error: ${error.message}` }, { status: 500 });
    }
  }

  // --- Mode 2: Direct prospect insertion ---
  const prospects = body.prospects;
  if (!Array.isArray(prospects) || prospects.length === 0) {
    return NextResponse.json({ ok: false, error: 'prospects[] requis (array non vide)' }, { status: 400 });
  }

  const inserted: string[] = [];
  const skipped: Array<{ company: string; reason: string }> = [];

  for (const p of prospects) {
    if (!p.company || p.company.length < 2) {
      skipped.push({ company: p.company || '(vide)', reason: 'Nom entreprise manquant ou trop court' });
      continue;
    }

    // Check for duplicates by company name
    const { data: existing } = await supabase
      .from('crm_prospects')
      .select('id')
      .ilike('company', p.company)
      .limit(1);

    if (existing && existing.length > 0) {
      skipped.push({ company: p.company, reason: 'Doublon (entreprise deja en CRM)' });
      continue;
    }

    // Also check by email if provided
    if (p.email) {
      const { data: emailExists } = await supabase
        .from('crm_prospects')
        .select('id')
        .eq('email', p.email.toLowerCase())
        .limit(1);

      if (emailExists && emailExists.length > 0) {
        skipped.push({ company: p.company, reason: 'Doublon (email deja en CRM)' });
        continue;
      }
    }

    const type = p.type && VALID_TYPES.includes(p.type.toLowerCase()) ? p.type.toLowerCase() : null;
    const score = typeof p.score === 'number' ? Math.min(100, Math.max(0, p.score)) : 50;

    const row: Record<string, any> = {
      company: p.company,
      email: p.email?.toLowerCase() || null,
      phone: p.phone || null,
      type,
      quartier: p.quartier || null,
      website: p.website || null,
      instagram: p.instagram || null,
      notes: p.notes || null,
      source: 'import',
      source_agent: 'commercial',
      // If prospect has email, mark as 'contacte' so email agent picks them up immediately
      status: p.email ? 'contacte' : 'identifie',
      temperature: score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold',
      score,
      email_sequence_status: p.email ? 'not_started' : null,
      email_sequence_step: 0,
      created_at: nowISO,
      updated_at: nowISO,
    };

    const { data: insertedRow, error: insertError } = await supabase
      .from('crm_prospects')
      .insert(row)
      .select('id')
      .single();

    if (insertError) {
      console.error(`[CommercialAgent] Insert error for ${p.company}:`, insertError.message);
      skipped.push({ company: p.company, reason: insertError.message });
    } else {
      inserted.push(insertedRow.id);
    }
  }

  // Log the sourcing run
  await supabase.from('agent_logs').insert({
    agent: 'commercial',
    action: 'prospect_sourcing',
    data: {
      total_input: prospects.length,
      inserted: inserted.length,
      skipped: skipped.length,
      skipped_details: skipped,
      source: body.action === 'source_ai' ? 'ai_generated' : 'manual_import',
      query: body.query || null,
    },
    created_at: nowISO,
  });

  // Report to CEO
  await supabase.from('agent_logs').insert({
    agent: 'commercial',
    action: 'report_to_ceo',
    data: {
      message: `Sourcing: ${inserted.length} nouveaux prospects ajoutes, ${skipped.length} ignores. Source: ${body.action === 'source_ai' ? 'IA' : 'import manuel'}.`,
      phase: 'sourcing_complete',
    },
    status: 'success',
    created_at: nowISO,
  });

  console.log(`[CommercialAgent] Sourcing complete: ${inserted.length} inserted, ${skipped.length} skipped`);

  return NextResponse.json({
    ok: true,
    inserted: inserted.length,
    skipped: skipped.length,
    skipped_details: skipped,
    prospect_ids: inserted,
  });
}
