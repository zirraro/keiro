'use client';

/**
 * Theo — Google Maps / Google Business Profile agent panel.
 * Extracted from AgentDashboard.tsx so Theo-specific UI lives with Theo.
 */

import { useState, useCallback, useEffect } from 'react';
import PreviewBanner from '../PreviewBanner';
import { DEMO_REVIEWS } from '../AgentPreviewData';
import {
  fmt, fmtDate,
  KpiCard, SectionTitle, ActionButton,
} from './Primitives';
import { AutoModeToggle } from './AutoModeToggle';
import { useLanguage } from '@/lib/i18n/context';
import type { PanelProps } from './types';

// Review card with AI reply generation + direct Google reply for Google reviews
function ReviewCard({ review, gradientFrom }: { review: { name?: string; author: string; rating: number; text: string; date: string; replied: boolean }; gradientFrom: string }) {
  const { locale } = useLanguage();
  const isEn = locale === 'en';
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const generateReply = useCallback(async () => {
    setGenerating(true);
    try {
      // Instruction sent to the agent: mirror the reviewer's language
      // so Theo writes the reply in the same language the customer used.
      const { languagePromptDirective } = await import('@/lib/agents/language-detect');
      const langHint = languagePromptDirective(review.text);
      const res = await fetch('/api/agents/client-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          agent_id: 'gmaps',
          message: `${langHint}\n\nGenere une reponse professionnelle et chaleureuse a cet avis Google (${review.rating}/5 etoiles) de ${review.author}: "${review.text}". Reponse courte (2-3 phrases max), qui remercie et montre qu'on prend en compte le feedback. Pas de formule type, sois naturel.`,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d.reply) setReplyText(d.reply);
      }
    } catch {} finally { setGenerating(false); }
  }, [review]);

  const copyReply = useCallback(() => {
    navigator.clipboard.writeText(replyText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [replyText]);

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-white/60">
              {review.author?.[0]?.toUpperCase() || '?'}
            </div>
            <span className="text-sm text-white/80 font-medium">{review.author}</span>
            <div className="flex gap-0.5">
              {Array.from({ length: 5 }).map((_, s) => (
                <svg key={s} className="w-3 h-3" viewBox="0 0 24 24" fill={s < review.rating ? '#fbbf24' : 'rgba(255,255,255,0.15)'}>
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
              style={{
                backgroundColor: review.replied ? 'rgba(52,211,153,0.15)' : 'rgba(251,191,36,0.15)',
                color: review.replied ? '#34d399' : '#fbbf24',
              }}
            >
              {review.replied ? 'Répondu' : 'En attente'}
            </span>
            {!review.replied && (
              <button onClick={() => { setShowReply(!showReply); if (!showReply && !replyText) generateReply(); }} className="text-xs px-3 py-2 bg-white/10 rounded-lg text-white/60 hover:bg-white/15 shrink-0 min-h-[36px]">
                {showReply ? 'Fermer' : 'Repondre'}
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-white/60 line-clamp-3">{review.text}</p>
        <p className="text-[10px] text-white/30 mt-1">{fmtDate(review.date)}</p>
      </div>

      {showReply && (
        <div className="px-4 pb-4 border-t border-white/5 pt-3 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] text-white/40">{replyText && !generating ? 'Modifie ou envoie :' : 'Reponse IA generee :'}</span>
            {generating && <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-purple-400" />}
          </div>
          <textarea
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            placeholder={generating ? (isEn ? 'Generating...' : 'Generation en cours...') : (isEn ? 'Write your reply or hit Regenerate for an AI suggestion...' : 'Ecris ta reponse ou clique Regenerer pour une suggestion IA...')}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-purple-500/50 resize-none"
            rows={3}
          />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={generateReply}
              disabled={generating}
              className="px-3 py-2 text-xs font-medium bg-white/10 text-white/60 rounded-lg hover:bg-white/15 disabled:opacity-40 min-h-[36px]"
            >
              {generating ? (isEn ? 'Generating...' : 'Generation...') : `\u2728 ${isEn ? 'Regenerate' : 'Regenerer'}`}
            </button>
            {/* Direct reply via Google Business API */}
            {review.name && (
              <button
                onClick={async () => {
                  if (!replyText.trim()) return;
                  setSending(true);
                  try {
                    const res = await fetch('/api/agents/google-reviews', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({ review_name: review.name, reply: replyText }),
                    });
                    const d = await res.json();
                    if (d.sent) { setSent(true); setTimeout(() => { setSent(false); setShowReply(false); }, 2000); }
                  } catch {} finally { setSending(false); }
                }}
                disabled={sending || !replyText.trim()}
                className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all ${sent ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gradient-to-r from-emerald-600 to-green-600 text-white hover:opacity-90'} disabled:opacity-40`}
              >
                {sent ? '\u2713 Publie !' : sending ? '...' : '\u{1F4E8} Publier sur Google'}
              </button>
            )}
            <button
              onClick={copyReply}
              disabled={!replyText.trim()}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all ${copied ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gradient-to-r from-amber-600 to-yellow-600 text-white hover:opacity-90'} disabled:opacity-40`}
            >
              {copied ? '\u2713 Copie !' : '\u{1F4CB} Copier'}
            </button>
            <a
              href="https://business.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-[10px] font-medium bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600/30 ml-auto"
            >
              Google Business {'\u2197'}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export function GmapsPanel({ data, agentName, gradientFrom, gradientTo }: PanelProps) {
  const { t } = useLanguage();
  const p = t.panels;
  const stats = data.gmapsStats || { reviewsAnswered: 0, googleRating: 0, totalReviews: 0, gmbClicks: 0, recentReviews: [] };

  // Fetch real Google reviews if connected
  const [googleReviews, setGoogleReviews] = useState<any[]>([]);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleNeedsLocation, setGoogleNeedsLocation] = useState(false);
  const [loadingReviews, setLoadingReviews] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchReviews = () => {
      setLoadingReviews(true);
      fetch('/api/agents/google-reviews', { credentials: 'include' })
        .then(r => r.json())
        .then(d => {
          if (cancelled) return;
          // Treat the account as connected as soon as the API says so, even
          // if there are zero reviews yet (new Google Business profile, or
          // location with no reviews) — otherwise the PreviewBanner stays
          // forever and the client thinks the connection failed.
          if (d.connected) {
            setGoogleReviews(d.reviews || []);
            setGoogleConnected(true);
            setGoogleNeedsLocation(!!d.needsLocation);
          } else {
            setGoogleConnected(false);
            setGoogleNeedsLocation(false);
          }
        })
        .catch(() => {})
        .finally(() => { if (!cancelled) setLoadingReviews(false); });
    };

    fetchReviews();

    // Re-check connection when the tab regains focus — handles the OAuth
    // round trip (Google → callback → back to this page) even if the URL
    // param watcher in the parent page didn't force a re-mount.
    const onFocus = () => fetchReviews();
    window.addEventListener('focus', onFocus);
    return () => { cancelled = true; window.removeEventListener('focus', onFocus); };
  }, []);

  // Star rating visual
  const fullStars = Math.floor(stats.googleRating);
  const hasHalf = stats.googleRating - fullStars >= 0.25;
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label={p.gmapsKpiAnswered} value={fmt(stats.reviewsAnswered)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard
          label={p.gmapsKpiRating}
          value={`${(stats.googleRating || 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}/5`}
          gradientFrom={gradientFrom}
          gradientTo={gradientTo}
        />
        <KpiCard label={p.gmapsKpiClicks} value={fmt(stats.gmbClicks)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      {/* Star rating visual */}
      <SectionTitle>{p.gmapsSectionAvg.replace('{n}', fmt(stats.totalReviews))}</SectionTitle>
      <div className="bg-white/5 rounded-xl border border-white/10 p-4 flex items-center justify-center gap-1">
        {Array.from({ length: fullStars }).map((_, i) => (
          <svg key={`full-${i}`} className="w-7 h-7" viewBox="0 0 24 24" fill={gradientFrom}>
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        ))}
        {hasHalf && (
          <svg className="w-7 h-7" viewBox="0 0 24 24">
            <defs>
              <linearGradient id="half-star-grad">
                <stop offset="50%" stopColor={gradientFrom} />
                <stop offset="50%" stopColor="rgba(255,255,255,0.15)" />
              </linearGradient>
            </defs>
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="url(#half-star-grad)" />
          </svg>
        )}
        {Array.from({ length: emptyStars }).map((_, i) => (
          <svg key={`empty-${i}`} className="w-7 h-7" viewBox="0 0 24 24" fill="rgba(255,255,255,0.15)">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        ))}
        <span className="ml-3 text-lg font-bold text-white/80">
          {(stats.googleRating || 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
        </span>
      </div>

      {/* Single preview banner if not connected */}
      {!googleConnected && !loadingReviews && (
        <PreviewBanner
          agentName="Theo"
          connectLabel={p.gmapsConnectLabel}
          connectUrl="/api/auth/google-oauth"
          claraMessage={p.gmapsConnectMessage}
          gradientFrom="#f59e0b"
          gradientTo="#d97706"
        />
      )}

      {/* Connected but no Google Business location found — guide user */}
      {googleConnected && googleNeedsLocation && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 mb-4">
          <div className="flex items-start gap-3">
            <span className="text-xl">{'\u26A0\uFE0F'}</span>
            <div className="flex-1 min-w-0">
              <h4 className="text-amber-300 font-bold text-sm mb-1">{p.gmapsNeedsLocationTitle}</h4>
              <p className="text-white/60 text-xs mb-2 leading-relaxed">
                {p.gmapsNeedsLocationDesc.split('business.google.com')[0]} <a href="https://business.google.com" target="_blank" rel="noopener" className="text-amber-300 underline">business.google.com</a>,
                puis reviens ici — Theo recuperera automatiquement tes avis.
              </p>
              <a
                href="/api/auth/google-oauth"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 transition"
              >
                {p.gmapsNeedsLocationBtn}
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Auto-reply toggle — always visible (demo or real) */}
      <AutoModeToggle agentId="gmaps" autoLabel={p.gmapsToggleAutoLabel} manualLabel={p.gmapsToggleManualLabel} autoDesc={p.gmapsToggleAutoDesc} manualDesc={p.gmapsToggleManualDesc} />

      {/* Google reviews: real data or demo */}
      <div data-tour="google-reviews">
      <SectionTitle>{googleConnected ? p.gmapsSectionAvisConnected.replace('{n}', String(googleReviews.length)) : p.gmapsSectionAvisPreview}</SectionTitle>
      <div className={`flex flex-col gap-2 ${!googleConnected ? 'opacity-90' : ''}`}>
        {(googleConnected ? googleReviews : DEMO_REVIEWS).slice(0, 10).map((review: any, i: number) => (
          <ReviewCard key={i} review={review} gradientFrom={gradientFrom} />
        ))}
      </div>

      </div>{/* close google-reviews data-tour */}

      {/* Bottom padding for mobile nav */}
      <div className="pb-16 lg:pb-0" />

      {/* Fallback: cached reviews from agent_logs */}
      {(stats.recentReviews?.length || 0) > 0 && <SectionTitle>{p.gmapsSectionRecentAvis}</SectionTitle>}
      {(stats.recentReviews?.length || 0) > 0 && (
        <div className="flex flex-col gap-2">
          {(stats.recentReviews || []).slice(0, 5).map((review: any, i: number) => (
            <ReviewCard key={i} review={review} gradientFrom={gradientFrom} />
          ))}
        </div>
      )}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href="/generate" className="px-4 py-2 bg-gradient-to-r from-amber-600 to-yellow-600 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all">
          {'\u2728'} {p.generate}
        </a>
        <a href="/assistant/crm" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u{1F4CA}'} {p.viewCrm}
        </a>
      </div>

      <ActionButton label={p.gmapsBtnViewPage} gradientFrom={gradientFrom} gradientTo={gradientTo} />
    </>
  );
}
