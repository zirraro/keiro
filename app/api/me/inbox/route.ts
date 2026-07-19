import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/me/inbox?direction=all|inbox|sent&limit=50
 *
 * Aggregates inbound + outbound emails for the caller into a single
 * timeline so the EmailPanel can show every message — including
 * those from senders that aren't in the CRM.
 *
 * Inbound: from agent_logs action='inbound_processed' (full body
 * stored by the IMAP poll).
 * Outbound: from crm_activities type='email' (Hugo cold + Hugo
 * auto-replies + manual sends from the panel).
 *
 * Returns emails sorted by date desc.
 */
export async function GET(req: NextRequest) {
  const { user } = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const direction = (req.nextUrl.searchParams.get('direction') || 'all').toLowerCase();
  const limit = Math.min(200, Math.max(10, parseInt(req.nextUrl.searchParams.get('limit') || '60')));

  const items: Array<{
    id: string;
    direction: 'inbox' | 'sent';
    date: string;
    from_email?: string;
    from_name?: string;
    to_email?: string;
    subject: string;
    body: string;
    message_id?: string;
    classification?: string | null;
    auto?: boolean;
    prospect_id?: string | null;
    blacklisted?: boolean;
  }> = [];

  if (direction === 'all' || direction === 'inbox') {
    const { data: inbound } = await sb
      .from('agent_logs')
      .select('id, data, created_at')
      .eq('agent', 'email')
      .eq('action', 'inbound_processed')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);
    for (const row of (inbound || []) as any[]) {
      const d = row.data || {};
      if (!d.from_email && !d.from) continue;
      items.push({
        id: row.id,
        direction: 'inbox',
        date: row.created_at,
        from_email: d.from_email || d.from,
        from_name: d.from_name || undefined,
        subject: d.subject || '(sans objet)',
        body: d.body || '',
        message_id: d.message_id,
        classification: d.classification || null,
      });
    }
  }

  if (direction === 'all' || direction === 'sent') {
    // Outbound: pull from crm_activities via inner-join on
    // crm_prospects so we filter server-side on prospect.user_id.
    // Previous version did `.in('prospect_id', [2000 ids])` which
    // built a URL > 8 KB and silently failed (no sent emails ever
    // showed up for users with many prospects).
    const { data: outbound, error: outboundErr } = await sb
      .from('crm_activities')
      .select('id, prospect_id, type, description, data, created_at, crm_prospects!inner(user_id)')
      .eq('crm_prospects.user_id', user.id)
      .eq('type', 'email')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (outboundErr) console.warn('[inbox] outbound query failed:', outboundErr.message);
    for (const row of (outbound || []) as any[]) {
      const d = row.data || {};
      // Attribution rule:
      //   manual_reply=true  → human (Toi)         — explicit override
      //   ai_generated=true  → AI   (Hugo)         — explicit
      //   source='daily_cron'/'sequence' → AI      — Hugo's cron path
      //   step or is_sequence_step       → AI      — Hugo's sequence flag
      //   auto_reply / auto              → AI      — Hugo replied to inbound
      //   else default to AI (legacy rows lacking flags are almost
      //   always Hugo since manual sends used to be agent_logs only).
      const isManual = d.manual_reply === true;
      const isAi = !isManual && (
        d.ai_generated === true ||
        d.auto_reply === true ||
        d.auto === true ||
        d.is_sequence_step === true ||
        typeof d.step === 'number' ||
        d.source === 'daily_cron' ||
        d.source === 'sequence'
      );
      // Skip les envois manuels ici : ils sont couverts par agent_logs
      // (manual_send) ci-dessous, source COMPLÈTE — y compris les mails vers une
      // adresse hors-CRM (prospect_id=null) que l'inner-join ci-dessus rate.
      // Évite aussi les doublons pour un envoi manuel vers un vrai prospect.
      if (isManual) continue;
      items.push({
        id: row.id,
        direction: 'sent',
        date: row.created_at,
        to_email: d.to_email || d.email || undefined,
        subject: d.subject || (row.description || '').substring(0, 80),
        body: d.body || d.message || row.description || '',
        message_id: d.message_id,
        auto: isAi || (!isManual && !isAi), // default → AI when ambiguous
        prospect_id: row.prospect_id,
      });
    }

    // Envois MANUELS depuis le panneau (bouton "Nouveau mail" / réponse). Source
    // complète et fiable : agent_logs action='manual_send' (écrit par
    // /api/me/send-email). Corrige le bug founder 19/07 : un mail manuel vers une
    // adresse hors-CRM n'apparaissait PAS dans « Envoyés » (l'inner-join
    // crm_prospects le supprimait). Ici on a le user_id direct, aucun join.
    const { data: manualSends } = await sb
      .from('agent_logs')
      .select('id, data, created_at')
      .eq('user_id', user.id)
      .eq('action', 'manual_send')
      .order('created_at', { ascending: false })
      .limit(limit);
    for (const row of (manualSends || []) as any[]) {
      const d = row.data || {};
      if (!d.to) continue;
      items.push({
        id: `manual_${row.id}`,
        direction: 'sent',
        date: row.created_at,
        to_email: d.to,
        subject: d.subject || '(sans objet)',
        body: d.body || '',
        message_id: d.message_id,
        auto: false, // envoi manuel = humain (Toi)
      });
    }
  }

  // Mark blacklisted senders so the UI can show a badge.
  const { data: bl } = await sb
    .from('email_blacklist')
    .select('email')
    .eq('client_id', user.id)
    .limit(2000);
  const blSet = new Set((bl || []).map((b: any) => (b.email || '').toLowerCase()));
  for (const it of items) {
    const target = (it.direction === 'inbox' ? it.from_email : it.to_email)?.toLowerCase();
    if (target && blSet.has(target)) it.blacklisted = true;
  }

  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Une boîte est-elle connectée (Gmail / domaine perso SMTP / Outlook) ? Sert à
  // l'UI : si NON connecté → afficher un aperçu EXEMPLE au lieu des vrais mails
  // (founder 15/07 : "quand déconnecté ça doit être des données sample").
  let mailboxConnected = false;
  let canReadInbox = false;
  try {
    const { data: prof } = await sb.from('profiles')
      .select('gmail_refresh_token, smtp_host, outlook_refresh_token')
      .eq('id', user.id).maybeSingle();
    mailboxConnected = !!(prof?.gmail_refresh_token || prof?.smtp_host || prof?.outlook_refresh_token);
    // LECTURE de la boîte = SMTP/IMAP (domaine perso) ou Outlook (Graph). Gmail en
    // option A (gmail.send) NE lit PAS → on montrera un APERÇU exemple étiqueté
    // pour ne pas perturber le reviewer Google (founder 16/07). Gmail readonly
    // (option B) sera ajouté ici quand le CASA sera validé.
    canReadInbox = !!(prof?.smtp_host || prof?.outlook_refresh_token);
  } catch { /* best-effort */ }

  return NextResponse.json({
    ok: true,
    mailboxConnected,
    canReadInbox,
    items: items.slice(0, limit),
    counts: {
      inbox: items.filter(i => i.direction === 'inbox').length,
      sent: items.filter(i => i.direction === 'sent').length,
    },
  });
}
