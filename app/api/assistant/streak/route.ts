import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * GET /api/assistant/streak
 * Returns the user's consecutive publishing/activity streak in days
 * Counts days where the user generated content or interacted with agents
 */
export async function GET() {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Auth required' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();

    // Get all activity dates (content generation + agent chats) in the last 60 days
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const [visuals, chats] = await Promise.all([
      supabase
        .from('user_visuals')
        .select('created_at')
        .eq('user_id', user.id)
        .gte('created_at', sixtyDaysAgo.toISOString())
        .order('created_at', { ascending: false }),
      supabase
        .from('client_agent_chats')
        .select('updated_at')
        .eq('user_id', user.id)
        .gte('updated_at', sixtyDaysAgo.toISOString())
        .order('updated_at', { ascending: false }),
    ]);

    // Collect unique active dates
    const activeDates = new Set<string>();

    for (const v of visuals.data || []) {
      activeDates.add(new Date(v.created_at).toISOString().split('T')[0]);
    }
    for (const c of chats.data || []) {
      activeDates.add(new Date(c.updated_at).toISOString().split('T')[0]);
    }

    // Calculate streak: count consecutive days going back from today
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 60; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      const dateStr = checkDate.toISOString().split('T')[0];

      if (activeDates.has(dateStr)) {
        streak++;
      } else if (i === 0) {
        // Today has no activity yet — check if yesterday continues the streak
        continue;
      } else {
        break;
      }
    }

    return NextResponse.json({
      ok: true,
      streak,
      activeDays: activeDates.size,
    });
  } catch (error: any) {
    console.error('[Streak] Error:', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
