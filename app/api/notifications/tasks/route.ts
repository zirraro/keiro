import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Tâches lancées depuis le chat qui viennent de se TERMINER.
 *
 * Sert le pop-up de fin de tâche (fondateur 2026-07-30) : « faudrait un pop-up
 * qui sort sur la page du client, la tâche demandée à tel agent est finie, avec
 * le détail rapide et une croix — sinon il oublie ».
 *
 * On ne renvoie que les fins de tâche demandées explicitement par le client
 * (source 'chat_task'), jamais les traitements de fond : le pop-up doit rester
 * rare et attendu, sinon il devient du bruit qu'on apprend à ignorer.
 */
export async function GET() {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ ok: false, tasks: [] }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  try {
    const { data } = await supabase
      .from('client_notifications')
      .select('id, agent, title, message, data, created_at')
      .eq('user_id', user.id)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(20);

    const tasks = (data || [])
      .filter((n: any) => n?.data?.source === 'chat_task')
      .slice(0, 5)
      .map((n: any) => ({
        id: n.id,
        agent: n.agent,
        // `title` porte déjà le nom de l'agent (« Hugo: c'est terminé »).
        title: n.title,
        message: n.message,
        ok: n.data?.ok !== false,
        action: n.data?.target_action || null,
        at: n.created_at,
      }));

    return NextResponse.json({ ok: true, tasks });
  } catch {
    return NextResponse.json({ ok: true, tasks: [] });
  }
}
