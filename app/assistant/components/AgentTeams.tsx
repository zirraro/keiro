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
  description: string;
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
    description: 'Publication automatique + onboarding guide',
  },
  {
    name: 'Pack Pro — Reseaux Sociaux',
    planLabel: 'Solo 49EUR',
    price: '49 EUR/mois',
    agentIds: ['content', 'seo', 'gmaps', 'dm_instagram', 'tiktok_comments', 'chatbot'],
    gradientFrom: '#8b5cf6',
    gradientTo: '#6d28d9',
    minPlan: 'solo',
    description: 'Automatisation complete de vos reseaux sociaux et visibilite',
  },
  {
    name: 'Pack Complet — Tout le Business',
    planLabel: 'Fondateurs 149EUR',
    price: '149 EUR/mois',
    agentIds: ['commercial', 'email', 'ads', 'comptable', 'rh'],
    gradientFrom: '#f59e0b',
    gradientTo: '#d97706',
    minPlan: 'fondateurs',
    description: 'Prospection, emails, pub, finance, juridique — tout automatise',
  },
];

interface ServiceTeam {
  name: string;
  icon: string;
  agentIds: string[];
  color: string;
}

const SERVICE_TEAMS: ServiceTeam[] = [
  { name: 'Marketing & Publication', icon: '📊', agentIds: ['marketing', 'content', 'seo'], color: 'from-pink-500 to-rose-500' },
  { name: 'Reseaux Sociaux', icon: '📱', agentIds: ['dm_instagram', 'tiktok_comments', 'gmaps', 'chatbot'], color: 'from-purple-500 to-violet-600' },
  { name: 'Commercial & Acquisition', icon: '💼', agentIds: ['commercial', 'email', 'ads'], color: 'from-blue-500 to-cyan-500' },
  { name: 'Admin & Support', icon: '🏢', agentIds: ['comptable', 'rh', 'onboarding'], color: 'from-amber-500 to-orange-500' },
];

const PLAN_ORDER = ['gratuit', 'sprint', 'solo', 'solo_promo', 'fondateurs', 'standard', 'business', 'elite'];

interface AgentTeamsProps {
  agents: ClientAgent[];
  userPlan: string;
  avatars?: { [agentId: string]: string | null };
}

export default function AgentTeams({ agents, userPlan, avatars = {} }: AgentTeamsProps) {
  const userPlanIndex = PLAN_ORDER.indexOf(userPlan || 'gratuit');

  return (
    <div className="space-y-6">
      {/* Packs par offre */}
      <div>
        <h2 className="text-white font-semibold text-lg mb-3">Packs par offre</h2>
        <div className="space-y-3">
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
                    <p className="text-white/50 text-xs">{pack.planLabel} — {pack.description}</p>
                  </div>
                  {isUnlocked ? (
                    <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-[10px] font-semibold rounded-full flex-shrink-0">
                      Inclus
                    </span>
                  ) : (
                    <a
                      href="/pricing"
                      className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white text-xs font-medium rounded-lg transition-colors flex-shrink-0"
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
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${
                        isUnlocked ? 'bg-white/10 text-white/90' : 'bg-white/5 text-white/40'
                      }`}
                      style={{ background: isUnlocked ? `linear-gradient(135deg, ${agent.gradientFrom}30, ${agent.gradientTo}30)` : undefined }}
                    >
                      {avatars[agent.id] ? (
                        <img src={avatars[agent.id]!} alt={agent.displayName} className="w-6 h-6 rounded-full object-cover" style={{ objectPosition: 'top center' }} />
                      ) : (
                        <span className="text-base">{agent.icon}</span>
                      )}
                      <div>
                        <span className="font-semibold text-xs">{agent.displayName}</span>
                        <span className="text-white/40 text-[10px] ml-1.5">{agent.title}</span>
                      </div>
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
      </div>

      {/* Equipes par service */}
      <div>
        <h2 className="text-white font-semibold text-lg mb-3">Equipes par service</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {SERVICE_TEAMS.map((team) => {
            const teamAgents = team.agentIds
              .map(id => agents.find(a => a.id === id))
              .filter(Boolean) as ClientAgent[];

            return (
              <div
                key={team.name}
                className="rounded-2xl border border-white/15 bg-white/5 overflow-hidden"
              >
                <div className={`px-4 py-2.5 bg-gradient-to-r ${team.color} bg-opacity-20`} style={{ background: `linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))` }}>
                  <h3 className="text-white font-bold text-sm flex items-center gap-2">
                    <span>{team.icon}</span> {team.name}
                  </h3>
                </div>
                <div className="p-3 space-y-1.5">
                  {teamAgents.map((agent) => (
                    <div
                      key={agent.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
                    >
                      {avatars[agent.id] ? (
                        <img src={avatars[agent.id]!} alt={agent.displayName} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" style={{ objectPosition: 'top center' }} />
                      ) : (
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: `linear-gradient(135deg, ${agent.gradientFrom}, ${agent.gradientTo})` }}
                        >
                          <span className="text-sm">{agent.icon}</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-semibold text-xs">{agent.displayName}</div>
                        <div className="text-white/40 text-[10px] truncate">{agent.description}</div>
                      </div>
                      <div
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: agent.visibility === 'active' ? '#22c55e' : '#6366f1' }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Background agents note */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-4">
        <div className="flex items-start gap-2">
          <span className="text-sm">🧠</span>
          <div>
            <p className="text-white/70 text-xs font-semibold">Agents en arriere-plan</p>
            <p className="text-white/40 text-[10px] mt-0.5">
              Noah (Orchestrateur IA) et Theo (Retention) optimisent invisiblement KeiroAI pour tous les plans, sans action de votre part.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
