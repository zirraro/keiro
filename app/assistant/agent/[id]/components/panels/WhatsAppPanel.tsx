'use client';

/**
 * Stella — WhatsApp Business dashboard panel.
 * Extracted from AgentDashboard.tsx.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  fmt, fmtPercent,
  KpiCard, SectionTitle, DonutChart, ProgressBar,
} from './Primitives';
import { DEMO_WHATSAPP_STATS } from '../AgentPreviewData';
import { useLanguage } from '@/lib/i18n/context';
import { launchWhatsAppEmbeddedSignup, preloadFbSdk, fbSdkReady, hostedSignupUrl } from '@/lib/whatsapp-embedded-signup';
import type { PanelProps } from './types';

// Bouton "Connecter mon numéro WhatsApp" — lance le vrai Embedded Signup Meta.
// Visible pour TOUT le monde (admin inclus) : la bannière Clara "Configurer
// WhatsApp" étant masquée aux admins, ce bouton garantit un point d'entrée fiable.
// Auto-diagnostic : si le SDK Facebook est bloqué par le navigateur (Firefox/Brave
// anti-pistage), on le détecte et on propose le flux Meta-hosted (navigation, non
// bloquée) + un message clair.
function ConnectWhatsAppButton({ en }: { en: boolean }) {
  const [msg, setMsg] = useState('');
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    preloadFbSdk();
    // Après ~4s, si window.FB n'est toujours pas là → le navigateur bloque le SDK.
    const t = setTimeout(() => { if (!fbSdkReady()) setBlocked(true); }, 4000);
    return () => clearTimeout(t);
  }, []);
  const onClick = () => {
    setMsg('');
    if (!fbSdkReady()) {
      // SDK indisponible → bascule directement sur le flux hosted (marche partout).
      setBlocked(true);
      window.location.href = hostedSignupUrl();
      return;
    }
    launchWhatsAppEmbeddedSignup({
      onSuccess: () => window.location.reload(),
      onError: (m) => setMsg(m),
      onUnavailable: async () => {
        try {
          const r = await fetch('/api/stripe/create-checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ planKey: 'stella_addon' }) });
          const d = await r.json();
          if (d?.url) window.location.href = d.url;
          else setMsg(en ? 'Activation available shortly.' : 'Activation disponible très bientôt.');
        } catch { setMsg(en ? 'Please try again.' : 'Réessaie.'); }
      },
    });
  };
  return (
    <div className="flex flex-col gap-1">
      <button type="button" onClick={onClick}
        className="px-3 py-2 rounded-lg bg-[#25D366] text-[#0b141a] text-[12px] font-bold hover:opacity-90 transition text-center">
        {en ? 'Connect my WhatsApp number' : 'Connecter mon numéro WhatsApp'}
      </button>
      {blocked && (
        <span className="text-[10px] text-amber-300 leading-snug">
          {en
            ? 'Your browser (Firefox/Brave) blocks Facebook. Use Chrome, or click the button — we\'ll open the Facebook page directly.'
            : 'Ton navigateur (Firefox/Brave) bloque Facebook. Utilise Chrome, ou clique le bouton — on ouvre la page Facebook directement.'}
        </span>
      )}
      {msg && <span className="text-[10px] text-amber-300 leading-snug">{msg}</span>}
    </div>
  );
}

// ─── Espace Stella : conversations WhatsApp en direct + reprise en main ───
type WaConv = { phone: string; name: string; last: string; last_role: string; last_at: string; count: number };
type WaMsg = { role: string; message: string; type: string; date: string };

function StellaConversations({ en }: { en: boolean }) {
  const [convs, setConvs] = useState<WaConv[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [thread, setThread] = useState<WaMsg[]>([]);
  const [human, setHuman] = useState(false);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(() => {
    setLoading(true);
    fetch('/api/agents/whatsapp/conversations', { credentials: 'include' })
      .then(r => r.json()).then(d => { if (d.ok) setConvs(d.conversations || []); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  const loadThread = useCallback((phone: string) => {
    fetch(`/api/agents/whatsapp/conversations?phone=${encodeURIComponent(phone)}`, { credentials: 'include' })
      .then(r => r.json()).then(d => { if (d.ok) { setThread(d.messages || []); setHuman(!!d.human_takeover); } })
      .catch(() => {});
  }, []);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { if (sel) loadThread(sel); }, [sel, loadThread]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [thread]);

  const sendReply = async () => {
    if (!sel || !reply.trim()) return;
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/agents/whatsapp/reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ phone: sel, message: reply.trim() }),
      });
      const d = await r.json();
      if (d.ok) { setReply(''); setHuman(true); loadThread(sel); }
      else setErr(d.error || (en ? 'Error' : 'Erreur'));
    } catch (e: any) { setErr(e?.message || (en ? 'Error' : 'Erreur')); } finally { setBusy(false); }
  };

  const toggleTakeover = async (action: 'takeover' | 'resume') => {
    if (!sel) return;
    setBusy(true);
    try {
      const r = await fetch('/api/agents/whatsapp/reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ phone: sel, action }),
      });
      const d = await r.json();
      if (d.ok) setHuman(action === 'takeover');
    } catch { /* noop */ } finally { setBusy(false); }
  };

  const bubbleStyle = (role: string) =>
    role === 'user'
      ? 'bg-white/[0.06] text-white/85 self-start rounded-2xl rounded-bl-md'
      : role === 'human'
        ? 'bg-sky-500/25 text-white self-end rounded-2xl rounded-br-md'
        : 'bg-[#25D366]/20 text-white self-end rounded-2xl rounded-br-md'; // assistant = Stella
  const roleLabel = (role: string) => role === 'user' ? '' : role === 'human' ? (en ? 'You' : 'Toi') : 'Stella';

  return (
    <div className="rounded-xl border border-[#25D366]/25 bg-[#0b141a]/40 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <span className="text-sm font-semibold text-white/90">{en ? 'Stella — conversations' : 'Stella — conversations'}</span>
        <button onClick={loadList} className="text-[11px] text-white/40 hover:text-white/70">↻ {en ? 'Refresh' : 'Actualiser'}</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] min-h-[340px]">
        {/* Liste */}
        <div className={`border-r border-white/10 max-h-[420px] overflow-y-auto ${sel ? 'hidden md:block' : ''}`}>
          {loading ? (
            <div className="p-4 text-white/30 text-sm">{en ? 'Loading…' : 'Chargement…'}</div>
          ) : convs.length === 0 ? (
            <div className="p-4 text-white/30 text-xs leading-relaxed">{en ? 'No conversation yet. When a customer messages your WhatsApp, Stella replies and it shows here.' : 'Aucune conversation. Quand un client écrit sur ton WhatsApp, Stella répond et ça apparaît ici.'}</div>
          ) : convs.map((c) => (
            <button key={c.phone} onClick={() => setSel(c.phone)}
              className={`w-full text-left px-3 py-2.5 border-b border-white/5 hover:bg-white/[0.04] transition ${sel === c.phone ? 'bg-white/[0.06]' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-white/90 truncate">{c.name}</span>
                <span className="text-[9px] text-white/30 shrink-0">{new Date(c.last_at).toLocaleDateString(en ? 'en-US' : 'fr-FR', { day: 'numeric', month: 'short' })}</span>
              </div>
              <div className="text-[11px] text-white/45 truncate">{c.last_role !== 'user' ? '↩ ' : ''}{c.last}</div>
            </button>
          ))}
        </div>
        {/* Fil */}
        <div className={`flex flex-col ${sel ? '' : 'hidden md:flex'}`}>
          {!sel ? (
            <div className="flex-1 flex items-center justify-center text-white/25 text-sm p-6 text-center">{en ? 'Select a conversation' : 'Sélectionne une conversation'}</div>
          ) : (
            <>
              <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
                <button onClick={() => setSel(null)} className="md:hidden text-white/50 text-sm">←</button>
                <span className="text-[13px] font-semibold text-white/85 flex-1 truncate">{convs.find(c => c.phone === sel)?.name || sel}</span>
                {human
                  ? <button disabled={busy} onClick={() => toggleTakeover('resume')} className="text-[10px] px-2 py-1 rounded-full bg-[#25D366]/20 text-[#34d399] font-semibold">{en ? 'Give back to Stella' : 'Rendre la main à Stella'}</button>
                  : <button disabled={busy} onClick={() => toggleTakeover('takeover')} className="text-[10px] px-2 py-1 rounded-full bg-sky-500/20 text-sky-300 font-semibold">{en ? 'Take over' : 'Reprendre la main'}</button>}
              </div>
              <div className="flex-1 max-h-[300px] overflow-y-auto p-3 flex flex-col gap-2">
                {thread.map((m, i) => (
                  <div key={i} className={`max-w-[80%] px-3 py-2 ${bubbleStyle(m.role)}`}>
                    {roleLabel(m.role) && <div className="text-[9px] font-bold opacity-60 mb-0.5">{roleLabel(m.role)}</div>}
                    <div className="text-[12px] whitespace-pre-wrap leading-snug">{m.message}</div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
              {human && (
                <div className="px-3 pb-2 flex items-center gap-2">
                  <input value={reply} onChange={e => setReply(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendReply(); }}
                    placeholder={en ? 'Reply as you…' : 'Réponds toi-même…'} className="flex-1 bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white outline-none focus:border-[#25D366]/50" />
                  <button disabled={busy || !reply.trim()} onClick={sendReply} className="px-3 py-2 rounded-lg bg-[#25D366] text-[#0b141a] text-[12px] font-bold disabled:opacity-40">{en ? 'Send' : 'Envoyer'}</button>
                </div>
              )}
              {!human && <div className="px-3 pb-2 text-[10px] text-white/30 italic">{en ? 'Stella is handling this conversation. Take over to reply yourself.' : 'Stella gère cette conversation. Reprends la main pour répondre toi-même.'}</div>}
              {err && <div className="px-3 pb-2 text-[10px] text-red-400">{err}</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function WhatsAppPanel({ data, agentName, gradientFrom, gradientTo }: PanelProps) {
  const { t, locale } = useLanguage();
  const p = t.panels;
  const dateLocale = locale === 'en' ? 'en-US' : 'fr-FR';
  const stats: any = data.whatsappStats || {
    conversations: DEMO_WHATSAPP_STATS.conversations,
    activeConversations: DEMO_WHATSAPP_STATS.activeConversations,
    leadsGenerated: DEMO_WHATSAPP_STATS.leadsGenerated,
    responseRate: DEMO_WHATSAPP_STATS.responseRate,
    recentChats: DEMO_WHATSAPP_STATS.recentChats || [],
  };

  const statusColors: Record<string, string> = {
    active: '#34d399',
    replied: '#60a5fa',
    converted: '#e879f9',
    waiting: '#fbbf24',
  };

  const en = locale === 'en';
  const connected = !!(data as any).whatsappConnected;

  // Cas d'usage concrets de Stella (founder 03/07 : montrer ce qu'elle fait,
  // avec exemples). Conçus autour du GRATUIT (service) + utility pas cher.
  const capabilities = [
    { icon: '📅', title: en ? 'Booking confirmations' : 'Confirmations de réservation', desc: en ? 'Instant WhatsApp confirmation when a client books.' : 'Confirmation WhatsApp instantanée à chaque réservation.', ex: en ? '"Hi Marie ✅ Your table for 2 is confirmed for Fri 8pm. See you soon!"' : '« Bonjour Marie ✅ Ta table pour 2 est confirmée vendredi 20h. À très vite ! »' },
    { icon: '⏰', title: en ? 'No-show reminders' : 'Rappels anti no-show', desc: en ? 'Automatic reminder before the appointment — fewer no-shows.' : 'Rappel automatique avant le RDV — moins d\'absences.', ex: en ? '"Reminder: your appointment is tomorrow at 2pm. Reply YES to confirm 🙌"' : '« Rappel : ton RDV est demain à 14h. Réponds OUI pour confirmer 🙌 »' },
    { icon: '💬', title: en ? 'Auto-answer questions' : 'Réponses auto aux questions', desc: en ? 'Hours, availability, prices, menu — answered 24/7 (free service window).' : 'Horaires, dispo, prix, carte — répondu 24/7 (fenêtre service gratuite).', ex: en ? '"We\'re open until 11pm tonight, and yes we have a vegan menu 🌱"' : '« On est ouverts jusqu\'à 23h ce soir, et oui on a une carte vegan 🌱 »' },
    { icon: '📦', title: en ? 'Order / ready-to-pickup' : 'Statut commande / prêt', desc: en ? 'Notify when an order is ready or on its way.' : 'Prévenir quand une commande est prête ou en route.', ex: en ? '"Your order #182 is ready for pickup 🎉"' : '« Ta commande n°182 est prête à récupérer 🎉 »' },
    { icon: '⭐', title: en ? 'Review follow-up' : 'Relance avis', desc: en ? 'Post-visit message that invites a Google review (hands off to Théo).' : 'Message post-visite qui invite à un avis Google (relais Théo).', ex: en ? '"Thanks for coming by! A quick Google review would help us a lot 🙏"' : '« Merci de ta visite ! Un petit avis Google nous aiderait beaucoup 🙏 »' },
    { icon: '📣', title: en ? 'Occasional campaigns' : 'Campagnes ponctuelles', desc: en ? 'Targeted promo broadcast — used sparingly to protect deliverability.' : 'Broadcast promo ciblé — avec parcimonie pour préserver la délivrabilité.', ex: en ? '"This weekend: -20% on all bouquets 💐 Order here 👇"' : '« Ce week-end : -20% sur tous les bouquets 💐 Commande ici 👇 »' },
  ];

  return (
    <>
      {/* Connexion du numéro WhatsApp — point d'entrée fiable (Embedded Signup). */}
      {!connected && (
        <div className="mb-3 flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border border-[#25D366]/30 bg-[#25D366]/[0.06] p-3">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white/90">{en ? 'Connect your WhatsApp Business number' : 'Connecte ton numéro WhatsApp Business'}</div>
            <div className="text-[11px] text-white/50 leading-relaxed">{en ? 'One click — pick your number and Stella starts replying automatically.' : 'En un clic — choisis ton numéro et Stella répond automatiquement.'}</div>
          </div>
          <ConnectWhatsAppButton en={en} />
        </div>
      )}

      {/* Espace Stella — conversations en direct + reprise en main (données réelles) */}
      <StellaConversations en={en} />

      {/* Ce que Stella fait — cas d'usage concrets avec exemples */}
      <div className="rounded-xl border border-[#25D366]/25 bg-[#25D366]/[0.05] p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="text-sm font-semibold text-white/90">{en ? '💚 What Stella does for you' : '💚 Ce que Stella fait pour toi'}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${connected ? 'bg-[#25D366]/20 text-[#34d399]' : 'bg-amber-500/15 text-amber-300'}`}>
            {connected ? (en ? 'Connected — live data' : 'Connecté — données réelles') : (en ? 'Preview — examples' : 'Aperçu — exemples')}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {capabilities.map((c, i) => (
            <div key={i} className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
              <div className="text-[12px] font-semibold text-white/85 mb-0.5">{c.icon} {c.title}</div>
              <div className="text-[10px] text-white/45 leading-relaxed mb-1.5">{c.desc}</div>
              <div className="text-[10px] italic text-[#34d399]/80 leading-relaxed border-l-2 border-[#25D366]/30 pl-2">{c.ex}</div>
            </div>
          ))}
        </div>
        {!connected && (
          <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-2.5">
            <span className="text-[11px] text-amber-100/80 flex-1">
              {en
                ? 'Connect a WhatsApp Business number to turn these on for real. Included in Business, or +19€/mo add-on.'
                : 'Connecte un numéro WhatsApp Business pour les activer pour de vrai. Inclus dans Business, ou add-on +19€/mois.'}
            </span>
            <button
              type="button"
              onClick={async () => {
                try {
                  const r = await fetch('/api/stripe/create-checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ planKey: 'stella_addon' }) });
                  const d = await r.json();
                  if (d?.url) window.location.href = d.url;
                } catch { /* noop */ }
              }}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-[#25D366] text-[#0b141a] text-[11px] font-bold hover:opacity-90 transition text-center"
            >
              {en ? 'Activate Stella — €19/mo' : 'Activer Stella — 19€/mois'}
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-4">
        <KpiCard label={p.whatsappKpiSent} value={fmt(stats.messagesSent)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label={p.whatsappKpiReceived} value={fmt(stats.messagesReceived)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label={p.whatsappKpiRate} value={fmtPercent(stats.responseRate)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label={p.whatsappKpiLeads} value={fmt(stats.leadsGenerated)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      {/* Performance visuelle */}
      <SectionTitle>{p.whatsappSectionPerf}</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 p-4 bg-white/[0.02]">
          <DonutChart
            segments={[
              { value: stats.messagesSent, color: '#25D366', label: p.whatsappLabelSent },
              { value: stats.messagesReceived, color: '#128C7E', label: p.whatsappLabelReceived },
              { value: stats.leadsGenerated, color: '#fbbf24', label: p.whatsappLabelLeads },
            ]}
            label={`${stats.responseRate}%`}
          />
        </div>
        <div className="rounded-xl border border-white/10 p-4 bg-white/[0.02] space-y-3">
          <ProgressBar value={stats.messagesReceived} max={Math.max(stats.messagesSent, 1)} color="#25D366" label={p.whatsappKpiRate} />
          <ProgressBar value={stats.leadsGenerated} max={Math.max(stats.messagesReceived, 1)} color="#fbbf24" label={p.whatsappLabelLeadRate} />
          <ProgressBar value={stats.conversationsActive} max={Math.max(stats.messagesSent, 1)} color="#128C7E" label={p.whatsappLabelConvsActive} />
        </div>
      </div>

      {/* Active conversations */}
      <SectionTitle>{p.whatsappSectionActive.replace('{n}', String(stats.conversationsActive))}</SectionTitle>
      {stats.recentConversations && stats.recentConversations.length > 0 ? (
        <div className="space-y-2">
          {(stats.recentConversations || []).map((conv: any, i: number) => (
            <div key={i} className="bg-white/5 rounded-xl border border-white/10 p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#25D366]/20 flex items-center justify-center flex-shrink-0">
                <span className="text-sm">{'\uD83D\uDCF2'}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">{conv.contact}</div>
                <div className="text-xs text-white/40 truncate">{conv.lastMessage}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColors[conv.status] || '#6b7280' }} />
                <span className="text-[10px] text-white/40">{new Date(conv.date).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' })}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-6 text-white/30 text-sm">{p.whatsappNoConvs}</div>
      )}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href="/generate" className="px-4 py-2 bg-gradient-to-r from-[#25D366] to-[#128C7E] text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all">
          {'\u2728'} {p.whatsappBtnCreateTemplate}
        </a>
        <a href="/assistant/crm" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u{1F4CA}'} {p.viewCrm}
        </a>
      </div>
    </>
  );
}
