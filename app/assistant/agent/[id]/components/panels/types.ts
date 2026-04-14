/**
 * Shared types for agent dashboard panels.
 *
 * Panels extracted from AgentDashboard.tsx import AgentDashboardData from here
 * rather than dragging the full AgentDashboard component back into their
 * bundles (which would recreate the circular dependency we're trying to avoid).
 */

export interface AgentDashboardData {
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
  rhStats?: {
    docsGenerated: number;
    questionsAnswered: number;
    activeContracts: number;
    recentDocs: Array<{ type: string; title: string; created_at: string }>;
  };
  onboardingStats?: {
    currentStep: number;
    totalSteps: number;
    completionPercent: number;
    agentsActivated: number;
    totalAgents: number;
    steps: Array<{ name: string; completed: boolean }>;
  };
  dmStats?: {
    dmsSent: number;
    responses: number;
    responseRate: number;
    rdvGenerated: number;
    recentDms: Array<{ target: string; status: string; date: string }>;
  };
  tiktokStats?: {
    commentsPosted: number;
    newFollowers: number;
    views: number;
    engagementRate: number;
    recentActions: Array<{ action: string; target: string; date: string }>;
  };
  gmapsStats?: {
    reviewsAnswered: number;
    googleRating: number;
    totalReviews: number;
    gmbClicks: number;
    recentReviews: Array<{ author: string; rating: number; text: string; date: string; replied: boolean }>;
  };
  chatbotStats?: {
    visitorsGreeted: number;
    leadsCaptured: number;
    conversionRate: number;
    recentSessions: Array<{ visitor: string; outcome: string; date: string }>;
  };
  whatsappStats?: {
    messagesSent: number;
    messagesReceived: number;
    responseRate: number;
    leadsGenerated: number;
    conversationsActive: number;
    recentConversations: Array<{ contact: string; lastMessage: string; status: string; date: string }>;
  };
  globalStats?: {
    commercial: Record<string, any>;
    visibility: Record<string, any>;
    instagram?: Record<string, any>;
    finance: Record<string, any>;
    teamActivity?: Array<{ agent: string; action: string; date?: string; created_at?: string }>;
    recentTeamActivity?: Array<{ agent: string; action: string; date: string }>;
    recommendation: string;
  };
}

export interface PanelProps {
  data: AgentDashboardData;
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
}
