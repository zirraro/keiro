'use client';

import { useState } from 'react';
import type { ClientAgent } from '@/lib/agents/client-context';
import { useLanguage } from '@/lib/i18n/context';

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
    name: 'Pack Createur',
    planLabel: 'Createur 49\u20AC',
    price: '49\u20AC/mois',
    agentIds: ['marketing', 'onboarding', 'content', 'dm_instagram'],
    gradientFrom: '#8b5cf6',
    gradientTo: '#6d28d9',
    minPlan: 'createur',
    description: 'AMI basique + Lena + Jade + Clara — contenu & publication',
  },
  {
    name: 'Pack Pro',
    planLabel: 'Pro 99\u20AC',
    price: '99\u20AC/mois',
    agentIds: ['email', 'ads', 'commercial', 'tiktok_comments'],
    gradientFrom: '#3b82f6',
    gradientTo: '#2563eb',
    minPlan: 'pro',
    description: 'Tout Createur + Hugo + Felix + Leo + Axel — croissance',
  },
  {
    name: 'Pack Business',
    planLabel: 'Business 199\u20AC',
    price: '199\u20AC/mois',
    agentIds: ['seo', 'rh', 'gmaps', 'chatbot', 'comptable'],
    gradientFrom: '#0c1a3a',
    gradientTo: '#1e3a5f',
    minPlan: 'business',
    description: 'Tout Pro + Oscar + Sara + Theo + Max + Louis + CRM',
  },
];

interface ServiceTeam {
  name: string;
  icon: string;
  agentIds: string[];
  color: string;
}

const SERVICE_TEAMS: ServiceTeam[] = [
  { name: 'Strategie & Contenu', icon: '📊', agentIds: ['marketing', 'content', 'seo'], color: 'from-pink-500 to-rose-500' },
  { name: 'Reseaux Sociaux', icon: '📱', agentIds: ['dm_instagram', 'tiktok_comments', 'gmaps', 'chatbot'], color: 'from-purple-500 to-violet-600' },
  { name: 'Commercial & Acquisition', icon: '💼', agentIds: ['commercial', 'email', 'ads'], color: 'from-blue-500 to-cyan-500' },
  { name: 'Admin & Support', icon: '🏢', agentIds: ['comptable', 'rh', 'onboarding'], color: 'from-amber-500 to-orange-500' },
];

const PLAN_ORDER = ['gratuit', 'sprint', 'solo', 'solo_promo', 'createur', 'pro', 'fondateurs', 'standard', 'business', 'elite'];

interface AgentTeamsProps {
  agents: ClientAgent[];
  userPlan: string;
  avatars?: { [agentId: string]: string | null };
}

export default function AgentTeams({ agents, userPlan, avatars = {} }: AgentTeamsProps) {
  const { t } = useLanguage();
  const nn = (t as any).notif || {};
  const userPlanIndex = PLAN_ORDER.indexOf(userPlan || 'gratuit');
  const [view, setView] = useState<'packs' | 'teams'>('packs');

  return (
    <div className="space-y-6">
      {/* View toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setView('packs')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            view === 'packs' ? 'bg-purple-600 text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'
          }`}
        >
          Packs par offre
        </button>
        <button
          onClick={() => setView('teams')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            view === 'teams' ? 'bg-purple-600 text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'
          }`}
        >
          Equipes par service
        </button>
      </div>

      {view === 'packs' ? (
        /* ─── Packs par offre ─── */
        <div className="space-y-4">
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
                    background: `linear-gradient(135deg, ${pack.gradientFrom}25, ${pack.gradientTo}25)`,
                  }}
                >
                  <div>
                    <h3 className="text-white font-bold text-sm">{pack.name}</h3>
                    <p className="text-white/50 text-xs">{pack.planLabel} — {pack.description}</p>
                  </div>
                  {isUnlocked ? (
                    <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-[10px] font-semibold rounded-full flex-shrink-0 border border-green-500/20">
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

                {/* Agents in pack — better avatar display */}
                <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {packAgents.map((agent) => (
                    <div
                      key={agent.id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${
                        isUnlocked ? 'bg-gray-900/50 hover:bg-gray-900/70' : 'bg-white/[0.03]'
                      } transition-colors`}
                    >
                      {/* Avatar with gradient ring */}
                      <div
                        className="w-10 h-10 rounded-full flex-shrink-0"
                        style={{
                          background: `linear-gradient(135deg, ${agent.gradientFrom}, ${agent.gradientTo})`,
                          padding: '2px',
                        }}
                      >
                        <div className="w-full h-full rounded-full overflow-hidden bg-gray-900 flex items-center justify-center">
                          {avatars[agent.id] ? (
                            <img
                              src={avatars[agent.id]!}
                              alt={agent.displayName}
                              className="w-full h-full object-cover scale-[1.15]"
                              style={{ objectPosition: 'center 15%' }}
                            />
                          ) : (
                            <span className="text-base">{agent.icon}</span>
                          )}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-white font-semibold text-xs">{agent.displayName}</div>
                        <div className="text-gray-400 text-[10px] truncate">{agent.title}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Locked overlay */}
                {!isUnlocked && (
                  <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px] pointer-events-none" />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* ─── Equipes par service ─── */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {SERVICE_TEAMS.map((team) => {
            const teamAgents = team.agentIds
              .map(id => agents.find(a => a.id === id))
              .filter(Boolean) as ClientAgent[];

            return (
              <div
                key={team.name}
                className="rounded-2xl border border-white/15 bg-gray-900/30 overflow-hidden"
              >
                <div className={`px-4 py-3 bg-gradient-to-r ${team.color}`}>
                  <h3 className="text-white font-bold text-sm flex items-center gap-2">
                    <span>{team.icon}</span> {team.name}
                  </h3>
                </div>
                <div className="p-3 space-y-2">
                  {teamAgents.map((agent) => (
                    <div
                      key={agent.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
                    >
                      {/* Avatar — circular with gradient ring */}
                      <div
                        className="w-11 h-11 rounded-full flex-shrink-0"
                        style={{
                          background: `linear-gradient(135deg, ${agent.gradientFrom}, ${agent.gradientTo})`,
                          padding: '2px',
                        }}
                      >
                        <div className="w-full h-full rounded-full overflow-hidden bg-gray-900 flex items-center justify-center">
                          {avatars[agent.id] ? (
                            <img
                              src={avatars[agent.id]!}
                              alt={agent.displayName}
                              className="w-full h-full object-cover scale-[1.15]"
                              style={{ objectPosition: 'center 15%' }}
                            />
                          ) : (
                            <div
                              className="w-full h-full flex items-center justify-center"
                              style={{ background: `linear-gradient(135deg, ${agent.gradientFrom}, ${agent.gradientTo})` }}
                            >
                              <span className="text-lg">{agent.icon}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-semibold text-xs">{agent.displayName}</div>
                        <div className="text-gray-400 text-[10px] truncate">{agent.description}</div>
                      </div>
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: agent.visibility === 'active' ? '#22c55e' : '#6366f1' }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Background agents note */}
      <div className="rounded-xl bg-gray-900/30 border border-white/10 p-4">
        <div className="flex items-start gap-2">
          <span className="text-sm">🧠</span>
          <div>
            <p className="text-white/70 text-xs font-semibold">{nn.backgroundAgents || 'Agents en arrière-plan'}</p>
            <p className="text-gray-500 text-[10px] mt-0.5">
              Noah (Orchestrateur IA) et Theo (Retention) optimisent invisiblement KeiroAI pour tous les plans, sans action de votre part.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
