'use client';

/**
 * OPTION B (post-CASA) — panneau DÉMO/UsAGE de la gestion native de la boîte Gmail.
 * Montre `gmail.readonly` (liste des mails reçus) + `gmail.compose` (bouton qui
 * crée un brouillon NATIF dans le Gmail du client). Sert de surface pour la vidéo
 * de vérification Google ET de fonctionnalité réelle une fois Option B validée.
 *
 * AUTO-GATÉ : interroge /api/me/gmail-inbox ; si Option B est OFF (GMAIL_OPTION_B
 * ≠ on côté serveur) l'endpoint renvoie enabled:false → le composant rend `null`.
 * → INVISIBLE en prod aujourd'hui, zéro impact.
 */

import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/i18n/context';

type Msg = { id: string; threadId: string; from: string; subject: string; snippet: string; date: string; unread: boolean };

export default function GmailNativeInbox() {
  const { locale } = useLanguage();
  const en = locale === 'en';
  const [enabled, setEnabled] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafting, setDrafting] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [acting, setActing] = useState<string | null>(null);
  const [triaging, setTriaging] = useState(false);
  const [triageMsg, setTriageMsg] = useState('');
  const [labels, setLabels] = useState<{ id: string; name: string }[]>([]);
  const loadLabels = () => {
    fetch('/api/me/gmail-inbox?labels=1', { credentials: 'include' })
      .then(r => r.json()).then(d => { if (d.enabled) setLabels(d.labels || []); }).catch(() => {});
  };

  // Hugo trie/nettoie/range la boîte en autonomie (Option B).
  const runTriage = async () => {
    setTriaging(true); setTriageMsg('');
    try {
      const r = await fetch('/api/agents/email/mailbox-triage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: '{}' });
      const d = await r.json();
      if (d.ok) {
        setTriageMsg(d.summary || (en ? 'Inbox sorted.' : 'Boîte triée.'));
        // Recharge la boîte + les dossiers (Hugo a pu en créer) pour refléter le tri.
        try { const rr = await fetch('/api/me/gmail-inbox', { credentials: 'include' }).then(x => x.json()); setMsgs(rr.messages || []); } catch {}
        loadLabels();
      } else setTriageMsg(d.error || (en ? 'Failed' : 'Échec'));
    } catch { setTriageMsg(en ? 'Failed' : 'Échec'); } finally { setTriaging(false); }
  };

  // Gestion de la boîte (corbeille / archive / lu) — gmail.modify. Optimiste :
  // on retire le message de la liste immédiatement (trash/archive).
  const manage = async (m: Msg, action: 'trash' | 'archive' | 'read') => {
    setActing(m.id + action);
    if (action === 'trash' || action === 'archive') setMsgs(prev => prev.filter(x => x.id !== m.id));
    try {
      await fetch('/api/me/gmail-inbox', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ messageId: m.id, action }),
      });
    } catch { /* optimistic */ } finally { setActing(null); }
  };

  useEffect(() => {
    fetch('/api/me/gmail-inbox', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setEnabled(!!d.enabled); setMsgs(d.messages || []); if (d.enabled) loadLabels(); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || !enabled) return null; // Option B off → invisible

  const senderName = (from: string) => from.replace(/<[^>]+>/, '').replace(/"/g, '').trim() || from;
  const senderEmail = (from: string) => { const m = from.match(/<([^>]+)>/); return m ? m[1] : from.trim(); };

  const makeDraft = async (m: Msg) => {
    setDrafting(m.id);
    try {
      const to = senderEmail(m.from);
      const subject = /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`;
      const htmlBody = en
        ? `<p>Hello,</p><p>Thank you for your message. I'm getting back to you shortly with all the details.</p><p>Best regards,</p>`
        : `<p>Bonjour,</p><p>Merci pour votre message. Je reviens vers vous très vite avec tous les détails.</p><p>Bien à vous,</p>`;
      const r = await fetch('/api/me/gmail-inbox', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ to, subject, htmlBody, threadId: m.threadId }),
      });
      const d = await r.json();
      if (d.ok) setDone(prev => ({ ...prev, [m.id]: true }));
    } finally { setDrafting(null); }
  };

  return (
    <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] p-3 sm:p-4 mb-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-white font-bold text-sm flex items-center gap-1.5">
          {'\u{1F4E5}'} {en ? 'Your Gmail inbox (Hugo)' : 'Ta boîte Gmail (Hugo)'}
        </h3>
        <span className="text-[10px] text-emerald-300/70">{en ? 'Native · read-only' : 'Natif · lecture seule'}</span>
      </div>
      <p className="text-[11px] text-white/50 mb-2 leading-relaxed">
        {en
          ? 'Hugo reads your inbox, drafts replies, and sorts/cleans/labels it like an expert assistant — asking you when in doubt.'
          : 'Hugo lit ta boîte, prépare des réponses, et la trie/nettoie/range comme un assistant expert — et te pose une question en cas de doute.'}
      </p>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button type="button" onClick={runTriage} disabled={triaging}
          className="text-[11px] px-3 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-200 font-semibold hover:bg-indigo-500/30 disabled:opacity-50">
          {triaging ? (en ? 'Hugo is sorting…' : 'Hugo trie…') : (en ? '🧹 Sort & tidy my inbox' : '🧹 Trier & ranger ma boîte')}
        </button>
        {triageMsg && <span className="text-[10px] text-emerald-300">{triageMsg}</span>}
      </div>
      {labels.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-wide text-white/40 mb-1">{en ? 'Folders (Hugo\'s filing)' : 'Dossiers (rangement de Hugo)'}</div>
          <div className="flex flex-wrap gap-1.5">
            {labels.map(l => (
              <span key={l.id} className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-white/70">📁 {l.name}</span>
            ))}
          </div>
        </div>
      )}

      {msgs.length === 0 ? (
        <div className="text-white/30 text-xs py-4 text-center">{en ? 'No recent message.' : 'Aucun message récent.'}</div>
      ) : (
        <div className="space-y-1.5">
          {msgs.map(m => (
            <div key={m.id} className="rounded-lg border border-white/10 bg-black/20 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  {m.unread && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />}
                  <span className="text-[12px] font-semibold text-white/90 truncate">{senderName(m.from)}</span>
                </div>
                <span className="text-[9px] text-white/30 shrink-0">{m.date ? new Date(m.date).toLocaleDateString(en ? 'en-US' : 'fr-FR', { day: 'numeric', month: 'short' }) : ''}</span>
              </div>
              <div className="text-[11px] text-white/70 truncate mt-0.5">{m.subject || (en ? '(no subject)' : '(sans objet)')}</div>
              <div className="text-[10px] text-white/40 line-clamp-2 mt-0.5">{m.snippet}</div>
              <div className="flex items-center justify-between gap-2 gap-y-1.5 mt-1.5 flex-wrap">
                {/* Gestion de la boîte : trier / ranger / supprimer */}
                <div className="flex items-center gap-1.5">
                  <button type="button" disabled={acting === m.id + 'read'} onClick={() => manage(m, 'read')} title={en ? 'Mark as read' : 'Marquer comme lu'}
                    className="text-[10px] px-2 py-1 rounded-md border border-white/10 text-white/50 hover:text-white/80 disabled:opacity-50">{en ? 'Read' : 'Lu'}</button>
                  <button type="button" disabled={acting === m.id + 'archive'} onClick={() => manage(m, 'archive')} title={en ? 'Archive' : 'Archiver'}
                    className="text-[10px] px-2 py-1 rounded-md border border-white/10 text-white/50 hover:text-white/80 disabled:opacity-50">{en ? 'Archive' : 'Archiver'}</button>
                  <button type="button" disabled={acting === m.id + 'trash'} onClick={() => manage(m, 'trash')} title={en ? 'Move to trash' : 'Mettre à la corbeille'}
                    className="text-[10px] px-2 py-1 rounded-md border border-red-500/25 text-red-300/80 hover:text-red-300 hover:border-red-500/50 disabled:opacity-50">{'🗑'} {en ? 'Trash' : 'Corbeille'}</button>
                </div>
                {done[m.id] ? (
                  <span className="text-[10px] text-emerald-300 font-semibold">{en ? '✓ Draft created' : '✓ Brouillon créé'}</span>
                ) : (
                  <button
                    type="button"
                    disabled={drafting === m.id}
                    onClick={() => makeDraft(m)}
                    className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold hover:bg-emerald-500/30 disabled:opacity-50"
                  >
                    {drafting === m.id ? (en ? 'Preparing…' : 'Préparation…') : (en ? 'Reply (draft)' : 'Répondre (brouillon)')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Toggle Option B (gestion complète de la boîte) — founder 25/07 ───
// Visible uniquement si NEXT_PUBLIC_MAILBOX_BETA=on (founder/test users), pour
// démo review + test. Activer → reconnexion Gmail avec scopes readonly+compose+
// modify (le callback pose le flag full_mailbox). Désactiver → coupe le flag.
export function MailboxBetaToggle() {
  const { locale } = useLanguage();
  const en = locale === 'en';
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    // Visible pour TOUS les clients (founder 25/07) — teaser "en cours d'intégration"
    // + fonctionnel pour les test users. Zéro impact : activer passe par un
    // consentement Google explicite (per-user).
    fetch('/api/me/mailbox-toggle', { credentials: 'include' })
      .then(r => r.json()).then(d => setEnabled(!!d.enabled)).catch(() => setEnabled(false));
  }, []);
  if (enabled === null) return null;

  const toggle = async () => {
    setBusy(true);
    if (!enabled) {
      // Activer = reconnexion OAuth (consentement scopes étendus requis).
      window.location.href = '/api/auth/gmail-oauth?optionB=1&returnTo=/assistant/agent/email';
      return;
    }
    try {
      await fetch('/api/me/mailbox-toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ enable: false }) });
      setEnabled(false);
    } catch { /* noop */ } finally { setBusy(false); }
  };

  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-indigo-500/25 bg-indigo-500/[0.06] p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-white/90">{en ? 'Full mailbox management' : 'Gestion complète de la boîte'}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-200 font-semibold">{en ? 'Feature in integration' : 'Fonctionnalité en cours d\'intégration'}</span>
        </div>
        <div className="text-[11px] text-white/50 leading-relaxed mt-0.5">
          {en ? 'Let Hugo read your inbox, draft native replies, and sort/trash/archive emails. Requires reconnecting Gmail with extended permissions.' : 'Hugo lit ta boîte, prépare des brouillons natifs, et trie/archive/supprime les mails. Nécessite de reconnecter Gmail avec les permissions étendues.'}
        </div>
      </div>
      <button
        type="button" role="switch" aria-checked={enabled} disabled={busy} onClick={toggle}
        className={`relative w-11 h-6 rounded-full transition shrink-0 ${enabled ? 'bg-emerald-500' : 'bg-white/20'} disabled:opacity-50`}
        title={enabled ? (en ? 'Disable' : 'Désactiver') : (en ? 'Enable (reconnect Gmail)' : 'Activer (reconnecte Gmail)')}
      >
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${enabled ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  );
}
