'use client';

/**
 * Shared auto-mode toggles used by every agent panel.
 * Extracted from AgentDashboard.tsx so the per-agent panel files can
 * import them without pulling the 4500-line parent back in.
 */

import { useState, useCallback, useEffect } from 'react';

export function AutoModeToggle({ agentId, autoLabel, manualLabel, autoDesc, manualDesc }: {
  agentId: string;
  autoLabel: string;
  manualLabel: string;
  autoDesc: string;
  manualDesc: string;
}) {
  const storageKey = `keiro_auto_${agentId}`;
  const [auto, setAuto] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try { const saved = localStorage.getItem(storageKey); if (saved) setAuto(saved === 'true'); } catch {}
    // Also check server
    fetch(`/api/agents/settings?agent_id=${agentId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.auto_mode !== undefined) setAuto(d.auto_mode); })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [agentId, storageKey]);

  const toggle = useCallback(async () => {
    const newVal = !auto;
    setAuto(newVal);
    try { localStorage.setItem(storageKey, String(newVal)); } catch {}
    try {
      await fetch('/api/agents/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ agent_id: agentId, auto_mode: newVal }),
      });
    } catch { setAuto(!newVal); }
  }, [auto, agentId, storageKey]);

  if (!loaded) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:p-4 mb-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base sm:text-lg">{auto ? '\u{1F916}' : '\u{270D}\uFE0F'}</span>
        <div className="min-w-0">
          <div className="text-xs sm:text-sm font-medium text-white/80">{auto ? autoLabel : manualLabel}</div>
          <div className="text-[10px] text-white/40">{auto ? autoDesc : manualDesc}</div>
        </div>
      </div>
      <button
        onClick={toggle}
        className={`w-12 h-7 rounded-full relative transition-colors flex-shrink-0 ${auto ? 'bg-emerald-500' : 'bg-white/15'}`}
      >
        <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${auto ? 'right-0.5' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

/**
 * NetworkControls — UNIFIED per-network row.
 *
 * Replaces the old pair (SocialConnectBanners + NetworkAutoModeToggles)
 * which rendered the same three networks twice — once with connect/
 * disconnect chips and once with auto-mode toggles. The user saw
 * "trop de répétition des reseaux" — this collapses each network into
 * a single row that shows both states.
 *
 * Per row: emoji + name + (CTA to connect, OR connected badge +
 * auto-publish toggle + tiny disconnect link).
 */
const NETWORK_META = [
  { key: 'instagram', label: 'Instagram', icon: '\uD83D\uDCF7', color: '#E1306C', gradient: 'from-pink-600 to-purple-600', oauth: '/api/auth/instagram-oauth' },
  { key: 'tiktok', label: 'TikTok', icon: '\uD83C\uDFB5', color: '#00f2ea', gradient: 'from-cyan-500 to-gray-900', oauth: '/api/auth/tiktok-oauth' },
  { key: 'linkedin', label: 'LinkedIn', icon: '\uD83D\uDCBC', color: '#0A66C2', gradient: 'from-blue-600 to-blue-800', oauth: '/api/auth/linkedin-oauth' },
];

export function NetworkControls({ agentId, connections }: { agentId: string; connections?: Record<string, boolean> }) {
  const [autoSettings, setAutoSettings] = useState<Record<string, boolean>>({});
  const [localConnected, setLocalConnected] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/agents/settings?agent_id=${agentId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const cfg = d.settings || {};
        setAutoSettings({
          instagram: cfg.auto_mode_instagram ?? cfg.auto_mode ?? false,
          tiktok: cfg.auto_mode_tiktok ?? cfg.auto_mode ?? false,
          linkedin: cfg.auto_mode_linkedin ?? cfg.auto_mode ?? false,
        });
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [agentId]);

  useEffect(() => {
    if (connections) {
      const c = new Set<string>();
      if (connections.instagram) c.add('instagram');
      if (connections.tiktok) c.add('tiktok');
      if (connections.linkedin) c.add('linkedin');
      setLocalConnected(c);
    }
  }, [connections]);

  const handleDisconnect = useCallback(async (network: string) => {
    if (typeof window !== 'undefined' && !window.confirm(`Déconnecter ${NETWORK_META.find(n => n.key === network)?.label || network} ?`)) return;
    try {
      await fetch('/api/agents/disconnect-network', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ network }),
      });
      setLocalConnected(prev => { const n = new Set(prev); n.delete(network); return n; });
      window.location.reload();
    } catch {}
  }, []);

  const toggleAuto = useCallback(async (network: string) => {
    const newVal = !autoSettings[network];
    const next = { ...autoSettings, [network]: newVal };
    setAutoSettings(next);
    const anyOn = Object.values(next).some(v => v);
    try {
      await fetch('/api/agents/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          agent_id: agentId,
          auto_mode: anyOn,
          [`auto_mode_${network}`]: newVal,
        }),
      });
    } catch { setAutoSettings(s => ({ ...s, [network]: !newVal })); }
  }, [autoSettings, agentId]);

  if (!loaded) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-4 mb-3">
      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <div>
          <h4 className="text-xs sm:text-sm font-bold text-white/90">Réseaux sociaux</h4>
          <p className="text-[10px] text-white/40">Connecte tes comptes — active la publication auto par réseau</p>
        </div>
      </div>
      <div className="space-y-2">
        {NETWORK_META.map(n => {
          const isConnected = localConnected.has(n.key);
          const auto = autoSettings[n.key];
          return (
            <div key={n.key} className="flex items-center gap-2 sm:gap-3 p-2 sm:p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0" style={{ background: `${n.color}25` }}>
                {n.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs sm:text-sm font-bold text-white truncate">{n.label}</span>
                  {isConnected && <span className="text-[9px] text-emerald-400 font-bold">{'\u2713'}</span>}
                </div>
                <div className="text-[10px] text-white/45 truncate">
                  {!isConnected
                    ? 'Non connecté'
                    : auto ? 'Publication auto activée' : 'Publication manuelle'}
                </div>
              </div>
              {!isConnected ? (
                <a
                  href={n.oauth}
                  className={`px-3 py-2 min-h-[36px] text-[11px] font-bold text-white rounded-lg bg-gradient-to-r ${n.gradient} hover:opacity-90 transition flex items-center gap-1`}
                >
                  Connecter
                </a>
              ) : (
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <button
                    onClick={() => toggleAuto(n.key)}
                    className={`w-11 h-6 rounded-full relative transition-colors flex-shrink-0 ${auto ? '' : 'bg-white/15'}`}
                    style={auto ? { backgroundColor: n.color } : {}}
                    title={auto ? 'Désactiver la publication auto' : 'Activer la publication auto'}
                    aria-label={`Publication auto ${n.label}`}
                  >
                    <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${auto ? 'right-0.5' : 'left-0.5'}`} />
                  </button>
                  <button
                    onClick={() => handleDisconnect(n.key)}
                    className="text-[9px] text-white/35 hover:text-red-400 px-1 transition flex-shrink-0"
                    title={`Déconnecter ${n.label}`}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function NetworkAutoModeToggles({ agentId }: { agentId: string }) {
  const [settings, setSettings] = useState<Record<string, boolean>>({});
  const [globalAuto, setGlobalAuto] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const NETWORKS = [
    { key: 'instagram', label: 'Instagram', icon: '\uD83D\uDCF7', color: '#E1306C' },
    { key: 'tiktok', label: 'TikTok', icon: '\uD83C\uDFB5', color: '#00f2ea' },
    { key: 'linkedin', label: 'LinkedIn', icon: '\uD83D\uDCBC', color: '#0A66C2' },
  ];

  useEffect(() => {
    fetch(`/api/agents/settings?agent_id=${agentId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const cfg = d.settings || {};
        setGlobalAuto(cfg.auto_mode ?? false);
        setSettings({
          instagram: cfg.auto_mode_instagram ?? cfg.auto_mode ?? false,
          tiktok: cfg.auto_mode_tiktok ?? cfg.auto_mode ?? false,
          linkedin: cfg.auto_mode_linkedin ?? cfg.auto_mode ?? false,
        });
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [agentId]);

  const toggleNetwork = useCallback(async (network: string) => {
    const newVal = !settings[network];
    const newSettings = { ...settings, [network]: newVal };
    setSettings(newSettings);
    // Update global auto_mode: true if any network is on
    const anyOn = Object.values(newSettings).some(v => v);
    setGlobalAuto(anyOn);
    try {
      await fetch('/api/agents/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          agent_id: agentId,
          auto_mode: anyOn,
          [`auto_mode_${network}`]: newVal,
        }),
      });
    } catch { setSettings(s => ({ ...s, [network]: !newVal })); }
  }, [settings, agentId]);

  if (!loaded) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 mb-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">{globalAuto ? '\uD83E\uDD16' : '\u270D\uFE0F'}</span>
        <span className="text-xs font-medium text-white/80">{globalAuto ? 'Publication automatique' : 'Publication manuelle'}</span>
      </div>
      <div className="space-y-1.5">
        {NETWORKS.map(n => (
          <div key={n.key} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-white/[0.03]">
            <div className="flex items-center gap-2">
              <span className="text-sm">{n.icon}</span>
              <span className="text-[11px] text-white/70">{n.label}</span>
            </div>
            <button
              onClick={() => toggleNetwork(n.key)}
              className={`w-10 h-5 rounded-full relative transition-colors flex-shrink-0 ${settings[n.key] ? '' : 'bg-white/15'}`}
              style={settings[n.key] ? { backgroundColor: n.color } : {}}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${settings[n.key] ? 'right-0.5' : 'left-0.5'}`} />
            </button>
          </div>
        ))}
      </div>
      <p className="text-[9px] text-white/25 mt-2">Active/desactive la publication automatique par reseau</p>
    </div>
  );
}
