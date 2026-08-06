'use client';

import type { ClientAgent } from '@/lib/agents/client-context';

/**
 * Les agents regroupés par offre.
 *
 * 2026-07-31 — Réécrit sur deux constats du fondateur : « l'onglet par offre
 * n'est pas à jour du tout » et « y'a 2 sous-onglets, vraiment pertinents ? ».
 *
 * 1. Les packs sont maintenant DÉRIVÉS du `minPlan` réel de chaque agent, au
 *    lieu d'une liste écrite à la main. L'ancienne plaçait Théo, Sara et Louis
 *    en Business alors qu'ils sont inclus dès Créateur, et citait Félix et
 *    Oscar — deux agents qui n'existent plus. Une liste figée finit toujours
 *    par mentir dès qu'on retouche les plans ; ici c'est impossible.
 *
 * 2. Le second sous-onglet « Équipes par service » redécoupait exactement les
 *    mêmes agents selon un autre axe, sans rien apprendre de plus. Supprimé :
 *    ce que le client veut savoir, c'est ce qu'il a et ce qu'il aurait en
 *    passant au plan au-dessus.
 */

const PLAN_ORDER = ['gratuit', 'free', 'sprint', 'solo', 'solo_promo', 'createur', 'pro', 'fondateurs', 'standard', 'business', 'elite', 'agence'];

const PACKS: Array<{ plan: string; name: string; price: string; from: string; to: string; blurb: string }> = [
  { plan: 'createur', name: 'Pack Créateur', price: '49€/mois', from: '#8b5cf6', to: '#6d28d9', blurb: 'Contenu, commentaires, avis Google, RH et finance' },
  { plan: 'pro', name: 'Pack Pro', price: '99€/mois', from: '#3b82f6', to: '#2563eb', blurb: 'Tout Créateur + emails, boîte gérée, prospection et SEO' },
  { plan: 'business', name: 'Pack Business', price: '149€/mois', from: '#0c1a3a', to: '#1e3a5f', blurb: 'Toute l’équipe + WhatsApp, multi-comptes et support prioritaire' },
];

interface AgentTeamsProps {
  agents: ClientAgent[];
  userPlan: string;
  avatars?: { [agentId: string]: string | null };
}

export default function AgentTeams({ agents, userPlan, avatars = {} }: AgentTeamsProps) {
  const userPlanIndex = PLAN_ORDER.indexOf((userPlan || 'gratuit').toLowerCase());

  // Un agent appartient au pack de SON minPlan. Les agents gratuits (Ami,
  // Clara) sont rattachés au premier pack : ils sont là dès le départ.
  const packAgentsFor = (plan: string) => {
    const idx = PLAN_ORDER.indexOf(plan);
    return agents.filter(a => {
      const req = PLAN_ORDER.indexOf(a.minPlan);
      if (plan === 'createur' && req < idx) return true; // gratuits inclus ici
      return req === idx;
    });
  };

  return (
    <div className="space-y-4">
      {PACKS.map((pack) => {
        const packIndex = PLAN_ORDER.indexOf(pack.plan);
        const isUnlocked = userPlanIndex >= packIndex;
        const packAgents = packAgentsFor(pack.plan);
        if (packAgents.length === 0) return null;

        return (
          <div
            key={pack.plan}
            className={`relative rounded-2xl border overflow-hidden transition-all ${
              isUnlocked ? 'border-white/20 bg-white/5' : 'border-white/10 bg-white/[0.02]'
            }`}
          >
            <div
              className="px-4 py-3 flex items-center justify-between gap-3"
              style={{ background: `linear-gradient(135deg, ${pack.from}25, ${pack.to}25)` }}
            >
              <div className="min-w-0">
                <h3 className="text-white font-bold text-sm">
                  {pack.name} <span className="text-white/40 font-medium">· {pack.price}</span>
                </h3>
                <p className="text-white/50 text-xs">{pack.blurb}</p>
              </div>
              {isUnlocked ? (
                <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-[10px] font-semibold rounded-full flex-shrink-0 border border-green-500/20">
                  Inclus
                </span>
              ) : (
                <a
                  href="/pricing"
                  className="min-h-[44px] inline-flex items-center justify-center px-3 py-1 bg-white/10 hover:bg-white/20 text-white text-xs font-medium rounded-lg transition-colors flex-shrink-0"
                >
                  Débloquer
                </a>
              )}
            </div>

            <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {packAgents.map((agent) => (
                <div
                  key={agent.id}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                    isUnlocked ? 'bg-gray-900/50 hover:bg-gray-900/70' : 'bg-white/[0.03]'
                  }`}
                >
                  <div
                    className="w-10 h-10 rounded-full flex-shrink-0"
                    style={{ background: `linear-gradient(135deg, ${agent.gradientFrom}, ${agent.gradientTo})`, padding: '2px' }}
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

            {!isUnlocked && <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px] pointer-events-none" />}
          </div>
        );
      })}
    </div>
  );
}
