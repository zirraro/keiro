'use client';

import type { ClientAgent } from '@/lib/agents/client-context';

interface AgentTeamPack {
  name: string;
  planLabel: string;
  price: string;
  agentIds: string[];
  gradientFrom: string;
  gradientTo: string;
  minPlan: string;
}

const TEAM_PACKS: AgentTeamPack[] = [
  {
    name: 'Pack Starter',
    planLabel: 'Gratuit',
    price: '0 EUR',
    agentIds: ['marketing', 'onboarding'],
    gradientFrom: '#10b981',
    gradientTo: '#059669',
    minPlan: 'gratuit',
  },
  {
    name: 'Pack Pro',
    planLabel: 'Solo',
    price: '49 EUR/mois',
    agentIds: ['content', 'seo', 'gmaps', 'dm_instagram', 'tiktok_comments', 'chatbot'],
    gradientFrom: '#8b5cf6',
    gradientTo: '#6d28d9',
    minPlan: 'solo',
  },
  {
    name: 'Pack Complet',
    planLabel: 'Fondateurs',
    price: '149 EUR/mois',
    agentIds: ['commercial', 'email', 'ads', 'comptable', 'rh'],
    gradientFrom: '#f59e0b',
    gradientTo: '#d97706',
    minPlan: 'fondateurs',
  },
];

const PLAN_ORDER = ['gratuit', 'sprint', 'solo', 'solo_promo', 'fondateurs', 'standard', 'business', 'elite'];

interface AgentTeamsProps {
  agents: ClientAgent[];
  userPlan: string;
}

export default function AgentTeams({ agents, userPlan }: AgentTeamsProps) {
  const userPlanIndex = PLAN_ORDER.indexOf(userPlan || 'gratuit');

  return (
    <div className="space-y-4">
      <h2 className="text-white font-semibold text-lg mb-2">Packs d&apos;agents</h2>

      {TEAM_PACKS.map((pack) => {
        const packPlanIndex = PLAN_ORDER.indexOf(pack.minPlan);
        const isUnlocked = userPlanIndex >= packPlanIndex;
        const packAgents = pack.agentIds
          .map(id => agents.find(a => a.id === id))
          .filter(Boolean) as ClientAgent[];

        return (
          <div
            key={pack.name}
            className={`relative rounded-2xl border overflow-hidden transition-all ${
              isUnlocked
                ? 'border-white/20 bg-white/5'
                : 'border-white/10 bg-white/[0.02]'
            }`}
          >
            {/* Pack header */}
            <div
              className="px-4 py-3 flex items-center justify-between"
              style={{
                background: `linear-gradient(135deg, ${pack.gradientFrom}20, ${pack.gradientTo}20)`,
              }}
            >
              <div>
                <h3 className="text-white font-bold text-sm">{pack.name}</h3>
                <p className="text-white/50 text-xs">{pack.planLabel} - {pack.price}</p>
              </div>
              {isUnlocked ? (
                <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-[10px] font-semibold rounded-full">
                  Inclus
                </span>
              ) : (
                <a
                  href="/pricing"
                  className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  Upgrader
                </a>
              )}
            </div>

            {/* Agents in pack */}
            <div className="px-4 py-3 flex flex-wrap gap-2">
              {packAgents.map((agent) => (
                <div
                  key={agent.id}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
                    isUnlocked ? 'bg-white/10 text-white/80' : 'bg-white/5 text-white/40'
                  }`}
                >
                  <span className="text-base">{agent.icon}</span>
                  <span className="font-medium text-xs">{agent.displayName}</span>
                  <span className="text-white/40 text-[10px]">{agent.title}</span>
                </div>
              ))}
              {packAgents.length === 0 && (
                <p className="text-white/30 text-xs">Agents inclus dans ce pack</p>
              )}
            </div>

            {/* Locked overlay */}
            {!isUnlocked && (
              <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px] pointer-events-none" />
            )}
          </div>
        );
      })}
    </div>
  );
}
