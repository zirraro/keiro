'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/**
 * ClaraHelper — Smart Clara popup that:
 * 1. After 2+ agent visits: offers help
 * 2. Detects inactive agents and suggests activating them
 * 3. Wizard mode: guides through agent setup sequentially
 */

const AGENT_SETUP_ORDER = [
  { id: 'content', name: 'Lena', role: 'Publication contenu', connectUrl: '/api/auth/instagram-oauth', connectLabel: 'Connecter Instagram', needsConnect: 'instagram' },
  { id: 'dm_instagram', name: 'Jade', role: 'DMs Instagram', connectUrl: '/api/auth/instagram-oauth', connectLabel: 'Connecter Instagram', needsConnect: 'instagram' },
  { id: 'email', name: 'Hugo', role: 'Email marketing', connectUrl: null, connectLabel: null, needsConnect: null },
  { id: 'gmaps', name: 'Theo', role: 'Avis Google', connectUrl: '/api/auth/google-oauth', connectLabel: 'Connecter Google', needsConnect: 'google' },
  { id: 'commercial', name: 'Leo', role: 'Prospection', connectUrl: null, connectLabel: null, needsConnect: null },
  { id: 'seo', name: 'Oscar', role: 'SEO', connectUrl: null, connectLabel: null, needsConnect: null },
  { id: 'instagram_comments', name: 'Commentaires', role: 'Commentaires IG', connectUrl: '/api/auth/instagram-oauth', connectLabel: 'Connecter Instagram', needsConnect: 'instagram' },
];

export default function ClaraHelper() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [mode, setMode] = useState<'help' | 'wizard' | 'inactive'>('help');
  const [inactiveAgents, setInactiveAgents] = useState<typeof AGENT_SETUP_ORDER>([]);
  const [currentWizardIndex, setCurrentWizardIndex] = useState(0);
  const [connections, setConnections] = useState<Record<string, boolean>>({});
  const pathname = usePathname();
  const router = useRouter();

  // Load inactive agents + connections
  useEffect(() => {
    if (!pathname?.startsWith('/assistant')) return;

    const load = async () => {
      try {
        // Get connections
        const dashRes = await fetch('/api/agents/dashboard?agent_id=marketing', { credentials: 'include' });
        if (dashRes.ok) {
          const d = await dashRes.json();
          if (d.connections) setConnections(d.connections);
        }

        // Get which agents are setup
        const setupAgents = new Set<string>();
        for (const agent of AGENT_SETUP_ORDER) {
          try {
            const res = await fetch('/api/agents/settings?agent_id=' + agent.id, { credentials: 'include' });
            if (res.ok) {
              const d = await res.json();
              if (d.settings?.setup_completed || d.settings?.auto_mode) setupAgents.add(agent.id);
            }
          } catch {}
        }

        const inactive = AGENT_SETUP_ORDER.filter(a => !setupAgents.has(a.id));
        setInactiveAgents(inactive);

        // Show bubble if there are inactive agents
        if (inactive.length > 0) {
          const shownKey = 'keiro_clara_inactive_shown';
          const lastShown = sessionStorage.getItem(shownKey);
          if (!lastShown || Date.now() - parseInt(lastShown) > 300000) { // 5 min cooldown
            setTimeout(() => {
              setMode('inactive');
              setShow(true);
            }, 5000);
          }
        }
      } catch {}
    };

    load();
  }, [pathname]);

  const dismissAndCooldown = useCallback(() => {
    setDismissed(true);
    setShow(false);
    try { sessionStorage.setItem('keiro_clara_inactive_shown', String(Date.now())); } catch {}
  }, []);

  const startWizard = useCallback(() => {
    setMode('wizard');
    setCurrentWizardIndex(0);
  }, []);

  const activateAgent = useCallback(async (agentId: string) => {
    // Mark as setup + auto mode
    await fetch('/api/agents/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ agent_id: agentId, auto_mode: true, setup_completed: true }),
    }).catch(() => {});

    // Save wizard state and navigate to agent page for tutorial
    const nextIndex = currentWizardIndex + 1;
    try {
      sessionStorage.setItem('keiro_wizard_active', 'true');
      sessionStorage.setItem('keiro_wizard_agent', agentId);
      sessionStorage.setItem('keiro_wizard_next', String(nextIndex));
      sessionStorage.setItem('keiro_wizard_total', String(inactiveAgents.length));
      sessionStorage.setItem('keiro_wizard_agents', JSON.stringify(inactiveAgents.map(a => a.id)));
    } catch {}

    // Navigate to agent workspace
    router.push('/assistant/agent/' + agentId);
    setShow(false);
  }, [currentWizardIndex, inactiveAgents, router]);

  const skipAgent = useCallback(() => {
    setCurrentWizardIndex(prev => prev + 1);
  }, []);

  if (!show || dismissed) return null;

  const currentAgent = mode === 'wizard' ? inactiveAgents[currentWizardIndex] : null;
  const wizardDone = mode === 'wizard' && currentWizardIndex >= inactiveAgents.length;

  // First time (many inactive agents) → center of page. After some setup → bottom left.
  const isFirstTime = inactiveAgents.length >= 5;
  const positionClass = isFirstTime
    ? 'fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4'
    : 'fixed bottom-20 lg:bottom-6 left-4 lg:left-6 z-50';

  return (
    <div className={`${positionClass} animate-in ${isFirstTime ? 'zoom-in-95' : 'slide-in-from-bottom-3'} duration-300`}>
      <div className="bg-gray-900/95 backdrop-blur-xl border border-emerald-500/20 rounded-2xl shadow-2xl shadow-emerald-500/10 p-4 sm:p-5 w-80 sm:w-96">
        <button onClick={dismissAndCooldown} className="absolute top-2 right-2 text-white/20 hover:text-white/50 transition">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-lg">C</div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-emerald-400 mb-1">Clara</div>

            {/* Mode: inactive agents reminder */}
            {mode === 'inactive' && (
              <>
                <p className="text-xs text-white/70 leading-relaxed mb-2">
                  Tu as <strong className="text-emerald-300">{inactiveAgents.length} agent{inactiveAgents.length > 1 ? 's' : ''}</strong> pret{inactiveAgents.length > 1 ? 's' : ''} a bosser pour toi ! Active-les en 30 secondes chacun.
                </p>
                <div className="flex flex-wrap gap-1 mb-2">
                  {inactiveAgents.slice(0, 4).map(a => (
                    <span key={a.id} className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded">{a.name}</span>
                  ))}
                  {inactiveAgents.length > 4 && <span className="text-[9px] text-white/30">+{inactiveAgents.length - 4}</span>}
                </div>
                <div className="flex gap-2">
                  <button onClick={startWizard} className="px-3 py-1.5 bg-emerald-600 text-white text-[10px] font-bold rounded-lg hover:bg-emerald-500 transition min-h-[32px]">
                    {'\u26A1'} Activer maintenant
                  </button>
                  <button onClick={dismissAndCooldown} className="px-3 py-1.5 bg-white/10 text-white/50 text-[10px] rounded-lg hover:bg-white/15 transition min-h-[32px]">
                    Plus tard
                  </button>
                </div>
              </>
            )}

            {/* Mode: wizard */}
            {mode === 'wizard' && !wizardDone && currentAgent && (
              <>
                <p className="text-[10px] text-white/40 mb-1">Agent {currentWizardIndex + 1}/{inactiveAgents.length}</p>
                <p className="text-xs text-white/80 font-medium mb-0.5">{currentAgent.name} — {currentAgent.role}</p>
                <div className="flex gap-1 mb-2">
                  {inactiveAgents.map((_, i) => (
                    <div key={i} className={`h-1 flex-1 rounded-full ${i < currentWizardIndex ? 'bg-emerald-400' : i === currentWizardIndex ? 'bg-white' : 'bg-white/15'}`} />
                  ))}
                </div>

                {currentAgent.needsConnect && !connections[currentAgent.needsConnect] ? (
                  <div className="flex gap-2">
                    <a href={currentAgent.connectUrl || '#'} className="px-3 py-1.5 bg-emerald-600 text-white text-[10px] font-bold rounded-lg hover:bg-emerald-500 transition min-h-[32px]">
                      {currentAgent.connectLabel}
                    </a>
                    <button onClick={skipAgent} className="px-3 py-1.5 bg-white/10 text-white/50 text-[10px] rounded-lg min-h-[32px]">Passer</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => activateAgent(currentAgent.id)} className="px-3 py-1.5 bg-emerald-600 text-white text-[10px] font-bold rounded-lg hover:bg-emerald-500 transition min-h-[32px]">
                      {'\u2705'} Activer {currentAgent.name}
                    </button>
                    <button onClick={skipAgent} className="px-3 py-1.5 bg-white/10 text-white/50 text-[10px] rounded-lg min-h-[32px]">Passer</button>
                  </div>
                )}
              </>
            )}

            {/* Mode: wizard done */}
            {wizardDone && (
              <>
                <p className="text-xs text-white/80 mb-2">{'\u{1F389}'} Bravo ! Tes agents sont prets a travailler pour toi !</p>
                <button onClick={dismissAndCooldown} className="px-3 py-1.5 bg-emerald-600 text-white text-[10px] font-bold rounded-lg min-h-[32px]">
                  C&apos;est parti !
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
