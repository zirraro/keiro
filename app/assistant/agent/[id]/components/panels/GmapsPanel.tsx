'use client';

/**
 * Theo — Google Maps / Google Business Profile agent panel.
 * Extracted from AgentDashboard.tsx so Theo-specific UI lives with Theo.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import PreviewBanner from '../PreviewBanner';
import { DEMO_REVIEWS } from '../AgentPreviewData';
import {
  fmt, fmtDate,
  KpiCard, SectionTitle, ActionButton,
} from './Primitives';
import { AutoModeToggle } from './AutoModeToggle';
import { useLanguage } from '@/lib/i18n/context';
import type { PanelProps } from './types';
import { CarteFiche, FiltresAvis, useFiltresAvis } from './FicheEtablissement';
import { exemplesSeoPour } from '@/lib/marketing/seo-local-exemples';
import HistoriqueTheo from './HistoriqueTheo';

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
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-white/60 shrink-0">
              {review.author?.[0]?.toUpperCase() || '?'}
            </div>
            <span className="text-sm text-white/80 font-medium truncate min-w-0">{review.author}</span>
            <div className="flex gap-0.5 shrink-0">
              {Array.from({ length: 5 }).map((_, s) => (
                <svg key={s} className="w-3 h-3" viewBox="0 0 24 24" fill={s < review.rating ? '#fbbf24' : 'rgba(255,255,255,0.15)'}>
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0"
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
        <p className="text-xs text-white/30 mt-1">{fmtDate(review.date)}</p>
      </div>

      {showReply && (
        <div className="px-4 pb-4 border-t border-white/5 pt-3 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-white/40">{replyText && !generating ? 'Modifie ou envoie :' : 'Reponse IA generee :'}</span>
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
                      // L'auteur et la note partent avec la réponse : c'est
                      // ce qui rend l'historique lisible ensuite.
                      body: JSON.stringify({
                        review_name: review.name, reply: replyText,
                        author: review.author, rating: review.rating,
                      }),
                    });
                    const d = await res.json();
                    if (d.sent) { setSent(true); setTimeout(() => { setSent(false); setShowReply(false); }, 2000); }
                  } catch {} finally { setSending(false); }
                }}
                disabled={sending || !replyText.trim()}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${sent ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gradient-to-r from-emerald-600 to-green-600 text-white hover:opacity-90'} disabled:opacity-40`}
              >
                {sent ? '\u2713 Publie !' : sending ? '...' : '\u{1F4E8} Publier sur Google'}
              </button>
            )}
            <button
              onClick={copyReply}
              disabled={!replyText.trim()}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${copied ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gradient-to-r from-amber-600 to-yellow-600 text-white hover:opacity-90'} disabled:opacity-40`}
            >
              {copied ? '\u2713 Copie !' : '\u{1F4CB} Copier'}
            </button>
            <a
              href="https://business.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600/30 ml-auto"
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
  const { t, locale } = useLanguage();
  const isEn = locale === 'en';
  const p = t.panels;
  const stats = data.gmapsStats || { reviewsAnswered: 0, googleRating: 0, totalReviews: 0, gmbClicks: 0, recentReviews: [] };

  // Fetch real Google reviews if connected
  const [googleReviews, setGoogleReviews] = useState<any[]>([]);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleNeedsLocation, setGoogleNeedsLocation] = useState(false);
  // La fiche telle que Google la publie — null tant qu'elle n'est pas lisible.
  const [fiche, setFiche] = useState<any>(null);
  const [messageGoogle, setMessageGoogle] = useState<string | null>(null);
  const [refusApi, setRefusApi] = useState(false);
  const [typeBusiness, setTypeBusiness] = useState<string | null>(null);
  const [deconnexion, setDeconnexion] = useState(false);
  // Le rafraîchissement vit dans le useEffect ; cette référence le rend
  // appelable depuis un bouton sans dupliquer la logique de récupération.
  const rafraichirRef = useRef<null | (() => void)>(null);
  const [loadingReviews, setLoadingReviews] = useState(false);
  // Théo v2 — collecte d'avis (lien officiel + QR).
  const [collectLink, setCollectLink] = useState<{ reviewUrl: string | null; qrUrl: string | null; source?: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (!googleConnected) return;
    let cancelled = false;
    fetch('/api/agents/reviews/collect-link', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (!cancelled && d?.ok && d.reviewUrl) setCollectLink({ reviewUrl: d.reviewUrl, qrUrl: d.qrUrl, source: d.source }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [googleConnected]);

  useEffect(() => {
    let cancelled = false;
    const fetchReviews = (forcer = false) => {
      setLoadingReviews(true);
      fetch(`/api/agents/google-reviews${forcer ? '?refresh=1' : ''}`, { credentials: 'include' })
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
            setFiche(d.fiche || null);
            setMessageGoogle(d.message || null);
            // Google a refusé l'appel : ce n'est PAS « aucun établissement ».
            // Confondre les deux envoie le client créer une fiche qu'il a déjà.
            setRefusApi(!!d.diagnostic?.erreur);
            setTypeBusiness(d.businessType || null);
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
    // Rester à jour sans que le client ait à y penser : une relecture toutes
    // les dix minutes tant que l'onglet est ouvert. Assez rare pour ne pas
    // peser sur le quota Google, assez fréquent pour qu'un avis du matin ne
    // dorme pas jusqu'au lendemain.
    const minuterie = window.setInterval(() => fetchReviews(), 10 * 60 * 1000);
    rafraichirRef.current = () => fetchReviews(true);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      window.clearInterval(minuterie);
    };
  }, []);

  // Les avis affichés : réels si le quota Google le permet, exemples sinon —
  // un panneau vide ne montre pas comment Théo travaille.
  // Un compte connecté qui n'a réellement aucun avis ne doit PAS voir des
  // exemples présentés comme les siens : le titre afficherait « N avis » sur
  // des données inventées. Zéro mesuré et absence de données sont deux choses
  // différentes — les exemples ne servent qu'au second cas.
  const enExemple = !googleConnected;
  const avisSource = enExemple ? DEMO_REVIEWS : googleReviews;
  const { periode, setPeriode, recherche, setRecherche, avisFiltres } = useFiltresAvis<any>(avisSource);
  const sansReponse = avisSource.filter((a: any) => !a.replied && !a.replyText && !a.reply).length;

  // Star rating visual
  const fullStars = Math.floor(stats.googleRating);
  const hasHalf = stats.googleRating - fullStars >= 0.25;
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);

  return (
    <>
      {/* La fiche établissement — première chose qu'un commerçant vient vérifier. */}
      <CarteFiche
        fiche={fiche}
        connecte={googleConnected}
        messageBlocage={messageGoogle}
      />

      {/* Rafraîchir et déconnecter : rien ne permettait de faire l'un ou
          l'autre. Un client dont la fiche venait d'être créée, ou dont
          l'accès API venait d'être accordé, n'avait aucun moyen de forcer la
          relecture — il fallait attendre. Et se déconnecter de Google était
          simplement impossible, alors qu'on peut le faire pour Instagram,
          TikTok et LinkedIn. */}
      {googleConnected && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => rafraichirRef.current?.()}
            disabled={loadingReviews}
            className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 active:bg-white/20 text-white/80 text-[13px] font-semibold transition-colors disabled:opacity-50"
          >
            {loadingReviews ? 'Mise à jour…' : '↻ Rafraîchir'}
          </button>
          <button
            onClick={async () => {
              if (!window.confirm('Déconnecter ta fiche Google ? Théo cessera de répondre à tes avis. Tu pourras la reconnecter quand tu veux.')) return;
              setDeconnexion(true);
              try {
                await fetch('/api/agents/disconnect-network', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({ network: 'google' }),
                });
                window.location.reload();
              } finally { setDeconnexion(false); }
            }}
            disabled={deconnexion}
            className="min-h-[44px] inline-flex items-center justify-center px-4 rounded-xl border border-white/15 text-white/50 hover:text-white/80 hover:border-white/25 text-[13px] font-medium transition-colors disabled:opacity-50"
          >
            {deconnexion ? 'Déconnexion…' : 'Déconnecter Google'}
          </button>
        </div>
      )}

      {/* Réponses automatiques — la seule décision qu'il prend ici. */}
      <AutoModeToggle agentId="gmaps" autoLabel={p.gmapsToggleAutoLabel} manualLabel={p.gmapsToggleManualLabel} autoDesc={p.gmapsToggleAutoDesc} manualDesc={p.gmapsToggleManualDesc} />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label={p.gmapsKpiAnswered} value={fmt(stats.reviewsAnswered)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard
          label={p.gmapsKpiRating}
          value={`${(stats.googleRating || 0).toLocaleString(typeof window !== 'undefined' && localStorage.getItem('keiro_language') === 'en' ? 'en-US' : 'fr-FR', { maximumFractionDigits: 1 })}/5`}
          gradientFrom={gradientFrom}
          gradientTo={gradientTo}
        />
        <KpiCard label={p.gmapsKpiClicks} value={fmt(stats.gmbClicks)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      {/* Bloc étoiles : seulement s'il y a des avis. Vide, il répétait le KPI
          « 0/5 » juste au-dessus et allongeait la page pour rien. */}
      {stats.totalReviews > 0 && <>
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
          {(stats.googleRating || 0).toLocaleString(typeof window !== 'undefined' && localStorage.getItem('keiro_language') === 'en' ? 'en-US' : 'fr-FR', { maximumFractionDigits: 1 })}
        </span>
      </div>
      </>}

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
      {googleConnected && googleNeedsLocation && !refusApi && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 mb-4">
          <div className="flex items-start gap-3">
            <span className="text-xl">{'\u26A0\uFE0F'}</span>
            <div className="flex-1 min-w-0">
              <h4 className="text-amber-300 font-bold text-sm mb-1">{p.gmapsNeedsLocationTitle}</h4>
              <p className="text-white/60 text-xs mb-2 leading-relaxed">{p.gmapsNeedsLocationDesc}</p>
              <a
                href="/api/auth/google-oauth"
                className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 transition"
              >
                {p.gmapsNeedsLocationBtn}
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Google reviews: real data or demo */}
      <div data-tour="google-reviews">
      <SectionTitle>{googleConnected ? p.gmapsSectionAvisConnected.replace('{n}', String(avisFiltres.length)) : p.gmapsSectionAvisPreview}</SectionTitle>
      <FiltresAvis periode={periode} setPeriode={setPeriode} recherche={recherche} setRecherche={setRecherche} sansReponse={sansReponse} />
      <div className={`flex flex-col gap-2 ${!googleConnected ? 'opacity-90' : ''}`}>
        {avisFiltres.length === 0 && (
          <p className="text-white/40 text-sm py-6 text-center">
            {avisSource.length === 0
              ? "Ta fiche n'a encore aucun avis. Théo répondra dès le premier."
              : 'Aucun avis ne correspond à cette recherche.'}
          </p>
        )}
        {avisFiltres.slice(0, 20).map((review: any, i: number) => (
          <ReviewCard key={i} review={review} gradientFrom={gradientFrom} />
        ))}
      </div>

      </div>{/* close google-reviews data-tour */}

      {/* THÉO v2 — Collecte d'avis : lien officiel + QR (kit vitrine / post-visite) */}
      {googleConnected && collectLink?.reviewUrl && (
        <>
          <SectionTitle>{isEn ? 'Collect new reviews' : 'Collecter de nouveaux avis'}</SectionTitle>
          <div className="bg-white/5 rounded-xl border border-white/10 p-4 flex flex-col sm:flex-row gap-4 items-center">
            {collectLink.qrUrl && (
              <img
                src={collectLink.qrUrl}
                alt={isEn ? 'Review QR code' : 'QR code avis'}
                className="w-32 h-32 rounded-lg bg-white p-1.5 flex-shrink-0"
                loading="lazy"
              />
            )}
            <div className="flex-1 min-w-0 w-full text-center sm:text-left">
              <p className="text-sm text-white/80 font-medium mb-1">
                {isEn ? 'Turn happy visits into 5★ reviews' : 'Transforme les visites contentes en avis 5★'}
              </p>
              <p className="text-xs text-white/50 leading-snug mb-3">
                {isEn
                  ? 'Print the QR for your counter/window, or send the link after a visit. Théo replies to every review → better local SEO.'
                  : 'Imprime le QR pour ton comptoir/vitrine, ou envoie le lien après une visite. Théo répond à chaque avis → meilleur SEO local.'}
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={() => { navigator.clipboard?.writeText(collectLink.reviewUrl || ''); setCopiedLink(true); setTimeout(() => setCopiedLink(false), 1800); }}
                  className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-medium transition-all active:scale-95"
                >
                  {copiedLink ? (isEn ? 'Copied ✓' : 'Copié ✓') : (isEn ? 'Copy review link' : 'Copier le lien d’avis')}
                </button>
                {collectLink.qrUrl && (
                  <a
                    href={collectLink.qrUrl}
                    download="qr-avis-google.png"
                    className="px-3 py-2 rounded-lg border border-white/15 text-white/80 hover:bg-white/5 text-xs font-medium text-center transition-all"
                  >
                    {isEn ? 'Download QR' : 'Télécharger le QR'}
                  </a>
                )}
              </div>
            </div>
          </div>
        </>
      )}

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

      {/* SEO local \u2014 ce que Th\u00e9o optimise (avec exemples ; r\u00e9el si location trouv\u00e9e) */}
      {(() => {
        const locationFound = googleConnected && !googleNeedsLocation;
        // Les exemples parlent le métier du client. Ils étaient tous écrits
        // pour un salon de coiffure : un restaurateur y lisait « balayage,
        // spécialiste bouclés » et se demandait si on s'était trompé de compte.
        const seoItems = exemplesSeoPour(typeBusiness);
        return (
          <div data-tour="theo-seo" className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/[0.05] p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-sm font-semibold text-white/90">{isEn ? 'Getting found on Google' : 'Être trouvé sur Google'}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${locationFound ? 'bg-amber-500/20 text-amber-300' : 'bg-white/10 text-white/50'}`}>
                {locationFound ? (isEn ? 'Active on your profile' : 'Actif sur ta fiche') : (isEn ? 'Preview \u2014 examples' : 'Aper\u00e7u \u2014 exemples')}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {/* 10 px était illisible sur un téléphone tenu à bout de bras. */}
              {seoItems.map((item, i) => (
                <div key={i} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="text-[13px] font-semibold text-white/90 mb-1">{item.titre}</div>
                  <div className="text-[12px] text-white/50 leading-relaxed mb-2">{item.pourquoi}</div>
                  <div className="text-[12px] text-amber-300/80 leading-relaxed border-l-2 border-amber-500/30 pl-2.5">{item.exemple}</div>
                </div>
              ))}
            </div>
            {!locationFound && (
              <p className="text-xs text-white/40 mt-2.5">
                {isEn
                  ? 'Connect your Google Business profile to run these on your real location.'
                  : 'Connecte ta fiche Google Business pour lancer \u00e7a sur ta vraie localisation.'}
              </p>
            )}
          </div>
        );
      })()}

      <HistoriqueTheo />

      {/* « Générer » menait au générateur d'images et « Voir le CRM » aux
          prospects : deux boutons sans rapport avec les avis Google, dans le
          panneau où l'on vient gérer ses avis. Le fondateur a demandé ce que
          « Générer » générait — la meilleure preuve qu'ils n'avaient rien à
          faire ici. Retirés : la page raccourcit d'autant. */}

      {/* Ce bouton n'avait aucune action : il affichait un libellé et ne
          menait nulle part. Il pointe maintenant vers la vraie fiche — sur
          la recherche Google quand on connaît le nom de l'établissement,
          sinon sur le tableau de bord Google Business. */}
      <a
        href={
          fiche?.nom
            ? `https://www.google.com/search?q=${encodeURIComponent(fiche.nom + (fiche.adresse ? ' ' + fiche.adresse : ''))}`
            : 'https://business.google.com/locations'
        }
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 w-full inline-flex items-center justify-center gap-2 min-h-[48px] px-4 py-3 rounded-xl text-white text-sm font-semibold bg-gradient-to-r hover:opacity-90 active:opacity-80 transition-opacity"
        style={{ backgroundImage: `linear-gradient(to right, ${gradientFrom}, ${gradientTo})` }}
      >
        {fiche?.nom ? 'Voir ma fiche sur Google' : 'Gérer ma fiche sur Google Business'} {'↗'}
      </a>
    </>
  );
}
