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
      .select('*, organizations(name, business_type, industry, locale)')
      .eq('widget_key', widget_key)
      .eq('is_active', true)
      .single();

    if (!widgetConfig) {
      return NextResponse.json({ error: 'Invalid or inactive widget key' }, { status: 403, headers: corsHeaders(origin) });
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

    // Build system prompt
    const agentType = widgetConfig.agent_type || 'chatbot'; // 'chatbot' (Max) or 'onboarding' (Clara)
    const greeting = widgetConfig.greeting_message || `Bonjour ! Comment puis-je vous aider ?`;

    const systemPrompt = agentType === 'onboarding'
      ? `Tu es Clara, assistante d'onboarding pour ${orgName} (${businessType}). Tu guides les visiteurs dans leur parcours d'achat, tu personnalises l'experience et tu pousses subtilement vers la conversion.

DOSSIER BUSINESS:
${dossier ? `Nom: ${dossier.company_name || orgName}\nDescription: ${dossier.company_description || ''}\nProduits: ${dossier.main_products || ''}\nCible: ${dossier.target_audience || ''}\nTon: ${dossier.brand_tone || 'chaleureux'}` : `Commerce: ${orgName}`}
${visitorContext}

OBJECTIFS:
- Accueillir chaleureusement le visiteur
- Comprendre ses besoins en posant des questions naturelles
- Recommander les produits/services adaptes a son profil
- Upsell et cross-sell subtils bases sur son comportement de navigation
- Capturer son email/tel pour le CRM si possible
- Pousser vers l'achat ou la reservation
- Analyser son comportement (pages vues, temps, panier) pour personnaliser

REGLES:
- Tutoie si ton decontracte, vouvoie si ton pro (selon le brand_tone)
- Messages courts (2-3 phrases max)
- 1 question ou 1 recommandation par message
- JAMAIS de pression agressive — toujours subtil et naturel
- Si le visiteur a vu une page produit, mentionne ce produit
- Si le visiteur revient, reconnais-le et propose du nouveau
- Reponds en francais
${crossClientContext}`

      : `Tu es Max, chatbot IA de ${orgName} (${businessType}). Tu accueilles les visiteurs, reponds a leurs questions et les guides vers l'achat ou le contact.

DOSSIER BUSINESS:
${dossier ? `Nom: ${dossier.company_name || orgName}\nDescription: ${dossier.company_description || ''}\nProduits: ${dossier.main_products || ''}\nHoraires: ${dossier.address || ''}\nSite: ${dossier.website_url || ''}` : `Commerce: ${orgName}`}
${visitorContext}

OBJECTIFS:
- Repondre aux questions frequentes (horaires, produits, prix, adresse)
- Qualifier le visiteur (besoin, budget, urgence)
- Capturer email/telephone pour le CRM
- Proposer un RDV ou une visite
- Rediriger vers les bons produits/pages

REGLES:
- Messages courts et utiles (2-3 phrases)
- Si tu ne sais pas, propose de contacter l'equipe
- Reponds en francais`;

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
