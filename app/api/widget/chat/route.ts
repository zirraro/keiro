import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { searchKnowledge } from '@/lib/agents/knowledge-rag';
import { saveLearning } from '@/lib/agents/learning';

export const runtime = 'nodejs';
export const maxDuration = 30;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// CORS headers for cross-origin widget
function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Widget-Key',
  };
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin') || '*';
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

/**
 * POST /api/widget/chat
 * Embeddable chatbot endpoint for client websites.
 * Auth via widget_key (linked to org_id).
 *
 * Body: { message, session_id, widget_key, visitor_profile? }
 */
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin') || '*';

  try {
    const body = await req.json();
    const { message, session_id, widget_key, visitor_profile } = body;

    if (!message || !widget_key) {
      return NextResponse.json({ error: 'message and widget_key required' }, { status: 400, headers: corsHeaders(origin) });
    }

    const supabase = getSupabase();

    // Validate widget key and get org config
    const { data: widgetConfig } = await supabase
      .from('widget_configs')
      .select('*, organizations(name, business_type, industry, locale, owner_user_id)')
      .eq('widget_key', widget_key)
      .eq('is_active', true)
      .single();

    if (!widgetConfig) {
      return NextResponse.json({ error: 'Invalid or inactive widget key' }, { status: 403, headers: corsHeaders(origin) });
    }

    // Plan gate — Clara chatbot is a Business+ feature (widget on client site).
    // Créateur/Pro plans see a 403 so they can't enable it accidentally.
    const ownerId = widgetConfig.organizations?.owner_user_id;
    if (ownerId) {
      const { data: ownerProfile } = await supabase
        .from('profiles')
        .select('subscription_plan, is_admin')
        .eq('id', ownerId)
        .maybeSingle();
      const plan = (ownerProfile?.subscription_plan || '').toLowerCase();
      const planAllowsChatbot = ownerProfile?.is_admin
        || ['business', 'fondateurs', 'elite', 'agence'].includes(plan);
      if (!planAllowsChatbot) {
        return NextResponse.json(
          { error: 'chatbot_not_in_plan', message: 'Clara chatbot requiert le plan Business.' },
          { status: 403, headers: corsHeaders(origin) },
        );
      }
    }

    const orgId = widgetConfig.org_id;
    const orgName = widgetConfig.organizations?.name || 'Commerce';
    const businessType = widgetConfig.organizations?.business_type || '';
    const sessionId = session_id || `widget_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Load conversation history for this session
    const { data: existingChat } = await supabase
      .from('widget_conversations')
      .select('messages')
      .eq('session_id', sessionId)
      .eq('org_id', orgId)
      .single();

    const history: Array<{ role: string; content: string }> = existingChat?.messages || [];

    // Load business dossier for context
    const { data: dossier } = await supabase
      .from('business_dossiers')
      .select('*')
      .eq('user_id', widgetConfig.user_id)
      .single();

    // Build visitor context from profile data
    let visitorContext = '';
    if (visitor_profile) {
      const parts: string[] = [];
      if (visitor_profile.city) parts.push(`Ville: ${visitor_profile.city}`);
      if (visitor_profile.country) parts.push(`Pays: ${visitor_profile.country}`);
      if (visitor_profile.device) parts.push(`Appareil: ${visitor_profile.device}`);
      if (visitor_profile.referrer) parts.push(`Venu de: ${visitor_profile.referrer}`);
      if (visitor_profile.pages_viewed) parts.push(`Pages vues: ${visitor_profile.pages_viewed.join(', ')}`);
      if (visitor_profile.time_on_site) parts.push(`Temps sur le site: ${visitor_profile.time_on_site}s`);
      if (visitor_profile.returning) parts.push('Visiteur de retour');
      if (visitor_profile.cart_items) parts.push(`Panier: ${visitor_profile.cart_items}`);
      if (parts.length) visitorContext = `\n\nPROFIL VISITEUR:\n${parts.join('\n')}`;
    }

    // Load cross-client intelligence from RAG
    // Anonymized patterns from ALL KeiroAI clients benefit each individual client
    let crossClientContext = '';
    try {
      const businessQuery = `${businessType} visiteur conversion achat recommandation`;
      const ragResults = await searchKnowledge(supabase, businessQuery, {
        category: 'content',
        businessType: businessType || undefined,
        threshold: 0.6,
        limit: 5,
      });
      if (ragResults.length > 0) {
        const insights = ragResults.map(r => `- ${r.content.substring(0, 200)}`).join('\n');
        crossClientContext = `\n\nINSIGHTS CROSS-CLIENTS (anonymises, de commerces similaires):\n${insights}`;
      }
    } catch {}

    // Clara is now the single client-facing widget agent — she does QA
    // (former "Max" job), onboarding/conversion AND retention follow-up.
    // agent_type is kept on widget_configs only to tune emphasis (chatbot
    // mode leans on QA + simple capture, onboarding mode leans deeper into
    // conversion + behavioural personalisation). Same persona either way.
    const agentType = widgetConfig.agent_type || 'chatbot';
    const greeting = widgetConfig.greeting_message || `Bonjour ! Comment puis-je vous aider ?`;

    // Auto-detect visitor language from their latest + recent messages and
    // tell the model to mirror it. Falls back to French when uncertain.
    const { languagePromptDirective: langFn } = await import('@/lib/agents/language-detect');
    const langSample = [message, ...history.slice(-4).filter(m => m.role === 'user').map(m => m.content)].join(' ');
    const langDirective = langFn(langSample);

    // ---- Returning visitor? ----
    // The retention angle: if the visitor has come back (returning flag
    // or prior session in this org), Clara should recognize them, ask
    // about their last interest, and surface a tailored next step rather
    // than greeting them like a stranger. Pulled from prior sessions on
    // the same org so we don't need to require a sticky cookie.
    let priorSessionsSignal = '';
    try {
      if (visitor_profile?.returning || visitor_profile?.total_purchases > 0) {
        const { data: prior } = await supabase
          .from('widget_conversations')
          .select('messages, message_count, last_message_at')
          .eq('org_id', orgId)
          .neq('session_id', sessionId)
          .order('last_message_at', { ascending: false })
          .limit(1);
        if (prior && prior.length > 0) {
          const lastMessages = (prior[0].messages || []).slice(-3).map((m: any) => `${m.role}: ${String(m.content).slice(0, 120)}`).join('\n');
          priorSessionsSignal = `\n\nVISITEUR DE RETOUR — derniere session (${prior[0].last_message_at}):\n${lastMessages}\nReconnais le subtilement et reprends le fil. Ne fais PAS comme si c'etait sa premiere visite.`;
        }
      }
    } catch { /* non-fatal */ }

    const baseDossier = dossier
      ? `Nom: ${dossier.company_name || orgName}\nDescription: ${dossier.company_description || ''}\nProduits: ${dossier.main_products || ''}\nCible: ${dossier.target_audience || ''}\nTon: ${dossier.brand_tone || 'chaleureux'}\nSite: ${dossier.website_url || ''}\nHoraires/adresse: ${dossier.address || ''}`
      : `Commerce: ${orgName}`;

    const emphasis = agentType === 'onboarding'
      ? `Tu portes plus fort le volet ACCUEIL + PERSONNALISATION : tu identifies vite le besoin, tu recommandes, tu reconnais les visiteurs qui reviennent et tu pousses subtilement vers conversion.`
      : `Tu portes plus fort le volet INFOS UTILES + QUALIFICATION : tu reponds vite aux questions frequentes (horaires, produits, prix, adresse), tu qualifies le visiteur (besoin, budget, urgence) et tu captures email/telephone.`;

    const systemPrompt = `${langDirective}

Tu es Clara, l'assistante IA cliente de ${orgName} (${businessType}). Tu remplis 3 roles a la fois — chatbot d'accueil, onboarding/conversion ET retention :

1. CHATBOT — tu reponds aux questions frequentes (horaires, prix, produits, adresse, disponibilites). Si tu ne sais pas, tu proposes de contacter l'equipe.
2. ONBOARDING / CONVERSION — tu personnalises selon le comportement de navigation (pages vues, temps sur le site, panier), tu recommandes le bon produit/service, tu fais de l'upsell/cross-sell subtil, tu pousses vers achat ou reservation.
3. RETENTION — si le visiteur est de retour, tu le reconnais et reprends la conversation au point ou elle s'etait arretee. Tu proposes de la nouveaute / des updates pertinents.

EMPHASE POUR CETTE INSTALLATION:
${emphasis}

DOSSIER BUSINESS:
${baseDossier}
${visitorContext}
${priorSessionsSignal}

OBJECTIFS PRIORITAIRES:
- Accueillir chaleureusement, sans pression
- Comprendre le besoin avant de pousser un produit
- Recommander en se basant sur les pages vues / le profil
- Capturer email ou telephone pour le CRM des qu'opportun (jamais en force)
- Reconnaitre les visiteurs qui reviennent, proposer la suite logique
- Pousser vers la bonne action finale (achat, RDV, contact)

REGLES STRICTES:
- Tutoie si brand_tone decontracte, vouvoie si pro. Ne mixe jamais les deux dans une meme session.
- Messages courts: 2-3 phrases max, 1 idee a la fois.
- Pose UNE question OU fais UNE recommandation par message, pas les deux.
- JAMAIS de pression agressive ("vite", "derniere chance" non sollicite).
- Si le visiteur cite un produit, parle de CE produit.
- Si tu ne sais pas, dis-le et propose un contact humain.
- Match la langue du visiteur (voir bloc LANGUAGE en haut).
${crossClientContext}`;

    // Call Claude
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const claudeMessages = [
      ...history.slice(-20).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: message },
    ];

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: systemPrompt,
      temperature: 0.7,
      messages: claudeMessages,
    });

    const reply = response.content[0].type === 'text' ? response.content[0].text.trim() : '';

    // Save conversation
    const newMessages = [
      ...history,
      { role: 'user', content: message, timestamp: new Date().toISOString() },
      { role: 'assistant', content: reply, timestamp: new Date().toISOString() },
    ];

    await supabase.from('widget_conversations').upsert({
      session_id: sessionId,
      org_id: orgId,
      messages: newMessages,
      visitor_profile: visitor_profile || null,
      last_message_at: new Date().toISOString(),
      message_count: newMessages.length,
    }, { onConflict: 'session_id' });

    // Save visitor interaction as learning for cross-client intelligence (every 5th message)
    if (newMessages.length > 0 && newMessages.length % 10 === 0 && visitor_profile) {
      try {
        const pagesStr = visitor_profile.pages_viewed?.slice(-5).join(', ') || '';
        const productsStr = visitor_profile.products_viewed?.slice(-3).join(', ') || '';
        const converted = visitor_profile.total_purchases > 0;
        await saveLearning(supabase, {
          agent: 'chatbot',
          category: 'conversion',
          learning: `Widget visiteur ${businessType}: ${visitor_profile.city || '?'}, ${visitor_profile.device || '?'}, ${visitor_profile.returning ? 'retour' : 'nouveau'}. Pages: ${pagesStr}. Produits vus: ${productsStr}. ${converted ? 'A ACHETE' : 'Pas encore converti'}. ${newMessages.length} messages echanges.`,
          evidence: `Session widget ${sessionId}`,
          confidence: converted ? 45 : 25,
          orgId: orgId || undefined,
        });
      } catch {}
    }

    // Extract email/phone if mentioned
    const emailMatch = message.match(/[\w.-]+@[\w.-]+\.\w+/);
    const phoneMatch = message.match(/(?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/);
    if (emailMatch || phoneMatch) {
      // Save lead to CRM
      try {
        await supabase.from('crm_prospects').insert({
          email: emailMatch?.[0] || null,
          phone: phoneMatch?.[0] || null,
          source: 'widget_chatbot',
          status: 'new',
          temperature: 'warm',
          org_id: orgId,
          notes: `Capture via widget chat. Session: ${sessionId}`,
        });
      } catch {}
    }

    return NextResponse.json({
      reply,
      session_id: sessionId,
    }, { headers: corsHeaders(origin) });

  } catch (err: any) {
    console.error('[Widget Chat] Error:', err);
    return NextResponse.json(
      { error: 'Erreur interne' },
      { status: 500, headers: corsHeaders(origin) }
    );
  }
}
