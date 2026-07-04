import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/notifications — Get client notifications (unread + recent)
 * POST /api/notifications — Mark notification(s) as read
 */
export async function GET() {
  const { user } = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  // Get unread count + last 50 notifications
  const { data: notifications } = await supabase
    .from('client_notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  const unreadCount = (notifications || []).filter(n => !n.read).length;

  // ── ACTIONS RÉELLES uniquement (founder 03/07) ──
  // Le popup "actions en attente" ne doit PLUS afficher toutes les notifs
  // (info/brief = purement informatif → cloche seule). Il ne compte QUE ce qui
  // demande VRAIMENT une action manuelle du client : type 'action' (reconnecter
  // un réseau, valider un brouillon, follow manuel, email à vérifier…) ou
  // 'alert' (échec à corriger). Ça arrête l'accumulation de "51 actions" bidon.
  const ACTION_TYPES = new Set(['action', 'alert']);
  const actionNotifs = (notifications || []).filter(n => !n.read && ACTION_TYPES.has((n.type || 'info')));

  // Hot prospects needing human intervention (affichés dans le panneau, PAS
  // comptés dans le total — ils ne sont pas une action manuelle bloquante et
  // gonflaient le compteur ×3 avant).
  const { data: hotProspects } = await supabase
    .from('crm_prospects')
    .select('id, company, email, type, status, temperature')
    .eq('temperature', 'hot')
    .in('status', ['repondu', 'interesse', 'demo'])
    .order('updated_at', { ascending: false })
    .limit(10);

  // Badges par agent = uniquement les vraies actions.
  const badges: Record<string, number> = {};
  for (const n of actionNotifs) {
    if (n.agent) badges[n.agent] = (badges[n.agent] || 0) + 1;
  }

  const totalPending = actionNotifs.length;

  // Signature stable de l'ensemble d'actions courant : permet au front de ne
  // ré-afficher le popup QUE si de NOUVELLES actions apparaissent (sinon le
  // masquage tient).
  const actionSignature = actionNotifs.map(n => n.id).sort().join(',');

  return NextResponse.json({
    notifications: notifications || [],
    unreadCount,
    totalPending,
    actionSignature,
    badges,
    hotProspects: (hotProspects || []).map(p => ({
      id: p.id,
      company: p.company || p.email,
      type: p.type,
      status: p.status,
    })),
  });
}

export async function POST(req: NextRequest) {
  const { user } = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const { action, notificationId, notificationIds } = await req.json();

  if (action === 'mark_read' && notificationId) {
    await supabase
      .from('client_notifications')
      .update({ read: true })
      .eq('id', notificationId)
      .eq('user_id', user.id);
  }

  if (action === 'mark_all_read') {
    await supabase
      .from('client_notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false);
  }

  if (action === 'mark_read_bulk' && notificationIds?.length) {
    await supabase
      .from('client_notifications')
      .update({ read: true })
      .in('id', notificationIds)
      .eq('user_id', user.id);
  }

  return NextResponse.json({ ok: true });
}
