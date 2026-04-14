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
