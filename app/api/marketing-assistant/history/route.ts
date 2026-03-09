import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * GET /api/marketing-assistant/history
 * Returns the latest conversation's messages (persists across sessions).
 * Also returns a summary of past conversation topics for personalization.
 */
export async function GET() {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Non authentifié' }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the most recent non-archived conversation (no 24h limit)
    const { data: conversation, error: convError } = await supabase
      .from('assistant_conversations')
      .select('id, last_message_at, title, business_context')
      .eq('user_id', user.id)
      .eq('is_archived', false)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .single();

    if (convError || !conversation) {
      return NextResponse.json({ ok: true, conversationId: null, messages: [], pastTopics: [] });
    }

    // Fetch messages for this conversation (last 30 messages)
    const { data: messages, error: msgError } = await supabase
      .from('assistant_messages')
      .select('id, role, content, created_at')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true })
      .limit(30);

    if (msgError) {
      console.error('[MarketingAssistant] Error fetching messages:', msgError);
      return NextResponse.json({ ok: false, error: msgError.message }, { status: 500 });
    }

    // Fetch past conversation titles for context (last 10 conversations)
    const { data: pastConversations } = await supabase
      .from('assistant_conversations')
      .select('title, business_context, last_message_at, message_count')
      .eq('user_id', user.id)
      .neq('id', conversation.id)
      .order('last_message_at', { ascending: false })
      .limit(10);

    const pastTopics = (pastConversations || []).map((c: any) => c.title).filter(Boolean);

    return NextResponse.json({
      ok: true,
      conversationId: conversation.id,
      messages: (messages || []).map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.created_at,
      })),
      pastTopics,
    });
  } catch (error: any) {
    console.error('[MarketingAssistant] History error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
