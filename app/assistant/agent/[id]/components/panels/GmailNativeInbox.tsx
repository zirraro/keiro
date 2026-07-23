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

  useEffect(() => {
    fetch('/api/me/gmail-inbox', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setEnabled(!!d.enabled); setMsgs(d.messages || []); })
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
      <p className="text-[11px] text-white/50 mb-3 leading-relaxed">
        {en
          ? 'Hugo reads the replies from your prospects and prepares a draft in your Gmail — you review and send from your own account.'
          : 'Hugo lit les réponses de tes prospects et prépare un brouillon dans ton Gmail — tu relis et envoies depuis ton compte.'}
      </p>

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
              <div className="flex justify-end mt-1.5">
                {done[m.id] ? (
                  <span className="text-[10px] text-emerald-300 font-semibold">{en ? '✓ Draft created in Gmail' : '✓ Brouillon créé dans Gmail'}</span>
                ) : (
                  <button
                    type="button"
                    disabled={drafting === m.id}
                    onClick={() => makeDraft(m)}
                    className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold hover:bg-emerald-500/30 disabled:opacity-50"
                  >
                    {drafting === m.id ? (en ? 'Preparing…' : 'Préparation…') : (en ? 'Prepare a reply (Gmail draft)' : 'Préparer une réponse (brouillon Gmail)')}
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
