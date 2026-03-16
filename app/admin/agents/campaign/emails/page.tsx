'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import Link from 'next/link';

type EmailActivity = {
  id: string;
  prospect_id: string;
  description: string;
  data: any;
  created_at: string;
  date_activite: string | null;
  prospect?: {
    company: string | null;
    email: string | null;
    type: string | null;
    quartier: string | null;
    temperature: string | null;
    score: number | null;
    status: string | null;
    last_email_opened_at: string | null;
    last_email_clicked_at: string | null;
  };
};

type EmailDraft = {
  id: string;
  email: string;
  company: string;
  step: number;
  subject: string;
  body: string;
  category: string;
  ai_generated: boolean;
  created_at: string;
};

const STEP_LABELS: Record<number, string> = {
  1: '1er contact',
  2: 'Relance douce',
  3: 'Valeur gratuite',
  4: 'FOMO',
  5: 'Derniere chance',
  10: 'Warm lead',
};

const TEMP_COLORS: Record<string, string> = {
  hot: 'bg-red-100 text-red-700',
  warm: 'bg-orange-100 text-orange-700',
  cold: 'bg-blue-100 text-blue-700',
  dead: 'bg-neutral-200 text-neutral-500',
};

function EmailsTrackingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromLogId = searchParams.get('from');

  const supabase = supabaseBrowser();

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'sent' | 'drafts' | 'failed'>('sent');
  const [sentEmails, setSentEmails] = useState<EmailActivity[]>([]);
  const [drafts, setDrafts] = useState<EmailDraft[]>([]);
  const [failedEmails, setFailedEmails] = useState<EmailActivity[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, sent: 0, opened: 0, clicked: 0, drafts: 0, failed: 0 });
  const [feedbackText, setFeedbackText] = useState('');
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [feedbackSaved, setFeedbackSaved] = useState(false);

  // Load feedback when expanding an email
  useEffect(() => {
    if (!expandedId) { setFeedbackText(''); return; }
    const activity = sentEmails.find(a => a.id === expandedId) || failedEmails.find(a => a.id === expandedId);
    setFeedbackText(activity?.data?.agent_feedback || '');
    setFeedbackSaved(false);
  }, [expandedId]);

  const saveFeedback = useCallback(async () => {
    if (!expandedId) return;
    setSavingFeedback(true);
    setFeedbackSaved(false);
    const currentActivity = sentEmails.find(a => a.id === expandedId) || failedEmails.find(a => a.id === expandedId);
    if (currentActivity) {
      const updatedData = { ...currentActivity.data, agent_feedback: feedbackText };
      await supabase.from('crm_activities').update({ data: updatedData }).eq('id', expandedId);
      // Update local state
      const updateList = (list: EmailActivity[]) =>
        list.map(a => a.id === expandedId ? { ...a, data: updatedData } : a);
      setSentEmails(updateList);
      setFailedEmails(updateList);
      setFeedbackSaved(true);
      setTimeout(() => setFeedbackSaved(false), 2000);
    }
    setSavingFeedback(false);
  }, [expandedId, feedbackText, sentEmails, failedEmails, supabase]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
      if (!profile?.is_admin) { router.push('/'); return; }

      // Fetch sent emails from crm_activities
      const { data: activities } = await supabase
        .from('crm_activities')
        .select('id, prospect_id, description, data, created_at, date_activite, prospect:crm_prospects(company, email, type, quartier, temperature, score, status, last_email_opened_at, last_email_clicked_at)')
        .eq('type', 'email')
        .order('created_at', { ascending: false })
        .limit(200);

      const allActivities = (activities || []) as unknown as EmailActivity[];
      const sent = allActivities.filter(a => !a.data?.error);
      const failed = allActivities.filter(a => !!a.data?.error);

      setSentEmails(sent);
      setFailedEmails(failed);

      // Fetch drafts from agent_logs
      const { data: draftLogs } = await supabase
        .from('agent_logs')
        .select('id, data, created_at')
        .eq('agent', 'email')
        .eq('action', 'email_drafts')
        .order('created_at', { ascending: false })
        .limit(20);

      const allDrafts: EmailDraft[] = [];
      for (const log of draftLogs || []) {
        if (log.data?.drafts) {
          for (const draft of log.data.drafts) {
            allDrafts.push({
              ...draft,
              id: `${log.id}_${draft.email}_${draft.step}`,
              created_at: log.created_at,
            });
          }
        }
      }
      setDrafts(allDrafts);

      // Stats
      const openedCount = sent.filter(a => a.prospect?.last_email_opened_at).length;
      const clickedCount = sent.filter(a => a.prospect?.last_email_clicked_at).length;
      setStats({
        total: allActivities.length,
        sent: sent.length,
        opened: openedCount,
        clicked: clickedCount,
        drafts: allDrafts.length,
        failed: failed.length,
      });

      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const currentList = tab === 'sent' ? sentEmails : tab === 'drafts' ? drafts : failedEmails;

  return (
    <div className="min-h-screen bg-neutral-50 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href={fromLogId ? `/admin/agents/campaign/${fromLogId}` : '/admin/agents?tab=campagnes'}
          className="text-sm text-purple-600 hover:underline"
        >
          Retour
        </Link>
        <h1 className="text-xl font-bold text-neutral-900">Suivi Emails</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
        {[
          { label: 'Total', value: stats.total, color: 'text-neutral-900' },
          { label: 'Envoyes', value: stats.sent, color: 'text-green-600' },
          { label: 'Ouverts', value: stats.opened, color: 'text-blue-600' },
          { label: 'Cliques', value: stats.clicked, color: 'text-purple-600' },
          { label: 'Brouillons', value: stats.drafts, color: 'text-amber-600' },
          { label: 'Echoues', value: stats.failed, color: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl shadow-sm border p-3 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-neutral-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-white rounded-lg border p-1 w-fit">
        {([
          { key: 'sent', label: `Envoyes (${stats.sent})`, color: 'bg-green-100 text-green-700' },
          { key: 'drafts', label: `Brouillons (${stats.drafts})`, color: 'bg-amber-100 text-amber-700' },
          { key: 'failed', label: `Echoues (${stats.failed})`, color: 'bg-red-100 text-red-700' },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
              tab === t.key ? t.color : 'text-neutral-500 hover:bg-neutral-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Email List */}
      {currentList.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border p-8 text-center text-neutral-400">
          Aucun email {tab === 'sent' ? 'envoye' : tab === 'drafts' ? 'en brouillon' : 'echoue'}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="divide-y divide-neutral-100">
            {tab === 'drafts' ? (
              // Draft emails
              (currentList as EmailDraft[]).map((draft, i) => (
                <details key={draft.id || i} className="group">
                  <summary className="px-4 py-3 cursor-pointer hover:bg-neutral-50 transition">
                    <div className="flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-amber-400" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-neutral-800 truncate">{draft.company || draft.email}</p>
                        <p className="text-[10px] text-neutral-400">{draft.email}</p>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
                        {STEP_LABELS[draft.step] || `Step ${draft.step}`}
                      </span>
                      {draft.category && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500">{draft.category}</span>
                      )}
                      {draft.ai_generated && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-600">IA</span>
                      )}
                      <span className="text-[10px] text-neutral-400">
                        {new Date(draft.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <svg className="w-4 h-4 text-neutral-400 group-open:rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </summary>
                  <div className="px-4 pb-4 pt-1">
                    <p className="text-xs font-semibold text-neutral-500 mb-2">Objet : {draft.subject}</p>
                    <div
                      className="bg-neutral-50 rounded-lg border border-neutral-100 p-3 text-xs text-neutral-700 max-h-64 overflow-y-auto leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: draft.body }}
                    />
                  </div>
                </details>
              ))
            ) : (
              // Sent / Failed emails
              (currentList as EmailActivity[]).map((activity, i) => {
                const d = activity.data || {};
                const p = activity.prospect;
                const isExpanded = expandedId === activity.id;
                const step = d.step || 0;
                const isOpened = !!p?.last_email_opened_at;
                const isClicked = !!p?.last_email_clicked_at;

                return (
                  <div
                    key={activity.id || i}
                    className={`px-4 py-3 cursor-pointer hover:bg-neutral-50 transition ${tab === 'failed' ? 'bg-red-50/50' : ''}`}
                    onClick={() => setExpandedId(isExpanded ? null : activity.id)}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                        tab === 'failed' ? 'bg-red-400' :
                        isClicked ? 'bg-purple-400' :
                        isOpened ? 'bg-blue-400' :
                        'bg-green-400'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-neutral-800 truncate">{p?.company || p?.email || activity.prospect_id?.slice(0, 12)}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {p?.email && <p className="text-[10px] text-neutral-400">{p.email}</p>}
                          {p?.type && <span className="text-[10px] px-1 py-0.5 rounded bg-purple-50 text-purple-500">{p.type}</span>}
                          {p?.quartier && <span className="text-[10px] px-1 py-0.5 rounded bg-blue-50 text-blue-500">{p.quartier}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {isOpened && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-600">Ouvert</span>}
                        {isClicked && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-600">Clique</span>}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          step === 1 ? 'bg-blue-100 text-blue-700' :
                          step === 10 ? 'bg-orange-100 text-orange-700' :
                          step >= 4 ? 'bg-red-100 text-red-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>{STEP_LABELS[step] || `Step ${step}`}</span>
                        {p?.temperature && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${TEMP_COLORS[p.temperature] || 'bg-neutral-100 text-neutral-500'}`}>
                            {p.temperature}
                          </span>
                        )}
                        {d.ai_generated && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-600">IA</span>}
                        <span className="text-[10px] text-neutral-400 ml-1">
                          {'Envoye le ' + new Date(activity.date_activite || activity.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="mt-3 ml-6 space-y-2">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {d.subject && (
                            <div className="col-span-2 sm:col-span-4 bg-neutral-50 rounded-lg border p-2">
                              <p className="text-[10px] font-semibold text-neutral-400 uppercase">Objet</p>
                              <p className="text-xs text-neutral-800">{d.subject}</p>
                            </div>
                          )}
                          {d.provider && (
                            <div className="bg-neutral-50 rounded-lg border p-2">
                              <p className="text-[10px] font-semibold text-neutral-400 uppercase">Provider</p>
                              <p className="text-xs text-neutral-800">{d.provider}</p>
                            </div>
                          )}
                          {d.category && (
                            <div className="bg-neutral-50 rounded-lg border p-2">
                              <p className="text-[10px] font-semibold text-neutral-400 uppercase">Categorie</p>
                              <p className="text-xs text-neutral-800">{d.category}</p>
                            </div>
                          )}
                          {d.message_id && (
                            <div className="bg-neutral-50 rounded-lg border p-2 col-span-2">
                              <p className="text-[10px] font-semibold text-neutral-400 uppercase">Message ID</p>
                              <p className="text-[10px] text-neutral-600 font-mono truncate">{d.message_id}</p>
                            </div>
                          )}
                          {p?.score !== undefined && p.score !== null && (
                            <div className="bg-neutral-50 rounded-lg border p-2">
                              <p className="text-[10px] font-semibold text-neutral-400 uppercase">Score</p>
                              <p className={`text-xs font-bold ${(p.score || 0) >= 50 ? 'text-red-600' : (p.score || 0) >= 25 ? 'text-orange-600' : 'text-neutral-600'}`}>{p.score}</p>
                            </div>
                          )}
                          {p?.status && (
                            <div className="bg-neutral-50 rounded-lg border p-2">
                              <p className="text-[10px] font-semibold text-neutral-400 uppercase">Statut CRM</p>
                              <p className="text-xs text-neutral-800">{p.status}</p>
                            </div>
                          )}
                          {isOpened && p?.last_email_opened_at && (
                            <div className="bg-blue-50 rounded-lg border border-blue-100 p-2">
                              <p className="text-[10px] font-semibold text-blue-500 uppercase">Ouvert le</p>
                              <p className="text-xs text-blue-700">{new Date(p.last_email_opened_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                            </div>
                          )}
                          {isClicked && p?.last_email_clicked_at && (
                            <div className="bg-purple-50 rounded-lg border border-purple-100 p-2">
                              <p className="text-[10px] font-semibold text-purple-500 uppercase">Clique le</p>
                              <p className="text-xs text-purple-700">{new Date(p.last_email_clicked_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                            </div>
                          )}
                        </div>
                        {d.error && (
                          <div className="bg-red-50 rounded-lg border border-red-100 p-2">
                            <p className="text-[10px] font-semibold text-red-500 uppercase">Erreur</p>
                            <p className="text-xs text-red-700">{d.error}</p>
                          </div>
                        )}
                        {/* Email body preview */}
                        {(d.body || d.html) && (
                          <div>
                            <p className="text-[10px] font-semibold text-neutral-400 uppercase mb-1">Contenu de l&apos;email</p>
                            <div
                              className="bg-white rounded-lg border p-3 text-xs text-neutral-700 max-h-80 overflow-y-auto leading-relaxed"
                              dangerouslySetInnerHTML={{ __html: d.body || d.html || '' }}
                            />
                          </div>
                        )}
                        {/* Feedback / notes */}
                        <div>
                          <p className="text-[10px] font-semibold text-neutral-400 uppercase mb-1">Notes / feedback agent</p>
                          <textarea
                            className="w-full rounded-lg border border-neutral-200 p-2 text-xs text-neutral-700 resize-y min-h-[60px] focus:outline-none focus:ring-1 focus:ring-purple-300"
                            placeholder="Notes sur cet email, ameliorations pour l'agent..."
                            value={feedbackText}
                            onChange={e => setFeedbackText(e.target.value)}
                            onClick={e => e.stopPropagation()}
                          />
                          <div className="flex items-center gap-2 mt-1">
                            <button
                              onClick={e => { e.stopPropagation(); saveFeedback(); }}
                              disabled={savingFeedback}
                              className="px-3 py-1 rounded-md text-[10px] font-medium bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 transition"
                            >
                              {savingFeedback ? 'Enregistrement...' : 'Enregistrer'}
                            </button>
                            {feedbackSaved && (
                              <span className="text-[10px] text-green-600 font-medium">Enregistre !</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function EmailsTrackingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-50 flex items-center justify-center"><div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <EmailsTrackingContent />
    </Suspense>
  );
}
