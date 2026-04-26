'use client';

/**
 * Hugo — Email prospection dashboard panel.
 * Extracted from AgentDashboard.tsx. Bundles EmailCard, CampaignCreator
 * and EmailInbox as private sub-components since they are only used
 * inside EmailPanel.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import PreviewBanner from '../PreviewBanner';
import { DEMO_EMAILS } from '../AgentPreviewData';
import {
  fmt, fmtPercent, fmtDate,
  KpiCard, SectionTitle, EmptyState, ProgressBar, CircularProgress,
} from './Primitives';
import { AutoModeToggle } from './AutoModeToggle';
import { EmailConnectBanner } from './SharedBanners';
import { useLanguage } from '@/lib/i18n/context';
import type { PanelProps } from './types';

function EmailCard({ email }: { email: { prospect: string; type: string; status: string; date: string; subject?: string; message?: string; provider?: string } }) {
  const { t } = useLanguage();
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const statusColors: Record<string, string> = { envoye: '#60a5fa', ouvert: '#fbbf24', repondu: '#34d399', auto_reply: '#a78bfa' };

  const handleReply = useCallback(async () => {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      await fetch('/api/crm/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ prospect_id: email.prospect, message: replyText, channel: 'email' }),
      });
      setSent(true);
      setTimeout(() => { setSent(false); setShowReply(false); setReplyText(''); }, 2000);
    } catch {} finally { setSending(false); }
  }, [replyText, email.prospect]);

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
      <div className="p-3 sm:p-4 flex items-center gap-3">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ backgroundColor: `${statusColors[email.status] ?? '#60a5fa'}22`, color: statusColors[email.status] ?? '#60a5fa' }}>
          {email.status}
        </span>
        <span className="text-sm text-white/80 truncate flex-1">{email.prospect}</span>
        <span className="text-[10px] text-white/30 shrink-0">{email.type?.replace('step_', 'Etape ')}</span>
        {email.provider && <span className="text-[9px] text-white/20 shrink-0">via {email.provider}</span>}
        <button onClick={() => setShowReply(!showReply)} className="text-[10px] px-2 py-1 bg-white/10 rounded-lg text-white/60 hover:bg-white/15 shrink-0">
          {showReply ? 'Fermer' : 'Repondre'}
        </button>
      </div>
      {email.subject && <div className="px-3 sm:px-4 pb-1 text-[11px] text-white/60 font-medium truncate">{email.subject}</div>}
      {email.message && <div className="px-3 sm:px-4 pb-2 text-[10px] text-white/30 line-clamp-2">{email.message.replace(/<[^>]+>/g, '').substring(0, 200)}</div>}
      {showReply && (
        <div className="px-3 sm:px-4 pb-3 border-t border-white/5 pt-2 flex gap-2">
          <input type="text" value={replyText} onChange={e => setReplyText(e.target.value)} placeholder={((t as any).notif?.emailReplyPlaceholder) || 'Repondre par email...'} className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-purple-500/50" onKeyDown={e => { if (e.key === 'Enter') handleReply(); }} />
          <button onClick={handleReply} disabled={sending || !replyText.trim()} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all shrink-0 ${sent ? 'bg-emerald-500/20 text-emerald-400' : 'bg-cyan-600 text-white hover:bg-cyan-700'} disabled:opacity-40`}>
            {sent ? '\u2713' : sending ? '...' : 'Envoyer'}
          </button>
        </div>
      )}
    </div>
  );
}

export function EmailPanel({ data, agentName, gradientFrom, gradientTo }: PanelProps) {
  const { t } = useLanguage();
  const p = t.panels;
  const stats = data.emailStats || { sent: 0, opened: 0, clicked: 0, openRate: 0, clickRate: 0, sequences: {}, recentEmails: [] };

  const seqEntries = Object.entries(stats.sequences ?? {}) as Array<[string, number]>;
  const seqTotal = seqEntries.reduce((s, [, v]) => s + (v || 0), 0) || 1;

  // Derive approximate counts for workflow
  const emailProspects = (stats as any).totalProspects || stats.sent || 0;
  const emailReplied = (stats as any).replied || 0;

  return (
    <>
      {/* Auto mode toggle */}
      <div data-tour="auto-toggle"><AutoModeToggle agentId="email" autoLabel="Automatic emails" manualLabel="Manual emails" autoDesc="Hugo sends email sequences automatically" manualDesc="You validate each email before sending" /></div>

      {/* Email connection banner */}
      <EmailConnectBanner connections={(data as any).connections} />

      {/* ── UNIFIED STATS SECTION ─────────────────────────────────
          User feedback: too many stat blocks repeated in different
          shapes (KPI cards + circular progress + bar chart all
          showing the same Sent/Opened/Clicked numbers). Consolidated
          into ONE section: a single funnel pipeline (telling the
          'sent→opened→clicked→replied' story) + the open/click %
          inline. Removed redundant Performance circulars and the
          recent-perf bar chart.
      */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 sm:p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-xs sm:text-sm font-bold text-white">Funnel email Hugo</h3>
          <div className="flex items-center gap-3 text-[10px] sm:text-xs">
            <span className="text-white/50">Open <strong className="text-cyan-300">{fmtPercent(stats.openRate)}</strong></span>
            <span className="text-white/50">Click <strong className="text-purple-300">{fmtPercent(stats.clickRate)}</strong></span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-1 text-center">
          {[
            { label: 'Prospects', value: emailProspects, icon: '\u{1F465}', color: '#94a3b8' },
            { label: p.emailCardStatusSent, value: stats.sent, icon: '\u{1F4E7}', color: '#60a5fa' },
            { label: p.emailCardStatusOpened, value: stats.opened, icon: '\u{1F4EC}', color: '#fbbf24' },
            { label: 'Clicked', value: stats.clicked, icon: '\u{1F517}', color: '#a855f7' },
            { label: p.emailCardStatusReplied, value: emailReplied, icon: '\u{1F4AC}', color: '#22c55e' },
          ].map((step, i) => (
            <div key={step.label} className="flex items-center flex-1 min-w-0">
              <div className="flex-1 text-center min-w-0">
                <div className="text-base sm:text-lg mb-0.5">{step.icon}</div>
                <div className="text-xs sm:text-sm font-bold" style={{ color: step.color }}>{fmt(step.value)}</div>
                <div className="text-[9px] text-white/40 mt-0.5 truncate">{step.label}</div>
              </div>
              {i < 4 && <div className="text-white/20 text-[10px] mx-0.5 flex-shrink-0">{'\u2192'}</div>}
            </div>
          ))}
        </div>
        {seqEntries.length > 0 && (
          <div className="mt-3 pt-3 border-t border-white/5">
            <div className="text-[10px] text-white/50 mb-1.5">Séquences en cours</div>
            <div className="flex h-4 rounded-full overflow-hidden">
              {seqEntries.map(([name, count], i) => (
                <div
                  key={name}
                  className="h-full flex items-center justify-center text-[9px] font-medium text-white"
                  style={{
                    width: `${(count / seqTotal) * 100}%`,
                    background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`,
                    opacity: 1 - i * 0.15,
                  }}
                  title={`${name}: ${count}`}
                >
                  {count > 1 ? name : ''}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
              {seqEntries.map(([name, count]) => (
                <span key={name} className="text-[10px] text-white/50">
                  {name}: <span className="text-white/80 font-medium">{fmt(count)}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href="/generate" className="px-3 py-2 min-h-[40px] bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all flex items-center gap-1.5">
          {'\u2728'} Create email template
        </a>
        <a href="/assistant/crm" className="px-3 py-2 min-h-[40px] bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15 flex items-center gap-1.5">
          {'\u{1F4CA}'} {p.viewCrm}
        </a>
      </div>

      {/* Hot prospects — direct notification */}
      {/* HotProspectsAlert removed */}

      {/* Hugo's mailbox — unified view (sent + received + non-prospect)
          with view toggle (list / split-pane) and inline stats. */}
      <div data-tour="email-inbox">
        <FullInbox />
      </div>

      {/* Custom domain — discrete option */}
      <details className="mt-3 rounded-xl border border-white/5 bg-white/[0.01]">
        <summary className="px-4 py-2.5 text-[10px] text-white/30 cursor-pointer hover:text-white/50 flex items-center gap-2">
          <span>{'\u2699\uFE0F'}</span> Send from your own domain
        </summary>
        <div className="px-4 pb-4 space-y-3">
          <p className="text-[11px] text-white/50">
            By default, Hugo sends from <span className="text-white/70 font-medium">contact@keiroai.com</span>.
            You can connect your own domain to send from <span className="text-white/70 font-medium">contact@yourcompany.com</span>.
          </p>
          <div className="rounded-lg bg-white/[0.03] border border-white/10 p-3 space-y-2">
            <h4 className="text-[11px] text-white/70 font-semibold">How to:</h4>
            <ol className="text-[10px] text-white/40 space-y-1.5 list-decimal pl-4">
              <li>Create an account on <a href="https://app.brevo.com" target="_blank" rel="noopener" className="text-purple-400 hover:underline">Brevo</a> (free, 300 emails/day)</li>
              <li>Add and verify your domain in Brevo (DNS: SPF + DKIM)</li>
              <li>Get your Brevo API key</li>
              <li>Share it with us during onboarding</li>
            </ol>
          </div>
          <div className="flex items-center gap-3">
            <a href="https://cal.com" target="_blank" rel="noopener" className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-[10px] font-bold rounded-xl hover:shadow-lg transition min-h-[44px] flex items-center gap-1">
              {'\uD83D\uDCC5'} Book an onboarding call
            </a>
            <span className="text-[9px] text-white/20">15 min, we configure it together</span>
          </div>
        </div>
      </details>
    </>
  );
}

// ─── Campaign Creator (mini flow) ──────────────────────────────────

function CampaignCreator() {
  const { t, locale } = useLanguage();
  const isEn = locale === 'en';
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [target, setTarget] = useState('all_prospects');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const generateEmail = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/agents/client-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ agent_id: 'email', message: `Genere un email de campagne marketing pour ${target === 'hot' ? 'mes prospects chauds' : target === 'new' ? 'mes nouveaux contacts' : 'tous mes prospects'}. Objet accrocheur + corps court et percutant en francais. Format: OBJET: ...\n\nCORPS: ...` }),
      });
      if (res.ok) {
        const d = await res.json();
        const text = d.reply || '';
        const subMatch = text.match(/OBJET:\s*(.*?)(\n|CORPS)/i);
        const bodyMatch = text.match(/CORPS:\s*([\s\S]*)/i);
        if (subMatch) setSubject(subMatch[1].trim());
        if (bodyMatch) setBody(bodyMatch[1].trim());
      }
    } catch {} finally { setGenerating(false); }
  }, [target]);

  if (sent) {
    return (
      <div id="campaign-modal" className="rounded-xl border border-emerald-500/20 bg-emerald-900/10 p-4 mb-3 text-center">
        <span className="text-lg">{'\u2705'}</span>
        <p className="text-xs text-emerald-400 font-bold mt-1">Campagne planifiee !</p>
        <button onClick={() => { setSent(false); setOpen(false); setStep(0); setSubject(''); setBody(''); }} className="text-[10px] text-white/40 mt-2 hover:text-white/60">Fermer</button>
      </div>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full py-2.5 mb-3 rounded-xl border border-dashed border-cyan-500/30 bg-cyan-900/5 text-cyan-400 text-xs font-medium hover:bg-cyan-900/10 transition-all">
        {'\u{1F4E7}'} Creer une nouvelle campagne email
      </button>
    );
  }

  return (
    <div id="campaign-modal" className="rounded-xl border border-cyan-500/20 bg-cyan-900/10 p-4 mb-3">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-bold text-cyan-300">{'\u{1F4E7}'} Nouvelle campagne email</h4>
        <button onClick={() => setOpen(false)} className="text-white/30 hover:text-white/60"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
      </div>

      {step === 0 && (
        <div className="space-y-2">
          <label className="text-[10px] text-white/50">Cible</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { key: 'all_prospects', label: 'Tous', icon: '\u{1F465}' },
              { key: 'hot', label: 'Prospects chauds', icon: '\u{1F525}' },
              { key: 'new', label: 'Nouveaux', icon: '\u2728' },
            ].map(t => (
              <button key={t.key} onClick={() => setTarget(t.key)} className={`p-2 rounded-lg text-[10px] font-medium text-center transition-all ${target === t.key ? 'bg-cyan-600 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>
                <div className="text-base mb-0.5">{t.icon}</div>{t.label}
              </button>
            ))}
          </div>
          <button onClick={() => { setStep(1); if (!subject) generateEmail(); }} className="w-full mt-2 py-2 bg-cyan-600 text-white text-xs font-bold rounded-lg">Suivant</button>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-2">
          <div>
            <label className="text-[10px] text-white/50">Objet</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder={generating ? 'Generation IA...' : 'Objet de l\'email'} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 mt-1" />
          </div>
          <div>
            <label className="text-[10px] text-white/50">Corps</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} placeholder={generating ? 'Generation IA en cours...' : 'Corps de l\'email'} rows={4} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 mt-1 resize-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep(0)} className="px-3 py-2 bg-white/10 text-white/50 text-xs rounded-lg">{isEn ? 'Back' : 'Retour'}</button>
            <button onClick={generateEmail} disabled={generating} className="px-3 py-2 bg-white/10 text-white/50 text-xs rounded-lg disabled:opacity-40">{generating ? '...' : '\u2728 Regenerer'}</button>
            <button
              onClick={async () => {
                if (!subject.trim() || !body.trim()) return;
                setSending(true);
                try {
                  await fetch('/api/agents/content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'schedule_campaign', target, subject, body }) });
                  setSent(true);
                } catch {} finally { setSending(false); }
              }}
              disabled={sending || !subject.trim() || !body.trim()}
              className="flex-1 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-xs font-bold rounded-lg disabled:opacity-40"
            >
              {sending ? '...' : (((t as any).notif?.emailLaunchCampaign) || '\u{1F680} Lancer la campagne')}
            </button>
          </div>
        </div>
      )}
    </div>
  );

}

// ─── Email Inbox Component ─────────────────────────────────────────

function EmailInbox({ emails, gradientFrom }: { emails: any[]; gradientFrom: string }) {
  const { locale } = useLanguage();
  const dateLocale = locale === 'en' ? 'en-US' : 'fr-FR';
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<any[]>([]);
  const [threadProspect, setThreadProspect] = useState<any>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [inboxFilter, setInboxFilter] = useState<'all' | 'inbox' | 'sent' | 'auto'>('all');
  const threadEndRef = useRef<HTMLDivElement>(null);

  // Filter emails by type
  const filteredEmails = emails.filter(e => {
    if (inboxFilter === 'inbox') return e.direction === 'incoming';
    if (inboxFilter === 'sent') return e.direction === 'outgoing' && !e.type?.includes('auto');
    if (inboxFilter === 'auto') return e.type?.includes('auto') || e.type?.includes('step_');
    return true;
  });

  const inboxCount = emails.filter(e => e.direction === 'incoming').length;
  const sentCount = emails.filter(e => e.direction === 'outgoing' && !e.type?.includes('auto')).length;
  const autoCount = emails.filter(e => e.type?.includes('auto') || e.type?.includes('step_')).length;

  // Group emails by prospect
  const byProspect = filteredEmails.reduce((acc: Record<string, any[]>, e: any) => {
    const key = e.prospect_id || e.prospect || e.email || 'unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});

  const prospectList = Object.entries(byProspect).filter(([, msgs]) => msgs.length > 0).map(([key, msgs]) => {
    const latest = msgs[0] || {};
    const hasIncoming = msgs.some((m: any) => m.direction === 'incoming');
    return { key, name: latest.prospect || key, email: latest.email || '', msgs, latest, hasIncoming, prospect_id: latest.prospect_id || '' };
  }).sort((a, b) => new Date(b.latest?.date || 0).getTime() - new Date(a.latest?.date || 0).getTime());

  const loadThread = useCallback(async (prospectId: string) => {
    if (!prospectId) return;
    setSelectedId(prospectId);
    setLoadingThread(true);
    try {
      const res = await fetch(`/api/crm/thread?prospect_id=${prospectId}`, { credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        setThread(d.thread || []);
        setThreadProspect(d.prospect || null);
      }
    } catch {} finally { setLoadingThread(false); }
  }, []);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread]);

  const sendReply = useCallback(async () => {
    if (!replyText.trim() || !threadProspect) return;
    setSending(true);
    try {
      const res = await fetch('/api/crm/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ prospect_id: threadProspect.id, message: replyText, channel: 'email' }),
      });
      if (res.ok) {
        setSent(true);
        setThread(prev => [...prev, { id: `new_${Date.now()}`, type: 'email', direction: 'outgoing', message: replyText, channel: 'email', date: new Date().toISOString(), auto: false }]);
        setReplyText('');
        setTimeout(() => setSent(false), 2000);
      }
    } catch {} finally { setSending(false); }
  }, [replyText, threadProspect]);

  const gmailConnectedGlobal = typeof window !== 'undefined' && (window as any).__gmailConnected;
  const isDemo = emails.length === 0 && !gmailConnectedGlobal;
  const displayEmails = isDemo ? DEMO_EMAILS : emails;

  // Re-filter with demo data
  const reFilteredEmails = displayEmails.filter((e: any) => {
    if (inboxFilter === 'inbox') return e.direction === 'incoming';
    if (inboxFilter === 'sent') return e.direction === 'outgoing' && !e.type?.includes('auto');
    if (inboxFilter === 'auto') return e.type?.includes('auto') || e.type?.includes('step_');
    return true;
  });

  // Re-group
  const reByProspect = reFilteredEmails.reduce((acc: Record<string, any[]>, e: any) => {
    const key = e.prospect_id || e.prospect || e.email || 'unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});
  const reProspectList = Object.entries(reByProspect).filter(([, msgs]) => msgs.length > 0).map(([key, msgs]) => {
    const latest = msgs[0] || {};
    const hasIncoming = msgs.some((m: any) => m.direction === 'incoming');
    return { key, name: latest.prospect || key, email: latest.email || '', msgs, latest, hasIncoming, prospect_id: latest.prospect_id || '' };
  }).sort((a, b) => new Date(b.latest?.date || 0).getTime() - new Date(a.latest?.date || 0).getTime());

  return (
    <div>
    {isDemo && (
      <PreviewBanner
        agentName="Hugo"
        connectLabel="Importer des contacts"
        connectUrl="/assistant/crm"
        claraMessage="Hugo peut envoyer les emails depuis ton propre Gmail pour plus d'impact ! Connecte ton email ci-dessus, ou il enverra depuis contact@keiroai.com en attendant."
        gradientFrom="#06b6d4"
        gradientTo="#0891b2"
      />
    )}
    <div>
      {/* Filter tabs + new campaign button */}
      <div className="flex items-center gap-1.5 mb-2 overflow-x-auto pb-1">
        {[
          { key: 'all', label: `Tous (${emails.length})` },
          { key: 'inbox', label: `Recus (${inboxCount})` },
          { key: 'sent', label: `Envoyes (${sentCount})` },
          { key: 'auto', label: `Sequences (${autoCount})` },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setInboxFilter(tab.key as any)}
            className={`px-3 py-1.5 text-[10px] sm:text-xs font-medium rounded-lg whitespace-nowrap transition-all ${
              inboxFilter === tab.key ? 'bg-cyan-600 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'
            }`}
          >
            {tab.label}
          </button>
        ))}
        <span className="text-[10px] text-white/20 ml-auto">{'\u{1F4E7}'} Campagne: voir ci-dessous</span>
      </div>

    {/* Campaign creation */}
    <div data-tour="email-campaign"><CampaignCreator /></div>

    <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden h-[60vh] sm:h-[calc(55vh-60px)] md:h-[420px] mb-16 lg:mb-0">
      <div className="flex h-full">
        {/* Email list */}
        <div className={`${selectedId ? 'hidden sm:block' : ''} w-full sm:w-56 border-r border-white/5 overflow-y-auto`}>
          <div className="px-3 py-2 border-b border-white/5 bg-white/[0.02]">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/30">{(isDemo ? reProspectList : prospectList).length} conversations</span>
          </div>
          {(isDemo ? reProspectList : prospectList).map(p => (
            <button
              key={p.key}
              onClick={() => p.prospect_id ? loadThread(p.prospect_id) : setSelectedId(p.key)}
              className={`w-full text-left px-3 py-3 border-b border-white/5 hover:bg-white/5 transition-colors ${selectedId === (p.prospect_id || p.key) ? 'bg-purple-500/10 border-l-2 border-l-cyan-500' : ''}`}
            >
              <div className="flex items-center gap-2">
                {p.hasIncoming && <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse flex-shrink-0" />}
                <span className="text-xs font-medium text-white truncate">{p.name}</span>
              </div>
              {p.email && <div className="text-[9px] text-white/20 truncate mt-0.5">{p.email}</div>}
              {p.latest.subject && <div className="text-[10px] text-white/50 truncate mt-0.5 font-medium">{p.latest.subject}</div>}
              <div className="text-[10px] text-white/30 truncate mt-0.5">
                {p.latest.direction === 'incoming' ? '\u2709\uFE0F ' : ''}{p.latest.message?.substring(0, 80) || p.latest.type}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                  p.latest.status === 'repondu' ? 'bg-emerald-400/15 text-emerald-400' :
                  p.latest.status === 'ouvert' ? 'bg-amber-400/15 text-amber-400' :
                  p.latest.status === 'clique' ? 'bg-purple-400/15 text-purple-400' :
                  'bg-blue-400/15 text-blue-400'
                }`}>{p.latest.status}</span>
                {p.latest.direction === 'outgoing' && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                    p.latest.auto || p.latest.type?.includes('auto') || p.latest.type?.includes('step_')
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-amber-500/15 text-amber-300'
                  }`}>
                    {p.latest.auto || p.latest.type?.includes('auto') || p.latest.type?.includes('step_') ? '\u{1F916} IA' : '\u270D\uFE0F Toi'}
                  </span>
                )}
                <span className="text-[9px] text-white/15 ml-auto">{new Date(p.latest.date).toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit' })}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Thread view */}
        {selectedId ? (
          <div className="flex-1 flex flex-col">
            <div className="px-3 py-2.5 border-b border-white/5 bg-white/[0.02] flex items-center gap-2">
              <button onClick={() => { setSelectedId(null); setThread([]); setThreadProspect(null); }} className="sm:hidden text-white/40 hover:text-white/60 text-sm">{'\u2190'}</button>
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-[10px] text-white font-bold">
                {(threadProspect?.company || threadProspect?.first_name || '?')[0]?.toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-bold text-white">{threadProspect?.company || threadProspect?.first_name || 'Prospect'}</span>
                {threadProspect?.email && <div className="text-[9px] text-white/30 truncate">{threadProspect.email}</div>}
              </div>
              {threadProspect?.temperature && (
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                  threadProspect.temperature === 'hot' ? 'bg-red-400/15 text-red-400' :
                  threadProspect.temperature === 'warm' ? 'bg-amber-400/15 text-amber-400' :
                  'bg-blue-400/15 text-blue-400'
                }`}>{threadProspect.temperature}</span>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5" style={{ maxHeight: 350 }}>
              {loadingThread ? (
                <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-cyan-400" /></div>
              ) : thread.length === 0 ? (
                <div className="text-center py-8 text-white/20 text-xs">Aucun echange pour ce prospect</div>
              ) : (
                thread.map((msg, i) => {
                  // Badge logic: outgoing messages get AI (Hugo) vs
                  // Human (toi) badge so the founder can tell at a
                  // glance which messages he wrote vs which Hugo
                  // sent automatically. Incoming = received reply.
                  const isOutgoing = msg.direction === 'outgoing';
                  const isAuto = !!msg.auto;
                  const badgeLabel = !isOutgoing
                    ? { text: '\u2709\uFE0F Reçu', cls: 'bg-cyan-500/15 text-cyan-300' }
                    : isAuto
                      ? { text: '\u{1F916} Hugo IA', cls: 'bg-emerald-500/20 text-emerald-200' }
                      : { text: '\u270D\uFE0F Toi', cls: 'bg-amber-500/20 text-amber-200' };
                  return (
                    <div key={msg.id || i} className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                        isOutgoing
                          ? (isAuto
                            ? 'bg-gradient-to-r from-cyan-600 to-blue-700 text-white rounded-br-md'
                            : 'bg-gradient-to-r from-amber-700 to-amber-600 text-white rounded-br-md')
                          : 'bg-white/10 text-white/80 rounded-bl-md'
                      }`}>
                        <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold mb-1 ${badgeLabel.cls}`}>
                          {badgeLabel.text}
                        </div>
                        {msg.subject && <div className="font-semibold text-[11px] mb-1 opacity-90">{msg.subject}</div>}
                        <div className="whitespace-pre-wrap">{msg.message || '[pas de contenu]'}</div>
                        <div className={`text-[10px] mt-1 flex items-center gap-1.5 ${isOutgoing ? 'text-white/60' : 'text-white/20'}`}>
                          {msg.date ? new Date(msg.date).toLocaleString(dateLocale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                          {msg.step && <span>· Etape {msg.step}</span>}
                          {msg.action_taken && (msg.action_taken === 'blacklisted' || msg.action_taken === 'stopped') && (
                            <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 text-[9px]">
                              {msg.action_taken === 'blacklisted' ? '\u{1F6AB} Désabonné' : '\u23F8 Stoppé'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={threadEndRef} />
            </div>

            {/* Reply */}
            {threadProspect?.email && (
              <div className="border-t border-white/5 px-3 py-2.5 flex gap-2 bg-white/[0.02]">
                <input
                  type="text"
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder={`Repondre a ${threadProspect.email}...`}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && replyText.trim()) { e.preventDefault(); sendReply(); } }}
                />
                <button
                  onClick={sendReply}
                  disabled={sending || !replyText.trim()}
                  className={`px-4 py-2 text-xs font-medium rounded-xl transition-all ${sent ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gradient-to-r from-cyan-600 to-blue-700 text-white hover:opacity-90'} disabled:opacity-40`}
                >
                  {sent ? '\u2713' : sending ? '...' : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                  )}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-white/20 text-xs gap-2 py-8">
            <svg className="w-8 h-8 text-white/10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            Selectionne un email
          </div>
        )}
      </div>
    </div>
    </div>
    </div>
  );
}

// FullInbox — unified Hugo mailbox: sent + received + non-CRM senders.
// View toggle: 'list' (compact rows + popup modal) for mobile,
// 'split' (Gmail-style two-pane) for desktop. Stats banner up top.
function FullInbox() {
  const { locale } = useLanguage();
  const en = locale === 'en';
  const dateLocale = en ? 'en-US' : 'fr-FR';
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'inbox' | 'sent'>('all');
  const [view, setView] = useState<'list' | 'split'>(() => {
    if (typeof window === 'undefined') return 'list';
    return window.innerWidth >= 768 ? 'split' : 'list';
  });
  const [selected, setSelected] = useState<any>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [sentOk, setSentOk] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/me/inbox?direction=${filter}&limit=80`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.ok) setItems(d.items || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  // Auto-select first item in split view when items arrive
  useEffect(() => {
    if (view === 'split' && items.length > 0 && !selected) {
      setSelected(items[0]);
    }
  }, [view, items, selected]);

  const sendReply = useCallback(async () => {
    if (!selected || !replyText.trim()) return;
    const to = selected.direction === 'inbox' ? selected.from_email : selected.to_email;
    if (!to) return;
    setSending(true);
    try {
      const res = await fetch('/api/me/send-email', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_email: to,
          subject: selected.subject?.startsWith('Re:') ? selected.subject : `Re: ${selected.subject || ''}`,
          body: replyText,
          in_reply_to: selected.message_id,
        }),
      });
      const j = await res.json();
      if (j.ok) {
        setSentOk(true);
        setReplyText('');
        setTimeout(() => { setSentOk(false); setSelected(null); load(); }, 1500);
      } else {
        alert(j.error || 'Erreur envoi');
      }
    } catch (e: any) {
      alert(e.message || 'Erreur envoi');
    } finally {
      setSending(false);
    }
  }, [selected, replyText, load]);

  const inboxCount = items.filter(i => i.direction === 'inbox').length;
  const sentCount = items.filter(i => i.direction === 'sent').length;
  const aiSentCount = items.filter(i => i.direction === 'sent' && i.auto).length;
  const humanSentCount = sentCount - aiSentCount;
  const unsubCount = items.filter(i => i.classification === 'unsubscribe' || i.blacklisted).length;

  // Reusable list rendering used by both views
  const ListRows = ({ compact = false }: { compact?: boolean }) => (
    <>
      {loading ? (
        <div className="text-center py-6 text-white/40 text-xs">{en ? 'Loading…' : 'Chargement…'}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-6 text-white/40 text-xs">{en ? 'No emails yet' : 'Aucun email'}</div>
      ) : (
        items.map((it: any) => (
          <button
            key={it.id}
            onClick={() => { setSelected(it); setReplyText(''); }}
            className={`w-full text-left ${compact ? 'px-2.5 py-2' : 'px-3 py-2.5'} hover:bg-white/5 transition flex items-center gap-2 ${selected?.id === it.id ? 'bg-cyan-500/10' : ''}`}
          >
            <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold ${it.direction === 'inbox' ? 'bg-cyan-500/20 text-cyan-300' : (it.auto ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300')}`}>
              {it.direction === 'inbox' ? '✉' : (it.auto ? '🤖' : '✍')}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-white truncate">
                  {it.direction === 'inbox' ? (it.from_name || it.from_email) : it.to_email}
                </span>
                {it.blacklisted && <span className="text-[8px] px-1 rounded bg-red-500/20 text-red-300 shrink-0">BL</span>}
                {it.classification === 'unsubscribe' && <span className="text-[8px] px-1 rounded bg-red-500/20 text-red-300 shrink-0">{en ? 'unsub' : 'désabo'}</span>}
              </div>
              <div className="text-[10px] text-white/60 truncate">{it.subject || '(sans objet)'}</div>
            </div>
            <span className="shrink-0 text-[9px] text-white/30">{new Date(it.date).toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit' })}</span>
          </button>
        ))
      )}
    </>
  );

  return (
    <div className="mt-4 space-y-2">
      {/* Header — title + view toggle */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-white">{en ? 'Hugo mailbox' : 'Boîte mail Hugo'}</h3>
          <p className="text-[10px] text-white/40">{en ? 'Sent + received, including non-CRM' : 'Envoyés + reçus, même hors CRM'}</p>
        </div>
        <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5 border border-white/10">
          <button
            onClick={() => setView('list')}
            className={`px-2.5 py-1.5 text-[10px] font-medium rounded transition ${view === 'list' ? 'bg-cyan-600 text-white' : 'text-white/60 hover:text-white'}`}
            title={en ? 'List view' : 'Vue liste'}
          >
            ☰ {en ? 'Liste' : 'Liste'}
          </button>
          <button
            onClick={() => setView('split')}
            className={`px-2.5 py-1.5 text-[10px] font-medium rounded transition ${view === 'split' ? 'bg-cyan-600 text-white' : 'text-white/60 hover:text-white'}`}
            title={en ? 'Split-pane view' : 'Vue boîte mail'}
          >
            ☐ {en ? 'Boîte' : 'Boîte'}
          </button>
        </div>
      </div>

      {/* Compact inline counters — removed the big 4-card banner since
          the funnel above already shows Sent / Opened / etc. We keep
          ONLY what the funnel doesn't carry: who-sent and unsub. */}
      <div className="flex items-center gap-3 text-[10px] text-white/50 flex-wrap">
        <span>{en ? 'Received' : 'Reçus'} <strong className="text-cyan-300">{inboxCount}</strong></span>
        <span className="text-white/20">·</span>
        <span>{en ? 'AI sent' : 'Hugo IA'} <strong className="text-emerald-300">{aiSentCount}</strong></span>
        <span className="text-white/20">·</span>
        <span>{en ? 'You sent' : 'Toi'} <strong className="text-amber-300">{humanSentCount}</strong></span>
        {unsubCount > 0 && (
          <>
            <span className="text-white/20">·</span>
            <span>{en ? 'Unsub' : 'Désabo'} <strong className="text-red-300">{unsubCount}</strong></span>
          </>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex gap-1.5 items-center">
        {[
          { key: 'all', label: en ? 'Tous' : 'Tous', count: items.length },
          { key: 'inbox', label: en ? 'Reçus' : 'Reçus', count: inboxCount },
          { key: 'sent', label: en ? 'Envoyés' : 'Envoyés', count: sentCount },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key as any)}
            className={`px-3 py-2 min-h-[40px] text-xs font-medium rounded-lg transition ${filter === t.key ? 'bg-cyan-600 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
          >
            {t.label} <span className="text-[9px] opacity-60 ml-0.5">{t.count}</span>
          </button>
        ))}
        <button onClick={load} className="ml-auto px-2 py-2 min-h-[40px] text-base text-white/40 hover:text-white/70" title={en ? 'Refresh' : 'Rafraîchir'} aria-label="Refresh">↻</button>
      </div>

      {view === 'list' && (
        <div className="bg-white/[0.02] border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5 max-h-[400px] overflow-y-auto">
          <ListRows />
        </div>
      )}

      {view === 'split' && (
        <div className="bg-white/[0.02] border border-white/10 rounded-xl overflow-hidden grid grid-cols-1 md:grid-cols-[280px_1fr] divide-y md:divide-y-0 md:divide-x divide-white/10 min-h-[480px]">
          <div className="overflow-y-auto max-h-[480px]">
            <ListRows compact />
          </div>
          <div className="overflow-y-auto max-h-[480px]">
            {selected ? (
              <SplitPaneContent
                selected={selected}
                en={en}
                dateLocale={dateLocale}
                replyText={replyText}
                setReplyText={setReplyText}
                sending={sending}
                sentOk={sentOk}
                onSend={sendReply}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-white/40 italic p-8">
                {en ? 'Pick an email on the left' : 'Sélectionne un email à gauche'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal popup — only in 'list' view (split view shows content inline) */}
      {selected && view === 'list' && (
        <div className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4" onClick={() => setSelected(null)}>
          <div className="bg-gray-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold ${selected.direction === 'inbox' ? 'bg-cyan-500/20 text-cyan-300' : (selected.auto ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300')}`}>
                  {selected.direction === 'inbox' ? (en ? '✉ Received' : '✉ Reçu') : (selected.auto ? '🤖 Hugo IA' : '✍ Toi')}
                </span>
                <div className="text-[10px] text-white/60 truncate">
                  {selected.direction === 'inbox' ? `${en ? 'From:' : 'De :'} ${selected.from_name || ''} <${selected.from_email}>` : `${en ? 'To:' : 'À :'} ${selected.to_email}`}
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-white/40 hover:text-white p-1.5"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="px-4 py-3 space-y-2 border-b border-white/10">
              <h4 className="text-sm font-bold text-white">{selected.subject || '(sans objet)'}</h4>
              <div className="text-[10px] text-white/40">{new Date(selected.date).toLocaleString(dateLocale, { dateStyle: 'medium', timeStyle: 'short' })}</div>
              {selected.classification === 'unsubscribe' && <div className="text-[10px] px-2 py-1 rounded bg-red-500/20 text-red-300 inline-block">🚫 {en ? 'Detected as unsubscribe — sender blacklisted' : 'Détecté comme désabonnement — expéditeur blacklisté'}</div>}
            </div>
            <div className="px-4 py-4 text-xs text-white/80 whitespace-pre-wrap leading-relaxed max-h-[40vh] overflow-y-auto">
              {selected.body || (en ? '(no body)' : '(pas de contenu)')}
            </div>
            {/* Reply */}
            {(selected.direction === 'inbox' || selected.to_email) && (
              <div className="border-t border-white/10 px-4 py-3 space-y-2">
                <div className="text-[10px] text-white/50">{en ? 'Reply to' : 'Répondre à'} <strong className="text-white/80">{selected.direction === 'inbox' ? selected.from_email : selected.to_email}</strong></div>
                <textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder={en ? 'Type your reply…' : 'Tape ta réponse…'}
                  rows={4}
                  className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-white/30">{en ? 'Sent from your connected SMTP' : 'Envoyé depuis ton SMTP connecté'}</span>
                  <button
                    onClick={sendReply}
                    disabled={sending || !replyText.trim()}
                    className={`px-4 py-2 text-xs font-bold rounded-lg transition ${sentOk ? 'bg-emerald-500/30 text-emerald-200' : 'bg-cyan-600 hover:bg-cyan-500 text-white'} disabled:opacity-40`}
                  >
                    {sentOk ? (en ? 'Sent ✓' : 'Envoyé ✓') : sending ? '...' : (en ? 'Send' : 'Envoyer')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// SplitPaneContent — right-pane email body + reply for the Gmail-style
// split view. Reuses the same shape as the modal but inline.
function SplitPaneContent({
  selected, en, dateLocale, replyText, setReplyText, sending, sentOk, onSend,
}: {
  selected: any;
  en: boolean;
  dateLocale: string;
  replyText: string;
  setReplyText: (s: string) => void;
  sending: boolean;
  sentOk: boolean;
  onSend: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-white/10 space-y-1">
        <div className="flex items-center gap-2">
          <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold ${selected.direction === 'inbox' ? 'bg-cyan-500/20 text-cyan-300' : (selected.auto ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300')}`}>
            {selected.direction === 'inbox' ? (en ? '✉ Reçu' : '✉ Reçu') : (selected.auto ? '🤖 Hugo IA' : '✍ Toi')}
          </span>
          <div className="text-[10px] text-white/60 truncate">
            {selected.direction === 'inbox' ? `${en ? 'From:' : 'De :'} ${selected.from_name || ''} <${selected.from_email}>` : `${en ? 'To:' : 'À :'} ${selected.to_email}`}
          </div>
        </div>
        <h4 className="text-sm font-bold text-white">{selected.subject || '(sans objet)'}</h4>
        <div className="text-[10px] text-white/40">{new Date(selected.date).toLocaleString(dateLocale, { dateStyle: 'medium', timeStyle: 'short' })}</div>
        {selected.classification === 'unsubscribe' && <div className="text-[10px] px-2 py-1 rounded bg-red-500/20 text-red-300 inline-block">🚫 {en ? 'Detected as unsubscribe — sender blacklisted' : 'Détecté comme désabonnement — expéditeur blacklisté'}</div>}
      </div>
      <div className="flex-1 px-4 py-4 text-xs text-white/80 whitespace-pre-wrap leading-relaxed overflow-y-auto">
        {selected.body || (en ? '(no body)' : '(pas de contenu)')}
      </div>
      {(selected.direction === 'inbox' || selected.to_email) && (
        <div className="border-t border-white/10 px-4 py-3 space-y-2">
          <div className="text-[10px] text-white/50">{en ? 'Reply to' : 'Répondre à'} <strong className="text-white/80">{selected.direction === 'inbox' ? selected.from_email : selected.to_email}</strong></div>
          <textarea
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            placeholder={en ? 'Type your reply…' : 'Tape ta réponse…'}
            rows={3}
            className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
          />
          <div className="flex items-center justify-end">
            <button
              onClick={onSend}
              disabled={sending || !replyText.trim()}
              className={`px-4 py-2 min-h-[40px] text-xs font-bold rounded-lg transition ${sentOk ? 'bg-emerald-500/30 text-emerald-200' : 'bg-cyan-600 hover:bg-cyan-500 text-white'} disabled:opacity-40`}
            >
              {sentOk ? (en ? 'Sent ✓' : 'Envoyé ✓') : sending ? '...' : (en ? 'Send' : 'Envoyer')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}