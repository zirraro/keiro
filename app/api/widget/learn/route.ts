import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { saveLearning } from '@/lib/agents/learning';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/widget/learn
 * Analyze recent widget conversations and extract learnings for the RAG pool.
 * Called by cron (marketing_learn slot) daily.
 *
 * Extracts:
 * - Most common visitor questions
 * - What triggers conversions (purchases, email captures)
 * - Common objections
 * - Popular products/pages
 * - Visitor behavior patterns
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Get recent widget conversations with messages
  const { data: conversations } = await supabase
    .from('widget_conversations')
    .select('session_id, org_id, messages, visitor_profile, message_count')
    .gte('last_message_at', since)
    .gt('message_count', 2) // Only conversations with actual exchanges
    .order('last_message_at', { ascending: false })
    .limit(50);

  if (!conversations || conversations.length === 0) {
    return NextResponse.json({ ok: true, message: 'No widget conversations to analyze', learnings: 0 });
  }

  // Prepare conversation summaries for AI analysis
  const convSummaries = conversations.map(c => {
    const msgs = (c.messages || []).slice(-10); // Last 10 messages
    const profile = c.visitor_profile || {};
    return {
      messages: msgs.map((m: any) => `${m.role}: ${m.content?.substring(0, 200)}`).join('\n'),
      pages: profile.pages_viewed?.join(', ') || 'unknown',
      city: profile.city || 'unknown',
      device: profile.device || 'unknown',
      returning: profile.returning || false,
      purchase: profile.total_purchases > 0,
      cart_value: profile.cart_value || 0,
    };
  });

  // AI analysis
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'ANTHROPIC_API_KEY missing' }, { status: 500 });
  }

  const anthropic = new Anthropic({ apiKey });
  let learnings: string[] = [];

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `Analyse ces ${conversations.length} conversations de chatbot widget (sur les sites clients KeiroAI) et extrais des LEARNINGS actionnables.

CONVERSATIONS:
${convSummaries.map((c, i) => `--- Conv ${i + 1} (${c.city}, ${c.device}, ${c.returning ? 'retour' : 'nouveau'}${c.purchase ? ', ACHAT' : ''}) ---\nPages: ${c.pages}\n${c.messages}`).join('\n\n').substring(0, 8000)}

Extrais 3-8 learnings sous forme de liste JSON:
["Learning 1: ...", "Learning 2: ..."]

Focus sur:
- Questions les plus frequentes des visiteurs
- Ce qui declenche un achat ou une capture d'email
- Objections courantes
- Pages/produits populaires
- Patterns de comportement (heure, device, returning)
- Ce que le chatbot ne sait pas repondre

Reponds UNIQUEMENT avec le JSON array.`,
      }],
    });

    const reply = response.content[0].type === 'text' ? response.content[0].text.trim() : '[]';
    try {
      const match = reply.match(/\[[\s\S]*\]/);
      if (match) learnings = JSON.parse(match[0]);
    } catch {}
  } catch (e: any) {
    console.error('[Widget Learn] AI analysis error:', e.message);
  }

  // Save learnings to RAG
  let saved = 0;
  for (const learning of learnings) {
    if (!learning || learning.length < 15) continue;
    try {
      // Get the most common org_id from conversations
      const orgId = conversations.find(c => c.org_id)?.org_id || null;
      await saveLearning(supabase, {
        agent: 'chatbot',
        category: 'content',
        learning: `Widget insight: ${learning}`,
        evidence: `Analyse de ${conversations.length} conversations widget en 24h`,
        confidence: 30,
        orgId: orgId || undefined,
      });
      saved++;
    } catch {}
  }

  // Log
  await supabase.from('agent_logs').insert({
    agent: 'chatbot',
    action: 'widget_learning',
    status: 'success',
    data: {
      conversations_analyzed: conversations.length,
      learnings_extracted: saved,
      learnings,
    },
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    conversations_analyzed: conversations.length,
    learnings_saved: saved,
  });
}
