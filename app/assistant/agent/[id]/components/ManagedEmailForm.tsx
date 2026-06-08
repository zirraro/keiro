"use client";

import { useState, useEffect } from 'react';

interface DnsRecord {
  type: string;
  host: string;
  value: string;
  label: string;
}

interface ManagedEmailFormProps {
  /** When the parent already knows the user has SMTP / Gmail / Outlook connected,
   *  the form is hidden and replaced by a tiny "switch to managed" link. */
  hidden?: boolean;
}

/**
 * Backend-caché email provisioning UI. Replaces the manual "configure
 * your SMTP" path. The client provides minimal info — KeiroAI handles
 * the rest (Brevo sender + domain auth). Brevo is never named.
 */
export default function ManagedEmailForm({ hidden }: ManagedEmailFormProps) {
  const [legalName, setLegalName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [domain, setDomain] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dnsRecords, setDnsRecords] = useState<DnsRecord[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/managed-email/init', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d?.ok && d.profile?.managed_email_status) {
          setStatus(d.profile.managed_email_status);
          if (d.profile.managed_email_from) setFromEmail(d.profile.managed_email_from);
          if (d.profile.managed_email_domain) setDomain(d.profile.managed_email_domain);
          if (d.profile.managed_email_legal_name) setLegalName(d.profile.managed_email_legal_name);
        }
      })
      .catch(() => { /* swallow */ });
  }, []);

  if (hidden) return null;

  const handleSubmit = async () => {
    if (!legalName.trim() || !contactEmail.trim() || !domain.trim() || !fromEmail.trim()) {
      setError('Tous les champs sont requis');
      return;
    }
    if (!fromEmail.toLowerCase().endsWith('@' + domain.toLowerCase())) {
      setError("L'email expéditeur doit appartenir au domaine déclaré");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch('/api/auth/managed-email/init', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legal_name: legalName.trim(),
          contact_email: contactEmail.trim().toLowerCase(),
          domain: domain.trim().toLowerCase(),
          from_email: fromEmail.trim().toLowerCase(),
        }),
      });
      const data = await r.json();
      if (!data.ok) {
        setError(data.error || `HTTP ${r.status}`);
        return;
      }
      setDnsRecords(data.dns_records || []);
      setStatus('pending_dns');
    } catch (e: any) {
      setError(e?.message || 'Erreur réseau');
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'connected') {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
        ✓ Email professionnel <strong className="text-white">{fromEmail}</strong> connecté. Hugo envoie déjà depuis cette adresse.
      </div>
    );
  }

  if (status === 'pending_dns' && dnsRecords) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
        <div className="text-xs text-amber-300">
          <strong>Étape finale :</strong> colle ces 3 enregistrements DNS chez ton registrar (Cloudflare, OVH, Gandi…). La vérification est automatique sous 24h, on t'écrit dès que c'est OK.
        </div>
        <div className="space-y-2">
          {dnsRecords.map((rec, i) => (
            <div key={i} className="rounded-lg bg-black/30 border border-white/10 p-2 text-[11px] text-white/80 font-mono">
              <div className="flex justify-between gap-2 mb-1">
                <span className="text-amber-300 font-semibold">{rec.label}</span>
                <span className="text-white/40">{rec.type}</span>
              </div>
              <div><span className="text-white/40">Host :</span> {rec.host}</div>
              <div className="break-all"><span className="text-white/40">Value :</span> {rec.value}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
      <h3 className="text-sm font-bold text-white">Connecter ton email professionnel</h3>
      <p className="text-[11px] text-white/50">
        On configure l'envoi depuis ton domaine pour toi. Aucune inscription externe à faire — donne juste les infos ci-dessous et l'équipe s'occupe de la vérification.
      </p>

      <div className="space-y-2">
        <input
          value={legalName}
          onChange={e => setLegalName(e.target.value)}
          placeholder="Nom légal de l'entreprise (ex. Bonjour Pizza SARL)"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />
        <input
          type="email"
          value={contactEmail}
          onChange={e => setContactEmail(e.target.value)}
          placeholder="Email de contact (pour les confirmations)"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />
        <input
          value={domain}
          onChange={e => setDomain(e.target.value.replace(/^https?:\/\//, '').replace(/\/.*$/, ''))}
          placeholder="Domaine (ex. bonjourpizza.com)"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />
        <input
          type="email"
          value={fromEmail}
          onChange={e => setFromEmail(e.target.value)}
          placeholder={domain ? `contact@${domain}` : 'Email expéditeur (ex. contact@bonjourpizza.com)'}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />
      </div>

      {error && <div className="text-[11px] text-red-300 bg-red-500/10 border border-red-500/30 rounded px-2 py-1">{error}</div>}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-purple-700 text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? 'Configuration en cours…' : 'Configurer mon email pro'}
      </button>
    </div>
  );
}
