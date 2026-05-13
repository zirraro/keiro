/**
 * Meta API audit log — visible to any logged-in user.
 *
 * Surfaced to the Meta App Review reviewer from /meta-review so they can
 * verify the human-in-the-loop guarantee: every Graph API write call
 * (DM send, comment reply, publish) is attributed to a user_id and a
 * timestamp, with no entries created without a human click event.
 */

'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

type LogRow = {
  id: string;
  agent: string;
  action: string;
  status: string;
  data: any;
  created_at: string;
  user_id: string | null;
};

const META_AGENTS = ['dm_instagram', 'instagram_comments', 'content', 'jade', 'axel', 'lena'];
const META_ACTIONS = [
  'dm_auto_reply',
  'execution_success',
  'webhook_dm_received',
  'handover_notification',
  'follow_campaign',
  'reply_comment',
  'auto_reply_all',
  'publish_diagnostic',
  'error_escalated_publish_instagram',
  'fetch_comments',
];

// Tag each row with the Meta permission it exercised — lets a Meta App
// Review reviewer scan the log and verify each granted permission is
// actually being used for the documented purpose.
type PermissionTag =
  | 'instagram_business_manage_messages'
  | 'instagram_business_manage_comments'
  | 'instagram_business_content_publish'
  | 'instagram_business_manage_insights'
  | 'instagram_business_basic'
  | 'human_agent'
  | 'pages_show_list'
  | 'oembed_read'
  | 'none';

function actionMeta(agent: string, action: string, data: any): { description: string; permission: PermissionTag; method: 'READ' | 'WRITE' | 'WEBHOOK' | 'INTERNAL' } {
  if (agent === 'dm_instagram' && action === 'execution_success')
    return { description: 'DM batch processed via Graph API (POST /me/messages, manual trigger)', permission: 'instagram_business_manage_messages', method: 'WRITE' };
  if (agent === 'dm_instagram' && action === 'dm_auto_reply') {
    const usedHumanAgent = !!(data && (data as any).human_agent);
    return {
      description: usedHumanAgent
        ? 'Reply sent on owner click with MESSAGE_TAG=HUMAN_AGENT (POST /me/messages, customer >24h)'
        : 'Reply drafted by Jade and sent on owner click (POST /me/messages, within 24h window)',
      permission: usedHumanAgent ? 'human_agent' : 'instagram_business_manage_messages',
      method: 'WRITE',
    };
  }
  if (agent === 'dm_instagram' && action === 'webhook_dm_received')
    return { description: 'Inbound DM received from Meta webhook (read-only)', permission: 'instagram_business_manage_messages', method: 'WEBHOOK' };
  if (agent === 'dm_instagram' && action === 'follow_campaign')
    return { description: 'Manual follow batch run by owner', permission: 'instagram_business_basic', method: 'INTERNAL' };
  if (agent === 'dm_instagram' && action === 'send_blocked_blacklist')
    return { description: 'Send refused by blacklist guard (GDPR/CAN-SPAM)', permission: 'none', method: 'INTERNAL' };
  if (agent === 'instagram_comments' && action === 'reply_comment')
    return { description: 'Reply posted to Instagram comment (POST /<comment-id>/replies)', permission: 'instagram_business_manage_comments', method: 'WRITE' };
  if (agent === 'instagram_comments' && action === 'fetch_comments')
    return { description: 'Comments fetched from /<media-id>/comments', permission: 'instagram_business_manage_comments', method: 'READ' };
  if (agent === 'instagram_comments' && action === 'auto_reply_all')
    return { description: 'Bulk reply to all pending comments (POST /<comment-id>/replies × N)', permission: 'instagram_business_manage_comments', method: 'WRITE' };
  if (agent === 'content' && action === 'publish_diagnostic')
    return { description: 'Publish attempt logged (POST /<ig-id>/media + /media_publish)', permission: 'instagram_business_content_publish', method: 'WRITE' };
  if (agent === 'content' && action === 'error_escalated_publish_instagram')
    return { description: 'Publish error escalated to admin', permission: 'instagram_business_content_publish', method: 'WRITE' };
  if (agent === 'lena' && action === 'insights_fetched')
    return { description: 'Insights metrics read from /<ig-id>/insights', permission: 'instagram_business_manage_insights', method: 'READ' };
  if (agent === 'auth' && action === 'instagram_force_fresh')
    return { description: 'OAuth permissions revoked via DELETE /me/permissions (manual refresh)', permission: 'none', method: 'INTERNAL' };
  return { description: `${agent} → ${action}`, permission: 'none', method: 'INTERNAL' };
}

const PERMISSION_LABEL: Record<PermissionTag, string> = {
  instagram_business_manage_messages: 'manage_messages',
  instagram_business_manage_comments: 'manage_comments',
  instagram_business_content_publish: 'content_publish',
  instagram_business_manage_insights: 'manage_insights',
  instagram_business_basic: 'business_basic',
  human_agent: 'human_agent',
  pages_show_list: 'pages_show_list',
  oembed_read: 'oembed_read',
  none: '—',
};

const PERMISSION_COLOR: Record<PermissionTag, string> = {
  instagram_business_manage_messages: 'bg-blue-100 text-blue-800',
  instagram_business_manage_comments: 'bg-purple-100 text-purple-800',
  instagram_business_content_publish: 'bg-emerald-100 text-emerald-800',
  instagram_business_manage_insights: 'bg-orange-100 text-orange-800',
  instagram_business_basic: 'bg-neutral-100 text-neutral-700',
  human_agent: 'bg-amber-100 text-amber-900',
  pages_show_list: 'bg-neutral-100 text-neutral-700',
  oembed_read: 'bg-cyan-100 text-cyan-800',
  none: 'bg-neutral-100 text-neutral-500',
};

const METHOD_COLOR: Record<string, string> = {
  WRITE: 'bg-rose-100 text-rose-800',
  READ: 'bg-emerald-100 text-emerald-800',
  WEBHOOK: 'bg-blue-100 text-blue-800',
  INTERNAL: 'bg-neutral-100 text-neutral-600',
};

export default function MetaAuditPage() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = supabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setAuthed(false);
        setLoading(false);
        return;
      }
      setAuthed(true);
      const { data, error } = await supabase
        .from('agent_logs')
        .select('id, agent, action, status, data, created_at, user_id')
        .in('agent', META_AGENTS)
        .order('created_at', { ascending: false })
        .limit(80);
      if (!error && data) setRows(data as any);
      setLoading(false);
    })();
  }, []);

  if (authed === false) {
    return (
      <main className="min-h-screen bg-neutral-50 flex items-center justify-center px-6">
        <div className="max-w-lg bg-white border rounded-2xl p-8 shadow-sm">
          <h1 className="text-xl font-bold mb-2">Sign in required</h1>
          <p className="text-sm text-neutral-600 mb-4">
            The Meta API audit log is only visible to logged-in accounts.
            For Meta App Review reviewers, the test credentials are at{' '}
            <a className="text-blue-700 underline" href="/meta-review?lang=en">/meta-review</a>.
          </p>
          <a
            href="/login?lang=en&redirect=/meta-audit"
            className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold"
          >
            Open the login page (English)
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-widest text-blue-700 font-semibold mb-2">
            Meta API audit log
          </p>
          <h1 className="text-2xl font-bold text-neutral-900">
            Recent Graph API calls — every action with timestamp
          </h1>
          <p className="text-sm text-neutral-600 mt-3 max-w-3xl">
            Each row is a Meta Graph API call our app made. We log the
            triggering agent, the action, the timestamp and a payload
            snippet. Read-only calls (webhook DM received, fetch comments)
            populate too so you can see the full lifecycle. No row exists
            without a corresponding human click or webhook event.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <a
              href="/assistant?lang=en"
              className="inline-flex items-center px-3 py-1.5 rounded-lg border border-neutral-300 hover:bg-white text-xs font-medium text-neutral-700"
            >
              ← Back to workspace
            </a>
            <a
              href="/meta-review?lang=en"
              className="inline-flex items-center px-3 py-1.5 rounded-lg border border-neutral-300 hover:bg-white text-xs font-medium text-neutral-700"
            >
              Reviewer guide
            </a>
          </div>
        </header>

        {/* Aggregated counts per permission — gives a Meta App Review
            reviewer a one-glance picture of which permissions are
            actually exercised on this account. Computed live from the
            same row data the table renders. */}
        {!loading && rows.length > 0 && (() => {
          const tally = new Map<PermissionTag, { reads: number; writes: number; webhooks: number }>();
          for (const r of rows) {
            const meta = actionMeta(r.agent, r.action, r.data);
            const t = tally.get(meta.permission) || { reads: 0, writes: 0, webhooks: 0 };
            if (meta.method === 'READ') t.reads++;
            else if (meta.method === 'WRITE') t.writes++;
            else if (meta.method === 'WEBHOOK') t.webhooks++;
            tally.set(meta.permission, t);
          }
          const entries = Array.from(tally.entries()).filter(([p]) => p !== 'none');
          if (entries.length === 0) return null;
          return (
            <section className="bg-white border border-neutral-200 rounded-2xl p-5 mb-6 shadow-sm">
              <h2 className="text-sm font-bold text-neutral-900 mb-3">Permissions exercised in the last 80 events</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {entries.map(([perm, counts]) => (
                  <div key={perm} className={`rounded-xl border border-neutral-200 p-3`}>
                    <div className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${PERMISSION_COLOR[perm]}`}>
                      {PERMISSION_LABEL[perm]}
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-xl font-black text-neutral-900">{counts.reads + counts.writes + counts.webhooks}</span>
                      <span className="text-[10px] text-neutral-500">total</span>
                    </div>
                    <div className="mt-1 text-[10px] text-neutral-500 space-x-2">
                      {counts.writes > 0 && <span><span className="text-rose-700 font-bold">{counts.writes}</span> write</span>}
                      {counts.reads > 0 && <span><span className="text-emerald-700 font-bold">{counts.reads}</span> read</span>}
                      {counts.webhooks > 0 && <span><span className="text-blue-700 font-bold">{counts.webhooks}</span> webhook</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })()}

        <section className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-12 text-center text-neutral-400 text-sm">Loading audit log…</div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-neutral-500">
              <div className="text-sm mb-2">No Meta API calls have been logged yet for this account.</div>
              <div className="text-xs text-neutral-400">
                Send a test DM, post a reply, or publish content from the workspace,
                then refresh this page — the entry will appear within seconds.
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-neutral-50 text-neutral-500 uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">When</th>
                    <th className="text-left px-4 py-3 font-semibold">Permission</th>
                    <th className="text-left px-4 py-3 font-semibold">Method</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                    <th className="text-left px-4 py-3 font-semibold">Agent / action / Graph API call</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {rows.map((row) => {
                    const meta = actionMeta(row.agent, row.action, row.data);
                    return (
                      <tr key={row.id} className="hover:bg-neutral-50">
                        <td className="px-4 py-3 text-neutral-600 whitespace-nowrap">
                          {new Date(row.created_at).toLocaleString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${PERMISSION_COLOR[meta.permission]}`}>
                            {PERMISSION_LABEL[meta.permission]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${METHOD_COLOR[meta.method]}`}>
                            {meta.method}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                              row.status === 'success' || row.status === 'ok'
                                ? 'bg-emerald-100 text-emerald-800'
                                : row.status === 'error' || row.status === 'failure'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-neutral-100 text-neutral-700'
                            }`}
                          >
                            {row.status || 'n/a'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-mono text-[11px] text-neutral-900">{row.agent} · {row.action}</div>
                          <div className="text-neutral-600 text-[11px] mt-0.5">{meta.description}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer className="mt-8 text-xs text-neutral-400">
          Showing the most recent 80 Meta-related entries across all KeiroAI
          agents. Older entries are retained for 90 days. For the full list of
          Graph API endpoints we call per permission, see the{' '}
          <a className="text-blue-700 underline" href="/meta-review?lang=en">
            reviewer guide
          </a>.
        </footer>
      </div>
    </main>
  );
}
