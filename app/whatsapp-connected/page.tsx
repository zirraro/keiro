'use client';

/**
 * Callback du flux Meta-HOSTED Embedded Signup WhatsApp (secours quand le SDK JS
 * est bloqué par le navigateur). Facebook redirige ici après l'onboarding ; on
 * capte le phone_number_id + waba_id (ou le code) présents dans l'URL, on POST à
 * /api/agents/whatsapp/connect, puis on renvoie sur le panneau Stella.
 */

import { useEffect, useState } from 'react';

export default function WhatsAppConnectedPage() {
  const [state, setState] = useState<'working' | 'ok' | 'partial' | 'error'>('working');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Certaines variantes renvoient les infos dans le fragment (#...).
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const pick = (k: string) => params.get(k) || hash.get(k) || '';
    const phone_number_id = pick('phone_number_id');
    const waba_id = pick('waba_id') || pick('whatsapp_business_account_id');
    const code = pick('code');
    const error = pick('error') || pick('error_message');

    const go = () => setTimeout(() => { window.location.href = '/assistant/agent/whatsapp'; }, 2200);

    if (error) { setState('error'); go(); return; }
    if (phone_number_id && waba_id) {
      fetch('/api/agents/whatsapp/connect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ phone_number_id, waba_id }),
      }).then(r => r.json()).then(d => { setState(d?.ok ? 'ok' : 'error'); go(); })
        .catch(() => { setState('error'); go(); });
    } else if (code) {
      // Pas d'IDs directs : on transmet le code au serveur (échange + résolution WABA).
      fetch('/api/agents/whatsapp/connect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ code }),
      }).then(r => r.json()).then(d => { setState(d?.ok ? 'ok' : 'partial'); go(); })
        .catch(() => { setState('partial'); go(); });
    } else {
      setState('partial'); go();
    }
  }, []);

  const label = state === 'working' ? 'Connexion de ton numéro WhatsApp…'
    : state === 'ok' ? '✅ Numéro connecté ! Redirection…'
    : state === 'partial' ? 'Onboarding reçu. Finalisation… Redirection vers Stella.'
    : 'Un souci est survenu. Redirection vers Stella pour réessayer.';

  return (
    <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid #25D366', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
      <p style={{ color: '#334155', fontSize: 15 }}>{label}</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
