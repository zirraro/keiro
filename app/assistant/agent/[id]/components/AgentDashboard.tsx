'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import PreviewBanner from './PreviewBanner';
import PostPreview from './PostPreview';
import PostPreviewModal from './PostPreviewModal';
import { DEMO_DM_CONVERSATIONS, DEMO_EMAILS, DEMO_CONTENT_POSTS, DEMO_REVIEWS, DEMO_COMMENTS, DEMO_ADS_STATS, DEMO_FINANCE_STATS, DEMO_RH_STATS, DEMO_CHATBOT_STATS, DEMO_WHATSAPP_STATS, DEMO_TIKTOK_STATS, DEMO_IG_COMMENTS } from './AgentPreviewData';
import {
  fmt, fmtCurrency, fmtPercent, fmtDate,
  KpiCard, SectionTitle, EmptyState, ActionButton,
  DonutChart, ProgressBar, ActivityFeed, CircularProgress,
} from './panels/Primitives';
import { AutoModeToggle, NetworkAutoModeToggles } from './panels/AutoModeToggle';
import { GmapsPanel } from './panels/GmapsPanel';
import { SeoPanel } from './panels/SeoPanel';
import { AdsPanel } from './panels/AdsPanel';
import { FinancePanel } from './panels/FinancePanel';
import { RhPanel } from './panels/RhPanel';
import { ChatbotPanel } from './panels/ChatbotPanel';
import { GenericPanel } from './panels/GenericPanel';
import { WhatsAppPanel } from './panels/WhatsAppPanel';
import { InstagramCommentsPanel } from './panels/InstagramCommentsPanel';
import { CommercialPanel } from './panels/CommercialPanel';
import { CeoPanel } from './panels/CeoPanel';
import { SocialConnectBanners, EmailConnectBanner, HotProspectsAlert, AgentNotifications } from './panels/SharedBanners';
import { MarketingPanel } from './panels/MarketingPanel';
import { TiktokCommentsPanel } from './panels/TiktokCommentsPanel';
import { OnboardingPanel } from './panels/OnboardingPanel';
import { ContentPanel } from './panels/ContentPanel';
import { DmInstagramPanel } from './panels/DmInstagramPanel';
import { EmailPanel } from './panels/EmailPanel';

// SOCIAL_NETWORKS + SocialConnectBanners + EmailConnectBanner + HotProspectsAlert → extracted to panels/SharedBanners.tsx



interface AgentDashboardProps {
  agentId: string;
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
  data: {
    recentChats?: number;
    totalMessages?: number;
    recommendations?: Array<{ action: string; data: any; created_at: string }>;
    emailStats?: {
      sent: number;
      opened: number;
      clicked: number;
      openRate: number;
      clickRate: number;
      sequences: Record<string, number>;
    };
    contentStats?: {
      postsGenerated: number;
      scheduledPosts: number;
      recentContent: Array<{ type: string; title: string; created_at: string }>;
    };
    seoStats?: {
      blogPosts: number;
      keywordsTracked: number;
      recentActions: Array<{ action: string; data: any; created_at: string }>;
    };
    adsStats?: {
      campaigns: number;
      totalSpend: number;
      avgRoas: number;
      recentCampaigns: Array<{ name: string; spend: number; roas: number; status: string }>;
    };
    financeStats?: {
      revenue: number;
      expenses: number;
      margin: number;
      recentTransactions: Array<{ description: string; amount: number; type: string; date: string }>;
    };
    // Sara (rh)
    rhStats?: {
      docsGenerated: number;
      questionsAnswered: number;
      activeContracts: number;
      recentDocs: Array<{ type: string; title: string; created_at: string }>;
    };
    // Clara (onboarding)
    onboardingStats?: {
      currentStep: number;
      totalSteps: number;
      completionPercent: number;
      agentsActivated: number;
      totalAgents: number;
      steps: Array<{ name: string; completed: boolean }>;
    };
    // Jade (dm_instagram)
    dmStats?: {
      dmsSent: number;
      responses: number;
      responseRate: number;
      rdvGenerated: number;
      recentDms: Array<{ target: string; status: string; date: string }>;
    };
    // Axel (tiktok_comments)
    tiktokStats?: {
      commentsPosted: number;
      newFollowers: number;
      views: number;
      engagementRate: number;
      recentActions: Array<{ action: string; target: string; date: string }>;
    };
    // Theo (gmaps)
    gmapsStats?: {
      reviewsAnswered: number;
      googleRating: number;
      totalReviews: number;
      gmbClicks: number;
      recentReviews: Array<{ author: string; rating: number; text: string; date: string; replied: boolean }>;
    };
    // Max (chatbot)
    chatbotStats?: {
      visitorsGreeted: number;
      leadsCaptured: number;
      conversionRate: number;
      recentSessions: Array<{ visitor: string; outcome: string; date: string }>;
    };
    // Stella (whatsapp)
    whatsappStats?: {
      messagesSent: number;
      messagesReceived: number;
      responseRate: number;
      leadsGenerated: number;
      conversationsActive: number;
      recentConversations: Array<{ contact: string; lastMessage: string; status: string; date: string }>;
    };
    // Ami global dashboard
    globalStats?: {
      commercial: Record<string, any>;
      visibility: Record<string, any>;
      instagram?: Record<string, any>;
      finance: Record<string, any>;
      teamActivity?: Array<{ agent: string; action: string; date?: string; created_at?: string }>;
      recentTeamActivity?: Array<{ agent: string; action: string; date: string }>;
      recommendation: string;
    };
  };
}

// TiktokCommentsPanel → extracted to panels/TiktokCommentsPanel.tsx
// CommercialPanel + LaunchProspectionButton + CeoPanel → extracted to panels/*.tsx
// GenericPanel → extracted to panels/*.tsx
// WhatsAppPanel → extracted to panels/*.tsx
// InstagramCommentsPanel → extracted to panels/*.tsx

/* ------------------------------------------------------------------ */
/*  Mapping agentId -> panel + subtitle                                */
/* ------------------------------------------------------------------ */

const AGENT_CONFIG: Record<string, { subtitle: string; Panel: typeof MarketingPanel }> = {
  marketing: { subtitle: 'Dashboard Global', Panel: MarketingPanel },
  email: { subtitle: 'Performance Email', Panel: EmailPanel },
  content: { subtitle: 'Publications & Contenu', Panel: ContentPanel },
  seo: { subtitle: 'Visibilite & SEO', Panel: SeoPanel },
  ads: { subtitle: 'Publicite & ROAS', Panel: AdsPanel },
  finance: { subtitle: 'Finance & Tresorerie', Panel: FinancePanel },
  rh: { subtitle: 'Expert Juridique & RH', Panel: RhPanel },
  onboarding: { subtitle: 'Guide de Demarrage', Panel: OnboardingPanel },
  dm_instagram: { subtitle: 'DM & Commentaires Instagram', Panel: DmInstagramPanel },
  instagram_comments: { subtitle: 'Commentaires Instagram', Panel: InstagramCommentsPanel },
  tiktok_comments: { subtitle: 'Expert TikTok Engagement', Panel: TiktokCommentsPanel },
  gmaps: { subtitle: 'Reputation & Avis Clients', Panel: GmapsPanel },
  chatbot: { subtitle: 'Chatbot Site Web', Panel: ChatbotPanel },
  whatsapp: { subtitle: 'WhatsApp Business', Panel: WhatsAppPanel },
  commercial: { subtitle: 'Prospection & Pipeline', Panel: CommercialPanel },
  comptable: { subtitle: 'Finance & Tresorerie', Panel: FinancePanel },
  ceo: { subtitle: 'Vision Strategique', Panel: CeoPanel },
  linkedin: { subtitle: 'LinkedIn & Reseau Pro', Panel: GenericPanel },
};

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

// Admin supervision names
const ADMIN_NAMES: Record<string, { name: string; subtitle: string }> = {
  marketing: { name: 'AMI Strategie Marketing Group', subtitle: 'Supervision Marketing — Tous clients' },
  email: { name: 'Hugo Email Group', subtitle: 'Supervision Email — Tous clients' },
  content: { name: 'Lena Contenu Group', subtitle: 'Supervision Contenu — Tous clients' },
  dm_instagram: { name: 'Jade DM Group', subtitle: 'Supervision DM Instagram — Tous clients' },
  commercial: { name: 'Leo Commercial Group', subtitle: 'Supervision Prospection — Tous clients' },
  seo: { name: 'Oscar SEO Group', subtitle: 'Supervision SEO — Tous clients' },
  ads: { name: 'Felix Ads Group', subtitle: 'Supervision Publicite — Tous clients' },
  gmaps: { name: 'Theo Avis Group', subtitle: 'Supervision Avis Google — Tous clients' },
  chatbot: { name: 'Max Chatbot Group', subtitle: 'Supervision Chatbot — Tous clients' },
  whatsapp: { name: 'Stella WhatsApp Group', subtitle: 'Supervision WhatsApp — Tous clients' },
  onboarding: { name: 'Clara Onboarding Group', subtitle: 'Supervision Onboarding — Tous clients' },
  tiktok_comments: { name: 'Axel TikTok Group', subtitle: 'Supervision TikTok — Tous clients' },
  instagram_comments: { name: 'Commentaires IG Group', subtitle: 'Supervision Commentaires — Tous clients' },
  linkedin: { name: 'Emma LinkedIn Group', subtitle: 'Supervision LinkedIn — Tous clients' },
  rh: { name: 'Sara RH Group', subtitle: 'Supervision Juridique — Tous clients' },
  finance: { name: 'Louis Finance Group', subtitle: 'Supervision Finance — Tous clients' },
};

// AgentNotifications → extracted to panels/SharedBanners.tsx

// ─── Agent Activity Indicator ─────────────────────────────────
const AGENT_ACTIVITY_LABELS: Record<string, Record<string, string>> = {
  email: { email_sent: 'envoie des emails', daily_cold: 'envoie une campagne email', warm_send: 'envoie des relances' },
  content: { daily_post_generated: 'cree du contenu', execute_publication: 'publie un post', generate_week: 'genere la semaine' },
  commercial: { prospect_scraped: 'prospecte', gmaps_scrape: 'recherche sur Google Maps', linkedin_scrape: 'prospecte sur LinkedIn' },
  seo: { blog_generated: 'redige un article SEO', seo_audit: 'analyse le SEO' },
  dm: { dm_sent: 'envoie des DMs', dm_reply: 'repond aux DMs' },
  instagram_comments: { comment_posted: 'commente sur Instagram' },
  marketing: { recommend: 'analyse la strategie' },
};

function AgentActivityBanner({ agentId, data, gradientFrom }: { agentId: string; data: any; gradientFrom: string }) {
  const logs = data?.recentLogs || data?.logs || [];
  if (!logs.length) return null;

  // Check if there's a recent action (< 5 min ago)
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const recentLog = logs.find((l: any) => new Date(l.created_at).getTime() > fiveMinAgo);

  // Also show last completed action (< 1h)
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const lastLog = logs.find((l: any) => new Date(l.created_at).getTime() > oneHourAgo);

  if (!recentLog && !lastLog) return null;

  const activeLog = recentLog || lastLog;
  const isActive = !!recentLog;
  const agentLabels = AGENT_ACTIVITY_LABELS[agentId] || {};
  const actionLabel = agentLabels[activeLog.action] || activeLog.action?.replace(/_/g, ' ') || 'travaille';
  const agentDisplayName = agentId === 'email' ? 'Hugo' : agentId === 'content' ? 'Lena' : agentId === 'commercial' ? 'Leo' : agentId === 'seo' ? 'Tom' : agentId === 'dm' ? 'Jade' : agentId === 'marketing' ? 'AMI' : agentId;
  const timeAgo = Math.round((Date.now() - new Date(activeLog.created_at).getTime()) / 60000);

  return (
    <div className={`mx-5 mt-2 flex items-center gap-2 px-3 py-2 rounded-lg border ${isActive ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-white/[0.03] border-white/10'}`}>
      {isActive ? (
        <div className="animate-pulse flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span className="text-xs font-medium text-emerald-400">{agentDisplayName} {actionLabel}...</span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-white/30" />
          <span className="text-xs text-white/50">{agentDisplayName} a {actionLabel}</span>
          <span className="text-[10px] text-white/30">il y a {timeAgo < 1 ? '< 1' : timeAgo} min</span>
        </div>
      )}
    </div>
  );
}

export default function AgentDashboard({ agentId, agentName, gradientFrom, gradientTo, data }: AgentDashboardProps) {
  // Set global connection flags for child components
  if (typeof window !== 'undefined') {
    (window as any).__igConnected = !!(data as any).connections?.instagram;
    (window as any).__ttConnected = !!(data as any).connections?.tiktok;
    (window as any).__liConnected = !!(data as any).connections?.linkedin;
    (window as any).__gmailConnected = !!(data as any).connections?.gmail;
  }
  const config = AGENT_CONFIG[agentId];
  const isAdmin = !!(data as any).supervision?.isAdmin;
  const adminOverride = isAdmin ? ADMIN_NAMES[agentId] : null;
  const displayName = adminOverride?.name || agentName;
  const subtitle = adminOverride?.subtitle || config?.subtitle || 'Tableau de bord';
  const Panel = config?.Panel ?? GenericPanel;

  return (
    <div className="overflow-y-auto w-full">
      {/* Agent identity band */}
      <div className="rounded-t-2xl px-5 py-4 mb-0" style={{ background: `linear-gradient(135deg, ${gradientFrom}25, ${gradientTo}15)`, borderBottom: `2px solid ${gradientFrom}40` }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">{displayName}</h2>
            <p className="text-sm font-medium" style={{ color: gradientFrom }}>{subtitle}</p>
          </div>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${gradientFrom}30, ${gradientTo}30)` }}>
            <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: gradientFrom }} />
          </div>
        </div>
      </div>

      {/* Agent activity indicator */}
      <AgentActivityBanner agentId={agentId} data={data} gradientFrom={gradientFrom} />

      {/* Launch campaign button — all agents */}
      {!isAdmin && agentId !== 'onboarding' && agentId !== 'ceo' && agentId !== 'qa' && agentId !== 'content' && (
        <div data-tour="launch-campaign" className="mx-5 mt-3 flex items-center gap-2">
          <button
            onClick={() => { try { (window as any).__openCampaignWizard?.(); } catch {} }}
            className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-bold rounded-xl hover:shadow-lg hover:shadow-emerald-500/20 transition-all min-h-[44px] flex items-center gap-2"
          >
            <span>{'\u26A1'}</span> Lancer une campagne
          </button>
          <span className="text-[9px] text-white/25">Configure et active en 30 secondes</span>
        </div>
      )}

      {/* Admin supervision panel — cross-client view */}
      {(data as any).supervision?.isAdmin && (
        <div className="mx-5 mt-3 rounded-xl border border-indigo-500/20 bg-indigo-900/10 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm">{'\u{1F6E1}\uFE0F'}</span>
            <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-wider">Supervision cross-clients</h3>
            <span className="ml-auto text-[10px] text-indigo-400/50">24h</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
            <div className="bg-indigo-900/20 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-white">{(data as any).supervision.totalActions24h}</div>
              <div className="text-[9px] text-indigo-300/60">Actions</div>
            </div>
            <div className="bg-indigo-900/20 rounded-lg p-2 text-center">
              <div className={`text-lg font-bold ${(data as any).supervision.totalErrors24h > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {(data as any).supervision.totalErrors24h}
              </div>
              <div className="text-[9px] text-indigo-300/60">Erreurs</div>
            </div>
            <div className="bg-indigo-900/20 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-white">{(data as any).supervision.clients?.length || 0}</div>
              <div className="text-[9px] text-indigo-300/60">Clients</div>
            </div>
          </div>
          {(data as any).supervision.clients?.length > 0 && (
            <div className="space-y-1">
              {(data as any).supervision.clients.map((c: any) => (
                <div key={c.user_id} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${c.errors > 0 ? 'bg-red-400' : 'bg-emerald-400'}`} />
                    <span className="text-xs text-white/70">{c.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-white/40">{c.actions} actions</span>
                    {c.errors > 0 && <span className="text-[10px] text-red-400 font-bold">{c.errors} err</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Preview banner for agents that need setup — Clara guides */}
      {!(data as any)[Object.keys(data).find(k => k.endsWith('Stats')) || ''] && !['marketing', 'onboarding', 'dm_instagram', 'email', 'content', 'gmaps', 'instagram_comments'].includes(agentId) && !(data as any).supervision?.isAdmin && !(data as any).connections?.instagram && (
        <div className="px-5 pt-3">
          {(() => {
            const previews: Record<string, { label: string; url: string; msg: string }> = {
              seo: { label: 'Renseigner ton site web', url: '#', msg: 'Voici un apercu de ce qu\'Oscar peut faire pour ton SEO. Renseigne ton site web et il analysera tout automatiquement.' },
              ads: { label: 'Connecter Meta Ads', url: '#', msg: 'Voici un apercu de Felix en action. Connecte tes comptes pub et il optimisera ton ROAS automatiquement.' },
              finance: { label: 'Activer le suivi', url: '#', msg: 'Voici un apercu du suivi financier par Louis. Le suivi est actif automatiquement avec ton abonnement.' },
              rh: { label: 'Activer Sara', url: '#', msg: 'Voici un apercu des documents que Sara peut generer : contrats, CGV, RGPD. Active-la pour commencer.' },
              chatbot: { label: 'Installer Max sur ton site', url: '#', msg: 'Voici un apercu des conversations que Max aura avec tes visiteurs. Installe le widget sur ton site pour demarrer.' },
              whatsapp: { label: 'Configurer WhatsApp', url: '#', msg: 'Voici un apercu de Stella en action. Configure ton numero WhatsApp pour activer les réponses automatiques.' },
              tiktok_comments: { label: 'Connecter TikTok', url: '/api/auth/tiktok-oauth', msg: 'Voici un apercu de l\'engagement TikTok par Axel. Connecte TikTok pour activer.' },
              instagram_comments: { label: 'Connecter Instagram', url: '/api/auth/instagram-oauth', msg: 'Voici un apercu des réponses automatiques a tes commentaires Instagram.' },
            };
            const cfg = previews[agentId];
            if (!cfg) return null;
            return <PreviewBanner agentName={agentName} connectLabel={cfg.label} connectUrl={cfg.url} claraMessage={cfg.msg} gradientFrom={gradientFrom} gradientTo={gradientTo} />;
          })()}
        </div>
      )}

      {/* Dashboard content — compact, no scroll needed */}
      <div data-tour="agent-dashboard" className="p-3 sm:p-4">
        <Panel data={data} agentName={agentName} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>
    </div>
  );
}
