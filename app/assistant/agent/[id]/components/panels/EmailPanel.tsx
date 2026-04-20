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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label={p.emailKpiSent} value={fmt(stats.sent)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label={p.emailKpiOpenRate} value={fmtPercent(stats.openRate)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label={p.emailKpiClickRate} value={fmtPercent(stats.clickRate)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label={p.emailSectionSequences} value={fmt(seqEntries.length)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      {/* Workflow visual — pipeline Email */}
      <SectionTitle>Email Workflow</SectionTitle>
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-center justify-between gap-1 text-center">
          {[
            { label: 'Prospects', value: emailProspects, icon: '\u{1F465}', color: '#94a3b8' },
            { label: p.emailCardStatusSent, value: stats.sent, icon: '\u{1F4E7}', color: '#60a5fa' },
            { label: p.emailCardStatusOpened, value: stats.opened, icon: '\u{1F4EC}', color: '#fbbf24' },
            { label: 'Clicked', value: stats.clicked, icon: '\u{1F517}', color: '#a855f7' },
            { label: p.emailCardStatusReplied, value: emailReplied, icon: '\u{1F4AC}', color: '#22c55e' },
          ].map((step, i) => (
            <div key={step.label} className="flex items-center flex-1">
              <div className="flex-1 text-center">
                <div className="text-lg mb-1">{step.icon}</div>
                <div className="text-sm font-bold text-white" style={{ color: step.color }}>{step.value}</div>
                <div className="text-[9px] text-white/40 mt-0.5">{step.label}</div>
              </div>
              {i < 4 && <div className="text-white/20 text-xs mx-1">{'\u2192'}</div>}
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-2">
          <span className="text-[10px] text-cyan-400">{'\u{1F4E8}'}</span>
          <span className="text-[10px] text-white/50">Prospects who <strong className="text-cyan-400">reply</strong> are automatically flagged in the CRM</span>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href="/generate" className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all">
          {'\u2728'} Create email template
        </a>
        <a href="/assistant/crm" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u{1F4CA}'} {p.viewCrm}
        </a>
      </div>

      <SectionTitle>Performance rates</SectionTitle>
      <div className="flex justify-center gap-8">
        <CircularProgress value={stats.openRate} label="Open rate" gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <CircularProgress value={stats.clickRate} label="Click rate" gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      <SectionTitle>Sequences pipeline</SectionTitle>
      <div className="bg-white/5 rounded-xl border border-white/10 p-4">
        {seqEntries.length === 0 ? (
          <p className="text-sm text-white/40 text-center">No active sequence</p>
        ) : (
          <>
            <div className="flex h-6 rounded-full overflow-hidden">
              {seqEntries.map(([name, count], i) => (
                <div
                  key={name}
                  className="h-full flex items-center justify-center text-[10px] font-medium text-white"
                  style={{
                    width: `${(count / seqTotal) * 100}%`,
                    background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`,
                    opacity: 1 - i * 0.15,
                  }}
                  title={`${name}: ${count}`}
                >
                  {count > 0 ? name : ''}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 mt-3">
              {seqEntries.map(([name, count]) => (
                <span key={name} className="text-xs text-white/50">
                  {name}: <span className="text-white/80 font-medium">{fmt(count)}</span>
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      <SectionTitle>Recent performance</SectionTitle>
      <div className="bg-white/5 rounded-xl border border-white/10 p-4">
        <div className="flex items-end gap-1 h-24">
          {[stats.sent, stats.opened, stats.clicked].map((val, i) => {
            const max = Math.max(stats.sent, 1);
            const labels = ['Sent', 'Opened', 'Clicked'];
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-md"
                  style={{
                    height: `${(val / max) * 100}%`,
                    minHeight: 4,
                    background: `linear-gradient(to top, ${gradientFrom}, ${gradientTo})`,
                  }}
                />
                <span className="text-[10px] text-white/50">{labels[i]}</span>
                <span className="text-xs text-white/70 font-medium">{fmt(val)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hot prospects — direct notification */}
      {/* HotProspectsAlert removed */}

      {/* Email Inbox */}
      <div data-tour="email-inbox">
        <SectionTitle>{p.emailInboxTitle}</SectionTitle>
        <EmailInbox emails={(data as any).recentEmails || (stats as any).recentEmails || []} gradientFrom={gradientFrom} />
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
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                  p.latest.status === 'repondu' ? 'bg-emerald-400/15 text-emerald-400' :
                  p.latest.status === 'ouvert' ? 'bg-amber-400/15 text-amber-400' :
                  p.latest.status === 'clique' ? 'bg-purple-400/15 text-purple-400' :
                  'bg-blue-400/15 text-blue-400'
                }`}>{p.latest.status}</span>
                <span className="text-[9px] text-white/15">{new Date(p.latest.date).toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit' })}</span>
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
                thread.map((msg, i) => (
                  <div key={msg.id || i} className={`flex ${msg.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                      msg.direction === 'outgoing'
                        ? 'bg-gradient-to-r from-cyan-600 to-blue-700 text-white rounded-br-md'
                        : 'bg-white/10 text-white/80 rounded-bl-md'
                    }`}>
                      {msg.direction === 'incoming' && <div className="text-[9px] text-cyan-300/60 mb-0.5">{'\u2709\uFE0F'} Reponse recue</div>}
                      {msg.auto && <div className="text-[9px] text-white/40 mb-0.5">{'\u{1F916}'} Auto</div>}
                      {msg.subject && <div className="font-semibold text-[11px] mb-1 opacity-90">{msg.subject}</div>}
                      <div className="whitespace-pre-wrap">{msg.message || '[pas de contenu]'}</div>
                      <div className={`text-[10px] mt-1 flex items-center gap-1.5 ${msg.direction === 'outgoing' ? 'text-cyan-200/50' : 'text-white/20'}`}>
                        {msg.date ? new Date(msg.date).toLocaleString(dateLocale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                        {msg.step && <span>· Etape {msg.step}</span>}
                      </div>
                    </div>
                  </div>
                ))
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