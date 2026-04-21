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
import { useLanguage } from '@/lib/i18n/context';

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
      // Force full page reload so all panels (DM, Content, Comments, Header dropdown) reflect the disconnect
      window.location.reload();
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

// Email connection banner — Gmail OAuth, custom SMTP form, or book a setup call.
export function EmailConnectBanner({ connections }: { connections?: Record<string, boolean> }) {
  const { locale } = useLanguage();
  const en = locale === 'en';
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [smtpConnected, setSmtpConnected] = useState(false);
  const [smtpFromEmail, setSmtpFromEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSmtpForm, setShowSmtpForm] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [gmailRes, smtpRes] = await Promise.all([
        fetch('/api/agents/email/check-connection', { credentials: 'include' }).then(r => r.json()).catch(() => ({})),
        fetch('/api/auth/smtp', { credentials: 'include' }).then(r => r.json()).catch(() => ({})),
      ]);
      setGmailConnected(!!gmailRes.gmail_connected);
      setGmailEmail(gmailRes.gmail_email || null);
      setSmtpConnected(!!smtpRes.connected);
      setSmtpFromEmail(smtpRes.from_email || null);
      if (typeof window !== 'undefined') (window as any).__gmailConnected = gmailRes.gmail_connected;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleDisconnectGmail = useCallback(async () => {
    const msg = en
      ? 'Disconnect Gmail? Emails will fall back to your SMTP or contact@keiroai.com.'
      : 'Déconnecter Gmail ? Les emails basculeront sur ton SMTP ou contact@keiroai.com.';
    if (typeof window !== 'undefined' && !window.confirm(msg)) return;
    try {
      await fetch('/api/agents/email/check-connection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'disconnect_gmail' }) });
      await refresh();
    } catch {}
  }, [en, refresh]);

  const handleDisconnectSmtp = useCallback(async () => {
    const msg = en
      ? 'Remove SMTP credentials? Hugo will fall back to Gmail or contact@keiroai.com.'
      : 'Supprimer les identifiants SMTP ? Hugo basculera sur Gmail ou contact@keiroai.com.';
    if (typeof window !== 'undefined' && !window.confirm(msg)) return;
    try {
      await fetch('/api/auth/smtp', { method: 'DELETE', credentials: 'include' });
      await refresh();
    } catch {}
  }, [en, refresh]);

  if (loading) return null;

  // Connected state — show a compact status strip with both channels.
  if (gmailConnected || smtpConnected) {
    return (
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 mb-3 space-y-2">
        {gmailConnected && (
          <div className="flex items-center gap-3">
            <span className="text-lg">{'\u2709\uFE0F'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-emerald-400">{en ? 'Gmail connected' : 'Gmail connecté'}</p>
              <p className="text-[10px] text-white/50">{en ? 'Hugo sends from' : 'Hugo envoie depuis'} <strong className="text-white/80">{gmailEmail}</strong></p>
            </div>
            <button onClick={handleDisconnectGmail} className="text-[9px] text-white/20 hover:text-red-400/60 transition">{en ? 'Disconnect' : 'Déconnecter'}</button>
          </div>
        )}
        {smtpConnected && (
          <div className="flex items-center gap-3">
            <span className="text-lg">{'\u2699\uFE0F'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-emerald-400">{en ? 'Custom SMTP connected' : 'SMTP personnalisé connecté'}</p>
              <p className="text-[10px] text-white/50">{en ? 'Hugo sends from' : 'Hugo envoie depuis'} <strong className="text-white/80">{smtpFromEmail}</strong></p>
            </div>
            <button onClick={handleDisconnectSmtp} className="text-[9px] text-white/20 hover:text-red-400/60 transition">{en ? 'Remove' : 'Supprimer'}</button>
          </div>
        )}
      </div>
    );
  }

  // No connection yet — show CTA block with 3 options.
  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 mb-3">
      <div className="flex items-start gap-3">
        <span className="text-xl">{'\u{1F4E7}'}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-white mb-1">
            {en ? 'Connect your email for maximum impact' : 'Connecte ton email pour plus d\'impact'}
          </p>
          <p className="text-[10px] text-white/50 mb-3 leading-relaxed">
            {en
              ? <>Hugo is sending from contact@keiroai.com for now. Connect your Gmail or custom SMTP so emails leave from <strong className="text-white/70">your own address</strong> — better open rate, more trust.</>
              : <>Hugo envoie actuellement depuis contact@keiroai.com. Connecte ton Gmail ou ton SMTP perso pour que les emails partent de <strong className="text-white/70">ton propre email</strong> — meilleur taux d&apos;ouverture et plus de confiance.</>}
          </p>
          <div className="flex flex-wrap gap-2 mb-2">
            <a href="/api/auth/gmail-oauth" className="inline-flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/15 text-white text-[10px] font-bold rounded-lg transition min-h-[36px]">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24"><path fill="#EA4335" d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3C17.782 1.145 15.055 0 12 0 7.27 0 3.198 2.698 1.24 6.65l4.026 3.115Z"/><path fill="#34A853" d="M16.04 18.013c-1.09.703-2.474 1.078-4.04 1.078a7.077 7.077 0 0 1-6.723-4.823l-4.04 3.067A11.965 11.965 0 0 0 12 24c2.933 0 5.735-1.043 7.834-3l-3.793-2.987Z"/><path fill="#4A90D9" d="M19.834 21c2.195-2.048 3.62-5.096 3.62-9 0-.71-.109-1.473-.272-2.182H12v4.637h6.436c-.317 1.559-1.17 2.766-2.395 3.558L19.834 21Z"/><path fill="#FBBC05" d="M5.277 14.268A7.12 7.12 0 0 1 4.909 12c0-.782.125-1.533.357-2.235L1.24 6.65A11.934 11.934 0 0 0 0 12c0 1.92.445 3.73 1.237 5.335l4.04-3.067Z"/></svg>
              {en ? 'Connect Gmail' : 'Connecter Gmail'}
            </a>
            <button onClick={() => setShowSmtpForm(v => !v)} className="inline-flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/15 text-white text-[10px] font-bold rounded-lg transition min-h-[36px]">
              {'\u2699\uFE0F'} {en ? (showSmtpForm ? 'Hide form' : 'Custom SMTP (my own domain)') : (showSmtpForm ? 'Masquer' : 'SMTP perso (domaine à moi)')}
            </button>
            <a
              href={process.env.NEXT_PUBLIC_SETUP_CALL_URL || 'https://cal.com/keiroai/setup-30min'}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-white/10 hover:border-white/20 text-white/70 text-[10px] font-bold rounded-lg transition min-h-[36px]"
            >
              {'\u{1F4C5}'} {en ? 'Book a setup call (30 min)' : 'Prendre un RDV setup (30 min)'}
            </a>
          </div>

          {showSmtpForm && <SmtpCustomForm onDone={refresh} />}
        </div>
      </div>
    </div>
  );
}

// Inline form to paste custom SMTP creds. Tests the connection server-side
// (real handshake) before saving — bad creds never touch the DB.
function SmtpCustomForm({ onDone }: { onDone: () => Promise<void> }) {
  const { locale } = useLanguage();
  const en = locale === 'en';
  const [host, setHost] = useState('');
  const [port, setPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [password, setPassword] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/auth/smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          host: host.trim(),
          port: Number(port),
          user: smtpUser.trim(),
          password,
          from_email: fromEmail.trim() || smtpUser.trim(),
          from_name: fromName.trim() || undefined,
          secure: Number(port) === 465,
        }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        setErr(data?.error || (en ? 'Save failed' : 'Échec de l\'enregistrement'));
      } else {
        await onDone();
      }
    } finally {
      setBusy(false);
    }
  };

  const presets: Array<{ label: string; host: string; port: number }> = [
    { label: 'OVH', host: 'ssl0.ovh.net', port: 587 },
    { label: 'Gandi', host: 'mail.gandi.net', port: 587 },
    { label: 'Infomaniak', host: 'mail.infomaniak.com', port: 587 },
    { label: 'Outlook/365', host: 'smtp.office365.com', port: 587 },
    { label: 'iCloud', host: 'smtp.mail.me.com', port: 587 },
    { label: 'Zoho', host: 'smtp.zoho.com', port: 587 },
  ];

  return (
    <form onSubmit={submit} className="mt-3 p-3 rounded-lg bg-black/20 border border-white/10 space-y-2">
      <p className="text-[10px] text-white/60">
        {en
          ? <>Paste your SMTP credentials — we test the connection live and only save if it works. The password is encrypted at rest (AES-256-GCM).</>
          : <>Colle tes identifiants SMTP — on teste la connexion en direct et on sauvegarde uniquement si ça marche. Le mot de passe est chiffré en base (AES-256-GCM).</>}
      </p>
      <div className="flex flex-wrap gap-1">
        {presets.map(p => (
          <button
            key={p.label} type="button"
            onClick={() => { setHost(p.host); setPort(String(p.port)); }}
            className="px-2 py-1 text-[9px] bg-white/5 hover:bg-white/10 text-white/60 rounded"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input value={host} onChange={e => setHost(e.target.value)} placeholder="SMTP host (ssl0.ovh.net)" className="px-2 py-1.5 text-xs bg-black/30 border border-white/10 rounded text-white placeholder-white/30" required />
        <input value={port} onChange={e => setPort(e.target.value)} placeholder="Port (587 or 465)" className="px-2 py-1.5 text-xs bg-black/30 border border-white/10 rounded text-white placeholder-white/30" required />
        <input value={smtpUser} onChange={e => setSmtpUser(e.target.value)} placeholder={en ? 'SMTP user (your email)' : 'Utilisateur SMTP (ton email)'} className="px-2 py-1.5 text-xs bg-black/30 border border-white/10 rounded text-white placeholder-white/30" required />
        <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder={en ? 'Password / app password' : 'Mot de passe / app password'} className="px-2 py-1.5 text-xs bg-black/30 border border-white/10 rounded text-white placeholder-white/30" required />
        <input value={fromEmail} onChange={e => setFromEmail(e.target.value)} placeholder={en ? 'From email (default = user)' : 'Email expéditeur (défaut = user)'} className="px-2 py-1.5 text-xs bg-black/30 border border-white/10 rounded text-white placeholder-white/30" />
        <input value={fromName} onChange={e => setFromName(e.target.value)} placeholder={en ? 'From name (optional)' : 'Nom expéditeur (optionnel)'} className="px-2 py-1.5 text-xs bg-black/30 border border-white/10 rounded text-white placeholder-white/30" />
      </div>
      {err && <p className="text-[10px] text-red-400">{err}</p>}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9px] text-white/40">
          {en
            ? <>Need help? <a href={process.env.NEXT_PUBLIC_SETUP_CALL_URL || 'https://cal.com/keiroai/setup-30min'} target="_blank" rel="noopener noreferrer" className="underline hover:text-white/70">Book a 30-min call</a> and we set it up together.</>
            : <>Besoin d&apos;aide ? <a href={process.env.NEXT_PUBLIC_SETUP_CALL_URL || 'https://cal.com/keiroai/setup-30min'} target="_blank" rel="noopener noreferrer" className="underline hover:text-white/70">Prends un RDV 30 min</a> et on le fait ensemble.</>}
        </p>
        <button type="submit" disabled={busy} className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold rounded-lg transition disabled:opacity-50">
          {busy ? (en ? 'Testing…' : 'Test en cours…') : (en ? 'Test & save' : 'Tester & sauvegarder')}
        </button>
      </div>
    </form>
  );
}

// "Reprends la main" notifications strip — shown above each panel that
// wants to surface unread agent notifications. Used by DmInstagramPanel
// and the main AgentDashboard wrapper.
export function AgentNotifications({ agentId }: { agentId: string }) {
  const [notifs, setNotifs] = useState<any[]>([]);
  const { locale } = useLanguage();

  // Pick the locale-specific copy with graceful fallback: EN locale reads
  // title_en/message_en, falls back to title_fr, then to the legacy title.
  const titleFor = (n: any) => {
    if (locale === 'en') return n.title_en || n.title_fr || n.title;
    return n.title_fr || n.title;
  };
  const messageFor = (n: any) => {
    if (locale === 'en') return n.message_en || n.message_fr || n.message;
    return n.message_fr || n.message;
  };

  useEffect(() => {
    fetch('/api/notifications', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const agentNotifs = (d.notifications || [])
          .filter((n: any) => n.agent === agentId && !n.read)
          .slice(0, 3);
        setNotifs(agentNotifs);
      })
      .catch(() => {});
  }, [agentId]);

  const markRead = useCallback(async (id: string) => {
    setNotifs(prev => prev.filter(n => n.id !== id));
    try {
      await fetch('/api/notifications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ action: 'mark_read', id }),
      });
    } catch {}
  }, []);

  if (notifs.length === 0) return null;

  return (
    <div className="space-y-2 mb-3">
      {notifs.map(n => (
        <div key={n.id} className={`rounded-xl border p-3 flex items-start gap-3 ${n.type === 'action' ? 'border-red-500/30 bg-red-500/5' : 'border-blue-500/20 bg-blue-500/5'}`}>
          <span className="text-lg mt-0.5">{n.type === 'action' ? '\u{1F525}' : '\u{1F514}'}</span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-white">{titleFor(n)}</div>
            <div className="text-[10px] text-white/50 mt-0.5">{messageFor(n)}</div>
          </div>
          <button onClick={() => markRead(n.id)} className="text-[9px] text-white/30 hover:text-white/60 px-2 py-1 bg-white/5 rounded-lg flex-shrink-0">OK</button>
        </div>
      ))}
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
