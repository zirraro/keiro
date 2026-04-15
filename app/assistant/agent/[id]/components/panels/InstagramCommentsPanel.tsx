'use client';

/**
 * Instagram comments moderation panel — used by both the dedicated
 * instagram_comments agent and the Jade DM panel for shared logic.
 * Extracted from AgentDashboard.tsx.
 */

import { useState, useEffect } from 'react';
import PreviewBanner from '../PreviewBanner';
import { DEMO_IG_COMMENTS } from '../AgentPreviewData';
import { fmt, KpiCard, SectionTitle } from './Primitives';
import { InstagramAssetBadge } from './InstagramAssetBadge';
import { useLanguage } from '@/lib/i18n/context';
import type { PanelProps } from './types';

export function InstagramCommentsPanel({ data, agentName, gradientFrom, gradientTo }: PanelProps) {
  const { t } = useLanguage();
  const p = t.panels;
  const [comments, setComments] = useState<Array<{ comment_id: string; text: string; username: string; timestamp: string; replied: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [replying, setReplying] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [autoReplying, setAutoReplying] = useState(false);

  // Fetch comments on mount
  useEffect(() => {
    fetch('/api/agents/instagram-comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'fetch_comments' }),
    }).then(r => r.json()).then(d => {
      if (d.comments) setComments(d.comments);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleReply = async (commentId: string) => {
    if (!replyText.trim()) return;
    try {
      await fetch('/api/agents/instagram-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'reply_comment', comment_id: commentId, message: replyText }),
      });
      setComments(prev => prev.map(c => c.comment_id === commentId ? { ...c, replied: true } : c));
      setReplying(null);
      setReplyText('');
    } catch {}
  };

  const handleAutoReply = async () => {
    setAutoReplying(true);
    try {
      const res = await fetch('/api/agents/instagram-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'auto_reply_all' }),
      });
      const d = await res.json();
      if (d.replied > 0) {
        setComments(prev => prev.map(c => ({ ...c, replied: true })));
      }
    } catch {} finally { setAutoReplying(false); }
  };

  const unreplied = comments.filter(c => !c.replied).length;

  return (
    <>
      <InstagramAssetBadge />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard label={p.igCommentsKpiTotal} value={fmt(comments.length)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label={p.igCommentsKpiUnanswered} value={fmt(unreplied)} gradientFrom={unreplied > 0 ? '#ef4444' : gradientFrom} gradientTo={unreplied > 0 ? '#dc2626' : gradientTo} />
        <KpiCard label={p.igCommentsKpiAnswered} value={fmt(comments.length - unreplied)} gradientFrom="#22c55e" gradientTo="#16a34a" />
      </div>

      {unreplied > 0 && (
        <button onClick={handleAutoReply} disabled={autoReplying} className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-xs font-semibold rounded-xl mt-3 disabled:opacity-50">
          {autoReplying ? p.igCommentsAutoReplyInProgress : p.igCommentsAutoReplyBtn.replace('{n}', String(unreplied))}
        </button>
      )}

      <SectionTitle>{p.igCommentsSectionRecent}</SectionTitle>
      {loading ? (
        <div className="text-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-400 mx-auto" /></div>
      ) : (comments.length === 0 ? DEMO_IG_COMMENTS : comments).length === 0 ? null : (
        <div className="flex flex-col gap-2">
          {(comments.length === 0 ? (
            <>
              <PreviewBanner agentName="Instagram Comments" connectLabel={p.assetBadgeConnectCta} connectUrl="/api/auth/instagram-oauth" claraMessage={p.contentConnectFirstBody} gradientFrom="#e11d48" gradientTo="#be123c" />
            </>
          ) : null)}
          {(comments.length === 0 ? DEMO_IG_COMMENTS : comments).slice(0, 10).map(c => (
            <div key={c.comment_id} className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
              <div className="p-3 flex items-start gap-3">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${c.replied ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                  {c.replied ? '\u2713' : p.igCommentsNewBadge}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-white/50">@{c.username}</span>
                  <p className="text-sm text-white/80 mt-0.5">{c.text}</p>
                </div>
                {!c.replied && (
                  <button onClick={() => setReplying(replying === c.comment_id ? null : c.comment_id)} className="text-[10px] px-2 py-1 bg-white/10 rounded-lg text-white/60 hover:bg-white/15 shrink-0">
                    {p.reply}
                  </button>
                )}
              </div>
              {replying === c.comment_id && (
                <div className="px-3 pb-3 border-t border-white/5 pt-2 flex gap-2">
                  <input type="text" value={replyText} onChange={e => setReplyText(e.target.value)} placeholder={p.dmCommentCardPlaceholder} className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none" onKeyDown={e => { if (e.key === 'Enter') handleReply(c.comment_id); }} />
                  <button onClick={() => handleReply(c.comment_id)} className="px-3 py-1.5 bg-purple-600 text-white text-xs rounded-lg">{p.sendBtn}</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
