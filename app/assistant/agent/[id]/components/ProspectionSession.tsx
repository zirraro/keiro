'use client';

/**
 * LÉO — Onglet Prospection / Session de démarchage (founder 13/07).
 * Un espace dédié : lancer une session paramétrée → liste de prospects à
 * appeler, éditer la fiche CRM en inline (sans ouvrir le CRM), marquer le
 * résultat, et suivre les STATS + l'HISTORIQUE ("j'ai appelé X, Y ont répondu").
 *
 * Réutilise les endpoints existants : call-list (liste), call-outcome (résultat),
 * update-fiche (commentaire/statut → lu par tous les agents), prospection-stats.
 */

import { useState, useCallback, useEffect } from 'react';
import { useLanguage } from '@/lib/i18n/context';

type Stats = { called: number; reached: number; interested: number; callback: number; not_interested: number; no_answer: number };

const TEMP: Record<string, string> = {
  hot: 'bg-red-500/20 text-red-300', warm: 'bg-amber-500/20 text-amber-200',
  cold: 'bg-white/10 text-white/50', dead: 'bg-white/5 text-white/30',
};

export default function ProspectionSession() {
  const { locale } = useLanguage();
  const en = locale === 'en';

  // Paramètres de session
  const [sector, setSector] = useState('');
  const [city, setCity] = useState('');
  const [temp, setTemp] = useState('');
  const [count, setCount] = useState(20);

  const [list, setList] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [openEdit, setOpenEdit] = useState<Record<string, boolean>>({});
  const [savedId, setSavedId] = useState<string | null>(null);

  const [stats, setStats] = useState<{ today: Stats; week: Stats; reachRate: number; interestRate: number; history: any[] } | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Sessions datées (mini-onglets) — chaque liste générée est sauvegardée avec sa
  // date, pour la finaliser jour par jour. Priorité coût : recharge par ids (0 Google).
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);

  const saveSession = useCallback(async (source: 'crm' | 'google', prospectIds: string[]) => {
    if (!prospectIds.length) return;
    try {
      const r = await fetch('/api/agents/commercial/prospection-sessions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ source, params: { sector, city, temp }, prospect_ids: prospectIds }),
      });
      if (r.ok) { const d = await r.json(); setSessions(d.sessions || []); setActiveSession(d.session?.id || null); }
    } catch { /* noop */ }
  }, [sector, city, temp]);

  const loadSession = useCallback(async (s: any) => {
    setActiveSession(s.id); setLoading(true);
    try {
      const ids = (s.prospect_ids || []).join(',');
      const res = await fetch(`/api/agents/commercial/call-list?ids=${encodeURIComponent(ids)}`, { credentials: 'include' });
      const d = await res.json();
      setList(d?.ok ? d.callList : []);
    } catch { setList([]); }
    setLoading(false);
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const r = await fetch('/api/agents/commercial/prospection-stats', { credentials: 'include' });
      if (r.ok) setStats(await r.json());
    } catch { /* noop */ }
  }, []);

  const launch = useCallback(async (save = false): Promise<any[]> => {
    setLoading(true);
    let items: any[] = [];
    try {
      const qs = new URLSearchParams({
        ...(sector ? { sector } : {}), ...(city ? { city } : {}),
        ...(temp ? { temperature: temp } : {}), limit: String(count), all: '1',
      }).toString();
      const res = await fetch(`/api/agents/commercial/call-list?${qs}`, { credentials: 'include' });
      const d = await res.json();
      items = d?.ok ? d.callList : [];
      setList(items);
      // save=true (clic sur "Charger depuis mon CRM") → nouvelle session datée.
      if (save && items.length) { setActiveSession(null); await saveSession('crm', items.map((p: any) => p.id)); }
    } catch { setList([]); }
    setLoading(false);
    return items;
  }, [sector, city, temp, count, saveSession]);

  // "Léo décide" : liste prête à prospecter, SANS filtre — Léo choisit les
  // meilleurs prospects du CRM (déjà classés par priorité × température × score
  // côté call-list) et adapte à l'instant. 1 clic, 0 réflexion. Coût nul (CRM).
  const launchSmart = useCallback(async () => {
    setLoading(true);
    let items: any[] = [];
    try {
      const res = await fetch(`/api/agents/commercial/call-list?limit=${count}&all=1`, { credentials: 'include' });
      const d = await res.json();
      items = d?.ok ? d.callList : [];
      setList(items);
      if (items.length) { setActiveSession(null); await saveSession('crm', items.map((p: any) => p.id)); }
    } catch { setList([]); }
    setLoading(false);
    return items;
  }, [count, saveSession]);

  // Recherche Google : scrape Google Maps sur (activité + ville) → crée de
  // NOUVELLES fiches CRM (les plus complètes possible : nom, adresse, tél, note
  // Google, site…), puis recharge la liste. Founder 13/07 : "si je tape une ville
  // pas dans le CRM ça lance une recherche Google et crée des fiches".
  const searchGoogle = useCallback(async () => {
    if (!sector && !city) { setSearchMsg(en ? 'Enter an activity and/or a city first.' : 'Renseigne une activité et/ou une ville d\'abord.'); return; }
    setSearching(true); setSearchMsg(null);
    try {
      const query = [sector, city].filter(Boolean).join(' ');
      const res = await fetch('/api/agents/gmaps', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ query, charge: true }),
      });
      const d = await res.json();
      if (res.status === 402 || d.error === 'insufficient_credits') {
        setSearchMsg(en ? '⚠️ Not enough credits for a Google search. Top up your credits and retry.' : '⚠️ Crédits insuffisants pour une recherche Google. Recharge tes crédits puis réessaie.');
      } else if (d.ok === false) {
        setSearchMsg(d.error || (en ? 'Search failed' : 'Recherche échouée'));
      } else if (d.skipped) {
        setSearchMsg(d.reason === 'plan_disabled'
          ? (en ? 'Google sourcing needs a higher plan.' : 'La recherche Google nécessite un plan supérieur.')
          : (en ? 'Search skipped (already scanned recently, no charge).' : 'Recherche ignorée (zone déjà scannée récemment, non facturée).'));
      } else {
        const imported = d.imported ?? d.added ?? d.prospects_added ?? d.totalImported ?? d.report?.imported ?? 0;
        const charged = d.credits_charged ?? 0;
        setSearchMsg(en ? `✓ ${imported} new prospect(s) added from Google${charged ? ` — ${charged} credits used` : ''}.` : `✓ ${imported} nouveau(x) prospect(s) ajouté(s) depuis Google${charged ? ` — ${charged} crédits utilisés` : ''}.`);
      }
      const items = await launch(false);
      if (items.length) { setActiveSession(null); await saveSession('google', items.map((p: any) => p.id)); }
    } catch (e: any) { setSearchMsg(e?.message || (en ? 'Search failed' : 'Recherche échouée')); }
    setSearching(false);
  }, [sector, city, en, launch, saveSession]);

  useEffect(() => {
    loadStats();
    // Enrichissement GRATUIT (0 coût API) : complète le quartier des fiches depuis
    // l'adresse → fait monter la complétude. Fire-and-forget, non bloquant.
    fetch('/api/agents/commercial/enrich-fiches?limit=200', { method: 'POST', credentials: 'include' }).catch(() => {});
    (async () => {
      try {
        const r = await fetch('/api/agents/commercial/prospection-sessions', { credentials: 'include' });
        const d = r.ok ? await r.json() : { sessions: [] };
        const ss = d.sessions || [];
        setSessions(ss);
        if (ss.length) await loadSession(ss[0]); // reprendre la dernière session (0 coût)
        else await launch(false);                // sinon liste CRM par défaut
      } catch { await launch(false); }
    })();
  }, [loadStats]); // eslint-disable-line react-hooks/exhaustive-deps

  const mark = useCallback(async (id: string, outcome: string) => {
    setBusy(id);
    try {
      await fetch('/api/agents/commercial/call-outcome', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ prospectId: id, outcome, note: noteDraft[id] || undefined }),
      });
      setList(prev => (prev || []).filter(p => p.id !== id));
      loadStats();
    } catch { /* noop */ }
    setBusy(null);
  }, [noteDraft, loadStats]);

  const saveFiche = useCallback(async (id: string, patch: { comment?: string; status?: string; temperature?: string }) => {
    setBusy(id);
    try {
      const r = await fetch('/api/agents/commercial/update-fiche', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ prospectId: id, ...patch }),
      });
      if (r.ok) {
        setList(prev => (prev || []).map(p => p.id === id ? { ...p, temperature: patch.temperature || p.temperature, status: patch.status || p.status } : p));
        if (patch.comment) setNoteDraft(prev => ({ ...prev, [id]: '' }));
        setSavedId(id); setTimeout(() => setSavedId(s => s === id ? null : s), 1500);
      }
    } catch { /* noop */ }
    setBusy(null);
  }, []);

  const StatCard = ({ label, value, accent }: { label: string; value: number | string; accent?: string }) => (
    <div className="rounded-xl bg-white/[0.03] border border-white/10 p-2.5 text-center">
      <div className={`text-lg sm:text-xl font-bold ${accent || 'text-white'}`}>{value}</div>
      <div className="text-[10px] text-white/50">{label}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* ── STATS SESSION ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-white">{en ? '📊 Your prospecting' : '📊 Ton démarchage'}</h3>
          <button onClick={() => setShowHistory(s => !s)} className="text-[11px] text-orange-300 hover:text-orange-200 font-medium">
            {showHistory ? (en ? 'Hide history' : "Masquer l'historique") : (en ? 'See history' : "Voir l'historique")}
          </button>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          <StatCard label={en ? 'Called today' : "Appelés aujourd'hui"} value={stats?.today.called ?? 0} accent="text-orange-300" />
          <StatCard label={en ? 'Called (7d)' : 'Appelés (7j)'} value={stats?.week.called ?? 0} />
          <StatCard label={en ? 'Reached' : 'Joints'} value={stats?.week.reached ?? 0} accent="text-cyan-300" />
          <StatCard label={en ? 'Interested' : 'Intéressés'} value={stats?.week.interested ?? 0} accent="text-emerald-300" />
          <StatCard label={en ? 'Reach rate' : 'Taux de contact'} value={`${stats?.reachRate ?? 0}%`} />
          <StatCard label={en ? 'To follow up' : 'À relancer'} value={stats?.week.callback ?? 0} accent="text-amber-300" />
        </div>
        {showHistory && (
          <div className="mt-2 rounded-xl bg-black/20 border border-white/10 p-2 max-h-52 overflow-y-auto">
            {(stats?.history || []).length === 0
              ? <p className="text-[11px] text-white/40 text-center py-3">{en ? 'No call logged yet.' : 'Aucun appel enregistré pour le moment.'}</p>
              : (stats?.history || []).map((h, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 text-[11px] border-b border-white/5 last:border-0">
                  <span className="whitespace-nowrap">{h.label}</span>
                  {h.note && <span className="text-white/50 truncate flex-1">— {h.note}</span>}
                  <span className="text-white/30 ml-auto whitespace-nowrap">{(h.at || '').slice(0, 10)}</span>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* ── LANCER UNE SESSION ── */}
      <div className="rounded-xl border border-orange-500/25 bg-orange-500/[0.05] p-3">
        <div className="text-xs font-bold text-orange-200 mb-1">{en ? '🎯 Launch a prospecting session' : '🎯 Lancer une session de démarchage'}</div>
        <p className="text-[11px] text-white/50 mb-2">{en ? 'One click and let Léo decide, or fine-tune the targeting below.' : 'Un clic et laisse Léo décider, ou affine le ciblage ci-dessous.'}</p>

        {/* Léo décide — liste prête, sans réflexion (le plus rapide, coût nul) */}
        <button onClick={launchSmart} disabled={loading}
          className="w-full mb-3 py-3 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 text-white text-sm font-extrabold disabled:opacity-50 active:scale-[0.99] transition-all shadow-lg shadow-orange-900/20">
          {loading ? '…' : (en ? '⚡ My list to prospect now (Léo decides)' : '⚡ Ma liste à prospecter maintenant (Léo décide)')}
        </button>
        <div className="text-[10px] text-white/35 mb-2 text-center">{en ? '— or target it yourself —' : '— ou cible toi-même —'}</div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <input value={sector} onChange={e => setSector(e.target.value)} placeholder={en ? 'Activity (e.g. beauty)' : 'Activité (ex : institut)'} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder-white/30" />
          <input value={city} onChange={e => setCity(e.target.value)} placeholder={en ? 'Region / city' : 'Région / ville'} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder-white/30" />
          <select value={temp} onChange={e => setTemp(e.target.value)} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/80 text-sm">
            <option value="">{en ? 'All temps' : 'Toutes T°'}</option>
            <option value="hot">🔥 {en ? 'Hot' : 'Chauds'}</option>
            <option value="warm">🌤️ {en ? 'Warm' : 'Tièdes'}</option>
            <option value="cold">❄️ {en ? 'Cold' : 'Froids'}</option>
          </select>
          <select value={count} onChange={e => setCount(Number(e.target.value))} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/80 text-sm">
            {[10, 20, 30, 50].map(n => <option key={n} value={n}>{n} {en ? 'prospects' : 'prospects'}</option>)}
          </select>
        </div>
        <div className="mt-2 flex flex-col sm:flex-row gap-2">
          <button onClick={() => launch(true)} disabled={loading} className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 text-white text-sm font-bold disabled:opacity-50 active:scale-[0.99] transition-all">
            {loading ? '…' : (en ? '📋 Load from my CRM (free)' : '📋 Charger depuis mon CRM (gratuit)')}
          </button>
          <button
            onClick={() => { if (window.confirm(en ? 'Google search uses credits (~3 per new prospect found — it costs us the Places API). We prioritize your CRM first (free). Continue?' : 'La recherche Google consomme des crédits (~3 par nouveau prospect trouvé — l\'API Places nous coûte). On privilégie ton CRM d\'abord (gratuit). Continuer ?')) searchGoogle(); }}
            disabled={searching}
            className="flex-1 py-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-white/80 text-sm font-semibold disabled:opacity-50 active:scale-[0.99] transition-all">
            {searching ? (en ? '🔍 Searching…' : '🔍 Recherche…') : (en ? '🔍 Search Google (paid)' : '🔍 Rechercher sur Google (payant)')}
          </button>
        </div>
        <p className="text-[10px] text-white/40 mt-1.5">{en ? 'We prioritize your CRM (free). Google search creates brand-new, pre-filled fiches (name, address, phone, Google rating) and uses ~3 credits per new prospect — use it only when the area isn\'t in your CRM. Capped per run.' : 'On privilégie ton CRM (gratuit). La recherche Google crée de nouvelles fiches déjà remplies (nom, adresse, tél, note Google) et consomme ~3 crédits par nouveau prospect — à utiliser seulement si la zone n\'est pas dans ton CRM. Plafonné par recherche.'}</p>
        {searchMsg && <p className="text-[11px] text-cyan-200 mt-1.5">{searchMsg}</p>}
      </div>

      {/* ── MINI-ONGLETS : sessions datées ── */}
      {sessions.length > 0 && (
        <div>
          <div className="text-[10px] text-white/40 uppercase font-bold mb-1.5">{en ? 'Your lists (finish day by day)' : 'Tes listes (à finir jour par jour)'}</div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {sessions.map((s: any) => (
              <button key={s.id} onClick={() => loadSession(s)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${activeSession === s.id ? 'bg-orange-500/25 text-orange-100 border-orange-400/40' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'}`}
                title={`${s.count} prospects · ${(s.at || '').slice(0, 10)}`}>
                {s.source === 'google' ? '🔍' : '📋'} {(s.at || '').slice(5, 10).replace('-', '/')} · {s.label} <span className="text-white/40">({s.count})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── LISTE À APPELER ── */}
      {list && list.length === 0 && (
        <p className="text-xs text-white/40 py-4 text-center">{en ? 'No prospect to call for this targeting. Widen the filters or run Léo to source more.' : 'Aucun prospect à appeler pour ce ciblage. Élargis les filtres ou lance Léo pour en sourcer davantage.'}</p>
      )}
      <div className="flex flex-col gap-2">
        {(list || []).map((p: any) => (
          <div key={p.id} className="rounded-xl bg-white/5 border border-white/10 p-3">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-white">{p.name}</span>
                  {p.company && <span className="text-xs text-white/50">· {p.company}</span>}
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${TEMP[p.temperature] || TEMP.cold}`}>{p.temperature}</span>
                </div>
                <div className="text-[11px] text-white/40 mt-0.5">{[p.business_type, p.city].filter(Boolean).join(' · ')}</div>
              </div>
              {p.phone
                ? <a href={`tel:${p.phone}`} className="px-3 py-1.5 rounded-lg bg-green-500/20 text-green-300 text-sm font-semibold whitespace-nowrap active:scale-95">📞 {p.phone}</a>
                : <span className="px-3 py-1.5 rounded-lg bg-white/5 text-white/40 text-[11px] whitespace-nowrap">{en ? 'No phone' : 'Pas de tél'}</span>}
            </div>
            <div className="mt-2 text-[11px] text-orange-200 bg-orange-500/10 border border-orange-500/15 rounded-lg px-2 py-1.5">
              <strong>{en ? 'Action:' : 'Action :'}</strong> {p.recommended_action}
            </div>
            {(p.fiche?.notes || p.fiche?.summary) && (
              <p className="mt-1.5 text-[11px] text-white/50 line-clamp-2">{p.fiche.summary || p.fiche.notes}</p>
            )}
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {[
                { k: 'reached_interested', l: en ? '✅ Interested' : '✅ Intéressé' },
                { k: 'follow_up', l: en ? '🔁 Follow up' : '🔁 À relancer' },
                { k: 'not_reached', l: en ? '📵 No answer' : '📵 Pas joint' },
                { k: 'reached_not_interested', l: en ? '🚫 Not interested' : '🚫 Pas intéressé' },
              ].map(o => (
                <button key={o.k} onClick={() => mark(p.id, o.k)} disabled={busy === p.id}
                  className="px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white/80 text-[11px] font-medium disabled:opacity-40 active:scale-95 transition-all">
                  {o.l}
                </button>
              ))}
            </div>
            <button onClick={() => setOpenEdit(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
              className="mt-2 text-[11px] text-orange-300 hover:text-orange-200 font-medium">
              {openEdit[p.id] ? (en ? '▾ Close fiche' : '▾ Fermer la fiche') : (en ? '✏️ Edit fiche (note, status)' : '✏️ Modifier la fiche (note, statut)')}
            </button>
            {openEdit[p.id] && (
              <div className="mt-2 space-y-2 rounded-lg bg-black/20 border border-white/10 p-2.5">
                <textarea value={noteDraft[p.id] ?? ''} onChange={e => setNoteDraft(prev => ({ ...prev, [p.id]: e.target.value }))}
                  placeholder={en ? 'Comment (read by all agents: Hugo follow-ups, Léna…)' : 'Commentaire (lu par tous les agents : relances Hugo, Léna…)'}
                  rows={2} className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-[12px] placeholder-white/30 resize-y focus:outline-none focus:ring-1 focus:ring-orange-500/40" />
                <div className="flex items-center gap-2 flex-wrap">
                  <select value={p.status || 'identifie'} onChange={e => saveFiche(p.id, { status: e.target.value })} className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/80 text-[11px]">
                    {[
                      { v: 'identifie', l: en ? 'Identified' : 'Identifié' }, { v: 'contacte', l: en ? 'Contacted' : 'Contacté' },
                      { v: 'repondu', l: en ? 'Replied' : 'A répondu' }, { v: 'demo', l: en ? 'Demo' : 'Démo' },
                      { v: 'sprint', l: en ? 'Negotiation' : 'Négociation' }, { v: 'client', l: 'Client' }, { v: 'perdu', l: en ? 'Lost' : 'Perdu' },
                    ].map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                  </select>
                  <div className="flex items-center gap-1">
                    {[{ v: 'hot', e: '🔥' }, { v: 'warm', e: '🌤️' }, { v: 'cold', e: '❄️' }].map(tp => (
                      <button key={tp.v} onClick={() => saveFiche(p.id, { temperature: tp.v })}
                        className={`w-7 h-7 rounded-lg text-sm transition-all ${p.temperature === tp.v ? 'bg-orange-500/30 border border-orange-400/40' : 'bg-white/5 border border-white/10 hover:bg-white/10'}`}>{tp.e}</button>
                    ))}
                  </div>
                  <button onClick={() => saveFiche(p.id, { comment: (noteDraft[p.id] || '').trim() })} disabled={busy === p.id || !(noteDraft[p.id] || '').trim()}
                    className="ml-auto px-3 py-1.5 rounded-lg bg-orange-500/80 hover:bg-orange-500 text-white text-[11px] font-semibold disabled:opacity-40 active:scale-95">
                    {busy === p.id ? '…' : savedId === p.id ? (en ? '✓ Saved' : '✓ Enregistré') : (en ? '💾 Save note' : '💾 Enregistrer')}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
