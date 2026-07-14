'use client';

/**
 * Jade — Instagram DM agent dashboard panel.
 * Extracted from AgentDashboard.tsx. Bundles all DM-related sub-components
 * (JadeTabs, DmConversationsLive, DmCard, CommentCard, LenaCommentsSection,
 * PendingDMQueue) since they are only used together inside DmInstagramPanel.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import PreviewBanner from '../PreviewBanner';
import { DEMO_DM_CONVERSATIONS, DEMO_IG_COMMENTS } from '../AgentPreviewData';
import { fmt, KpiCard, SectionTitle } from './Primitives';
import { SocialConnectBanners, AgentNotifications } from './SharedBanners';
import { InstagramAssetBadge } from './InstagramAssetBadge';
import FollowSuggestions from './FollowSuggestions';
import { useLanguage } from '@/lib/i18n/context';
import { DemoCaption } from '@/components/meta/DemoCaption';
import type { PanelProps } from './types';

// Jade tabs: DMs + Comments switch

// Jade multi-network: like Léna, the user picks a network FIRST at the
// top of the panel (under the Jade header). Selecting a network swaps
// the entire underlying experience (KPIs, campaign actions, queue, tabs)
// so the workspace reads as truly multi-network. The selector lives at
// the panel root (DmInstagramPanel) — not inside JadeTabs — exactly
// like Léna's NetworkSection rule. JadeTabs just receives the selected
// network as a prop.
export type JadeNetwork = 'instagram' | 'tiktok' | 'linkedin';

export const JADE_NETWORKS: { key: JadeNetwork; label: string; icon: string; color: string }[] = [
  { key: 'instagram', label: 'Instagram', icon: '\u{1F4F8}', color: '#e11d48' },
  { key: 'tiktok', label: 'TikTok', icon: '\u{1F3B5}', color: '#00f2ea' },
  { key: 'linkedin', label: 'LinkedIn', icon: '\u{1F4BC}', color: '#0A66C2' },
];

export function JadeNetworkSelector({ network, onChange }: { network: JadeNetwork; onChange: (n: JadeNetwork) => void }) {
  return (
    <div className="flex gap-2 mb-3">
      {JADE_NETWORKS.map(n => (
        <button
          key={n.key}
          onClick={() => onChange(n.key)}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
            network === n.key
              ? 'bg-white/10 text-white border border-white/20 shadow'
              : 'bg-white/[0.03] text-white/40 border border-white/5 hover:text-white/70'
          }`}
          style={network === n.key ? { borderColor: n.color + '60' } : {}}
        >
          <span>{n.icon}</span>
          <span>{n.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Network-aware KPI row for Jade. Instagram pulls live dashboard
 * stats. TikTok and LinkedIn show plausible sample numbers until those
 * networks are fully wired through the dashboard API. Labels adapt
 * per network because the engagement vocabulary differs (DMs → DMs,
 * comments → comments, follows → connexions on LinkedIn, etc.).
 */
function JadeKpiRow({ network, connected, stats }: { network: JadeNetwork; connected: boolean; stats: any }) {
  const { t, locale } = useLanguage();
  const en = locale === 'en';
  const p = t.panels;

  let display: { sent: number; replies: number; drafted: number; prospects: number };
  let isSample = false;

  if (network === 'instagram') {
    if (connected) {
      display = {
        sent: stats?.dmsSent || 0,
        replies: stats?.responses || 0,
        drafted: stats?.queuePending || 0,
        prospects: stats?.prospectsWithIG || 0,
      };
    } else {
      isSample = true;
      display = { sent: 12, replies: 4, drafted: 8, prospects: 27 };
    }
  } else if (network === 'tiktok') {
    // No live TT DM stats yet — sample numbers anchored on a typical
    // active small-business TikTok account.
    isSample = !connected;
    display = { sent: 18, replies: 6, drafted: 14, prospects: 42 };
  } else {
    // LinkedIn — sample numbers anchored on a typical B2B small biz.
    isSample = !connected;
    display = { sent: 9, replies: 3, drafted: 6, prospects: 22 };
  }

  // If all 4 KPIs are 0 AND the user is connected (so it's real zero,
  // not sample), hide the noisy "0 / 0 / 0 / 0" row and show a clean
  // empty state inviting the user to launch their first action.
  const allZero = display.sent === 0 && display.replies === 0 && display.drafted === 0 && display.prospects === 0;
  if (allZero && !isSample && connected) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 mb-3 flex items-center gap-2.5">
        <span className="text-base">{'\u{1F4CA}'}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold text-white/80">{en ? 'Your Jade stats will appear here' : 'Tes stats Jade apparaitront ici'}</div>
          <div className="text-[10px] text-white/50">
            {en
              ? 'Launch your first campaign (Prepare DMs · Follow · Send queued) and the numbers fill in live.'
              : 'Lance ta première campagne (Prepare DMs · Follow · Send queued) et les chiffres se remplissent en live.'}
          </div>
        </div>
      </div>
    );
  }

  const labels = network === 'linkedin'
    ? (en
        ? { sent: 'Messages sent', replies: 'Replies', drafted: 'To send', prospects: 'Targeted connections' }
        : { sent: 'Messages envoyés', replies: 'Réponses', drafted: 'À envoyer', prospects: 'Connexions ciblées' })
    : network === 'tiktok'
      ? (en
          ? { sent: 'DMs sent', replies: 'Replies', drafted: 'To send', prospects: 'Targeted creators' }
          : { sent: 'DMs envoyés', replies: 'Réponses', drafted: 'À envoyer', prospects: 'Créateurs ciblés' })
      : { sent: p.dmKpiSent, replies: p.dmKpiResponses, drafted: p.dmKpiPrepared, prospects: p.dmKpiProspects };

  return (
    <>
      {isSample && (
        <div className="flex items-center gap-2 mb-2 text-[10px]">
          <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-semibold">Sample data</span>
          <span className="text-white/40">
            {network === 'instagram'
              ? (en ? 'Connect Instagram to replace these sample numbers with your live Jade activity.' : 'Connecte Instagram pour remplacer ces chiffres-exemple par ton activité Jade en live.')
              : (en ? `Connect ${network === 'tiktok' ? 'TikTok' : 'LinkedIn'} to activate real data.` : `Connecte ${network === 'tiktok' ? 'TikTok' : 'LinkedIn'} pour activer les vraies données.`)}
          </span>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <KpiCard label={labels.sent} value={fmt(display.sent)} gradientFrom="#3b82f6" gradientTo="#2563eb" />
        <KpiCard label={labels.replies} value={fmt(display.replies)} gradientFrom="#f59e0b" gradientTo="#d97706" />
        <KpiCard label={labels.drafted} value={fmt(display.drafted)} gradientFrom="#8b5cf6" gradientTo="#6d28d9" />
        <KpiCard label={labels.prospects} value={fmt(display.prospects)} gradientFrom="#ec4899" gradientTo="#db2777" />
      </div>
    </>
  );
}

function JadeTabs({ network }: { network: JadeNetwork }) {
  const { t, locale } = useLanguage();
  const p = t.panels;
  const en = locale === 'en';
  const [tab, setTab] = useState<'prospection' | 'dms' | 'comments' | 'follows'>('prospection');
  const followsLabel = en ? 'Accounts to follow' : 'Comptes à suivre';

  // 2026-06-25 — L'API TikTok ne permet NI DM NI réponse aux commentaires (que
  // la publication). Sur TikTok (et LinkedIn) on ne montre donc QUE "Comptes à
  // suivre". Les onglets DM/Commentaires restent uniquement pour Instagram
  // (Meta autorise ces APIs).
  const igFull = network === 'instagram';
  useEffect(() => { if (!igFull) setTab('follows'); }, [igFull]);

  return (
    <div>
      {/* Onglets : DM/Commentaires uniquement sur Instagram ; "Comptes à suivre" partout */}
      <div className="flex gap-1 bg-white/5 rounded-lg p-0.5 border border-white/10 mb-3">
        {igFull && (
          <>
            <button
              onClick={() => setTab('prospection')}
              className={`flex-1 min-w-0 flex items-center justify-center gap-1 px-2 sm:px-3 py-2 rounded-md text-xs font-medium transition-all ${tab === 'prospection' ? 'bg-white/10 text-white shadow' : 'text-white/40 hover:text-white/60'}`}
            >
              {'\u{1F3AF}'} {en ? 'Prospecting DMs' : 'DM de prospection'}
            </button>
            <button
              onClick={() => setTab('dms')}
              className={`flex-1 min-w-0 flex items-center justify-center gap-1 px-2 sm:px-3 py-2 rounded-md text-xs font-medium transition-all ${tab === 'dms' ? 'bg-white/10 text-white shadow' : 'text-white/40 hover:text-white/60'}`}
            >
              {'\u{1F4AC}'} {en ? 'General DMs' : 'DM généraux'}
            </button>
            <button
              onClick={() => setTab('comments')}
              className={`flex-1 min-w-0 flex items-center justify-center gap-1 px-2 sm:px-3 py-2 rounded-md text-xs font-medium transition-all ${tab === 'comments' ? 'bg-white/10 text-white shadow' : 'text-white/40 hover:text-white/60'}`}
            >
              {'\u{1F4AC}'} {p.dmTabsComments}
            </button>
          </>
        )}
        <button
          onClick={() => setTab('follows')}
          className={`flex-1 min-w-0 flex items-center justify-center gap-1 px-2 sm:px-3 py-2 rounded-md text-xs font-medium transition-all ${tab === 'follows' ? 'bg-white/10 text-white shadow' : 'text-white/40 hover:text-white/60'}`}
        >
          {'\u{1F91D}'} {followsLabel}
        </button>
      </div>

      {/* Comptes à suivre — MÊME setup riche que l'onglet Insta (file de
          prospects cliquables → profil + Fait/Passer + Tout marquer fait + KPIs)
          pour les 3 réseaux (founder 2026-06-25). + warming/niche en complément. */}
      {tab === 'follows' && (
        <div data-tour="dm-follows">
          {network === 'tiktok' && (
            <div className="mb-3 rounded-xl border border-cyan-500/25 bg-cyan-500/[0.06] p-3">
              <div className="text-xs font-bold text-cyan-200 mb-1">{en ? '💡 Keep your TikTok ALIVE = more reach' : '💡 Garde ton TikTok VIVANT = plus de portée'}</div>
              <p className="text-[11px] text-white/60 leading-snug">{en
                ? 'A TikTok account that follows and likes regularly is far better distributed — and it protects your own posts from being throttled when you\'re inactive. 2 min/day: follow a few niche accounts below AND go like a few of their posts. Views follow activity.'
                : 'Un compte TikTok qui suit et like régulièrement est bien mieux distribué — et ça protège tes propres posts du throttle quand tu es inactif. 2 min/jour : suis quelques comptes de ta niche ci-dessous ET va liker quelques-uns de leurs posts. Les vues suivent l\'activité.'}</p>
            </div>
          )}
          {network === 'linkedin' && <LinkedInDrafts />}
          <ManualFollowsList platform={network} />
          <FollowSuggestions platform={network} />
        </div>
      )}

      {/* Instagram — DM de prospection (préparés par Jade, envoi MANUEL car Meta
          interdit le DM à froid automatique). Une fois envoyé → rejoint les DM
          généraux (conversation). */}
      {igFull && tab === 'prospection' && (
        <div data-tour="dm-prospection">
          <p className="text-[11px] text-white/50 mb-2">{en ? 'Jade prepares a personalised opening DM for each new prospect. Send them manually (Instagram forbids cold auto-DMs) — once sent, the conversation moves to General DMs.' : 'Jade prépare un DM d’accroche personnalisé pour chaque nouveau prospect. Envoie-les à la main (Instagram interdit le DM à froid auto) — une fois envoyé, la conversation passe dans DM généraux.'}</p>
          <PendingDMQueue gradientFrom="#ec4899" />
        </div>
      )}

      {/* Instagram — DM + commentaires (Meta API) */}
      {igFull && tab === 'dms' && (
        <div data-tour="dm-conversations"><DmConversationsLive /></div>
      )}
      {igFull && tab === 'comments' && (
        <div data-tour="dm-comments"><LenaCommentsSection /></div>
      )}

      {/* TikTok — uniquement comptes à suivre (l'API ne permet pas DM/commentaires) */}
      {network === 'tiktok' && (
        <p className="text-[10px] text-white/30 mt-3">
          {en
            ? "On TikTok, DMs and comment replies aren't available — so we focus on the accounts to follow to keep your account active and boost your content's reach."
            : "Sur TikTok, les DM et réponses aux commentaires ne sont pas disponibles — on se concentre donc sur les comptes à suivre pour garder ton compte actif et booster la portée de tes contenus."}
        </p>
      )}
    </div>
  );
}

/**
 * Live TikTok data for Jade — pulls REAL rows from the same tables the
 * agent populates so the panel finally stops showing fake samples once
 * the user is connected.
 *
 * Data sources (2026-06-07):
 *   - comments: agent_logs where agent='tiktok_comments' AND
 *     action='reply_sent' AND user_id=current → already-replied comments
 *     (Jade auto-reply is wired via /api/agents/tiktok-comments).
 *   - dms: dm_queue where channel='tiktok' AND user_id=current — Jade
 *     prepares drafts here. TikTok has no public DM API for general apps
 *     so each draft includes a "Open profile in TikTok" deep link to
 *     send the message manually (human-in-the-loop pattern).
 *   - follows: crm_prospects filtered on tiktok_handle for the current
 *     user — the prospect scraper feeds these. Each row links to the
 *     public TikTok profile so the client can follow manually.
 */
function JadeTiktokLive({ tab }: { tab: 'dms' | 'comments' | 'follows' }) {
  const { locale } = useLanguage();
  const en = locale === 'en';
  const [rows, setRows] = useState<Array<{ who: string; msg: string; href?: string; ts?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const sb = (await import('@/lib/supabase/client')).supabaseBrowser();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) { setLoading(false); return; }
        // Check TikTok connection on the user's profile
        const { data: profile } = await sb
          .from('profiles')
          .select('tiktok_access_token')
          .eq('id', user.id)
          .maybeSingle();
        const isConnected = !!profile?.tiktok_access_token;
        if (!cancelled) setConnected(isConnected);
        if (!isConnected) { if (!cancelled) setLoading(false); return; }
        let out: typeof rows = [];

        if (tab === 'comments') {
          const { data } = await sb
            .from('agent_logs')
            .select('created_at, data')
            .eq('agent', 'tiktok_comments')
            .eq('action', 'reply_sent')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20);
          out = (data || []).map((r: any) => ({
            who: '@' + (r.data?.username || 'commenter'),
            msg: r.data?.reply_text || r.data?.original_text || '(comment auto-reply envoyée)',
            ts: r.created_at,
            href: r.data?.video_id ? `https://www.tiktok.com/embed/v2/${r.data.video_id}` : undefined,
          }));
        } else if (tab === 'dms') {
          const { data } = await sb
            .from('dm_queue')
            .select('created_at, target, message, status')
            .eq('user_id', user.id)
            .eq('channel', 'tiktok')
            .order('created_at', { ascending: false })
            .limit(20);
          out = (data || []).map((r: any) => ({
            who: r.target || '@cible',
            msg: `[${r.status}] ${r.message?.substring(0, 140) || ''}`,
            ts: r.created_at,
            href: r.target && r.target.startsWith('@') ? `https://www.tiktok.com/${r.target}` : undefined,
          }));
        } else {
          const { data } = await sb
            .from('crm_prospects')
            .select('company, tiktok_handle, score, created_at')
            .eq('user_id', user.id)
            .not('tiktok_handle', 'is', null)
            .order('score', { ascending: false })
            .limit(20);
          out = (data || []).map((r: any) => ({
            who: r.tiktok_handle?.startsWith('@') ? r.tiktok_handle : `@${r.tiktok_handle}`,
            msg: `${r.company || 'prospect'} · Match ${r.score || 0}%`,
            ts: r.created_at,
            href: r.tiktok_handle ? `https://www.tiktok.com/${r.tiktok_handle.startsWith('@') ? r.tiktok_handle : '@' + r.tiktok_handle}` : undefined,
          }));
        }
        if (!cancelled) setRows(out);
      } catch {}
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tab]);

  const tabLabel = en
    ? (tab === 'dms' ? 'messages ready to send' : tab === 'comments' ? 'auto-replied comments' : 'accounts to follow')
    : (tab === 'dms' ? 'messages prêts à envoyer' : tab === 'comments' ? 'commentaires auto-répondus' : 'comptes à suivre');

  if (loading) {
    return <div className="text-white/40 text-sm p-4">{en ? 'Loading…' : 'Chargement…'}</div>;
  }
  if (connected === false) {
    // Show the standard "connect TikTok" CTA when not yet linked
    return <JadeNetworkPlaceholder network="tiktok" tab={tab} />;
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-sm text-white/60">
        <div className="font-bold text-white mb-1">{en ? 'TikTok connected ✅' : 'TikTok connecté ✅'}</div>
        <div className="text-xs">{en ? <>No {tabLabel} yet. Jade keeps feeding this list — check back in a few hours.</> : <>Aucun {tabLabel} pour l&apos;instant. Jade alimente cette liste en continu — reviens dans quelques heures.</>}</div>
        {tab === 'dms' && (
          <div className="mt-2 text-[11px] text-white/50 space-y-1">
            {en ? (
              <>
                <div>📨 <strong>TikTok DM strategy:</strong> Jade does the <strong>prospecting</strong> (analyzes relevant accounts → personalized message + visual ready). <strong>Follow-up</strong> stays human (when the first reply comes in, you answer it).</div>
                <div>🔗 The visual comes as a public URL link (not an attachment — TikTok rejects them / recipients distrust screenshots).</div>
                <div>⚠️ TikTok has no public DM API. Each draft includes an "Open in TikTok" button → copy the message + send in 1 click.</div>
              </>
            ) : (
              <>
                <div>📨 <strong>Stratégie DM TikTok :</strong> Jade fait la <strong>prospection</strong> (analyse des comptes pertinents → message + visuel personnalisé prêts). Le <strong>suivi</strong> reste humain (le 1er message reçu, c&apos;est toi qui réponds).</div>
                <div>🔗 Le visuel arrive en lien URL public (pas en pièce jointe — TikTok rejette / les destinataires se méfient des screenshots).</div>
                <div>⚠️ TikTok n&apos;a pas d&apos;API DM grand public. Chaque draft inclut un bouton « Ouvrir dans TikTok » → copier le message + envoyer en 1 clic.</div>
              </>
            )}
          </div>
        )}
        {tab === 'follows' && (
          <div className="mt-2 text-[11px] text-white/50 space-y-1">
            {en ? (
              <>
                <div>🎯 <strong>Accounts analyzed against the client target</strong> (audience, sector, account size). Jade prioritizes the profiles where your historical reply rate is highest.</div>
                <div>⚠️ TikTok has no follow API. Each suggestion opens the profile for a manual follow + first interaction (comment, share) in 1 click.</div>
              </>
            ) : (
              <>
                <div>🎯 <strong>Comptes analysés selon la cible client</strong> (audience, secteur, taille de compte). Jade priorise les profils où ton taux de réponse historique est le plus haut.</div>
                <div>⚠️ TikTok n&apos;a pas d&apos;API follow. Chaque suggestion ouvre le profil pour follow + 1ère interaction (commentaire, partage) manuels en 1 clic.</div>
              </>
            )}
          </div>
        )}
        {tab === 'comments' && (
          <div className="mt-2 text-[11px] text-white/50">
            {en
              ? <>✅ Jade automatically replies to ALL comments on your TikTok videos (cron every hour). This list fills up as soon as a comment arrives.</>
              : <>✅ Jade répond automatiquement à TOUS les commentaires sur tes vidéos TikTok (cron toutes les heures). Cette liste se remplit dès qu&apos;un commentaire arrive.</>}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="rounded-lg bg-white/5 border border-white/10 p-3 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-cyan-300 truncate">{r.who}</div>
            <div className="text-xs text-white/70 mt-0.5">{r.msg}</div>
            {r.ts && <div className="text-[10px] text-white/30 mt-1">{new Date(r.ts).toLocaleString(en ? 'en-US' : 'fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</div>}
          </div>
          {r.href && (
            <a
              href={r.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 text-[10px] px-2 py-1 rounded bg-cyan-500/20 border border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/30 transition"
            >
              {en ? 'Open →' : 'Ouvrir →'}
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Placeholder space for Jade on TikTok and LinkedIn — shows a "Connect
 * to activate" CTA + 3 sample items per tab so the workspace reads as
 * truly multi-network. Once the TikTok DM API + LinkedIn messaging
 * scope are wired, this gets replaced by live data loaders.
 */
function JadeNetworkPlaceholder({ network, tab }: { network: 'tiktok' | 'linkedin'; tab: 'dms' | 'comments' | 'follows' }) {
  const { locale } = useLanguage();
  const en = locale === 'en';
  const networkLabel = network === 'tiktok' ? 'TikTok' : 'LinkedIn';
  const oauth = network === 'tiktok' ? '/api/auth/tiktok-oauth' : '/api/auth/linkedin-oauth';
  const tabLabel = en
    ? (tab === 'dms' ? 'direct messages' : tab === 'comments' ? 'comments' : 'follows / connections')
    : (tab === 'dms' ? 'messages privés' : tab === 'comments' ? 'commentaires' : 'follows / connexions');

  const samples = tab === 'dms'
    ? [
        { who: network === 'tiktok' ? '@creator_marais' : '/in/marie-pro', msg: network === 'tiktok' ? 'Salut ! J\'ai adoré ta dernière vidéo, vous prenez des collabs ?' : 'Bonjour, j\'aimerais en savoir plus sur votre service. Disponible cette semaine ?' },
        { who: network === 'tiktok' ? '@food_lover_lyon' : '/in/alex-founder', msg: network === 'tiktok' ? 'Trop fort le tuto !! Vous êtes ouvert dimanche ?' : 'Intéressé par votre approche, on peut échanger 15min ?' },
        { who: network === 'tiktok' ? '@bistrot_paris11' : '/in/sophie-dir', msg: network === 'tiktok' ? 'Hey, j\'aimerais partager ton concept avec ma com — possible ?' : 'Votre profil correspond à un besoin que j\'ai. Disponible pour un appel ?' },
      ]
    : tab === 'comments'
    ? [
        { who: network === 'tiktok' ? '@scroll_addict_22' : '/in/laurent-pro', msg: network === 'tiktok' ? 'C\'est ouf, vous êtes où en France ?' : 'Belle initiative — un retour d\'expérience à partager ?' },
        { who: network === 'tiktok' ? '@thomas_eats' : '/in/celine-vc', msg: network === 'tiktok' ? '12K vues mérité, format propre' : 'Curieux du modèle business derrière. Article à venir ?' },
        { who: network === 'tiktok' ? '@maelys_food' : '/in/aurelie-rh', msg: network === 'tiktok' ? 'Trop bien, vous prenez des stagiaires ?' : 'Recrutez-vous ? Profil correspondant dans mon réseau' },
      ]
    : [
        { who: network === 'tiktok' ? '@studio_kbarber' : 'Marc Dubois — Restaurateur Lyon', msg: network === 'tiktok' ? 'Barber shop Marseille · 8.4K abonnés' : 'Restaurateur · 1.2k connexions · Match 92%' },
        { who: network === 'tiktok' ? '@bistrot_dumarais' : 'Camille Roux — Coach business', msg: network === 'tiktok' ? 'Restaurant Paris · 12.1K abonnés' : 'Coach · 2.4k connexions · Match 87%' },
        { who: network === 'tiktok' ? '@fleurs_lyon' : 'David Lemoine — Fondateur SaaS', msg: network === 'tiktok' ? 'Fleuriste Lyon · 6.3K abonnés' : 'CEO · 5.6k connexions · Match 84%' },
      ];

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 text-[10px]">
        <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-semibold">Sample data</span>
        <span className="text-white/40">{en ? `Examples — connect ${networkLabel} to see your real ${tabLabel}.` : `Exemples — connecte ${networkLabel} pour voir tes vrais ${tabLabel}.`}</span>
      </div>

      <a
        href={oauth}
        className={`block text-center w-full py-2.5 rounded-xl text-sm font-bold text-white mb-3 ${
          network === 'tiktok'
            ? 'bg-gradient-to-r from-black to-pink-600 hover:opacity-90'
            : 'bg-gradient-to-r from-blue-600 to-blue-800 hover:opacity-90'
        }`}
      >
        {en ? 'Connect ' : 'Connecter '}{networkLabel} {'→'}
      </a>

      <div className="space-y-2 max-h-[420px] overflow-y-auto">
        {samples.map((s, i) => (
          <div key={i} className="bg-white/[0.03] rounded-xl border border-white/10 p-3 flex items-start gap-2">
            <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] text-white font-bold"
              style={{ background: network === 'tiktok' ? 'linear-gradient(135deg, #000, #ff0050)' : 'linear-gradient(135deg, #0A66C2, #004182)' }}>
              {s.who.replace(/^@|^\/in\//, '')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-bold text-white/80 truncate">{s.who}</div>
              <p className="text-[11px] text-white/60 mt-1 break-words">{s.msg}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Base64url → Uint8Array (needed by pushManager.subscribe). The VAPID
// public key is shipped as base64url and has to be decoded before passing.
function urlB64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = typeof atob === 'function' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary');
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// Brouillons LinkedIn de Jade — DM + commentaires générés (envoi manuel, l'API
// LinkedIn interdit l'automatisation). Founder 03/07.
function LinkedInDrafts() {
  const { locale } = useLanguage();
  const en = locale === 'en';
  const [data, setData] = useState<any>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/agents/dm-instagram/linkedin-drafts', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null)).then(d => { if (d?.ok) setData(d); }).catch(() => {});
  }, []);

  const copy = (key: string, text: string) => {
    try { navigator.clipboard?.writeText(text); } catch { /* noop */ }
    setCopied(key);
    setTimeout(() => setCopied(c => (c === key ? null : c)), 1500);
  };

  if (!data) return null;
  const Section = ({ label, items, kind }: { label: string; items: any[]; kind: string }) => (
    <div className="mb-3">
      <div className="text-[10px] uppercase tracking-wide text-white/40 mb-1">{label}</div>
      <div className="space-y-1.5">
        {items.map((it: any, i: number) => {
          const key = `${kind}-${i}`;
          return (
            <div key={key} className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[11px] font-semibold text-[#0A66C2] dark:text-sky-300">{it.title}</span>
                <button type="button" onClick={() => copy(key, it.text)} className="shrink-0 text-[10px] px-2 py-1 rounded-md border border-white/15 text-white/60 hover:border-sky-400/50 hover:text-sky-300 transition">
                  {copied === key ? (en ? '✓ Copied' : '✓ Copié') : (en ? 'Copy' : 'Copier')}
                </button>
              </div>
              <p className="text-[11px] text-white/70 leading-relaxed whitespace-pre-wrap">{it.text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="mb-3 rounded-xl border border-[#0A66C2]/25 bg-[#0A66C2]/[0.05] p-3">
      <div className="text-xs font-semibold text-white/90 mb-2">{en ? '✍️ LinkedIn drafts — DMs & comments (Jade)' : '✍️ Brouillons LinkedIn — DM & commentaires (Jade)'}</div>
      <Section label={en ? 'Connection / DM messages' : 'Messages de mise en relation / DM'} items={data.dmDrafts || []} kind="dm" />
      <Section label={en ? 'Post comments' : 'Commentaires de posts'} items={data.commentDrafts || []} kind="cm" />
      <p className="text-[10px] text-white/40">{data.note}</p>
    </div>
  );
}

function ManualFollowsList({ platform = 'instagram' }: { platform?: 'instagram' | 'tiktok' | 'linkedin' }) {
  const { locale } = useLanguage();
  const en = locale === 'en';
  const netLabel = platform === 'tiktok' ? 'TikTok' : platform === 'linkedin' ? 'LinkedIn' : 'Instagram';
  const [items, setItems] = useState<Array<{
    id: string;
    company?: string;
    instagram?: string;
    handle?: string;
    score?: number;
    angle_approche?: string;
    note_google?: number;
    google_rating?: number;
  }>>([]);
  const [funnel, setFunnel] = useState<{ queued: number; followed: number; eligible: number; dm_sent: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Push-notification state. We reflect the current permission + our
  // own subscription in state so the button shows the right label
  // ("Activer les rappels" vs "Rappels activés").
  const [pushState, setPushState] = useState<'loading' | 'unsupported' | 'denied' | 'off' | 'on'>('loading');
  const [pushBusy, setPushBusy] = useState(false);

  // Detect mobile once at mount. We use it to pick between the IG app
  // deep link (instagram://user?username=X — opens the native app
  // instantly on iOS/Android) and the web fallback (opens a browser tab
  // on desktop). Doing this client-side avoids SSR mismatches.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      setIsMobile(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
    }
  }, []);

  // Probe push support + existing subscription at mount. We register
  // the service worker lazily here (rather than at app boot) so users
  // who never open Jade don't pay the cost.
  useEffect(() => {
    (async () => {
      if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        setPushState('unsupported');
        return;
      }
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        const existing = await reg.pushManager.getSubscription();
        if (Notification.permission === 'denied') {
          setPushState('denied');
        } else if (existing) {
          setPushState('on');
        } else {
          setPushState('off');
        }
      } catch {
        setPushState('unsupported');
      }
    })();
  }, []);

  const enablePush = useCallback(async () => {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      window.alert(en ? 'Push not configured on this server.' : 'Push non configuré sur ce serveur.');
      return;
    }
    setPushBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushState(permission === 'denied' ? 'denied' : 'off');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(vapidKey),
      });
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (res.ok) setPushState('on');
    } finally {
      setPushBusy(false);
    }
  }, [en]);

  const disablePush = useCallback(async () => {
    setPushBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setPushState('off');
    } finally {
      setPushBusy(false);
    }
  }, []);

  const profileHref = (handle: string) => {
    if (platform === 'tiktok') {
      // Username TikTok propre depuis tout format (URL/@/espaces) → lien toujours
      // bien formé (sinon l'app s'ouvre sans naviguer vers le profil).
      const u = String(handle || '')
        .replace(/https?:\/\/(www\.|m\.)?tiktok\.com\/@?/i, '')
        .split(/[/?#]/)[0].replace(/^@/, '').replace(/\s+/g, '').trim();
      return `https://www.tiktok.com/@${u}`;
    }
    const h = encodeURIComponent(String(handle || '').replace(/^@/, ''));
    if (platform === 'linkedin') return /^https?:\/\//i.test(handle) ? handle : `https://www.linkedin.com/search/results/all/?keywords=${h}`;
    return isMobile ? `instagram://user?username=${h}` : `https://www.instagram.com/${h}/`;
  };

  // Auto-seed strategy: on the very first time the client opens this
  // tab after connecting Instagram, if our manual-follows queue is
  // empty, fire a Léo prospection run to populate real follow
  // candidates. We track the seed attempt in localStorage so we never
  // loop (one seed per browser, per network). Subsequent loads keep
  // enriching naturally via the daily cron without showing examples
  // again — once we have real items, examples are gone for good.
  const SEED_KEY = 'jade_follows_seeded_v1';
  const load = async (allowSeed = false) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/agents/dm-instagram/manual-follows?platform=${platform}`);
      if (!res.ok) return;
      const data = await res.json();
      const list = data.follows || [];
      setItems(list);
      if (data.funnel) setFunnel(data.funnel);

      // First-connection seeding (Instagram seulement — Léo prospecte des
      // handles IG ; TikTok/LinkedIn réutilisent les mêmes prospects via leur
      // handle propre).
      const igConnected = (typeof window !== 'undefined' && (window as any).__igConnected) || false;
      const alreadySeeded = typeof window !== 'undefined' && localStorage.getItem(SEED_KEY) === '1';
      if (platform === 'instagram' && allowSeed && igConnected && list.length === 0 && !alreadySeeded) {
        try {
          localStorage.setItem(SEED_KEY, '1');
          // Kick off a small follow-prospects pass — async, fire-and-forget
          // for the user; we re-fetch after a short delay so the first
          // batch lands as soon as Léo finishes scraping.
          fetch('/api/agents/dm-instagram/follow-prospects', { method: 'POST', credentials: 'include' }).catch(() => {});
          setTimeout(() => { load(false); }, 6000);
        } catch {}
      }
    } finally {
      setLoading(false);
    }
  };

  // Recharge à CHAQUE changement de réseau (sinon les comptes à suivre du 1er
  // réseau restent affichés sur les autres = effet miroir TikTok/LinkedIn).
  useEffect(() => { setItems([]); setFunnel(null); load(true); }, [platform]);

  const handleAction = async (prospectId: string, action: 'done' | 'skip' | 'dead_link') => {
    setBusyId(prospectId);
    try {
      await fetch('/api/agents/dm-instagram/manual-follows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect_id: prospectId, action, platform }),
      });
      setItems(prev => prev.filter(x => x.id !== prospectId));
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkAllDone = async () => {
    const msg = en
      ? `Mark all ${items.length} accounts as followed? Use this only if you've already tapped Follow on each profile on ${netLabel}.`
      : `Marquer les ${items.length} comptes comme suivis ? Utilise ce bouton uniquement si tu as déjà tapé Suivre sur chaque profil ${netLabel}.`;
    if (!window.confirm(msg)) return;
    setBatchBusy(true);
    try {
      await fetch('/api/agents/dm-instagram/manual-follows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'all_done', platform }),
      });
      setItems([]);
    } finally {
      setBatchBusy(false);
    }
  };

  if (loading) {
    return <div className="text-white/40 text-sm py-4 text-center">{en ? 'Loading…' : 'Chargement…'}</div>;
  }

  if (items.length === 0) {
    // TikTok / LinkedIn : pas de données d'exemple IG — état vide simple +
    // renvoi vers la prospection (les comptes viennent des prospects qui ont
    // un handle de cette plateforme).
    if (platform !== 'instagram') {
      return (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-center leading-relaxed">
          <span className="text-xl">{'\u{1F91D}'}</span>
          <p className="text-xs text-white/60 mt-1">{en ? `No ${netLabel} accounts to follow yet` : `Aucun compte ${netLabel} à suivre pour l'instant`}</p>
          <p className="text-[11px] text-white/40 mt-1">{en ? `Léo's prospection surfaces accounts with a ${netLabel} handle — they'll appear here to follow in one tap.` : `La prospection de Léo fait remonter les comptes ayant un ${netLabel} — ils apparaîtront ici à suivre en un tap.`}</p>
        </div>
      );
    }
    // STRICT rule: sample accounts ONLY when Instagram is NOT connected.
    // When connected, the empty state is "no accounts queued yet" — real
    // suggestions come in as Léo's prospection queue produces matches.
    const igConnected = (typeof window !== 'undefined' && (window as any).__igConnected) || false;
    if (!igConnected) {
      const sample = [
        { id: 'sample-1', company: 'Pizzeria Da Marco', instagram: 'pizzeria_damarco', score: 78, note_google: 4.6, angle_approche: en ? 'New menu spotted on Instagram — opportunity to highlight signature pizza in a Reel' : "Nouvelle carte vue sur Instagram — opportunité de mettre en avant la pizza signature en Reel" },
        { id: 'sample-2', company: 'Salon Léa Coiffure', instagram: 'salon_lea', score: 71, note_google: 4.8, angle_approche: en ? 'Strong before/after engagement — could be a recurring DM hook with a free consultation slot' : 'Forte engagement avant/après — accroche DM récurrente avec un créneau diagnostic gratuit' },
        { id: 'sample-3', company: 'Atelier Fleurs du Marais', instagram: 'fleurs_marais', score: 66, note_google: 4.5, angle_approche: en ? 'Active during weddings season — DM angle: tailored arrangements for May couples' : "Active sur la saison mariages — angle DM : compositions sur-mesure pour les couples de mai" },
      ];
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[11px]">
            <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-semibold">Sample data</span>
            <span className="text-white/40">
              {en
                ? 'Example accounts Jade would queue — connect Instagram + run Léo prospection to see real candidates.'
                : 'Comptes d\'exemple que Jade mettrait en file — connecte Instagram + lance Léo pour voir tes vrais candidats.'}
            </span>
          </div>
          {sample.map(s => (
            <div key={s.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white">{s.company}</div>
                  <div className="text-[11px] text-white/40">@{s.instagram} · ⭐ {s.note_google} · {en ? 'score' : 'score'} {s.score}/100</div>
                  <p className="text-[11px] text-white/60 mt-1 leading-snug">{s.angle_approche}</p>
                </div>
                <span className="text-[10px] text-white/30 px-2 py-1 rounded bg-white/5 flex-shrink-0">{en ? 'Example' : 'Exemple'}</span>
              </div>
            </div>
          ))}
        </div>
      );
    }
    // Connected with empty queue. If we just kicked off the first
    // seeding pass (SEED_KEY set this session), show a clear "Léo is
    // preparing recommendations" state so the user understands the
    // wait. Otherwise it's the steady-state "morning batch" message.
    const seedInFlight = typeof window !== 'undefined' && localStorage.getItem(SEED_KEY) === '1' && !items.length;
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-center leading-relaxed">
        {seedInFlight ? (
          <>
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-purple-300 font-semibold">
                {en ? 'Léo is preparing your first recommendations…' : 'Léo prépare tes premières recommandations…'}
              </span>
            </div>
            <p className="text-[11px] text-white/50">
              {en
                ? 'A first batch of qualified accounts should appear within ~30 seconds. From there Jade keeps enriching the queue every morning.'
                : 'Un premier lot de comptes qualifiés arrive dans ~30 secondes. Jade enrichit ensuite la liste chaque matin.'}
            </p>
          </>
        ) : (
          <>
            <span className="text-xl">{'\u{1F91D}'}</span>
            <p className="text-xs text-white/60 mt-1">
              {en ? 'No accounts queued right now' : 'Aucun compte en attente'}
            </p>
            <p className="text-[10px] text-white/40 mt-1">
              {en
                ? 'Jade adds new suggestions every morning from Léo\'s qualified prospects.'
                : 'Jade ajoute des suggestions chaque matin à partir des prospects qualifiés par Léo.'}
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-[11px] text-white/50 px-1 pb-1 leading-snug">
        {en
          ? <>Tap the handle to open {netLabel}{isMobile ? ' in the app' : ''}, tap Follow, then press ✓ here so we know. </>
          : <>Touche le handle pour ouvrir {netLabel}{isMobile ? ' dans l\'appli' : ''}, appuie sur Suivre, puis valide avec ✓ ici. </>}
        {platform !== 'instagram' && (
          <span className="text-amber-300/70">
            {en
              ? 'Note: some profiles may no longer be available or the link may not open directly — a quick manual check is sometimes needed. Tap ⚠ Bad link to report it (it won\'t come back).'
              : 'Note : certains profils peuvent ne plus être disponibles ou le lien peut ne pas s\'ouvrir directement — une vérif manuelle reste parfois nécessaire. Touche ⚠ Lien mort pour le signaler (il ne reviendra plus).'}
          </span>
        )}
      </div>
      {funnel && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2 text-center">
            <div className="text-base font-bold text-amber-300">{funnel.queued}</div>
            <div className="text-[10px] text-amber-300/60">{en ? 'In queue' : 'En attente'}</div>
          </div>
          <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-2 text-center">
            <div className="text-base font-bold text-blue-300">{funnel.eligible}</div>
            <div className="text-[10px] text-blue-300/60">{en ? 'Eligible' : 'Éligibles'}</div>
          </div>
          <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-2 text-center">
            <div className="text-base font-bold text-purple-300">{funnel.followed}</div>
            <div className="text-[10px] text-purple-300/60">{en ? 'Followed' : 'Suivis'}</div>
          </div>
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2 text-center">
            <div className="text-base font-bold text-emerald-300">{funnel.dm_sent}</div>
            <div className="text-[10px] text-emerald-300/60">{en ? 'DMs sent' : 'DMs envoyés'}</div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 pb-1 flex-wrap">
        <div className="text-[11px] text-white/60">
          {items.length} {en ? 'shown' : 'affichés'}{funnel && funnel.queued > items.length ? ` / ${funnel.queued} ${en ? 'total' : 'total'}` : ''}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {pushState === 'on' && (
            <button
              disabled={pushBusy}
              onClick={disablePush}
              className="px-3 py-1 text-[11px] text-white/50 hover:text-white/80 border border-white/10 rounded-md transition disabled:opacity-50"
              title={en ? 'Disable morning reminders' : 'Désactiver les rappels du matin'}
            >
              {'\u{1F514}'} {en ? 'Reminders on' : 'Rappels activés'}
            </button>
          )}
          {pushState === 'off' && (
            <button
              disabled={pushBusy}
              onClick={enablePush}
              className="px-3 py-1 text-[11px] bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 rounded-md transition disabled:opacity-50"
              title={en ? 'Enable morning push reminders' : 'Activer les rappels push chaque matin'}
            >
              {'\u{1F514}'} {en ? 'Enable morning reminders' : 'Activer les rappels matin'}
            </button>
          )}
          {pushState === 'denied' && (
            <span className="text-[10px] text-white/40" title={en ? 'Notifications blocked in browser settings' : 'Notifications bloquées dans les paramètres du navigateur'}>
              {'\u{1F515}'} {en ? 'Notifications blocked' : 'Notifications bloquées'}
            </span>
          )}
          <button
            disabled={batchBusy}
            onClick={handleMarkAllDone}
            className="px-3 py-1 text-[11px] bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded-md transition disabled:opacity-50"
          >
            {batchBusy
              ? (en ? 'Marking…' : 'En cours…')
              : (en ? `✓ Mark all ${items.length} as followed` : `✓ Tout marquer fait (${items.length})`)}
          </button>
        </div>
      </div>
      {items.map(item => {
        const handle = String(item.handle || item.instagram || '').replace(/^@/, '');
        const rating = item.google_rating || item.note_google;
        return (
          <div key={item.id} className="bg-white/5 border border-white/10 rounded-lg p-3 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <a
                  href={profileHref(handle)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-white font-medium hover:underline truncate"
                >
                  @{handle}
                </a>
                {typeof item.score === 'number' && (
                  <span className="text-[10px] text-white/40 bg-white/5 px-1.5 py-0.5 rounded">
                    {en ? 'score' : 'score'} {item.score}
                  </span>
                )}
                {typeof rating === 'number' && rating > 0 && (
                  <span className="text-[10px] text-yellow-300/70">⭐ {rating}</span>
                )}
              </div>
              {item.company && (
                <div className="text-[11px] text-white/50 truncate mt-0.5">{item.company}</div>
              )}
              {item.angle_approche && (
                <div className="text-[11px] text-white/40 mt-1 line-clamp-2">{item.angle_approche}</div>
              )}
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <button
                disabled={busyId === item.id}
                onClick={() => handleAction(item.id, 'done')}
                className="px-2.5 py-1 text-[11px] bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 rounded-md transition disabled:opacity-50"
              >
                {en ? '✓ Followed' : '✓ Fait'}
              </button>
              <button
                disabled={busyId === item.id}
                onClick={() => handleAction(item.id, 'dead_link')}
                title={en ? 'The link does not open the profile / account unavailable' : 'Le lien n\'ouvre pas le profil / compte indisponible'}
                className="px-2.5 py-1 text-[11px] text-amber-300/80 hover:text-amber-200 border border-amber-500/25 hover:border-amber-500/40 rounded-md transition disabled:opacity-50 mt-1"
              >
                {en ? '⚠ Bad link' : '⚠ Lien mort'}
              </button>
              <button
                disabled={busyId === item.id}
                onClick={() => handleAction(item.id, 'skip')}
                className="px-2.5 py-1 text-[11px] text-white/40 hover:text-white/70 border border-white/10 rounded-md transition disabled:opacity-50 mt-1"
              >
                {en ? 'Skip' : 'Passer'}
              </button>
            </div>
          </div>
        );
      })}

      {/* Footer — "Trouver plus" lives at the BOTTOM of the list per
          founder ask 2026-05-24: button should only be reachable once
          the client has descended through the accumulated queue. Visible
          permanently here but naturally requires a scroll to discover. */}
      <div className="pt-3 mt-1 border-t border-white/5 flex items-center justify-between gap-2 flex-wrap">
        <div className="text-[10px] text-white/40">
          {funnel && funnel.queued > items.length
            ? (en ? `+${funnel.queued - items.length} more in queue` : `+${funnel.queued - items.length} encore en attente`)
            : (en ? `End of list (${items.length} accounts)` : `Fin de liste (${items.length} comptes)`)}
        </div>
        <button
          disabled={refreshing}
          onClick={async () => {
            setRefreshing(true);
            try {
              await fetch('/api/agents/dm-instagram/follow-prospects', { method: 'POST', credentials: 'include' });
              await load(false);
            } finally { setRefreshing(false); }
          }}
          className="px-3 py-1.5 text-[11px] bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 rounded-md transition disabled:opacity-50 min-h-[36px]"
          title={en ? 'Run Jade now to enrich the queue' : "Lancer Jade pour enrichir la file maintenant"}
        >
          {refreshing
            ? (en ? '↻ Searching…' : '↻ Recherche…')
            : (en ? '↻ Find more accounts' : '↻ Trouver plus de comptes')}
        </button>
      </div>
    </div>
  );
}

// Merge fresh server messages for ONE conversation with any local optimistic
// entries (sending/sent/prepared) we already had. Preserves outbound
// messages the server hasn't echoed back yet.
function mergeMessageArrays(
  prev: Array<{ id?: string; message: string; fromMe: boolean; status?: string; [k: string]: any }>,
  fresh: Array<{ id?: string; message: string; fromMe: boolean; [k: string]: any }>,
): any[] {
  if (!Array.isArray(prev) || prev.length === 0) return fresh;
  // If fresh is empty (rate-limit, timeout, transient error), keep prev as-is.
  // Wiping would make the whole thread vanish for the duration of the next
  // successful poll — the opposite of the user-facing expectation.
  if (!Array.isArray(fresh) || fresh.length === 0) return prev;
  const freshIds = new Set(fresh.map(m => m.id).filter(Boolean));
  const freshKeys = new Set(fresh.map(m => `${m.fromMe}|${m.message}`));
  const extras = prev.filter(m =>
    m.fromMe && (m.status === 'sending' || m.status === 'sent' || m.status === 'error' || m.status === 'prepared') &&
    !(m.id && freshIds.has(m.id)) && !freshKeys.has(`${m.fromMe}|${m.message}`)
  );
  return [...fresh, ...extras];
}

// Live Instagram DM conversations component

function DmConversationsLive() {
  const { t, locale } = useLanguage();
  const en = locale === 'en';
  const p = t.panels;
  const dateLocale = locale === 'en' ? 'en-US' : 'fr-FR';
  const [convs, setConvs] = useState<Array<{
    id: string;
    participant: { username: string; id: string };
    updated_time?: string;
    messages: Array<{ id?: string; message: string; from: string; fromMe: boolean; created_time: string; status?: string; attachments?: Array<{ type: string; url: string }> }>;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const [humanOnly, setHumanOnly] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  // 2026-06-03 — init from localStorage to avoid flicker (was useState(true)
  // → fetch async → toggle visibly flipped from green to red on every page
  // load). Founder reported: "le toggle ai active saute il active desactive
  // tout seul".
  const [aiActive, setAiActive] = useState(() => {
    if (typeof window === 'undefined') return true;
    const cached = localStorage.getItem('keiro_auto_dm_instagram');
    if (cached === null) return true;
    return cached !== 'false';
  });
  const [aiLoaded, setAiLoaded] = useState(false);
  const [userTyping, setUserTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load AI toggle state from server (authoritative). Only override the
  // localStorage cache if the server value differs — and only once on mount
  // so async refetches can't flip the UI behind the user's back.
  useEffect(() => {
    fetch('/api/agents/settings?agent_id=dm_instagram', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.auto_mode !== undefined) {
          setAiActive(d.auto_mode);
          try { localStorage.setItem('keiro_auto_dm_instagram', String(d.auto_mode)); } catch {}
        }
        setAiLoaded(true);
      })
      .catch(() => setAiLoaded(true));
  }, []);

  // Fire the polling auto-reply once. Used when the AI toggle turns ON so
  // Jade picks up messages that arrived while she was paused, without
  // waiting for the next worker tick.
  const kickAutoReply = useCallback(() => {
    fetch('/api/agents/dm-instagram/auto-reply', {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {});
  }, []);

  const persistAiMode = useCallback(async (val: boolean) => {
    setAiActive(val);
    try { localStorage.setItem('keiro_auto_dm_instagram', String(val)); } catch {}
    try {
      await fetch('/api/agents/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ agent_id: 'dm_instagram', auto_mode: val }),
      });
    } catch {}
    // Meta Human Agent protocol: when the human hands the mic back to the
    // AI, the AI must *immediately* pick up any messages received during
    // the handoff. Fire auto-reply once on OFF→ON transitions.
    if (val) kickAutoReply();
  }, [kickAutoReply]);

  // Merge fresh server conversations with local optimistic state.
  // Preserves:
  //  - optimistic "sending/sent/prepared" messages not yet echoed by Meta
  //  - the previous list when the fresh payload is empty but the account
  //    is still connected (transient API hiccup shouldn't wipe the UI)
  const mergeConvs = useCallback((fresh: typeof convs, opts: { connected: boolean }) => {
    setConvs(prev => {
      // If the server explicitly says "disconnected", clear the panel.
      if (!opts.connected) return [];
      // If the fresh pull is empty but we had convs, keep the old list —
      // otherwise the list flickers away every time the graph returns 0
      // (rate limit, timeout, transient error).
      if (fresh.length === 0 && prev.length > 0) return prev;
      if (prev.length === 0) return fresh;

      const prevById = new Map(prev.map(c => [c.id, c]));
      let changed = fresh.length !== prev.length;
      const merged = fresh.map(fc => {
        const old = prevById.get(fc.id);
        if (!old) { changed = true; return fc; }
        // The list endpoint now returns no messages per conv — the messages
        // live in the per-conv endpoint. Do NOT overwrite old.messages when
        // fresh arrives with an empty array, otherwise every 10s list poll
        // wipes the currently-open thread's messages.
        if (!fc.messages || fc.messages.length === 0) {
          if (old.updated_time !== fc.updated_time) changed = true;
          return { ...fc, messages: old.messages };
        }
        const freshIds = new Set(fc.messages.map(m => m.id).filter(Boolean));
        const freshKeys = new Set(fc.messages.map(m => `${m.fromMe}|${m.message}`));
        const extras = old.messages.filter(m =>
          m.fromMe && (m.status === 'sending' || m.status === 'sent' || m.status === 'error' || m.status === 'prepared') &&
          !(m.id && freshIds.has(m.id)) && !freshKeys.has(`${m.fromMe}|${m.message}`)
        );
        const mergedMsgs = [...fc.messages, ...extras];
        if (
          old.messages.length !== mergedMsgs.length ||
          old.updated_time !== fc.updated_time ||
          old.messages[old.messages.length - 1]?.id !== mergedMsgs[mergedMsgs.length - 1]?.id
        ) changed = true;
        return { ...fc, messages: mergedMsgs };
      });
      return changed ? merged : prev;
    });
  }, []);

  const [connected, setConnected] = useState<boolean | null>(null);

  const fetchConversations = useCallback(() => {
    fetch('/api/agents/dm-instagram/conversations', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const isConnected = d.connected !== false;
        setConnected(isConnected);
        if (d.conversations) {
          setApiResponded(true);
          mergeConvs(d.conversations, { connected: isConnected });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [mergeConvs]);

  // Initial load + auto-refresh every 10s (slightly faster than before for
  // near-real-time feel). Paused while user is typing so the textarea
  // doesn't re-render and swallow focus.
  useEffect(() => {
    fetchConversations();
    const interval = setInterval(() => { if (!userTyping) fetchConversations(); }, 10000);
    return () => clearInterval(interval);
  }, [fetchConversations, userTyping]);

  // Auto-open the most recent conversation on desktop so messages are visible
  // directly (no extra click). On mobile we keep the list view first.
  useEffect(() => {
    if (selectedConv) return;
    if (typeof window !== 'undefined' && window.innerWidth < 640) return;
    if (convs.length > 0) setSelectedConv(convs[0].id);
  }, [convs, selectedConv]);

  // Auto-scroll to bottom of messages (within container, not page)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedConv, convs]);

  const sendReply = useCallback(async () => {
    const selected = convs.find(c => c.id === selectedConv);
    if (!selected || !replyText.trim()) return;
    setSending(true);
    const msgText = replyText;
    setReplyText('');
    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Optimistic UI update — stable localId so merge() can preserve it
    setConvs(prev => prev.map(c => c.id === selected.id ? {
      ...c,
      messages: [...c.messages, { id: localId, message: msgText, from: 'moi', fromMe: true, created_time: new Date().toISOString(), status: 'sending' }],
    } : c));

    try {
      const res = await fetch('/api/agents/dm-instagram/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          recipient_id: selected.participant.id,
          message: msgText,
        }),
      });
      const data = await res.json();

      setConvs(prev => prev.map(c => c.id === selected.id ? {
        ...c,
        messages: c.messages.map(m =>
          m.id === localId ? { ...m, status: data.sent ? 'sent' : 'prepared' } : m
        ),
      } : c));
    } catch {
      setConvs(prev => prev.map(c => c.id === selected.id ? {
        ...c,
        messages: c.messages.map(m =>
          m.id === localId ? { ...m, status: 'error' } : m
        ),
      } : c));
    } finally {
      setSending(false);
      // Reset typing flag so AI toggle returns to active after send
      setUserTyping(false);
    }
  }, [convs, selectedConv, replyText]);

  const [apiResponded, setApiResponded] = useState(false);
  const [msgLoading, setMsgLoading] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);

  // Lazy-load the messages of the currently selected conversation. The list
  // endpoint now returns conversations WITHOUT messages (to avoid Meta's
  // "Application request limit"), so this effect pulls messages for one
  // conversation at a time — much easier on the quota.
  useEffect(() => {
    if (!selectedConv) return;
    let cancelled = false;
    const fetchMsgs = async () => {
      setMsgLoading(true);
      try {
        const res = await fetch(`/api/agents/dm-instagram/conversations/${encodeURIComponent(selectedConv)}/messages`, { credentials: 'include' });
        const d = await res.json();
        if (cancelled) return;
        if (d.error === 'rate_limited') setRateLimited(true);
        if (Array.isArray(d.messages)) {
          setConvs(prev => prev.map(c => c.id === selectedConv ? { ...c, messages: mergeMessageArrays(c.messages, d.messages) } : c));
        }
      } catch {} finally {
        if (!cancelled) setMsgLoading(false);
      }
    };
    fetchMsgs();
    const interval = setInterval(() => { if (!userTyping) fetchMsgs(); }, 10000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [selectedConv, userTyping]);

  // Only show the spinner on the very first load; once we have at least one
  // payload, keep the UI stable and let polling update it in the background.
  if (loading && !apiResponded) return <div className="text-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-400 mx-auto" /><div className="text-white/30 text-[10px] mt-2">{p.dmConvsLoading}</div></div>;

  // Instagram is considered connected either via the global flag set at
  // page boot OR when the API has explicitly confirmed connected: true.
  const igConnected = (typeof window !== 'undefined' && (window as any).__igConnected) || connected === true;
  // Demo mode only when no evidence of a real account AND nothing loaded.
  const isDemo = convs.length === 0 && !apiResponded && !igConnected;
  const displayConvs = isDemo ? DEMO_DM_CONVERSATIONS : convs;
  const selected = displayConvs.find(c => c.id === selectedConv);

  // Conversations awaiting a HUMAN reply = an unanswered inbound message
  // outside Meta's 24h window. Jade cannot auto-reply there (compliance) —
  // only a human with the HUMAN_AGENT tag can. Uses updated_time fallback so
  // it counts correctly as soon as the list loads (before messages fetch).
  const needsHuman = (c: any) => {
    const lastMsg = c.messages[c.messages.length - 1];
    const isUnread = !lastMsg || !lastMsg.fromMe;
    const lastInbound = [...c.messages].reverse().find((m: any) => !m.fromMe);
    const refTime = lastInbound?.created_time
      ? new Date(lastInbound.created_time).getTime()
      : (c.updated_time ? new Date(c.updated_time).getTime() : null);
    const hrs = refTime ? (Date.now() - refTime) / 3600000 : 0;
    return isUnread && hrs > 24;
  };
  const humanCount = displayConvs.filter(needsHuman).length;
  const shownConvs = humanOnly ? displayConvs.filter(needsHuman) : displayConvs;

  // Is the currently-open conversation outside Meta's 24h window? If so the AI
  // auto-reply CANNOT apply (only a human + HUMAN_AGENT tag), so the AI toggle
  // is forced visually OFF and disabled for that thread. The underlying global
  // setting is untouched and re-applies on a <24h conversation.
  const selectedOutside24h = (() => {
    if (!selected) return false;
    const lastInbound = [...selected.messages].reverse().find((m: any) => !m.fromMe);
    const refTime = lastInbound?.created_time
      ? new Date(lastInbound.created_time).getTime()
      : (selected.updated_time ? new Date(selected.updated_time).getTime() : null);
    return refTime ? (Date.now() - refTime) / 3600000 > 24 : false;
  })();

  return (
    <div>
    {isDemo && (
      <>
        <PreviewBanner
          agentName="Jade"
          connectLabel="Connect Instagram"
          connectUrl="/api/auth/instagram-oauth"
          claraMessage={p.dmConnectFirstBody}
          gradientFrom="#e11d48"
          gradientTo="#be123c"
        />
        <div className="flex items-center gap-2 mb-2 text-[10px]">
          <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-semibold">Sample data</span>
          <span className="text-white/40">
            Example conversations. Once Instagram is connected, your real inbound DMs replace this list.
          </span>
        </div>
      </>
    )}
    {!isDemo && convs.length === 0 && igConnected && (
      <div className="text-center py-4 mb-3 bg-white/[0.02] rounded-xl border border-white/5">
        <span className="text-xl">{'\u{1F4AC}'}</span>
        <p className="text-xs text-white/40 mt-1">{p.dmEmptyConversationsTitle}</p>
        <p className="text-[10px] text-white/50 mt-0.5">{p.dmEmptyConversationsSubtitle}</p>
      </div>
    )}
    <div className={`rounded-xl border-2 ${isDemo ? 'border-amber-500/20 opacity-90' : 'border-purple-500/20'} bg-gradient-to-b from-purple-900/10 to-transparent overflow-hidden shadow-lg shadow-purple-500/5 max-h-[60vh] md:h-[420px] min-h-[320px] mb-4 lg:mb-0`}>
      <div className="flex h-full">
        {/* Conversation list */}
        <div className={`${selectedConv ? 'hidden sm:block' : ''} w-full sm:w-56 border-r border-white/10 overflow-y-auto`}>
          <div className="px-3 py-2.5 border-b border-purple-500/20 bg-purple-900/20">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-300/60">{'\u{1F4AC}'} {p.dmConvsSidebarLabel}</span>
            {humanCount > 0 && (
              <button
                onClick={() => setHumanOnly(v => !v)}
                className={`mt-1.5 w-full flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border transition-colors ${humanOnly ? 'bg-amber-500/25 border-amber-500/50 text-amber-200' : 'bg-amber-500/10 border-amber-500/25 text-amber-300/80 hover:bg-amber-500/20'}`}
                title="Conversations hors fenêtre 24h — réponse humaine requise (Jade ne répond pas automatiquement hors 24h)"
              >
                {'⏳'} {en ? `Awaiting human reply (${humanCount})` : `En attente de réponse humaine (${humanCount})`}
              </button>
            )}
          </div>
          {shownConvs.length === 0 && humanOnly && (
            <div className="px-3 py-6 text-center text-[10px] text-white/40">{en ? 'No conversation awaiting a human reply.' : 'Aucune conversation en attente de réponse humaine.'}</div>
          )}
          {shownConvs.map(conv => {
            const lastMsg = conv.messages[conv.messages.length - 1];
            const isUnread = lastMsg && !lastMsg.fromMe;
            // Compute Meta's 24h messaging window state for this conv.
            // We look at the LAST INBOUND message (customer-side) — that's
            // what resets the standard window per Meta policy. If the
            // newest message is from us, the window is whatever the last
            // inbound was; if no inbound exists, treat as in-window so
            // the UI doesn't shout "needs human agent" on fresh threads.
            const lastInbound = [...conv.messages].reverse().find((m: any) => !m.fromMe);
            // Fall back to the conversation's updated_time when the per-conv
            // messages aren't loaded yet (the list endpoint returns none) so
            // the >24h badge shows as soon as the list loads — not only after
            // the thread is opened.
            const refTime = lastInbound?.created_time
              ? new Date(lastInbound.created_time).getTime()
              : (conv.updated_time ? new Date(conv.updated_time).getTime() : null);
            const hoursSince = refTime ? (Date.now() - refTime) / 3600000 : 0;
            const outsideWindow = hoursSince > 24;
            return (
              <button
                key={conv.id}
                onClick={() => setSelectedConv(conv.id)}
                className={`w-full text-left px-3 py-3 border-b border-white/5 hover:bg-white/5 transition-colors ${selectedConv === conv.id ? 'bg-purple-500/10 border-l-2 border-l-purple-500' : ''}`}
              >
                <div className="flex items-center gap-2">
                  {isUnread && <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse flex-shrink-0" />}
                  <span className="text-xs font-medium text-white truncate">@{conv.participant.username}</span>
                  {/* Window badge — orange when >24h so the user spots
                      conversations that will need the HUMAN_AGENT tag. */}
                  {outsideWindow && (
                    <span
                      className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex-shrink-0"
                      title="Outside the 24h messaging window — send will use messaging_type=MESSAGE_TAG, tag=HUMAN_AGENT"
                    >
                      &gt;24h
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-white/30 truncate mt-0.5 pl-4">
                  {lastMsg?.fromMe ? p.dmConvsToMe : ''}{lastMsg?.message?.substring(0, 50) || '...'}
                </div>
                {conv.updated_time && (
                  <div className="text-[10px] text-white/40 mt-0.5 pl-4">
                    {new Date(conv.updated_time).toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit' })}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Messages */}
        {selected ? (
          <div className="flex-1 flex flex-col">
            {/* Header */}
            <div className="px-3 py-2.5 border-b border-white/5 bg-white/[0.02] flex items-center gap-2">
              <button onClick={() => setSelectedConv(null)} className="sm:hidden text-white/40 hover:text-white/60 text-lg p-1 min-w-[44px] min-h-[44px] flex items-center justify-center">{'\u2190'}</button>
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-[10px] text-white font-bold flex-shrink-0">
                {selected.participant.username[0]?.toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-bold text-white truncate block">@{selected.participant.username}</span>
                <div className="text-[10px] text-white/45 truncate">{p.dmConvsMessagesCount.replace('{n}', String(selected.messages.length))}</div>
              </div>
              <div className="ml-auto flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/20">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-[10px] text-emerald-400 font-medium">{p.dmConvsBadgeAi}</span>
                </div>
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/20">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <span className="text-[10px] text-blue-400 font-medium">{p.dmConvsBadgeYou}</span>
                </div>
              </div>
            </div>

            {/* 24h messaging window state \u2014 tells the user (and a Meta
                App Review reviewer) exactly which Graph API path this
                send will take. Recomputed from the selected conv's last
                inbound message every render so it stays accurate as new
                messages arrive. */}
            {(() => {
              const lastInbound = [...selected.messages].reverse().find((m: any) => !m.fromMe);
              const lastInboundTime = lastInbound?.created_time ? new Date(lastInbound.created_time).getTime() : null;
              if (!lastInbound || !lastInboundTime) {
                return (
                  <div className="px-3 py-2 border-b border-white/5 bg-white/[0.02] text-[10px] text-white/40">
                    {'\u{1F4AC}'} No inbound message yet \u2014 auto-reply will trigger as soon as @{selected.participant.username} writes first.
                  </div>
                );
              }
              const hours = (Date.now() - lastInboundTime) / 3600000;
              const inWindow = hours <= 24;
              const days = Math.floor(hours / 24);
              return inWindow ? (
                <div className="px-3 py-2 border-b border-white/5 bg-emerald-500/[0.06] flex items-center gap-2 text-[10px] flex-wrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-200 font-bold">{en ? 'Auto-reply ON' : 'R\u00e9ponse auto ACTIVE'}</span>
                  <span className="text-emerald-300 font-semibold">{en ? 'In the 24h messaging window' : 'Dans la fen\u00eatre 24h'}</span>
                  <span className="text-white/40">\u00b7 {en ? `Last customer message ${Math.floor(hours)}h ago.` : `Dernier message client il y a ${Math.floor(hours)}h.`}</span>
                </div>
              ) : (
                <div className="px-3 py-2 border-b border-white/5 bg-amber-500/[0.08] flex items-center gap-2 text-[10px] flex-wrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/25 text-amber-200 font-bold">{en ? 'Auto-reply OFF' : 'R\u00e9ponse auto D\u00c9SACTIV\u00c9E'}</span>
                  <span className="text-amber-300 font-semibold">{en ? 'Outside 24h \u00b7 human reply required' : 'Hors 24h \u00b7 r\u00e9ponse humaine requise'}</span>
                  <span className="text-white/50">\u00b7 {en ? `Customer wrote ${days}d${Math.floor(hours - days * 24)}h ago \u2014 your manual reply is sent with the HUMAN_AGENT tag.` : `Client a \u00e9crit il y a ${days}j${Math.floor(hours - days * 24)}h \u2014 ta r\u00e9ponse manuelle part avec le tag HUMAN_AGENT.`}</span>
                </div>
              );
            })()}
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
              {(selected.messages as any[]).map((msg: any, i: number) => (
                <div key={msg.id || i} className={`flex ${msg.fromMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] sm:max-w-[80%] px-3 py-2 rounded-2xl text-xs leading-relaxed break-words ${
                    msg.fromMe
                      ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-br-md'
                      : 'bg-white/10 text-white/80 rounded-bl-md'
                  } ${msg.status === 'sending' ? 'opacity-60' : ''}`}>
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="flex flex-col gap-1 mb-1">
                        {msg.attachments.map((a: { type: string; url: string }, ai: number) => (
                          a.type === 'video' ? (
                            <video key={ai} src={a.url} controls className="rounded-lg max-w-full max-h-64" />
                          ) : a.type === 'image' ? (
                            <a key={ai} href={a.url} target="_blank" rel="noopener noreferrer">
                              <img src={a.url} alt="attachment" className="rounded-lg max-w-full max-h-64 object-cover" />
                            </a>
                          ) : (
                            <a key={ai} href={a.url} target="_blank" rel="noopener noreferrer" className="underline text-[10px] text-white/60">{a.type || 'file'}</a>
                          )
                        ))}
                      </div>
                    )}
                    {msg.message || (msg.attachments?.length ? null : <span className="italic text-white/30">[media]</span>)}
                    <div className={`flex items-center gap-1 mt-0.5 ${msg.fromMe ? 'justify-end' : ''}`}>
                      <span className={`text-[10px] ${msg.fromMe ? 'text-purple-200/60' : 'text-white/45'}`}>
                        {msg.created_time ? new Date(msg.created_time).toLocaleString(dateLocale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                      {msg.fromMe && msg.status === 'sending' && <span className="text-[10px] text-yellow-300/60">{p.dmConvsStatusSending}</span>}
                      {msg.fromMe && msg.status === 'sent' && <span className="text-[10px] text-green-300/60">{'\u2713'}</span>}
                      {msg.fromMe && msg.status === 'prepared' && <span className="text-[10px] text-amber-300/60">{p.dmConvsStatusPrepared}</span>}
                      {msg.fromMe && msg.status === 'error' && <span className="text-[10px] text-red-300/60">{p.dmConvsStatusError}</span>}
                      {msg.fromMe && (() => {
                        const isManual = msg.from === 'moi' || msg.status === 'sending' || msg.status === 'sent';
                        return <span className={`text-[10px] px-1 py-0.5 rounded ${isManual ? 'bg-blue-500/20 text-blue-300' : 'bg-emerald-500/20 text-emerald-300'}`}>{isManual ? p.dmConvsOrigVous : p.dmConvsOrigAi}</span>;
                      })()}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            {/* Inline AI / You toggle — sits right above the composer so the
                client sees the current mode at a glance. Auto-switches to
                "You" while typing, back to "AI" when idle. */}
            <div className="border-t border-white/5 px-3 pt-2 pb-1 bg-white/[0.02] flex items-center justify-between gap-2">
              <span className="text-[10px] text-white/40 truncate">
                {selectedOutside24h
                  ? (en ? '\uD83E\uDDD1 >24h \u2014 human reply only (AI never auto-replies here)' : "\uD83E\uDDD1 >24h \u2014 r\u00E9ponse humaine seule (l'IA n'auto-r\u00E9pond jamais ici)")
                  : (aiActive && !userTyping ? `\u{1F916} ${p.dmConvsBadgeAi}` : `\u270D\uFE0F ${p.dmConvsBadgeYou}`)}
              </span>
              {/* The toggle is the GLOBAL auto-reply switch (auto_mode). It is
                  always clickable so the owner can turn the AI off everywhere.
                  Regardless of this switch, the backend NEVER auto-replies to a
                  conversation older than 24h (compliance \u2014 only a human send
                  with the HUMAN_AGENT tag is allowed there). */}
              <button
                onClick={() => persistAiMode(!aiActive)}
                className={`w-9 h-5 rounded-full relative transition-colors flex-shrink-0 ${aiActive ? 'bg-emerald-500' : 'bg-white/15'}`}
                title={aiActive
                  ? (en ? 'AI auto-reply is ON for all conversations within the 24h window. Click to turn it OFF everywhere.' : "R\u00E9ponse auto IA ACTIVE pour toutes les conversations dans la fen\u00EAtre 24h. Cliquer pour la D\u00C9SACTIVER partout.")
                  : (en ? 'AI auto-reply is OFF. Click to turn it ON.' : "R\u00E9ponse auto IA D\u00C9SACTIV\u00C9E. Cliquer pour l'ACTIVER.")}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${aiActive ? 'right-0.5' : 'left-0.5'}`} />
              </button>
            </div>
            {/* Reply input */}
            <div className="border-t border-white/5 px-3 py-2.5 flex gap-2 flex-wrap bg-white/[0.02]">
              <input
                type="text"
                value={replyText}
                onChange={e => {
                  setReplyText(e.target.value);
                  // Auto-switch to "You" the moment the user starts typing
                  if (e.target.value.length > 0 && !userTyping) setUserTyping(true);
                  if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
                  typingTimerRef.current = setTimeout(() => {
                    setUserTyping(false);
                  }, 4000);
                }}
                onFocus={() => { if (replyText.length > 0) setUserTyping(true); }}
                onBlur={() => {
                  if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
                  setUserTyping(false);
                }}
                placeholder={p.dmConvsInputPlaceholder}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 sm:py-2 text-sm sm:text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/30"
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && replyText.trim()) { e.preventDefault(); sendReply(); } }}
              />
              {(() => {
                // Same 24h window check as the header banner — the send
                // button label flips to "Send as Human Agent" when we
                // know the message will be tagged. That way the founder
                // (and Meta App Review reviewer) sees in one glance which
                // path the click will hit.
                const lastInbound = [...selected.messages].reverse().find((m: any) => !m.fromMe);
                const lastInboundTime = lastInbound?.created_time ? new Date(lastInbound.created_time).getTime() : null;
                const outside = lastInboundTime ? (Date.now() - lastInboundTime) / 3600000 > 24 : false;
                const cls = outside
                  ? 'px-3 py-3 sm:py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500'
                  : 'px-4 py-3 sm:py-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600';
                return (
                  <button
                    onClick={sendReply}
                    disabled={sending || !replyText.trim()}
                    className={`${cls} text-white text-xs font-medium rounded-xl disabled:opacity-40 transition-all active:scale-95 flex items-center gap-1.5`}
                    data-meta-review="dm-send"
                    title={outside
                      ? 'Ce message a plus de 24h. Instagram limite l\'envoi via l\'API à la fenêtre de 24h — au-delà, l\'envoi peut échouer. Signalé ici pour que tu saches qu\'une réponse est en retard.'
                      : 'Dans la fenêtre de 24h. Envoi standard POST /me/messages. Clic manuel uniquement — aucune automatisation.'}
                  >
                    {sending ? (
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                    ) : (
                      <>
                        {outside && <span className="text-[10px]">⏰</span>}
                        <span className="hidden sm:inline">{outside ? 'Envoyer (>24h)' : 'Envoyer'}</span>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                      </>
                    )}
                  </button>
                );
              })()}
            </div>
            {/* Demo-mode caption explaining the API call — visible only when ?demo=1 so a Meta App Review reviewer recording the screencast can see what each click triggers without any subtitles or narration. */}
            <div className="px-3 pb-2">
              <DemoCaption>
                Manual click → POST /me/messages (recipient_id, message). Permission: instagram_business_manage_messages. Sending is only allowed within Instagram&apos;s 24h window; beyond 24h the conversation is flagged (⏰) so you know a reply is overdue.
              </DemoCaption>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-white/45 text-xs gap-2 py-8">
            <svg className="w-8 h-8 text-white/35" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            {p.dmConvsPickHint}
          </div>
        )}
      </div>
    </div>
    </div>
  );
}

// Reply card for DMs and emails

function DmCard({ dm, statusColors }: { dm: { target: string; status: string; message?: string; date: string }; statusColors: Record<string, string> }) {
  const { t } = useLanguage();
  const p = t.panels;
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleReply = useCallback(async () => {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      await fetch('/api/crm/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ prospect_id: dm.target, message: replyText, channel: 'dm_instagram' }),
      });
      setSent(true);
      setTimeout(() => { setSent(false); setShowReply(false); setReplyText(''); }, 2000);
    } catch {} finally { setSending(false); }
  }, [replyText, dm.target]);

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
      <div className="p-3 sm:p-4 flex items-center gap-3">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ backgroundColor: `${statusColors[dm.status] ?? '#a78bfa'}22`, color: statusColors[dm.status] ?? '#a78bfa' }}>
          {dm.status}
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-sm text-white/80 truncate block">@{dm.target}</span>
          {dm.message && <span className="text-[10px] text-white/40 truncate block">{dm.message}</span>}
        </div>
        <button onClick={() => setShowReply(!showReply)} className="text-[10px] px-2 py-1 bg-white/10 rounded-lg text-white/60 hover:bg-white/15 shrink-0">
          {showReply ? p.close : p.reply}
        </button>
      </div>
      {showReply && (
        <div className="px-3 sm:px-4 pb-3 border-t border-white/5 pt-2 flex gap-2">
          <input type="text" value={replyText} onChange={e => setReplyText(e.target.value)} placeholder={p.dmCommentCardPlaceholder} className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-purple-500/50" onKeyDown={e => { if (e.key === 'Enter') handleReply(); }} />
          <button onClick={handleReply} disabled={sending || !replyText.trim()} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all shrink-0 ${sent ? 'bg-emerald-500/20 text-emerald-400' : 'bg-purple-600 text-white hover:bg-purple-700'} disabled:opacity-40`}>
            {sent ? '\u2713' : sending ? '...' : p.sendBtn}
          </button>
        </div>
      )}
    </div>
  );
}

// Inline comments section for Lena

function CommentCard({ comment: c, isDemo, onUpdate, hidePostHeader }: { comment: any; isDemo: boolean; onUpdate: (id: string, data: any) => void; hidePostHeader?: boolean }) {
  const { t, locale } = useLanguage();
  const en = locale === 'en';
  const p = t.panels;
  const [replyText, setReplyText] = useState('');
  const [showReply, setShowReply] = useState(false);
  const [sending, setSending] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  // Suggest = ask the server to generate a high-quality, context-aware draft
  // (post caption + brand voice) and pre-fill the editor with it. The owner
  // reviews/edits before sending. NEVER a hardcoded template.
  const suggestReply = useCallback(async () => {
    if (isDemo) { setReplyText(en ? 'Love that you liked it — the pistachio is our quiet bestseller!' : 'Content que ça te plaise — la pistache c\'est notre best-seller discret !'); setShowReply(true); return; }
    setSuggesting(true);
    setShowReply(true);
    try {
      const res = await fetch('/api/agents/instagram-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'suggest_reply', comment_id: c.comment_id, media_id: c.media_id }),
      });
      const data = await res.json();
      if (data?.ok && data.reply) setReplyText(data.reply);
    } catch {} finally { setSuggesting(false); }
  }, [c.comment_id, c.media_id, isDemo, en]);

  const sendReply = useCallback(async (customReply?: string) => {
    setSending(true);
    try {
      const res = await fetch('/api/agents/instagram-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'reply_comment', comment_id: c.comment_id, media_id: c.media_id, ...(customReply ? { custom_reply: customReply } : {}) }),
      });
      const data = await res.json();
      onUpdate(c.comment_id, { replied: true, reply_text: customReply || data.reply || p.replied });
      setShowReply(false);
      setReplyText('');
    } catch {} finally { setSending(false); }
  }, [c.comment_id, c.media_id, onUpdate, p.replied]);

  // Human-friendly timestamp ("2h ago" / "Yesterday" / "3 Apr")
  const formatWhen = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
  };

  const postCtx = c.post || {};
  const postThumb: string | null = postCtx.thumbnail_url || null;
  const postCaption: string = postCtx.caption || '';
  const postPermalink: string | null = postCtx.permalink || null;
  const mediaType: string = (postCtx.media_type || '').toUpperCase();
  const mediaBadge = mediaType === 'VIDEO' || mediaType === 'REELS' ? '🎬' : mediaType === 'CAROUSEL_ALBUM' ? '🖼️' : '📷';

  return (
    <div className={`${hidePostHeader ? '' : 'bg-white/5 rounded-xl border border-white/10'} overflow-hidden ${postPermalink && !isDemo && !hidePostHeader ? 'hover:border-purple-500/40 transition' : ''}`}>
      {/* Post context — only when not in group view (group view shows
          the post header once at the top). */}
      {!hidePostHeader && (postThumb || postCaption) && (
        <a
          href={postPermalink || '#'}
          target={postPermalink ? '_blank' : undefined}
          rel="noopener noreferrer"
          onClick={(e) => { if (!postPermalink || isDemo) e.preventDefault(); }}
          className={`flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-white/[0.02] ${postPermalink && !isDemo ? 'hover:bg-white/5 transition cursor-pointer' : 'pointer-events-none'}`}
          title={postPermalink && !isDemo ? 'Open post on Instagram' : ''}
        >
          {postThumb && (
            <img src={postThumb} alt="" className="w-10 h-10 rounded-md object-cover flex-shrink-0" loading="lazy" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-white/30">{mediaBadge}</span>
              <span className="text-[10px] font-semibold text-white/60 truncate">
                {postCaption ? postCaption.substring(0, 60) : 'Instagram post'}
              </span>
            </div>
            {postCtx.posted_at && (
              <div className="text-[10px] text-white/50">Posted {formatWhen(postCtx.posted_at)}</div>
            )}
          </div>
          {postPermalink && <span className="text-[10px] text-purple-400/60">{'\u2197'}</span>}
        </a>
      )}

      {/* Comment */}
      <div className="p-3 flex items-start gap-2.5">
        <a
          href={c.username && !isDemo ? `https://www.instagram.com/${c.username}/` : '#'}
          target={c.username && !isDemo ? '_blank' : undefined}
          rel="noopener noreferrer"
          onClick={(e) => { if (isDemo) e.preventDefault(); }}
          className={`w-9 h-9 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center text-[14px] text-white font-bold flex-shrink-0 shadow-md ring-2 ring-white/10 ${c.username && !isDemo ? 'hover:ring-purple-400/50 transition' : ''}`}
          title={c.username && !isDemo ? `Open @${c.username} on Instagram` : ''}
        >
          {(c.username || '?')[0].toUpperCase()}
        </a>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={c.username && !isDemo ? `https://www.instagram.com/${c.username}/` : '#'}
              target={c.username && !isDemo ? '_blank' : undefined}
              rel="noopener noreferrer"
              onClick={(e) => { if (isDemo) e.preventDefault(); }}
              className={`text-[14px] font-bold text-white ${c.username && !isDemo ? 'hover:text-purple-300 hover:underline transition' : ''}`}
            >
              @{c.username || 'instagram_user'}
            </a>
            {c.timestamp && <span className="text-[10px] text-white/40">· {formatWhen(c.timestamp)}</span>}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${c.replied ? 'bg-emerald-400/15 text-emerald-400' : 'bg-amber-400/15 text-amber-400'}`}>
              {c.replied ? p.replied : p.pending}
            </span>
            {/* "Open on Instagram" link — points at the post permalink
                because Instagram doesn't expose a stable deep-link to
                a specific comment via web URL. Reviewers can find the
                comment by scrolling the post's comment list. */}
            {!isDemo && postPermalink && (
              <a
                href={postPermalink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-purple-300/70 hover:text-purple-200 ml-auto"
                title="Open the post + comments on Instagram"
              >
                Open on Instagram ↗
              </a>
            )}
          </div>
          <p className="text-[12px] text-white/75 mt-1 whitespace-pre-wrap break-words leading-relaxed">{c.text}</p>
        </div>
      </div>

      {/* Reply shown */}
      {c.replied && c.reply_text && (
        <div className="px-3 pb-2 ml-9">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
            <span className="text-[10px] text-emerald-400 font-medium">{p.dmCommentCardReplyShown}</span>
            <p className="text-[10px] text-white/60 mt-0.5">{c.reply_text}</p>
          </div>
        </div>
      )}

      {/* Actions — Auto-reply / Suggest / Write. In demo mode the
          buttons still work visually (mark as replied) but skip the
          actual Graph API call so we don't waste tokens or hit Meta
          on fake comment IDs. */}
      {!c.replied && (
        <div className="px-3 pb-3">
          {!showReply ? (
            <>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  if (isDemo) {
                    onUpdate(c.comment_id, { replied: true, reply_text: 'Merci ! On adore te lire 🙌' });
                  } else {
                    sendReply();
                  }
                }}
                disabled={sending}
                title="Posts a reply via the Graph API (POST /{comment-id}/replies). Permission: instagram_business_manage_comments."
                className="px-2.5 py-1.5 bg-emerald-600/20 text-emerald-400 text-[10px] font-medium rounded-lg hover:bg-emerald-600/30 transition min-h-[32px] disabled:opacity-50"
              >
                {sending ? '...' : (p.dmCommentCardReplyAuto || (en ? 'Auto reply' : 'Réponse auto'))}
              </button>
              <button
                onClick={suggestReply}
                disabled={suggesting}
                title="Generates a context-aware draft (post + brand voice) you can review and edit before sending."
                className="px-2.5 py-1.5 bg-amber-600/20 text-amber-400 text-[10px] font-medium rounded-lg hover:bg-amber-600/30 transition min-h-[32px] disabled:opacity-50"
              >
                {suggesting ? '…' : `💡 ${en ? 'Suggest' : 'Suggérer'}`}
              </button>
              <button
                onClick={() => setShowReply(true)}
                className="px-2.5 py-1.5 bg-blue-600/20 text-blue-400 text-[10px] font-medium rounded-lg hover:bg-blue-600/30 transition min-h-[32px]"
              >
                ✍️ {en ? 'Write' : 'Écrire'}
              </button>
            </div>
            {!isDemo && (
              <DemoCaption>
                Manual click → POST /{`<comment-id>`}/replies. Permission: instagram_business_manage_comments. AI suggests the draft, owner sends.
              </DemoCaption>
            )}
            </>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && replyText.trim()) {
                    if (isDemo) {
                      onUpdate(c.comment_id, { replied: true, reply_text: replyText });
                      setShowReply(false); setReplyText('');
                    } else {
                      sendReply(replyText);
                    }
                  }
                }}
                placeholder={p.dmCommentCardPlaceholder || (en ? 'Type your reply…' : 'Tape ta réponse…')}
                autoFocus
                className="flex-1 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[11px] text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
              />
              <button
                onClick={() => {
                  if (isDemo) {
                    onUpdate(c.comment_id, { replied: true, reply_text: replyText });
                    setShowReply(false); setReplyText('');
                  } else {
                    sendReply(replyText);
                  }
                }}
                disabled={sending || !replyText.trim()}
                title="Sends your custom reply to this Instagram comment via the Graph API (POST /{comment-id}/replies)."
                className="px-3 py-1.5 bg-blue-600 text-white text-[10px] font-bold rounded-lg disabled:opacity-40 min-h-[32px]"
              >
                {sending ? '...' : (p.sendBtn || (en ? 'Send' : 'Envoyer'))}
              </button>
              <button onClick={() => setShowReply(false)} className="text-white/30 hover:text-white/60 text-xs px-1">✕</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LenaCommentsSection() {
  const { t, locale } = useLanguage();
  const en = locale === 'en';
  const p = t.panels;
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoReply, setAutoReply] = useState<boolean>(false);
  const [autoReplyLoaded, setAutoReplyLoaded] = useState(false);
  const [filter, setFilter] = useState<'pending' | 'all' | 'replied'>('pending');
  const [repliedPeriod, setRepliedPeriod] = useState<'all' | '24h' | '7d' | '30d'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [replyingBatch, setReplyingBatch] = useState(false);
  const [catchingUp, setCatchingUp] = useState(false);

  const refetchComments = useCallback(async () => {
    try {
      const r = await fetch('/api/agents/instagram-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'fetch_comments' }),
      });
      const d = await r.json();
      if (d.comments) setComments(d.comments);
    } catch {}
  }, []);

  useEffect(() => {
    refetchComments().finally(() => setLoading(false));
  }, [refetchComments]);

  // Load + persist Jade's auto-reply setting.
  useEffect(() => {
    fetch('/api/agents/settings?agent_id=instagram_comments', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setAutoReply(!!d.settings?.auto_mode); setAutoReplyLoaded(true); })
      .catch(() => setAutoReplyLoaded(true));
  }, []);

  const toggleAutoReply = useCallback(async () => {
    const next = !autoReply;
    setAutoReply(next);
    try {
      await fetch('/api/agents/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ agent_id: 'instagram_comments', auto_mode: next }),
      });
      // Turning it ON catches up immediately: reply to every pending /
      // unanswered comment now, instead of waiting for the next webhook
      // (which only fires on NEW comments) or the periodic cron.
      if (next) {
        setCatchingUp(true);
        try {
          await fetch('/api/agents/instagram-comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ action: 'auto_reply_all' }),
          });
          await refetchComments();
        } finally { setCatchingUp(false); }
      }
    } catch { setAutoReply(!next); setCatchingUp(false); }
  }, [autoReply, refetchComments]);

  const replySingle = useCallback(async (commentId: string, mediaId: string, customReply?: string) => {
    try {
      await fetch('/api/agents/instagram-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'reply_comment', comment_id: commentId, media_id: mediaId, ...(customReply ? { custom_reply: customReply } : {}) }),
      });
      setComments(prev => prev.map(c => c.comment_id === commentId ? { ...c, replied: true } : c));
      setSelected(prev => { const n = new Set(prev); n.delete(commentId); return n; });
    } catch {}
  }, []);

  const replySelected = useCallback(async () => {
    if (selected.size === 0) return;
    setReplyingBatch(true);
    try {
      await Promise.all(Array.from(selected).map(id => {
        const c = comments.find(x => x.comment_id === id);
        if (!c) return Promise.resolve();
        return fetch('/api/agents/instagram-comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action: 'reply_comment', comment_id: id, media_id: c.media_id }),
        }).catch(() => {});
      }));
      setComments(prev => prev.map(c => selected.has(c.comment_id) ? { ...c, replied: true } : c));
      setSelected(new Set());
    } finally { setReplyingBatch(false); }
  }, [selected, comments]);

  if (loading) return <div className="text-center py-4"><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-400 mx-auto" /></div>;

  // Comments display rule (founder hard rule):
  //   - When IG is connected → show ONLY real comments fetched from
  //     the Graph API. If 0 real comments, show an honest empty state
  //     with a link to the IG account.
  //   - When IG is NOT connected → show sample comments as onboarding
  //     preview, with the "Sample data" badge.
  // No mixing of real + samples. No sample fallback for connected
  // accounts with 0 comments — the empty state is the truth.
  const igConnected = !!(window as any).__igConnected;
  const sourceList: any[] = comments.length > 0 ? comments : (igConnected ? [] : DEMO_IG_COMMENTS);
  const isDemo = !igConnected && comments.length === 0;

  const pending = sourceList.filter(c => !c.replied);
  const replied = sourceList.filter(c => c.replied);
  // Period filter on the Replied tab (by reply date).
  const withinPeriod = (iso: string | null | undefined, period: typeof repliedPeriod) => {
    if (period === 'all' || !iso) return true;
    const days = period === '24h' ? 1 : period === '7d' ? 7 : 30;
    return (Date.now() - new Date(iso).getTime()) <= days * 86400000;
  };
  const repliedFiltered = replied.filter(c => withinPeriod(c.replied_at, repliedPeriod));
  const counts = { all: sourceList.length, pending: pending.length, replied: replied.length };
  const visible = filter === 'all' ? sourceList : filter === 'replied' ? repliedFiltered : pending;

  return (
    <div className={isDemo ? 'opacity-95' : ''}>
      {/* Sample-data badge — when Instagram is not connected. */}
      {isDemo && (
        <div className="flex items-center gap-2 mb-3 text-[10px]">
          <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-semibold">Sample data</span>
          <span className="text-white/40">Example comments — connect Instagram to replace them with your real ones.</span>
        </div>
      )}

      {/* Auto-reply master toggle — clear on/off so the client knows
          exactly whether Jade will reply on his own. When ON, every new
          comment gets an AI reply automatically; when OFF, the client
          handles each one from this list. */}
      {!isDemo && (
        <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-3 mb-3 flex items-center gap-3">
          <button
            onClick={toggleAutoReply}
            disabled={!autoReplyLoaded || catchingUp}
            aria-label={autoReply ? 'Disable Jade auto-reply' : 'Enable Jade auto-reply'}
            className={`w-11 h-6 rounded-full relative transition-colors flex-shrink-0 ${catchingUp ? 'opacity-60' : ''} ${autoReply ? 'bg-emerald-500' : 'bg-white/15'}`}
          >
            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${autoReply ? 'right-0.5' : 'left-0.5'}`} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold text-white">
              {autoReply
                ? (en ? 'Auto-reply ON — Jade replies on her own' : 'Auto-reply ON — Jade répond seul')
                : (en ? 'Auto-reply OFF — you validate each reply' : 'Auto-reply OFF — tu valides chaque réponse')}
            </div>
            <div className="text-[10px] text-white/50 mt-0.5">
              {catchingUp
                ? (en ? '⏳ Replying to all pending comments now…' : '⏳ Réponse à tous les commentaires en attente en cours…')
                : autoReply
                ? (en ? 'New comments get a reply automatically — and pending ones were just answered.' : "Les nouveaux commentaires reçoivent une réponse automatiquement — et ceux en attente viennent d'être traités.")
                : (en ? 'Select the pending comments below and choose Reply, Suggest or Skip.' : "Sélectionne les commentaires en attente ci-dessous et choisis Reply, Suggest ou Skip.")}
            </div>
          </div>
        </div>
      )}

      {/* Filter chips — never let an active client lose track of pending vs replied. */}
      <div className="flex items-center gap-1 mb-2 text-[10px]">
        {(['pending', 'all', 'replied'] as const).map(f => (
          <button
            key={f}
            onClick={() => { setFilter(f); setSelected(new Set()); }}
            className={`px-2.5 py-1 rounded-full font-semibold transition ${
              filter === f
                ? 'bg-purple-500/30 text-white border border-purple-500/40'
                : 'bg-white/5 text-white/50 border border-white/10 hover:text-white/80'
            }`}
          >
            {f === 'pending' ? (en ? `To reply (${counts.pending})` : `À répondre (${counts.pending})`) : f === 'replied' ? (en ? `Replied (${counts.replied})` : `Répondus (${counts.replied})`) : (en ? `All (${counts.all})` : `Tous (${counts.all})`)}
          </button>
        ))}
        {filter === 'pending' && counts.pending > 0 && (
          <button
            onClick={() => {
              const ids = pending.map(c => c.comment_id);
              if (selected.size === ids.length) setSelected(new Set());
              else setSelected(new Set(ids));
            }}
            className="ml-auto text-[10px] text-white/40 hover:text-white"
          >
            {selected.size === counts.pending ? (en ? 'Deselect all' : 'Tout désélectionner') : (en ? 'Select all' : 'Tout sélectionner')}
          </button>
        )}
      </div>

      {/* Period filter — only on the Replied tab, filters by reply date. */}
      {filter === 'replied' && counts.replied > 0 && (
        <div className="flex items-center gap-1 mb-2 text-[9px]">
          <span className="text-white/30 mr-0.5">{en ? 'Period:' : 'Période :'}</span>
          {(['all', '24h', '7d', '30d'] as const).map(per => (
            <button
              key={per}
              onClick={() => setRepliedPeriod(per)}
              className={`px-2 py-0.5 rounded-full font-medium transition ${
                repliedPeriod === per
                  ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-500/40'
                  : 'bg-white/5 text-white/40 border border-white/10 hover:text-white/70'
              }`}
            >
              {per === 'all' ? (en ? 'All' : 'Tous') : per === '24h' ? (en ? '24h' : '24h') : per === '7d' ? (en ? '7 days' : '7 jours') : (en ? '30 days' : '30 jours')}
            </button>
          ))}
          <span className="ml-auto text-white/30">{repliedFiltered.length}/{counts.replied}</span>
        </div>
      )}

      {/* Bulk-reply bar — appears the moment the client has selected at least one pending comment. */}
      {filter === 'pending' && selected.size > 0 && (
        <div className="rounded-lg border border-purple-500/30 bg-purple-500/10 p-2 mb-2 flex items-center gap-2">
          <span className="text-[11px] text-purple-200 font-semibold flex-1">{selected.size} {en ? 'selected' : 'sélectionné(s)'}</span>
          <button
            onClick={replySelected}
            disabled={replyingBatch}
            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-bold rounded-lg disabled:opacity-50"
          >
            {replyingBatch ? '...' : (en ? `AI replies to ${selected.size}` : `IA répond aux ${selected.size}`)}
          </button>
          <button onClick={() => setSelected(new Set())} className="text-[10px] text-white/40 hover:text-white px-2">
            {en ? 'Cancel' : 'Annuler'}
          </button>
        </div>
      )}

      {/* Empty state when Instagram is connected but no comments at all */}
      {!isDemo && counts.all === 0 && (
        <a
          href="https://www.instagram.com/keiro_ai/"
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] p-4 text-center transition"
        >
          <span className="text-xl">{'\u{1F4AC}'}</span>
          <p className="text-xs text-white/60 mt-1">{en ? 'No comments yet' : 'Aucun commentaire pour le moment'}</p>
          <p className="text-[10px] text-white/40 mt-1">{en ? <>Your real Instagram comments will appear here as soon as a visitor leaves one. Fetched live via GET /&lt;media-id&gt;/comments.</> : <>Tes vrais commentaires Instagram apparaitront ici dès qu'un visiteur en laisse un. Fetched live via GET /&lt;media-id&gt;/comments.</>}</p>
          <p className="text-[10px] text-purple-300 mt-2">{en ? 'See your posts on Instagram ↗' : 'Voir tes posts sur Instagram ↗'}</p>
        </a>
      )}

      {/* Empty state within a filter (e.g. all replied) */}
      {!isDemo && counts.all > 0 && visible.length === 0 && (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-center text-[11px] text-white/40">
          {filter === 'pending' ? (en ? 'All comments handled 👌' : 'Tous les commentaires sont traités 👌') : (en ? 'No replied comments yet.' : 'Aucun commentaire répondu pour le moment.')}
        </div>
      )}

      {/* Comments grouped by post — each post header (thumbnail +
          caption + permalink) appears ONCE at the top of a section,
          with all its comments listed below. Founder ask: "dans jade
          commentaire je veux voir le post et les commentaires
          associes sous la meme rubrique". */}
      <div className="space-y-3 max-h-[520px] overflow-y-auto">
        {(() => {
          const grouped = new Map<string, { post: any; comments: any[] }>();
          for (const c of visible.slice(0, 50)) {
            const k = c.media_id || c.comment_id || 'unknown';
            if (!grouped.has(k)) grouped.set(k, { post: c.post || {}, comments: [] });
            grouped.get(k)!.comments.push(c);
          }
          return [...grouped.entries()].map(([mediaId, group]) => (
            <PostGroup
              key={mediaId}
              post={group.post}
              comments={group.comments}
              isDemo={isDemo}
              filter={filter}
              selected={selected}
              setSelected={setSelected}
              onUpdate={(id, data) => setComments(prev => prev.map(cc => cc.comment_id === id ? { ...cc, ...data } : cc))}
            />
          ));
        })()}
      </div>
    </div>
  );
}

// PostGroup renders one Instagram post header + all its comments
// underneath as a single rubric. The post header is clickable and
// opens the post on Instagram. Each commenter's username is also
// clickable (opens their IG profile) so the user can verify the
// comment is real and find it back later.
function PostGroup({
  post, comments, isDemo, filter, selected, setSelected, onUpdate,
}: {
  post: any;
  comments: any[];
  isDemo: boolean;
  filter: 'pending' | 'all' | 'replied';
  selected: Set<string>;
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>;
  onUpdate: (id: string, data: any) => void;
}) {
  const { locale } = useLanguage();
  const en = locale === 'en';
  const postThumb: string | null = post?.thumbnail_url || null;
  const postCaption: string = post?.caption || '';
  const postPermalink: string | null = post?.permalink || null;
  const mediaType: string = (post?.media_type || '').toUpperCase();
  const mediaBadge = mediaType === 'VIDEO' || mediaType === 'REELS' ? '🎬' : mediaType === 'CAROUSEL_ALBUM' ? '🖼️' : '📷';

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
      {/* Post header — clickable to open the post on Instagram */}
      {(postThumb || postCaption) && (
        <a
          href={postPermalink || '#'}
          target={postPermalink ? '_blank' : undefined}
          rel="noopener noreferrer"
          onClick={(e) => { if (!postPermalink || isDemo) e.preventDefault(); }}
          className={`flex items-center gap-3 px-3 py-2.5 border-b border-white/10 bg-white/[0.04] ${postPermalink && !isDemo ? 'hover:bg-white/[0.07] transition cursor-pointer' : ''}`}
          title={postPermalink && !isDemo ? (en ? 'Open the post on Instagram' : 'Ouvrir le post sur Instagram') : ''}
        >
          {postThumb && (
            <img src={postThumb} alt="" className="w-14 h-14 rounded-md object-cover flex-shrink-0" loading="lazy" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[10px] text-white/40">{mediaBadge}</span>
              <span className="text-[10px] font-bold text-white/80 truncate">
                {postCaption ? postCaption.substring(0, 80) : (en ? 'Instagram post' : 'Post Instagram')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-purple-300/70 font-semibold">{comments.length} {en ? `comment${comments.length > 1 ? 's' : ''}` : `commentaire${comments.length > 1 ? 's' : ''}`}</span>
              {post?.posted_at && (
                <span className="text-[10px] text-white/30">· {en ? 'published' : 'publié'} {new Date(post.posted_at).toLocaleDateString()}</span>
              )}
            </div>
          </div>
          {postPermalink && !isDemo && (
            <span className="text-[11px] text-purple-300 font-semibold flex-shrink-0">{en ? 'Open ↗' : 'Ouvrir ↗'}</span>
          )}
        </a>
      )}

      {/* Comments list under this post */}
      <div className="divide-y divide-white/5">
        {comments.map((c: any) => {
          const isPending = !c.replied;
          const checked = selected.has(c.comment_id);
          return (
            <div key={c.comment_id} className={`relative ${isPending && filter === 'pending' ? 'pl-7' : ''} bg-white/[0.01]`}>
              {isPending && filter === 'pending' && (
                <button
                  onClick={() => setSelected(prev => {
                    const n = new Set(prev);
                    if (n.has(c.comment_id)) n.delete(c.comment_id); else n.add(c.comment_id);
                    return n;
                  })}
                  aria-label={checked ? (en ? 'Deselect' : 'Désélectionner') : (en ? 'Select' : 'Sélectionner')}
                  className={`absolute left-1.5 top-3 w-5 h-5 rounded border-2 ${checked ? 'bg-purple-500 border-purple-500' : 'bg-transparent border-white/30'} flex items-center justify-center`}
                >
                  {checked && <span className="text-white text-[10px] font-bold">✓</span>}
                </button>
              )}
              {/* Inline comment card — without post header (the post is
                  already at the top of the group). */}
              <CommentCard comment={c} isDemo={isDemo} hidePostHeader onUpdate={onUpdate} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Pending DM Queue — client can preview and mass-send prepared DMs */

function PendingDMQueue({ gradientFrom }: { gradientFrom: string }) {
  const { t, locale } = useLanguage();
  const en = locale === 'en';
  const p = t.panels;
  const [queue, setQueue] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [prepareInfo, setPrepareInfo] = useState<string | null>(null);

  const loadQueue = useCallback(async (limit = 50) => {
    try {
      const res = await fetch(`/api/agents/dm-instagram/queue?limit=${limit}`, { credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        setQueue(d.queue || []);
        setTotal(d.total || 0);
      }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadQueue(showAll ? 200 : 50); }, [loadQueue, showAll]);

  // Déclenche Jade : analyse les profils Instagram des prospects + prépare des
  // DM d'accroche personnalisés AVEC un visuel à l'image du business. C'est ce
  // qui manquait : la file était vide → l'onglet n'affichait rien. Maintenant
  // le client voit l'agent EN ACTION et les DM apparaissent quand c'est prêt.
  const prepareNow = useCallback(async () => {
    if (preparing) return;
    setPreparing(true);
    setPrepareInfo(en ? 'Jade is analysing your prospects\' Instagram profiles and writing personalised DMs…' : 'Jade analyse les profils Instagram de tes prospects et rédige des DM personnalisés…');
    try {
      // Mode quick : réponse rapide (texte inséré tout de suite), visuels générés
      // en arrière-plan. On recharge dès le retour puis on poll pour voir les
      // images se remplir dans les cartes.
      const res = await fetch('/api/agents/dm-instagram?with_image=1&quick=1', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'instagram' }),
      });
      const d = await res.json().catch(() => ({} as any));
      const n = d?.prepared || 0;
      await loadQueue(showAll ? 200 : 50);
      if (n > 0) {
        setPrepareInfo(en ? `✅ ${n} DM prepared — visuals are generating (a few seconds)…` : `✅ ${n} DM préparés — les visuels se génèrent (quelques secondes)…`);
        // Poll silencieux : les visuels apparaissent au fur et à mesure.
        let tries = 0;
        const poll = async () => {
          tries++;
          await loadQueue(showAll ? 200 : 50);
          if (tries < 9) setTimeout(poll, 8000);
          else setPrepareInfo(en ? `✅ ${n} DM ready to send below.` : `✅ ${n} DM prêts à envoyer ci-dessous.`);
        };
        setTimeout(poll, 8000);
      } else {
        setPrepareInfo(d?.message || (en ? 'No new eligible prospect right now. Add Instagram handles via Léo prospection, then retry.' : 'Aucun nouveau prospect éligible pour l\'instant. Ajoute des comptes Instagram via la prospection Léo, puis réessaie.'));
      }
    } catch {
      setPrepareInfo(en ? 'Preparation failed — please retry.' : 'La préparation a échoué — réessaie.');
    } finally {
      setPreparing(false);
    }
  }, [preparing, en, loadQueue, showAll]);

  const sendDM = useCallback(async (dmId: string) => {
    setSending(dmId);
    try {
      const res = await fetch('/api/agents/dm-instagram/send-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ dm_id: dmId }),
      });
      if (res.ok) {
        setQueue(prev => prev.filter(d => d.id !== dmId));
        setTotal(prev => prev - 1);
      }
    } catch {} finally { setSending(null); }
  }, []);

  // Per-DM status after a pre-flight check. We surface this inline (red
  // banner for invalid handles, orange for low-activity warnings, green
  // for "message copied, go paste it in IG") instead of a browser alert,
  // which is jarring on mobile. The user controls when to mark the DM as
  // sent — no auto-timeout that could mis-report a DM the user never
  // actually pasted.
  type DmStatus = {
    kind: 'invalid' | 'warning' | 'ready';
    text: string;
    snapshot?: {
      biography?: string;
      followers_count?: number;
      media_count?: number;
      website?: string;
      recent_post_caption?: string;
    };
    deeplink?: string;
  };
  const [verifying, setVerifying] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, DmStatus>>({});

  const handleEnvoyerDM = useCallback(async (dm: { id: string; handle: string; message: string }) => {
    const cleanHandle = (dm.handle || '').replace(/^@/, '').trim();
    if (!cleanHandle) return;
    setVerifying(dm.id);
    try {
      const vres = await fetch(`/api/agents/dm-instagram/preflight?dm_id=${encodeURIComponent(dm.id)}`, {
        method: 'GET',
        credentials: 'include',
      });
      const v = await vres.json().catch(() => ({} as any));
      const snap = v?.snapshot;
      const firstPost = Array.isArray(snap?.recent_posts) && snap.recent_posts[0]?.caption
        ? String(snap.recent_posts[0].caption)
        : undefined;
      const snapSummary = snap
        ? {
            biography: snap.biography,
            followers_count: snap.followers_count,
            media_count: snap.media_count,
            website: snap.website,
            recent_post_caption: firstPost,
          }
        : undefined;

      if (v?.status === 'invalid_handle') {
        setStatuses(prev => ({
          ...prev,
          [dm.id]: {
            kind: 'invalid',
            text: v.warning || p.dmUnreachableAlert.replace('{handle}', cleanHandle).replace('{reason}', en ? 'account not found' : 'compte introuvable'),
          },
        }));
        return;
      }

      // 'likely_blocked', 'no_creds' or 'ready': allow the user to
      // proceed, but show any warning inline first so they know what
      // to expect when they tap the deeplink.
      const deeplink = v?.dm_deeplink || `https://ig.me/m/${cleanHandle}`;
      const kind: DmStatus['kind'] = v?.status === 'likely_blocked' ? 'warning' : 'ready';
      setStatuses(prev => ({
        ...prev,
        [dm.id]: {
          kind,
          text: v?.warning || (en ? 'Profile verified — message copied, open Instagram to paste it.' : 'Profil vérifié — message copié, ouvre Instagram pour le coller.'),
          snapshot: snapSummary,
          deeplink,
        },
      }));

      // Copy the message so the user only needs to paste + send in IG.
      navigator.clipboard.writeText(dm.message).catch(() => {});
      window.open(deeplink, '_blank');
      // DO NOT auto-mark as sent — the user will click "✓ Envoyé"
      // explicitly once they actually pasted the message in IG.
    } catch {
      // Pre-flight itself failed (network hiccup, rate limit). Fall back
      // to the direct deeplink — better to let the user through than
      // block on a transient error.
      navigator.clipboard.writeText(dm.message).catch(() => {});
      window.open(`https://ig.me/m/${cleanHandle}`, '_blank');
      setStatuses(prev => ({
        ...prev,
        [dm.id]: {
          kind: 'warning',
          text: en ? 'Pre-check unavailable. Message copied, paste it into Instagram.' : 'Pré-vérification indisponible. Message copié, colle-le dans Instagram.',
          deeplink: `https://ig.me/m/${cleanHandle}`,
        },
      }));
    } finally {
      setVerifying(null);
    }
  }, [p.dmUnreachableAlert]);

  const confirmSent = useCallback(async (dmId: string) => {
    setStatuses(prev => { const n = { ...prev }; delete n[dmId]; return n; });
    await sendDM(dmId);
  }, [sendDM]);

  const removeFromQueue = useCallback((dmId: string) => {
    setStatuses(prev => { const n = { ...prev }; delete n[dmId]; return n; });
    setQueue(prev => prev.filter(d => d.id !== dmId));
    setTotal(prev => prev - 1);
  }, []);

  // Mark a DM as blocked by the prospect (they have DMs disabled or
  // declined the message request). Client clicks this after opening the
  // ig.me link and seeing Instagram's native "can't message" screen.
  const markBlocked = useCallback(async (dmId: string) => {
    try {
      await fetch('/api/agents/dm-instagram/send-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ dm_id: dmId, status: 'blocked' }),
      });
    } catch {}
    setQueue(prev => prev.filter(d => d.id !== dmId));
    setTotal(prev => prev - 1);
  }, []);

  const displayed = showAll ? queue : queue.slice(0, 10);

  // Bouton "Préparer maintenant" — toujours visible (déclenche Jade + montre
  // l'état d'action). Résout le "il ne se passe rien" quand la file est vide.
  const prepareBtn = (
    <button
      onClick={prepareNow}
      disabled={preparing}
      className="px-3 py-2 min-h-[40px] bg-gradient-to-r from-pink-500 to-purple-600 text-white text-xs font-bold rounded-lg hover:opacity-90 transition disabled:opacity-50 flex items-center gap-1.5"
    >
      {preparing ? (en ? '⏳ Jade prépare…' : '⏳ Jade prépare…') : (en ? '⚡ Prepare prospecting DMs' : '⚡ Préparer des DM de prospection')}
    </button>
  );

  const infoBanner = prepareInfo && (
    <div className={`mb-2 rounded-lg p-2.5 text-[11px] leading-relaxed border ${preparing ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-200' : 'bg-white/[0.04] border-white/10 text-white/70'}`}>
      {preparing && <span className="inline-block w-3 h-3 mr-1.5 rounded-full border-2 border-cyan-300 border-t-transparent animate-spin align-[-2px]" />}
      {prepareInfo}
    </div>
  );

  // État de CHARGEMENT initial.
  if (loading) {
    return (
      <div className="mb-3">
        <div className="animate-pulse space-y-2">
          <div className="h-16 bg-white/[0.04] rounded-xl" />
          <div className="h-16 bg-white/[0.04] rounded-xl" />
        </div>
      </div>
    );
  }

  // File VIDE → on montre quand même de quoi lancer l'agent + l'explication.
  if (queue.length === 0) {
    return (
      <div className="mb-3">
        {infoBanner}
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center">
          <div className="text-2xl mb-2">{'\u{1F3AF}'}</div>
          <p className="text-xs text-white/70 mb-1 font-semibold">{en ? 'No prospecting DM ready yet' : 'Aucun DM de prospection prêt pour l\'instant'}</p>
          <p className="text-[11px] text-white/45 mb-3 max-w-sm mx-auto">{en ? 'Jade analyses your prospects\' Instagram profiles and writes a personalised opening DM with a visual matching their business. Launch it below.' : 'Jade analyse les profils Instagram de tes prospects et rédige un DM d\'accroche personnalisé avec un visuel à l\'image de leur business. Lance-le ci-dessous.'}</p>
          <div className="flex justify-center">{prepareBtn}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-3">
      {infoBanner}
      {/* Header + campaign actions */}
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <span className="text-xs font-bold text-white flex items-center gap-1.5">
          {'\u{1F4AC}'} {p.dmReadyHeader} <span className="text-[10px] text-cyan-400 bg-cyan-500/20 px-1.5 py-0.5 rounded-full">{total}</span>
        </span>
        <div className="flex items-center gap-1.5">
          {!showAll && queue.length > 10 && (
            <button onClick={() => setShowAll(true)} className="text-[10px] text-cyan-400 hover:text-cyan-300 transition">
              {p.seeAll} ({total})
            </button>
          )}
          {prepareBtn}
        </div>
      </div>

      <div className={`space-y-2 ${showAll ? 'max-h-[600px]' : 'max-h-[400px]'} overflow-y-auto pr-1`}>
        {displayed.map(dm => {
          const cleanHandle = (dm.handle || '').replace(/^@/, '').trim();
          if (!cleanHandle) return null;
          const isVerified = (dm as any).verified_exists === true;
          const status = statuses[dm.id];
          return (
          <div key={dm.id} className="bg-white/[0.03] border border-white/10 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-white">@{cleanHandle}</span>
              {isVerified && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-semibold">
                  {'\u2705'} {p.verified}
                </span>
              )}
              {dm.company && <span className="text-[10px] text-white/40">{dm.company}</span>}
            </div>
            {/* Visuel de prospection généré à l'image du business analysé
                (stocké dans personalization.visual_url) — c'est l'image que
                le client joint au DM pour accrocher le prospect. */}
            {(dm as any).visual_url && (
              <a href={(dm as any).visual_url} target="_blank" rel="noopener noreferrer" className="block mb-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={(dm as any).visual_url} alt={en ? 'Prospecting visual' : 'Visuel de prospection'} className="w-full max-h-52 object-cover rounded-lg border border-white/10" loading="lazy" />
              </a>
            )}
            <p className="text-[11px] text-white/60 leading-relaxed mb-2 line-clamp-3">{dm.message}</p>
            {(dm as any).personalization_detail && (
              <p className="text-[10px] text-white/35 italic mb-2 line-clamp-2">{'\u{1F50E}'} {(dm as any).personalization_detail}</p>
            )}

            {/* Pre-flight status banner — shown inline after "Envoyer" click */}
            {status && (
              <div
                className={`mb-2 rounded-lg p-2.5 text-[11px] leading-relaxed border ${
                  status.kind === 'invalid'
                    ? 'bg-red-500/10 border-red-500/30 text-red-200'
                    : status.kind === 'warning'
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                }`}
              >
                <div>{status.text}</div>
                {status.snapshot && (
                  <div className="mt-1 text-[10px] text-white/60">
                    {typeof status.snapshot.followers_count === 'number' && `${status.snapshot.followers_count} ${en ? 'followers' : 'abonnés'} · `}
                    {typeof status.snapshot.media_count === 'number' && `${status.snapshot.media_count} posts`}
                    {status.snapshot.biography && (
                      <div className="mt-1 italic line-clamp-2">« {status.snapshot.biography.substring(0, 120)} »</div>
                    )}
                    {status.snapshot.recent_post_caption && (
                      <div className="mt-1 text-white/50 line-clamp-2">{en ? 'Latest post: ' : 'Dernier post : '}« {status.snapshot.recent_post_caption.substring(0, 100)} »</div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              {!status || status.kind === 'invalid' ? (
                <>
                  {status?.kind === 'invalid' ? (
                    <button
                      onClick={() => removeFromQueue(dm.id)}
                      className="px-4 py-2.5 min-h-[44px] bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 text-xs font-bold rounded-lg transition"
                    >
                      {'\u{1F5D1}'} {en ? 'Remove from DM channel' : 'Retirer du canal DM'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleEnvoyerDM({ id: dm.id, handle: cleanHandle, message: dm.message })}
                      disabled={sending === dm.id || verifying === dm.id}
                      className="px-4 py-2.5 min-h-[44px] bg-gradient-to-r from-pink-500 to-purple-600 text-white text-xs font-bold rounded-lg hover:opacity-90 transition disabled:opacity-40"
                      title={p.dmBtnTooltip}
                    >
                      {verifying === dm.id
                        ? `\u23F3 ${p.dmBtnVerifying}`
                        : sending === dm.id
                          ? `\u2713 ${p.dmBtnSent}`
                          : `${'\u{1F4AC}'} ${p.dmBtnEnvoyerDM}`}
                    </button>
                  )}
                  <button
                    onClick={() => markBlocked(dm.id)}
                    className="px-3 py-2.5 min-h-[44px] text-xs text-red-400/60 hover:text-red-400 transition"
                    title={en ? 'The prospect has DMs disabled — remove them from the channel' : 'Le prospect a bloqué les DMs — retire-le du canal'}
                  >
                    {'\u{1F6AB}'} {p.dmBtnBlockedMark}
                  </button>
                  <button
                    onClick={() => setQueue(prev => prev.filter(d => d.id !== dm.id))}
                    className="px-3 py-2.5 min-h-[44px] text-xs text-white/30 hover:text-white/60 transition"
                  >
                    {p.dmBtnSkipDM}
                  </button>
                </>
              ) : (
                // Pre-flight OK (ready or warning) — user has been sent to IG.
                // Wait for them to confirm the outcome explicitly.
                <>
                  <button
                    onClick={() => confirmSent(dm.id)}
                    disabled={sending === dm.id}
                    className="px-4 py-2.5 min-h-[44px] bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold rounded-lg transition disabled:opacity-40"
                  >
                    {'\u2713'} {en ? 'Sent successfully' : 'Bien envoyé'}
                  </button>
                  <button
                    onClick={() => {
                      if (status?.deeplink) window.open(status.deeplink, '_blank');
                    }}
                    className="px-3 py-2.5 min-h-[44px] text-xs text-white/50 hover:text-white/80 border border-white/10 rounded-lg transition"
                  >
                    {'\u{1F517}'} {en ? 'Reopen Instagram' : 'Rouvrir Instagram'}
                  </button>
                  <button
                    onClick={() => markBlocked(dm.id)}
                    className="px-3 py-2.5 min-h-[44px] text-xs text-red-400/60 hover:text-red-400 transition"
                  >
                    {'\u{1F6AB}'} {en ? 'DMs blocked' : 'DMs bloqués'}
                  </button>
                </>
              )}
            </div>
          </div>
          );
        }).filter(Boolean)}
      </div>
    </div>
  );
}

// JadeCampaignActions — 5 quick-action buttons that open a
// confirmation+customization modal before firing. Each action accepts
// parameters tailored to its workflow (quantity, tone, filter, etc.),
// so the user always reviews and tweaks what Jade is about to do
// rather than firing blind.
type ActionField =
  | { key: string; label: string; type: 'number'; default: number; min: number; max: number; help?: string }
  | { key: string; label: string; type: 'select'; default: string; options: { value: string; label: string }[]; help?: string }
  | { key: string; label: string; type: 'toggle'; default: boolean; help?: string };

interface ActionConfig {
  key: string;
  label: string;
  desc: string;
  icon: string;
  classes: string;
  confirmTitle: string;
  confirmIntro: string;
  fields: ActionField[];
  run: (params: Record<string, any>) => Promise<{ kind: 'ok' | 'err'; text: string }>;
}

function ActionConfirmModal({ config, onClose }: { config: ActionConfig; onClose: (result?: { kind: 'ok' | 'err'; text: string }) => void }) {
  const { locale } = useLanguage();
  const en = locale === 'en';
  const [params, setParams] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {};
    for (const f of config.fields) init[f.key] = f.default;
    return init;
  });
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      const result = await config.run(params);
      onClose(result);
    } catch (e: any) {
      onClose({ kind: 'err', text: e?.message || (en ? 'Network error' : 'Erreur réseau') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => !busy && onClose()}>
      <div className="bg-[#0f1d38] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">{config.icon}</span>
            <h2 className="text-white font-bold text-base">{config.confirmTitle}</h2>
          </div>
          <p className="text-[11px] text-white/60 leading-relaxed">{config.confirmIntro}</p>
        </div>

        <div className="p-5 space-y-4">
          {config.fields.map(field => (
            <div key={field.key}>
              <label className="text-[11px] font-semibold text-white/80 block mb-1.5">{field.label}</label>
              {field.type === 'number' && (
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={field.min}
                    max={field.max}
                    value={params[field.key]}
                    onChange={e => setParams({ ...params, [field.key]: parseInt(e.target.value) })}
                    className="flex-1 accent-purple-500"
                  />
                  <span className="text-white font-bold text-sm min-w-[40px] text-right">{params[field.key]}</span>
                </div>
              )}
              {field.type === 'select' && (
                <select
                  value={params[field.key]}
                  onChange={e => setParams({ ...params, [field.key]: e.target.value })}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-xs focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                >
                  {field.options.map(opt => (
                    <option key={opt.value} value={opt.value} className="bg-[#0f1d38]">{opt.label}</option>
                  ))}
                </select>
              )}
              {field.type === 'toggle' && (
                <button
                  onClick={() => setParams({ ...params, [field.key]: !params[field.key] })}
                  className={`relative w-11 h-6 rounded-full transition ${params[field.key] ? 'bg-emerald-500' : 'bg-white/15'}`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${params[field.key] ? 'right-0.5' : 'left-0.5'}`} />
                </button>
              )}
              {field.help && (
                <p className="text-[10px] text-white/40 mt-1">{field.help}</p>
              )}
            </div>
          ))}
        </div>

        {busy && (
          <div className="px-5 pb-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/25 text-purple-200 text-[11px]">
              <div className="w-3 h-3 rounded-full border-2 border-purple-300/30 border-t-purple-300 animate-spin" />
              <span>{en ? 'Action in progress… Jade is processing the conversations, this usually takes 5-30s' : 'Action en cours… Jade traite les conversations, ça prend généralement 5-30s'}</span>
            </div>
          </div>
        )}
        <div className="p-5 border-t border-white/10 flex items-center gap-2">
          <button
            onClick={() => onClose()}
            disabled={busy}
            className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 text-xs font-semibold transition disabled:opacity-50"
          >
            {en ? 'Cancel' : 'Annuler'}
          </button>
          <button
            onClick={confirm}
            disabled={busy}
            className={`flex-1 py-2.5 rounded-xl text-white text-xs font-bold transition disabled:opacity-50 flex items-center justify-center gap-2 ${config.classes.includes('emerald') ? 'bg-emerald-600 hover:bg-emerald-500' : config.classes.includes('pink') ? 'bg-pink-600 hover:bg-pink-500' : config.classes.includes('cyan') ? 'bg-cyan-600 hover:bg-cyan-500' : config.classes.includes('blue') ? 'bg-blue-600 hover:bg-blue-500' : 'bg-purple-600 hover:bg-purple-500'}`}
          >
            {busy ? (
              <>
                <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                <span>{en ? 'Launching…' : 'Lancement en cours…'}</span>
              </>
            ) : (
              <span>{en ? 'Confirm and launch' : 'Confirmer et lancer'}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function JadeCampaignActions({ p }: { p: any }) {
  const { locale } = useLanguage();
  const en = locale === 'en';
  const [activeAction, setActiveAction] = useState<ActionConfig | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const handleClose = useCallback((result?: { kind: 'ok' | 'err'; text: string }) => {
    setActiveAction(null);
    if (result) {
      setToast(result);
      setTimeout(() => setToast(null), 4500);
    }
  }, []);

  const actions: ActionConfig[] = [
    {
      key: 'prepare',
      label: p.dmCampaignPrepare,
      desc: p.dmCampaignPrepareDesc,
      icon: '\u{1F4AC}',
      classes: 'bg-pink-500/10 border-pink-500/20 hover:bg-pink-500/20 text-pink-400',
      confirmTitle: en ? 'Prepare a wave of DMs' : 'Préparer une vague de DMs',
      confirmIntro: en ? 'Jade will select qualified prospects and prepare a personalized DM draft for each. You can review them before sending.' : 'Jade va sélectionner des prospects qualifiés et préparer un draft de DM personnalisé pour chacun. Tu pourras les relire avant l\'envoi.',
      fields: [
        { key: 'count', label: en ? 'Number of DMs to prepare' : 'Nombre de DMs à préparer', type: 'number', default: 20, min: 5, max: 50, help: en ? 'Max 50 to avoid the Meta rate-limit.' : 'Max 50 pour éviter le rate-limit Meta.' },
        { key: 'slot', label: en ? 'Prospect bucket' : 'Bucket de prospects', type: 'select', default: 'morning', options: [
          { value: 'morning', label: en ? 'Morning prospects (hot leads)' : 'Prospects du matin (hot leads)' },
          { value: 'afternoon', label: en ? 'Afternoon prospects (qualified)' : 'Prospects de l\'après-midi (qualified)' },
          { value: 'evening', label: en ? 'Evening prospects (warm)' : 'Prospects du soir (warm)' },
        ]},
        { key: 'tone', label: en ? 'Message tone' : 'Ton du message', type: 'select', default: 'founder', options: [
          { value: 'founder', label: en ? 'Founder voice — Victor casual' : 'Founder voice — Victor décontracté' },
          { value: 'pro', label: en ? 'Pro — courteous and structured' : 'Pro — courtois et structuré' },
          { value: 'playful', label: en ? 'Playful — fun, emoji friendly' : 'Playful — fun, emoji friendly' },
        ]},
        // 2026-06-04 — Founder ask : "quand on clique sur prepare dm
        // met la fonction avec image". Toggle qui demande à Jade de
        // générer un visuel personnalisé pour CHAQUE prospect (pas
        // juste les top 10 du batch auto).
        { key: 'with_image', label: en ? '📸 Attach a personalized visual per prospect (recommended)' : '📸 Joindre un visuel personnalisé par prospect (recommandé)', type: 'toggle', default: true, help: en ? 'Jade scrapes the Insta profile + generates a documentary image matching the prospect\'s sector. Cost: +€0.03 per visual.' : 'Jade scrape le profil Insta + génère une image documentaire matchant le secteur du prospect. Coût : +€0.03 par visuel.' },
      ],
      run: async (params) => {
        const qs = new URLSearchParams({
          slot: String(params.slot),
          count: String(params.count),
          tone: String(params.tone),
          ...(params.with_image ? { with_image: '1' } : {}),
        });
        const r = await fetch(`/api/agents/dm-instagram?${qs.toString()}`, { method: 'POST', credentials: 'include' });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return { kind: 'err' as const, text: j.error || (en ? 'Preparation failed' : 'Préparation échouée') };
        const prepared = j?.prepared ?? j?.queued ?? params.count;
        const imgPart = params.with_image ? (en ? ' (with personalized visual)' : ' (avec visuel personnalisé)') : '';
        return { kind: 'ok' as const, text: en ? `${prepared} DMs prepared${imgPart}. Go review them in the DMs tab.` : `${prepared} DMs préparés${imgPart}. Va les relire dans l'onglet DMs.` };
      },
    },
    {
      key: 'follow',
      label: p.dmCampaignFollow,
      desc: p.dmCampaignFollowDesc,
      icon: '\u{1F465}',
      classes: 'bg-cyan-500/10 border-cyan-500/20 hover:bg-cyan-500/20 text-cyan-400',
      confirmTitle: en ? 'Follow warm-up — prepare your list' : 'Follow warm-up — préparer ta liste',
      confirmIntro: en ? 'Meta does NOT allow programmatic follows for Business accounts. Jade checks each handle, scores the account (bio + last 3 posts), and gives you a list of candidates to follow manually in the "To follow" tab. You tap Follow on Instagram → you check ✓ here → Jade knows when to DM.' : 'Meta n\'autorise PAS le follow programmatique pour les comptes Business. Jade vérifie chaque handle, score le compte (bio + 3 derniers posts), et te met une liste de candidats à follow manuellement dans l\'onglet "À suivre". Tu tapes Follow sur Instagram → tu coches ✓ ici → Jade sait quand DM.',
      fields: [
        { key: 'count', label: en ? 'Number of candidates to prepare' : 'Nombre de candidats à préparer', type: 'number', default: 10, min: 3, max: 25, help: en ? 'How many prospects Jade analyzes for your manual follow list. Meta flags beyond 20-25 effective follows/day — stay safe.' : 'Combien de prospects Jade analyse pour ta liste de follow manuelle. Meta flag au-delà de 20-25 follows/jour effectifs — reste safe.' },
        { key: 'filter', label: en ? 'Filter prospects' : 'Filtrer les prospects', type: 'select', default: 'hot', options: [
          { value: 'hot', label: en ? 'Hot prospects only (score ≥ 70)' : 'Hot prospects uniquement (score ≥ 70)' },
          { value: 'warm', label: en ? 'Warm prospects (score 40-70)' : 'Warm prospects (score 40-70)' },
          { value: 'all', label: en ? 'All qualified prospects' : 'Tous les prospects qualifiés' },
        ]},
      ],
      run: async (params) => {
        const r = await fetch(`/api/agents/dm-instagram/follow-prospects?count=${params.count}&filter=${params.filter}`, { method: 'POST', credentials: 'include' });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return { kind: 'err' as const, text: j.error || (en ? 'Follow failed' : 'Échec du follow') };
        const queued = j.queued_for_manual_follow ?? j.followed ?? 0;
        const skipped = j.skipped ?? 0;
        const candidates = j.candidates ?? queued + skipped;
        if (queued === 0 && skipped === 0 && candidates === 0) {
          return { kind: 'ok' as const, text: j.message || (en ? 'Pipeline already warm — no candidates to prepare. Run Léo if you want new prospects.' : 'Pipeline déjà chaud — aucun candidat à préparer. Lance Léo si tu veux de nouveaux prospects.') };
        }
        return { kind: 'ok' as const, text: en ? `✓ ${queued} candidates prepared (out of ${candidates} analyzed, ${skipped} skipped). Open the "To follow" tab to follow them manually on Instagram.` : `✓ ${queued} candidats préparés (sur ${candidates} analysés, ${skipped} ignorés). Ouvre l\'onglet "À suivre" pour les follow manuellement sur Instagram.` };
      },
    },
    {
      key: 'send_queued',
      label: en ? 'Send queued DMs' : 'Send queued DMs',
      desc: en ? 'Send the prepared DMs in queue' : 'Envoie les DMs préparés en file',
      icon: '\u{1F4E4}',
      classes: 'bg-purple-500/10 border-purple-500/20 hover:bg-purple-500/20 text-purple-400',
      confirmTitle: en ? 'Send queued DMs' : 'Envoyer les DMs en file',
      confirmIntro: en ? 'Jade will send the prepared DMs to prospects via Graph API (instagram_business_manage_messages). Each send is logged in /meta-audit.' : 'Jade va envoyer les DMs préparés vers les prospects via Graph API (instagram_business_manage_messages). Chaque envoi est tracé dans /meta-audit.',
      fields: [
        { key: 'count', label: en ? 'How many to send in this wave' : 'Combien envoyer dans cette vague', type: 'number', default: 10, min: 1, max: 30, help: en ? 'Tip: 10-15 per wave with a 1h pause between waves to stay natural.' : 'Conseil : 10-15 par vague avec pause de 1h entre vagues pour rester naturel.' },
        { key: 'pace', label: en ? 'Delay between DMs' : 'Délai entre DMs', type: 'select', default: 'human', options: [
          { value: 'human', label: en ? 'Human — 30 to 90 sec between DMs' : 'Humain — 30 à 90 sec entre DMs' },
          { value: 'fast', label: en ? 'Fast — 5 to 15 sec (less safe)' : 'Rapide — 5 à 15 sec (moins safe)' },
        ]},
      ],
      run: async (params) => {
        const r = await fetch(`/api/agents/dm-instagram/send-queue?count=${params.count}&pace=${params.pace}`, { method: 'POST', credentials: 'include' });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return { kind: 'err' as const, text: j.error || (en ? 'Queue send failed' : 'Envoi de la file échoué') };
        const sent = j?.sent ?? j?.delivered ?? null;
        return { kind: 'ok' as const, text: sent !== null ? (en ? `${sent} DMs sent from the queue.` : `${sent} DMs envoyés depuis la file.`) : (en ? 'Queue being processed — check again in 1 min.' : 'File en cours de traitement — revérifie dans 1 min.') };
      },
    },
    {
      key: 'comments',
      label: p.dmCampaignComments,
      desc: p.dmCampaignCommentsDesc,
      icon: '\u{1F4DD}',
      classes: 'bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20 text-blue-400',
      confirmTitle: en ? 'Generate community comments' : 'Générer des commentaires communauté',
      confirmIntro: en ? 'Jade will generate authentic comments to engage prospects on their recent posts. Each draft is reviewed before publishing.' : 'Jade va générer des commentaires authentiques pour engager des prospects sur leurs posts récents. Chaque draft est review avant publication.',
      fields: [
        { key: 'count', label: en ? 'Number of comments to generate' : 'Nombre de commentaires à générer', type: 'number', default: 8, min: 3, max: 25 },
        { key: 'tone', label: en ? 'Comments tone' : 'Ton des commentaires', type: 'select', default: 'warm', options: [
          { value: 'warm', label: en ? 'Warm — close, encouraging' : 'Chaleureux — proche, encourageant' },
          { value: 'pro', label: en ? 'Pro — observant, expert' : 'Pro — observateur, expert' },
          { value: 'playful', label: en ? 'Fun — light, complicit' : 'Fun — léger, complice' },
        ]},
      ],
      run: async (params) => {
        const r = await fetch(`/api/agents/content?slot=community&count=${params.count}&tone=${params.tone}`, { method: 'GET', credentials: 'include' });
        if (!r.ok) return { kind: 'err' as const, text: en ? 'Comment generation failed' : 'Génération commentaires échouée' };
        return { kind: 'ok' as const, text: en ? `${params.count} comments being generated — available in the Comments tab in ~30 sec.` : `${params.count} commentaires en cours de génération — disponibles dans l'onglet Comments dans ~30 sec.` };
      },
    },
    {
      key: 'autoreply',
      label: p.dmCampaignAutoReply,
      desc: p.dmCampaignAutoReplyDesc,
      icon: '\u{1F504}',
      classes: 'bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400',
      confirmTitle: en ? 'Auto-reply to incoming DMs' : 'Auto-réponse aux DMs entrants',
      confirmIntro: en ? 'Jade will generate a drafted reply for each unanswered incoming DM. You validate each reply before it goes out (strict human-in-the-loop).' : 'Jade va générer une réponse drafted pour chaque DM entrant non répondu. Tu valides chaque réponse avant qu\'elle parte (Human-in-the-loop strict).',
      fields: [
        { key: 'style', label: en ? 'Reply style' : 'Style de réponse', type: 'select', default: 'warm', options: [
          { value: 'warm', label: en ? 'Warm — Victor casual' : 'Chaleureux — Victor décontracté' },
          { value: 'concise', label: en ? 'Concise — straight to the point' : 'Concis — direct au but' },
          { value: 'detailed', label: en ? 'Detailed — qualification questions' : 'Détaillé — questions de qualification' },
        ]},
        // Founder ask 2026-06-02: removed dead "autosend formules simples" toggle
        // (was never used server-side). Kept the on-demand initiator: when DM
        // agent is "AI actif", Jade répond à TOUS les DMs auto. Ce bouton sert
        // juste à kicker un cycle de poll immédiat sans attendre le cron 10 min.
        { key: 'force_now', label: en ? 'Run an immediate poll cycle (without waiting for the 10 min cron)' : 'Lancer un cycle de poll immédiat (sans attendre les 10 min du cron)', type: 'toggle', default: true, help: en ? 'Without checking, the poll runs every 10 min in the background. Check to kick it now.' : 'Sans cocher, le poll se fait toutes les 10 min en arrière-plan. Coche pour kicker maintenant.' },
      ],
      run: async (params) => {
        const r = await fetch(`/api/agents/dm-instagram/auto-reply?style=${params.style}`, { method: 'POST', credentials: 'include' });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return { kind: 'err' as const, text: j.error || (en ? 'Auto-replies failed' : 'Réponses auto échouées') };
        const replied = j.replied ?? 0;
        const skipped = j.skipped ?? 0;
        const total = j.total_conversations ?? 0;
        if (j.skipped_reason === 'ai_off') {
          return { kind: 'err' as const, text: en ? 'Jade AI is paused — re-enable the "AI" toggle at the top of the panel to restart.' : 'AI Jade est en pause — réactive le toggle "AI" en haut du panel pour relancer.' };
        }
        return { kind: 'ok' as const, text: en ? `${replied} reply(ies) sent, ${skipped} already replied, ${total} conversations scanned. Jade auto-replies to all new DMs.` : `${replied} réponse(s) envoyée(s), ${skipped} déjà répondu(s), ${total} conversations scannées. Jade répond à tous les nouveaux DMs en auto.` };
      },
    },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
        {actions.map(a => (
          <button
            key={a.key}
            onClick={() => setActiveAction(a)}
            disabled={activeAction !== null}
            className={`flex flex-col items-center gap-1 p-3 border rounded-xl transition text-center disabled:opacity-50 ${a.classes}`}
          >
            <span className="text-lg">{a.icon}</span>
            <span className="text-[10px] font-bold">{a.label}</span>
            <span className="text-[10px] text-white/30 leading-tight">{a.desc}</span>
          </button>
        ))}
      </div>
      {toast && (
        <div className={`mb-3 px-3 py-2 rounded-lg text-[11px] border ${toast.kind === 'ok' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-rose-500/10 border-rose-500/20 text-rose-300'}`}>
          {toast.kind === 'ok' ? '✓ ' : '⚠ '}{toast.text}
        </div>
      )}
      {activeAction && <ActionConfirmModal config={activeAction} onClose={handleClose} />}
    </div>
  );
}

// JadeHeader — compact identity + Human Agent Protocol in a single card.
// Replaces the previous stack of (InstagramAssetBadge + protocol banner +
// SocialConnectBanners) which was three banners visually competing for
// the same space at the top of the panel.
function JadeHeader({ connected, p }: { connected: boolean; p: any }) {
  const [profile, setProfile] = useState<{ ig?: string; followers?: number; pic?: string; pageName?: string } | null>(null);

  useEffect(() => {
    if (!connected) { setProfile(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const sb = (await import('@/lib/supabase/client')).supabaseBrowser();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return;
        const readProfile = async () => sb.from('profiles')
          .select('instagram_username, instagram_followers_count, instagram_profile_picture_url, facebook_page_name')
          .eq('id', user.id)
          .maybeSingle();
        let { data } = await readProfile();
        // Auto-refresh when the cached follower count is null/0 even
        // though the account is marked connected — same root cause as
        // Léna's NetworkConnectionCard (silent OAuth-callback enrichment
        // failure). One round-trip to /api/instagram/refresh-profile
        // brings real numbers back without the user having to click
        // anything.
        if (!data || data.instagram_followers_count == null || data.instagram_followers_count === 0) {
          try {
            await fetch('/api/instagram/refresh-profile', { method: 'POST', credentials: 'include' });
            const fresh = await readProfile();
            if (!cancelled && fresh.data) data = fresh.data;
          } catch {}
        }
        if (!cancelled) setProfile({
          ig: data?.instagram_username || undefined,
          followers: typeof data?.instagram_followers_count === 'number' ? data.instagram_followers_count : undefined,
          pic: data?.instagram_profile_picture_url || undefined,
          pageName: data?.facebook_page_name || undefined,
        });
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [connected]);

  return (
    <div className="rounded-2xl border border-pink-500/25 bg-gradient-to-br from-pink-500/10 via-purple-500/10 to-transparent p-4 mb-3">
      {/* Row 1 — identity + connect/disconnect */}
      <div className="flex items-center gap-3">
        {connected && profile?.pic ? (
          <img src={profile.pic} alt={profile.ig || 'Instagram'} className="w-11 h-11 rounded-xl object-cover" />
        ) : (
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-lg">
            {'\u{1F4F8}'}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-white truncate">
            {connected && profile?.ig ? `@${profile.ig}` : 'Instagram'}
          </div>
          {connected ? (
            <div className="text-[10px] text-emerald-300 flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Connected</span>
              {typeof profile?.followers === 'number' && <span className="text-white/50">· {fmt(profile.followers)} followers</span>}
              {profile?.pageName && <span className="text-white/40 truncate">· FB {profile.pageName}</span>}
            </div>
          ) : (
            <div className="text-[10px] text-white/40">No Instagram Business account connected</div>
          )}
        </div>
        {!connected ? (
          <a
            href="/api/auth/instagram-oauth"
            className="px-3 py-2 rounded-lg bg-gradient-to-r from-pink-500 to-purple-600 text-white text-[11px] font-bold hover:opacity-90 transition flex-shrink-0"
            title="Standard Meta OAuth flow — select your Page and IG Business account, grant permissions, return here."
          >
            ⚡ Connect
          </a>
        ) : null}
      </div>

      {/* Row 2 — Human Agent Protocol (kept compact) */}
      <div className="mt-3 pt-3 border-t border-white/10 flex items-start gap-2">
        <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">{'\u{1F9D1}'}</div>
        <div className="flex-1">
          <div className="text-[11px] font-semibold text-blue-300">{p.dmHumanProtocolTitle}</div>
          <p className="text-[10px] text-white/50 mt-0.5">
            {p.dmHumanProtocolDesc.split('**').map((seg: string, i: number) => i % 2 ? <strong key={i} className="text-white/70">{seg}</strong> : <span key={i}>{seg}</span>)}
          </p>
        </div>
      </div>
    </div>
  );
}

export function DmInstagramPanel({ data, agentName, gradientFrom, gradientTo }: PanelProps) {
  const { t, locale } = useLanguage();
  const en = locale === 'en';
  const p = t.panels;
  const stats = data.dmStats || {
    dmsSent: 0,
    responses: 0,
    rdvGenerated: 0,
    responseRate: 0,
    prospectsGenerated: 0,
    recentDms: [],
  };

  const statusColors: Record<string, string> = {
    envoye: '#60a5fa',
    repondu: '#34d399',
    rdv: '#e879f9',
    ignore: '#f87171',
  };

  const igConnected = !!(data as any).connections?.instagram;
  const tiktokConnected = !!(data as any).connections?.tiktok;
  const linkedinConnected = !!(data as any).connections?.linkedin;

  // Network state lifted to panel root — switching network swaps the
  // entire experience underneath (KPIs, campaign, queue, tabs) exactly
  // like Léna's ContentPanel.
  const [network, setNetwork] = useState<JadeNetwork>('instagram');
  const networkConnected = network === 'instagram' ? igConnected : network === 'tiktok' ? tiktokConnected : linkedinConnected;
  const networkLabel = network === 'instagram' ? 'Instagram' : network === 'tiktok' ? 'TikTok' : 'LinkedIn';
  const networkOauth = network === 'instagram' ? '/api/auth/instagram-oauth' : network === 'tiktok' ? '/api/auth/tiktok-oauth' : '/api/auth/linkedin-oauth';

  return (
    <>
      {/* Network selector at the very TOP — Léna parity. Jade is no
          longer Instagram-only: switching the network swaps the
          identity card, KPIs, campaign actions, queue and tabs
          underneath. The selector is the FIRST anchor of the panel
          (no Jade header above it) so the network choice frames the
          whole experience. */}
      <JadeNetworkSelector network={network} onChange={setNetwork} />

      {/* Network-aware identity / compliance card. For Instagram we
          keep the full JadeHeader (IG identity + Human Agent Protocol
          line). For TikTok and LinkedIn we show a focused identity
          card with the right connect CTA — no Human Agent line since
          that compliance rule is Instagram-specific. */}
      {network === 'instagram' && (
        <JadeHeader connected={igConnected} p={p} />
      )}
      {network !== 'instagram' && (
        <div className={`rounded-2xl p-4 mb-3 border ${
          networkConnected
            ? 'bg-emerald-500/5 border-emerald-500/20'
            : 'bg-white/[0.03] border-white/10'
        }`}>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-lg" style={{
              background: network === 'tiktok'
                ? 'linear-gradient(135deg, #000, #ff0050)'
                : 'linear-gradient(135deg, #0A66C2, #004182)',
            }}>{network === 'tiktok' ? '\u{1F3B5}' : '\u{1F4BC}'}</div>
            <div className="flex-1 min-w-0">
              <div className="text-white font-bold text-sm">{networkLabel}</div>
              <div className="text-[10px] text-white/50 mt-0.5">
                {networkConnected
                  ? (en ? `${networkLabel} connected — DMs, comments, engagement managed from Jade` : `${networkLabel} connecté — DMs, commentaires, engagement gérés depuis Jade`)
                  : (en ? `Connect ${networkLabel} to activate real data and actions on this network` : `Connecte ${networkLabel} pour activer les vraies données et les actions sur ce réseau`)}
              </div>
            </div>
            {!networkConnected && (
              <a
                href={networkOauth}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold text-white flex-shrink-0 ${
                  network === 'tiktok'
                    ? 'bg-gradient-to-r from-black to-pink-600 hover:opacity-90'
                    : 'bg-gradient-to-r from-blue-600 to-blue-800 hover:opacity-90'
                }`}
              >
                {en ? 'Connect →' : 'Connecter →'}
              </a>
            )}
          </div>
        </div>
      )}

      {/* TT/LI branch: KPIs sample + tabs only (no campaign block —
          Jade campaign actions are wired to the Instagram pipeline). */}
      {network !== 'instagram' && (
        <div>
          <JadeKpiRow network={network} connected={networkConnected} stats={null} />
          <JadeTabs network={network} />
        </div>
      )}

      {network === 'instagram' && (
        <>

      {/* KPI row — network-aware. For IG it pulls live stats from the
          dashboard API; for TT/LI it shows sample numbers labelled. */}
      <JadeKpiRow network="instagram" connected={igConnected} stats={stats} />

      {/* Action buttons — direct quick-actions for Jade (Prepare DMs,
          Follow, Send queued, Comments, Auto-reply). No "Launch
          campaign" title — the buttons are self-explanatory and the
          founder asked to remove the header (cleaner UX, parity with
          Léna's flat-grid action style). */}
      <JadeCampaignActions p={p} />

      {/* DM funnel (prospects → conversion) moved to /assistant/crm where
          the conversion view belongs. The Jade panel keeps only the live
          stats that matter for daily action: KPIs at the top, pending
          DMs queue, conversations + comments below. */}
      {/* Removed redundant Queue + engagement grid (duplicate of KPIs/funnel)
          and the standalone CRM button (kept inline below if there's activity). */}
      {(((stats as any).likesGiven || 0) > 0) && (
        <div className="flex items-center gap-2 mb-3 text-[11px]">
          <span className="px-2.5 py-1 rounded-full bg-pink-500/10 border border-pink-500/20 text-pink-300 font-medium flex items-center gap-1.5">
            <span>❤️</span> {fmt((stats as any).likesGiven || 0)} {p.dmStatLikes}
          </span>
          <a href="/assistant/crm" className="ml-auto text-white/40 hover:text-white text-[11px]">
            📊 CRM →
          </a>
        </div>
      )}

      {/* Pending notifications for this agent — "Reprends la main" */}
      <AgentNotifications agentId="dm_instagram" />

      {/* Hot prospects */}
      {/* HotProspectsAlert removed */}

      {/* Les DM de prospection en attente sont désormais organisés dans l'onglet
          "DM de prospection" de JadeTabs (founder 12/07) — plus de bloc dupliqué ici. */}

      {/* DMs / Comments / Follows switch — Instagram live data */}
      <JadeTabs network="instagram" />
        </>
      )}
    </>
  );
}