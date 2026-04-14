'use client';

/**
 * Shared UI banners used by multiple agent panels:
 *   - SocialConnectBanners  (Instagram/TikTok/LinkedIn connect widgets)
 *   - EmailConnectBanner    (Gmail/Outlook connect CTA for Hugo)
 *   - HotProspectsAlert     (hot prospects notification strip)
 *
 * Extracted from AgentDashboard.tsx so every panel file can import them
 * without re-pulling the parent 2900-line component.
 */

import { useState, useEffect, useCallback } from 'react';

const SOCIAL_NETWORKS = {
  instagram: {
    name: 'Instagram',
    icon: '\u{1F4F7}',
    color: '#E1306C',
    gradient: 'from-pink-600 to-purple-600',
    oauthUrl: '/api/auth/instagram-oauth',
    description: 'Publie, reponds aux DMs et commentaires',
  },
  tiktok: {
    name: 'TikTok',
    icon: '\u{1F3B5}',
    color: '#00f2ea',
    gradient: 'from-cyan-500 to-gray-900',
    oauthUrl: '/api/auth/tiktok-oauth',
    description: 'Publie des videos et engage ta communaute',
  },
  linkedin: {
    name: 'LinkedIn',
    icon: '\u{1F4BC}',
    color: '#0A66C2',
    gradient: 'from-blue-600 to-blue-800',
    oauthUrl: '/api/auth/linkedin-oauth',
    description: 'Publie et developpe ton reseau pro',
  },
} as const;

export type SocialNetworkKey = keyof typeof SOCIAL_NETWORKS;

export function SocialConnectBanners({ agentId, networks, connections }: {
  agentId: string;
  networks: Array<SocialNetworkKey>;
  connections?: Record<string, boolean>;
}) {
  const [localConnected, setLocalConnected] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Use connections from dashboard API (shared, always up-to-date)
    if (connections) {
      const c = new Set<string>();
      if (connections.instagram) c.add('instagram');
      if (connections.tiktok) c.add('tiktok');
      if (connections.linkedin) c.add('linkedin');
      if (connections.google) c.add('google');
      setLocalConnected(c);
    }
  }, [connections]);

  const handleDisconnect = useCallback(async (network: string) => {
    if (typeof window !== 'undefined' && !window.confirm(`Deconnecter ${SOCIAL_NETWORKS[network as SocialNetworkKey]?.name || network} ?`)) return;
    try {
      await fetch('/api/agents/disconnect-network', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ network }),
      });
      setLocalConnected(prev => { const n = new Set(prev); n.delete(network); return n; });
    } catch {}
  }, []);

  return (
    <div className="flex flex-wrap gap-2 mb-3">
      {networks.map(key => {
        const net = SOCIAL_NETWORKS[key];
        const isConnected = localConnected.has(key) || connections?.[key];
        return (
          <div key={key} className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs flex-shrink-0" style={{ background: `${net.color}20` }}>
              {net.icon}
            </div>
            <span className="text-[10px] text-white/60 font-medium">{net.name}</span>
            {isConnected ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-emerald-400 font-bold">{'\u2713'}</span>
                <button onClick={() => handleDisconnect(key)} className="text-[8px] text-white/15 hover:text-red-400/50 transition">Deconnecter</button>
              </div>
            ) : (
              <a href={net.oauthUrl} className={`px-2 py-0.5 bg-gradient-to-r ${net.gradient} text-white text-[9px] font-bold rounded-md hover:opacity-90 transition`}>
                Connecter
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Email connection banner — encourage client to connect their Gmail/Outlook
export function EmailConnectBanner({ connections }: { connections?: Record<string, boolean> }) {
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const handleDisconnect = useCallback(async () => {
    if (typeof window !== 'undefined' && !window.confirm('Deconnecter Gmail ? Les emails partiront de contact@keiroai.com.')) return;
    try {
      await fetch('/api/agents/email/check-connection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'disconnect_gmail' }) });
      setGmailConnected(false);
      setGmailEmail(null);
    } catch {}
  }, []);

  useEffect(() => {
    // Always check via direct API call — don't rely on cached connections
    // This ensures Gmail is detected immediately after OAuth redirect
    fetch('/api/agents/email/check-connection', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        setGmailConnected(d.gmail_connected || false);
        setGmailEmail(d.gmail_email || null);
        if (typeof window !== 'undefined') (window as any).__gmailConnected = d.gmail_connected;
      })
      .catch(() => {
        // Fallback to cached connections
        if (connections?.gmail) {
          setGmailConnected(true);
          setGmailEmail((connections as any).gmail_email || null);
        }
      })
      .finally(() => setLoading(false));
  }, [connections]);

  if (loading) return null;

  if (gmailConnected) {
    return (
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 mb-3 flex items-center gap-3">
        <span className="text-lg">{'\u2709\uFE0F'}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-emerald-400">Email connecte</p>
          <p className="text-[10px] text-white/50">Les emails partent de <strong className="text-white/80">{gmailEmail}</strong></p>
        </div>
        <button onClick={handleDisconnect} className="text-[9px] text-white/20 hover:text-red-400/60 transition">Deconnecter</button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 mb-3">
      <div className="flex items-start gap-3">
        <span className="text-xl">{'\u{1F4E7}'}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-white mb-1">Connecte ton email pour plus d&apos;impact</p>
          <p className="text-[10px] text-white/50 mb-3 leading-relaxed">
            Hugo envoie actuellement depuis contact@keiroai.com. Connecte ton Gmail ou Outlook pour que les emails partent de <strong className="text-white/70">ton propre email</strong> — meilleur taux d&apos;ouverture et plus de confiance.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href="/api/auth/gmail-oauth" className="inline-flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/15 text-white text-[10px] font-bold rounded-lg transition min-h-[36px]">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24"><path fill="#EA4335" d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3C17.782 1.145 15.055 0 12 0 7.27 0 3.198 2.698 1.24 6.65l4.026 3.115Z"/><path fill="#34A853" d="M16.04 18.013c-1.09.703-2.474 1.078-4.04 1.078a7.077 7.077 0 0 1-6.723-4.823l-4.04 3.067A11.965 11.965 0 0 0 12 24c2.933 0 5.735-1.043 7.834-3l-3.793-2.987Z"/><path fill="#4A90D9" d="M19.834 21c2.195-2.048 3.62-5.096 3.62-9 0-.71-.109-1.473-.272-2.182H12v4.637h6.436c-.317 1.559-1.17 2.766-2.395 3.558L19.834 21Z"/><path fill="#FBBC05" d="M5.277 14.268A7.12 7.12 0 0 1 4.909 12c0-.782.125-1.533.357-2.235L1.24 6.65A11.934 11.934 0 0 0 0 12c0 1.92.445 3.73 1.237 5.335l4.04-3.067Z"/></svg>
              Connecter Gmail
            </a>
            <div className="text-[9px] text-white/30 self-center">Outlook bientot</div>
          </div>
          <p className="text-[9px] text-white/25 mt-2">
            Pas de Gmail ? Tu peux aussi creer un gmail dedie a ta prospection (ex: contact@tonbusiness.com) ou <a href="https://cal.com" className="underline hover:text-white/40">prendre un RDV</a> pour qu&apos;on configure ton domaine custom.
          </p>
        </div>
      </div>
    </div>
  );
}

// Hot prospects notification — shown directly in agent dashboard
export function HotProspectsAlert({ source, gradientFrom }: { source?: string; gradientFrom: string }) {
  const [prospects, setProspects] = useState<Array<{ id: string; company: string; email: string; temperature: string; status: string; type: string }>>([]);

  useEffect(() => {
    fetch('/api/crm/export?format=json', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const hot = (d.prospects || []).filter((p: any) => p.temperature === 'hot').slice(0, 5);
        setProspects(hot);
      }).catch(() => {});
  }, []);

  if (prospects.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{'\u{1F525}'}</span>
        <span className="text-xs font-bold text-amber-400">{prospects.length} prospect{prospects.length > 1 ? 's' : ''} chaud{prospects.length > 1 ? 's' : ''} — a contacter en priorite !</span>
      </div>
      <div className="space-y-2">
        {prospects.map(p => (
          <div key={p.id} className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2">
            <span className="text-xs text-amber-400">{'\u{1F525}'}</span>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium text-white">{p.company || p.email}</span>
              {p.type && <span className="text-[9px] text-white/30 ml-2">{p.type}</span>}
            </div>
            <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded">{p.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
