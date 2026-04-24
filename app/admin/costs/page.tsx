'use client';

import { useEffect, useState } from 'react';

type LiveEst = {
  seedream_images: { count: number; eur: number };
  seedance_videos: { count: number; eur: number };
  google_places_details: { count: number; eur: number };
  google_places_search: { count: number; eur: number };
  claude_anthropic: { eur: number; breakdown: Record<string, number> };
  gemini: { eur: number };
  total_eur: number;
};
type Upload = {
  id: string;
  service: string;
  billing_period: string;
  total_cost_eur: number;
  uploaded_at: string;
  notes: string | null;
};
type Payload = { ok: boolean; period: string; live_estimates: LiveEst; uploads: Upload[] };

const SERVICES = [
  { id: 'google_cloud', label: 'Google Cloud / Places API' },
  { id: 'bytedance', label: 'ByteDance (Seedream + Seedance)' },
  { id: 'anthropic', label: 'Anthropic (Claude Haiku/Sonnet)' },
  { id: 'gemini', label: 'Google Gemini' },
  { id: 'brevo', label: 'Brevo (emails)' },
  { id: 'elevenlabs', label: 'ElevenLabs (TTS)' },
  { id: 'meta', label: 'Meta (Instagram / WhatsApp)' },
  { id: 'other', label: 'Autre' },
];

export default function AdminCostsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [uploadService, setUploadService] = useState('google_cloud');
  const [uploadPeriod, setUploadPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [csvText, setCsvText] = useState('');
  const [totalOverride, setTotalOverride] = useState('');
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);

  const load = () => {
    setLoading(true);
    fetch('/api/admin/costs', { credentials: 'include' })
      .then(r => r.json())
      .then((d: any) => d.ok ? setData(d) : setErr(d.error))
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);
    try {
      const body: any = {
        service: uploadService,
        billing_period: uploadPeriod,
        csv_text: csvText,
        notes: notes || null,
      };
      if (totalOverride) body.total_override = parseFloat(totalOverride);
      const res = await fetch('/api/admin/costs', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'Upload failed');
      setCsvText(''); setTotalOverride(''); setNotes('');
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Supprimer cet upload ?')) return;
    await fetch(`/api/admin/costs?id=${id}`, { method: 'DELETE', credentials: 'include' });
    load();
  };

  if (loading) return <div className="min-h-screen bg-[#060b18] flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400" /></div>;
  if (err || !data) return <div className="min-h-screen bg-[#060b18] text-white p-8">Erreur : {err || 'no data'}</div>;

  const live = data.live_estimates;
  const uploadsByService: Record<string, Upload[]> = {};
  for (const u of data.uploads) {
    if (!uploadsByService[u.service]) uploadsByService[u.service] = [];
    uploadsByService[u.service].push(u);
  }

  const currencyFmt = (v: number) => `€${v.toFixed(2)}`;

  return (
    <div className="min-h-screen bg-[#060b18] text-white p-6 md:p-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">Coûts — Dashboard admin</h1>
        <p className="text-slate-400 text-sm mt-1">Période en cours : {data.period} · Estimations live calculées depuis les logs, uploads = vraies factures tierces</p>
      </header>

      {/* LIVE ESTIMATES */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-3">Estimation live (ce mois)</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <Card title="Seedream (images)" count={live.seedream_images.count} eur={live.seedream_images.eur} />
          <Card title="Seedance (vidéos)" count={live.seedance_videos.count} eur={live.seedance_videos.eur} />
          <Card title="Google Places details" count={live.google_places_details.count} eur={live.google_places_details.eur} />
          <Card title="Google Places search" count={live.google_places_search.count} eur={live.google_places_search.eur} />
          <Card title="Anthropic Claude" count={0} eur={live.claude_anthropic.eur} />
          <Card title="Google Gemini" count={0} eur={live.gemini.eur} />
        </div>
        <div className="mt-4 text-right text-lg font-bold">
          Total estimé : <span className="text-purple-300">{currencyFmt(live.total_eur)}</span>
        </div>
      </section>

      {/* UPLOAD FORM */}
      <section className="mb-10 bg-[#0a1224] rounded-2xl p-6 border border-white/10">
        <h2 className="text-lg font-semibold mb-4">Uploader une facture tierce (CSV)</h2>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid md:grid-cols-3 gap-3">
            <select value={uploadService} onChange={e => setUploadService(e.target.value)} className="bg-[#060b18] border border-white/10 rounded px-3 py-2">
              {SERVICES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <input type="text" value={uploadPeriod} onChange={e => setUploadPeriod(e.target.value)} placeholder="YYYY-MM" className="bg-[#060b18] border border-white/10 rounded px-3 py-2" />
            <input type="text" value={totalOverride} onChange={e => setTotalOverride(e.target.value)} placeholder="Total €  (optionnel, override si parsing rate)" className="bg-[#060b18] border border-white/10 rounded px-3 py-2" />
          </div>
          <textarea value={csvText} onChange={e => setCsvText(e.target.value)} placeholder="Colle ici le contenu CSV complet de la facture" rows={6} className="w-full bg-[#060b18] border border-white/10 rounded px-3 py-2 font-mono text-xs" required />
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optionnel)" className="w-full bg-[#060b18] border border-white/10 rounded px-3 py-2" />
          <button type="submit" disabled={uploading} className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-2 rounded font-semibold disabled:opacity-50">
            {uploading ? 'Upload...' : 'Enregistrer la facture'}
          </button>
        </form>
      </section>

      {/* UPLOADED BILLS */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Factures tierces enregistrées</h2>
        {data.uploads.length === 0 ? (
          <p className="text-slate-400 text-sm">Aucune facture uploadée pour l'instant.</p>
        ) : (
          <div className="bg-[#0a1224] rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-left">
                <tr>
                  <th className="px-4 py-2">Service</th>
                  <th className="px-4 py-2">Période</th>
                  <th className="px-4 py-2 text-right">Total €</th>
                  <th className="px-4 py-2">Notes</th>
                  <th className="px-4 py-2">Upload</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.uploads.map(u => (
                  <tr key={u.id} className="border-t border-white/5">
                    <td className="px-4 py-2">{u.service}</td>
                    <td className="px-4 py-2">{u.billing_period}</td>
                    <td className="px-4 py-2 text-right font-mono">{currencyFmt(u.total_cost_eur)}</td>
                    <td className="px-4 py-2 text-slate-400">{u.notes || '—'}</td>
                    <td className="px-4 py-2 text-slate-400">{new Date(u.uploaded_at).toLocaleDateString('fr-FR')}</td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => remove(u.id)} className="text-red-400 hover:text-red-300 text-xs">Supprimer</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Card({ title, count, eur }: { title: string; count: number; eur: number }) {
  return (
    <div className="bg-[#0a1224] rounded-xl border border-white/10 p-4">
      <div className="text-xs text-slate-400">{title}</div>
      {count > 0 && <div className="text-lg text-white/70 mt-1">{count.toLocaleString('fr-FR')} calls</div>}
      <div className="text-2xl font-bold text-purple-300 mt-1">€{eur.toFixed(2)}</div>
    </div>
  );
}
