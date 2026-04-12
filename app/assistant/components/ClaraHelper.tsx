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
  { id: 'content', name: 'Lena', icon: '\u2728', role: 'Experte Publication & Contenu', desc: 'Genere des posts, reels et stories optimises. Publie automatiquement sur Instagram, TikTok et LinkedIn selon ton calendrier.', benefit: 'Contenu pro publie automatiquement', connectUrl: '/api/auth/instagram-oauth', connectLabel: 'Connecter Instagram', needsConnect: 'instagram' },
  { id: 'dm_instagram', name: 'Jade', icon: '\u{1F4AC}', role: 'Experte DM & Prospection Instagram', desc: 'Envoie des DMs personnalises a tes prospects, repond automatiquement et qualifie les leads. Tu es alerte quand un prospect est chaud.', benefit: '50 prospects contactes par jour', connectUrl: '/api/auth/instagram-oauth', connectLabel: 'Connecter Instagram', needsConnect: 'instagram' },
  { id: 'email', name: 'Hugo', icon: '\u{1F4E7}', role: 'Expert Email Marketing', desc: 'Envoie des sequences email personnalisees a tes prospects, suit les ouvertures et clics. Hugo envoie depuis KeiroAI mais tu peux repondre directement depuis ton espace agent.', benefit: 'Sequences email 100% auto', connectUrl: null, connectLabel: null, needsConnect: null },
  { id: 'gmaps', name: 'Theo', icon: '\u2B50', role: 'Expert Avis Google & Reputation', desc: 'Repond a tous tes avis Google avec des reponses IA personnalisees. Ameliore ta note et ta visibilite locale.', benefit: 'Chaque avis repondu en 30 sec', connectUrl: '/api/auth/google-oauth', connectLabel: 'Connecter Google Business', needsConnect: 'google' },
  { id: 'commercial', name: 'Leo', icon: '\u{1F91D}', role: 'Assistant Prospection & CRM', desc: 'Prospecte sur Google Maps dans ta zone, qualifie les leads, gere ton pipeline commercial et relance automatiquement.', benefit: 'Pipeline commercial automatise', connectUrl: null, connectLabel: null, needsConnect: null },
  { id: 'seo', name: 'Oscar', icon: '\u{1F50D}', role: 'Expert SEO & Visibilite', desc: 'Analyse ton site, suit tes positions Google, identifie les opportunites de mots-cles et te donne des recommandations concretes.', benefit: 'Monte dans les resultats Google', connectUrl: null, connectLabel: null, needsConnect: null },
  { id: 'linkedin', name: 'Emma', icon: '\u{1F4BC}', role: 'Experte LinkedIn & Reseau Pro', desc: 'Publie du contenu optimise sur LinkedIn, commente et engage ton reseau professionnel pour generer des leads B2B.', benefit: 'Leads B2B automatises', connectUrl: '/api/auth/linkedin-oauth', connectLabel: 'Connecter LinkedIn', needsConnect: 'linkedin' },
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

    // Quick check: if coming from onboarding popup, show wizard immediately with all agents
    const startFlag = sessionStorage.getItem('keiro_start_wizard');
    if (startFlag) {
      sessionStorage.removeItem('keiro_start_wizard');
      setInactiveAgents([...AGENT_SETUP_ORDER]);
      setMode('inactive');
      setShow(true);
      return; // Skip async loading — show wizard now
    }

    const load = async () => {
      try {
        // Get connections — try multiple sources
        const conns: Record<string, boolean> = {};
        try {
          const dashRes = await fetch('/api/agents/dashboard?agent_id=marketing', { credentials: 'include' });
          if (dashRes.ok) {
            const d = await dashRes.json();
            if (d.connections) Object.assign(conns, d.connections);
          }
        } catch {}
        // Also check IG token directly
        try {
          const igRes = await fetch('/api/instagram/check-token', { credentials: 'include' });
          if (igRes.ok) {
            const d = await igRes.json();
            if (d.valid || d.connected) conns.instagram = true;
          }
        } catch {}
        setConnections(conns);
        console.log('[ClaraHelper] Connections:', conns);

        // Check if user is authenticated — don't show for visitors
        try {
          const meRes = await fetch('/api/me', { credentials: 'include' });
          if (!meRes.ok) return; // Not logged in → don't show
        } catch { return; }

        // Get which agents are setup — parallel requests for speed
        const setupAgents = new Set<string>();
        const settingsPromises = AGENT_SETUP_ORDER.map(agent =>
          fetch('/api/agents/settings?agent_id=' + agent.id, { credentials: 'include' })
            .then(r => r.json())
            .then(d => { if (d.settings?.setup_completed || d.settings?.auto_mode) setupAgents.add(agent.id); })
            .catch(() => {})
        );
        await Promise.all(settingsPromises);

        const inactive = AGENT_SETUP_ORDER.filter(a => !setupAgents.has(a.id));
        setInactiveAgents(inactive);

        // Filter out already-done agents from this wizard session
        const doneAgents = new Set(JSON.parse(sessionStorage.getItem('keiro_wizard_done') || '[]'));
        const remaining = inactive.filter(a => !doneAgents.has(a.id));
        setInactiveAgents(remaining);

        // Start wizard flag handled in early check above

        // Popup schedule: show at 20 visits, then 40 days later, then 80 days later, then never
        if (remaining.length > 0) {
          const visitKey = 'keiro_clara_visit_count';
          const visits = parseInt(localStorage.getItem(visitKey) || '0') + 1;
          localStorage.setItem(visitKey, String(visits));

          const dismissCountKey = 'keiro_clara_dismiss_count';
          const dismissCount = parseInt(localStorage.getItem(dismissCountKey) || '0');
          const dismissedKey = 'keiro_clara_dismissed_at';
          const lastDismissed = localStorage.getItem(dismissedKey);

          // 3 chances max: after 20 visits, then 40 days after dismiss #1, then 80 days after dismiss #2
          let shouldShow = false;
          if (dismissCount === 0 && visits === 20) {
            shouldShow = true;
          } else if (dismissCount === 1 && lastDismissed) {
            const daysSinceDismiss = (Date.now() - parseInt(lastDismissed)) / (1000 * 60 * 60 * 24);
            shouldShow = daysSinceDismiss >= 40;
          } else if (dismissCount === 2 && lastDismissed) {
            const daysSinceDismiss = (Date.now() - parseInt(lastDismissed)) / (1000 * 60 * 60 * 24);
            shouldShow = daysSinceDismiss >= 80;
          }
          // dismissCount >= 3 → never show again

          if (shouldShow) {
            setTimeout(() => {
              setMode('inactive');
              setShow(true);
            }, 4000);
          }
        }
      } catch {}
    };

    load();
  }, [pathname]);

  const dismissAndCooldown = useCallback(() => {
    setDismissed(true);
    setShow(false);
    try {
      localStorage.setItem('keiro_clara_dismissed_at', String(Date.now()));
      const count = parseInt(localStorage.getItem('keiro_clara_dismiss_count') || '0');
      localStorage.setItem('keiro_clara_dismiss_count', String(count + 1));
    } catch {}
  }, []);

  const startWizard = useCallback(() => {
    setMode('wizard');
    setCurrentWizardIndex(0);
  }, []);

  const activateAgent = useCallback(async (agent: typeof AGENT_SETUP_ORDER[0]) => {
    // Mark as setup + auto mode
    await fetch('/api/agents/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ agent_id: agent.id, auto_mode: true, setup_completed: true }),
    }).catch(() => {});

    // Save wizard state for the tutorial overlay on the agent page
    const remaining = inactiveAgents.slice(currentWizardIndex + 1);
    try {
      sessionStorage.setItem('keiro_wizard_active', 'true');
      sessionStorage.setItem('keiro_wizard_agent', agent.id);
      sessionStorage.setItem('keiro_wizard_next', String(currentWizardIndex + 1));
      sessionStorage.setItem('keiro_wizard_total', String(inactiveAgents.length));
      sessionStorage.setItem('keiro_wizard_agents', JSON.stringify(remaining.map(a => a.id)));
      // Mark this agent as done to prevent loop
      const doneKey = 'keiro_wizard_done';
      const done = JSON.parse(sessionStorage.getItem(doneKey) || '[]');
      done.push(agent.id);
      sessionStorage.setItem(doneKey, JSON.stringify(done));
    } catch {}

    // If agent needs connection and not connected, go to OAuth first
    if (agent.needsConnect && !connections[agent.needsConnect] && agent.connectUrl) {
      window.location.href = agent.connectUrl;
      return;
    }

    // Navigate to agent workspace — full reload to trigger tutorial
    window.location.href = '/assistant/agent/' + agent.id;
  }, [currentWizardIndex, inactiveAgents, connections]);

  const skipAgent = useCallback(() => {
    setCurrentWizardIndex(prev => prev + 1);
  }, []);

  // Hide Clara when spotlight tour is active
  const [tourActive, setTourActive] = useState(false);
  useEffect(() => {
    const check = () => {
      try {
        const running = sessionStorage.getItem('keiro_tour_running') === 'true';
        setTourActive(running);
      } catch {}
    };
    check();
    const interval = setInterval(check, 500);
    return () => clearInterval(interval);
  }, []);

  if (!show || dismissed || tourActive) return null;

  const currentAgent = mode === 'wizard' ? inactiveAgents[currentWizardIndex] : null;
  const wizardDone = mode === 'wizard' && currentWizardIndex >= inactiveAgents.length;

  // First time (many inactive agents) → center of page. After some setup → bottom left.
  const isFirstTime = inactiveAgents.length >= 5;
  const positionClass = isFirstTime
    ? 'fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4'
    : 'fixed bottom-20 lg:bottom-6 left-4 lg:left-6 z-50';

  return (
    <div className={`${positionClass} animate-in ${isFirstTime ? 'zoom-in-95' : 'slide-in-from-bottom-3'} duration-300`}>
      <div className="bg-gray-900/95 backdrop-blur-xl border border-emerald-500/20 rounded-2xl shadow-2xl shadow-emerald-500/10 p-3 sm:p-5 w-[calc(100vw-32px)] sm:w-96 max-w-sm">
        <button onClick={dismissAndCooldown} className="absolute top-2 right-2 text-white/20 hover:text-white/50 transition">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-lg">C</div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-emerald-400 mb-1">Clara</div>

            {/* Mode: inactive agents — rich presentation */}
            {mode === 'inactive' && (
              <>
                <p className="text-xs text-white/70 leading-relaxed mb-3">
                  Tu as <strong className="text-emerald-300">{inactiveAgents.length} agent{inactiveAgents.length > 1 ? 's' : ''}</strong> pret{inactiveAgents.length > 1 ? 's' : ''} a travailler pour toi ! Chacun s&apos;active en 30 secondes.
                </p>
                <div className="space-y-1.5 mb-3 max-h-[250px] overflow-y-auto">
                  {inactiveAgents.map((a, i) => (
                    <button
                      key={a.id}
                      onClick={() => { setCurrentWizardIndex(i); setMode('wizard'); }}
                      className="w-full flex items-center gap-2.5 bg-white/5 hover:bg-white/10 rounded-lg px-3 py-2 transition text-left"
                    >
                      <span className="text-lg">{(a as any).icon || '\u{1F916}'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-bold text-white">{a.name}</div>
                        <div className="text-[9px] text-white/40">{a.role}</div>
                      </div>
                      <span className="text-emerald-400 text-[10px] font-bold">{'\u26A1'}</span>
                    </button>
                  ))}
                </div>
                <button onClick={startWizard} className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-bold rounded-xl hover:shadow-lg transition min-h-[40px] mb-1.5">
                  {'\u26A1'} Activer dans l&apos;ordre recommande
                </button>
                <button onClick={dismissAndCooldown} className="w-full py-1.5 text-white/30 text-[10px] hover:text-white/50 transition">
                  Plus tard
                </button>
              </>
            )}

            {/* Mode: wizard — rich agent presentation */}
            {mode === 'wizard' && !wizardDone && currentAgent && (
              <>
                {/* Progress */}
                <div className="flex gap-1 mb-3">
                  {inactiveAgents.map((_, i) => (
                    <div key={i} className={`h-1.5 flex-1 rounded-full ${i < currentWizardIndex ? 'bg-emerald-400' : i === currentWizardIndex ? 'bg-white' : 'bg-white/15'}`} />
                  ))}
                </div>

                {/* Agent card */}
                <div className="bg-white/5 rounded-xl p-3 mb-3 border border-white/10">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">{(currentAgent as any).icon || '\u{1F916}'}</span>
                    <div>
                      <div className="text-sm font-bold text-white">{currentAgent.name}</div>
                      <div className="text-[10px] text-emerald-400">{currentAgent.role}</div>
                    </div>
                    <span className="ml-auto text-[9px] text-white/30">{currentWizardIndex + 1}/{inactiveAgents.length}</span>
                  </div>
                  <p className="text-[11px] text-white/60 leading-relaxed mb-2">{(currentAgent as any).desc || ''}</p>
                  {(currentAgent as any).benefit && (
                    <div className="flex items-center gap-1.5 text-[10px] text-emerald-300 bg-emerald-500/10 px-2 py-1 rounded-lg">
                      <span>{'\u{1F680}'}</span>
                      <span>{(currentAgent as any).benefit}</span>
                    </div>
                  )}
                </div>

                {/* Action */}
                {currentAgent.needsConnect && !connections[currentAgent.needsConnect] ? (
                  <div className="space-y-2">
                    <a href={currentAgent.connectUrl || '#'} className="block w-full py-2.5 text-center bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-500 transition min-h-[40px]">
                      {'\u{1F517}'} {currentAgent.connectLabel}
                    </a>
                    <button onClick={() => activateAgent(currentAgent)} className="w-full py-1.5 text-white/40 text-[10px] hover:text-white/60 transition">Deja connecte ? Activer directement</button>
                    <button onClick={skipAgent} className="w-full py-1.5 text-white/25 text-[10px] hover:text-white/40 transition">Passer cet agent</button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button onClick={() => activateAgent(currentAgent)} className="w-full py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-500 transition min-h-[40px]">
                      {'\u26A1'} Activer {currentAgent.name}
                    </button>
                    <button onClick={skipAgent} className="w-full py-1.5 text-white/25 text-[10px] hover:text-white/40 transition">Passer cet agent</button>
                  </div>
                )}
              </>
            )}

            {/* Mode: wizard done */}
            {wizardDone && (
              <>
                <p className="text-xs text-white/80 mb-2">{'\u{1F389}'} Bravo ! Tes agents sont prets a travailler pour toi !</p>
                <button onClick={dismissAndCooldown} className="px-3 py-1.5 bg-emerald-600 text-white text-[10px] font-bold rounded-lg min-h-[40px]">
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
