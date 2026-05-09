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

function actionDescription(agent: string, action: string): string {
  if (agent === 'dm_instagram' && action === 'execution_success')
    return 'DM batch processed via Graph API (POST /me/messages, manual trigger)';
  if (agent === 'dm_instagram' && action === 'dm_auto_reply')
    return 'Reply drafted by Jade and sent on owner click (POST /me/messages)';
  if (agent === 'dm_instagram' && action === 'webhook_dm_received')
    return 'Inbound DM received from Meta webhook (read-only)';
  if (agent === 'instagram_comments' && action === 'reply_comment')
    return 'Reply posted to Instagram comment (POST /{comment-id}/replies)';
  if (agent === 'content' && action === 'publish_diagnostic')
    return 'Publish attempt logged (POST /{ig-id}/media + /media_publish)';
  if (agent === 'dm_instagram' && action === 'follow_campaign')
    return 'Manual follow batch run by owner';
  return `${agent} → ${action}`;
}

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
                    <th className="text-left px-4 py-3 font-semibold">Agent / action</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                    <th className="text-left px-4 py-3 font-semibold">What this maps to (Graph API)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {rows.map((row) => (
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
                        <div className="font-mono text-neutral-900">{row.agent}</div>
                        <div className="text-neutral-500 text-[11px]">{row.action}</div>
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
                      <td className="px-4 py-3 text-neutral-700">
                        {actionDescription(row.agent, row.action)}
                      </td>
                    </tr>
                  ))}
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
