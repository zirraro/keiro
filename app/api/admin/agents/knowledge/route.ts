/**
 * Liste le pool de savoir mutualisé d'un agent.
 * Filtrable par ?agent= et ?business_type= et ?category=.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const supabase = sb();
  const { data: profile } = await supabase.from('profiles').select('is_admin, subscription_plan').eq('id', user.id).maybeSingle();
  if (!profile?.is_admin && profile?.subscription_plan !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const url = new URL(req.url);
  const agent = url.searchParams.get('agent');
  const businessType = url.searchParams.get('business_type');
  const category = url.searchParams.get('category');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 500);

  let q = supabase
    .from('agent_knowledge')
    .select('id, agent, business_type, category, summary, content, confidence, source, usage_count, last_used_at, created_at, updated_at')
    .order('confidence', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (agent) q = q.eq('agent', agent);
  if (businessType) q = q.eq('business_type', businessType);
  if (category) q = q.eq('category', category);

  const { data, error: queryErr } = await q;
  if (queryErr) return NextResponse.json({ ok: false, error: queryErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, knowledge: data || [], count: (data || []).length });
}
