'use client';

/**
 * Clara — onboarding brand kit (brief v3 §2.4).
 * Parcours : nom/verticale → horaires → prix ?/no_public_prices → sujets
 * interdits → save. Quand confirmed_at est posé (essentiels remplis), le toggle
 * auto-publish devient disponible. Wired à /api/brand-kit.
 */
import { useEffect, useState } from 'react';

const VERTICALS = [
  { v: 'restaurant', label: '🍽️ Restaurant / café' },
  { v: 'beaute', label: '💅 Beauté / esthétique' },
  { v: 'coach', label: '🏋️ Coach / sport' },
  { v: 'immobilier', label: '🏠 Immobilier' },
  { v: 'boutique', label: '🛍️ Boutique / commerce' },
  { v: 'autre', label: '✨ Autre' },
];
const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const TOPIC_SUGGESTIONS = ['politique', 'religion', 'régime médical', 'promesses santé', 'comparaison concurrents'];

// Questionnaire PERSONAL BRANDING — conçu comme l'intake d'un stratège marketing
// de marque personnelle. Plus c'est riche, plus Léna produit du contenu
// percutant, cohérent et viral (storytelling ancré). (founder 2026-06-23)
const PB_QUESTIONS: { key: string; label: string; ph: string; big?: boolean }[] = [
  { key: 'role', label: 'Ton rôle / ton expertise en une phrase', ph: "Ex : Coach business pour artisans · Cheffe pâtissière · Fondateur d'agence" },
  { key: 'mission', label: 'Ta mission & ton déclic — le POURQUOI', ph: "Pourquoi tu fais ça, l'élément déclencheur, ce qui te porte (matière de ton origin story)", big: true },
  { key: 'audience', label: 'Ton audience idéale (à qui tu parles vraiment)', ph: "Ex : artisans 30-50 ans débordés qui veulent déléguer leur com" },
  { key: 'promise', label: 'La transformation que tu apportes (avant → après)', ph: 'Ex : de "invisible en ligne" à "booké 3 semaines à l\'avance"' },
  { key: 'unique', label: 'Ton angle unique — ce qui te différencie', ph: "Ton approche, ton histoire, ta méthode que personne d'autre n'a" },
  { key: 'values', label: 'Tes convictions / opinions tranchées (tes POV)', ph: "Ce que tu défends, ce qui t'agace dans ton secteur — pour des prises de position qui font réagir", big: true },
  { key: 'pillars', label: 'Tes 3 à 5 thèmes de contenu récurrents', ph: "Ex : coulisses atelier · conseils business · avant/après · ta vie d'entrepreneur" },
  { key: 'proof', label: 'Tes preuves / résultats (crédibilité)', ph: "Réalisations, chiffres, années d'expérience, clients marquants, prix" },
  { key: 'signature', label: 'Tes signatures (catchphrase, rituel, format récurrent)', ph: "Une phrase qui te colle, un format récurrent, un rituel reconnaissable" },
  { key: 'avoid', label: 'Ce que tu ne veux PAS montrer / dire', ph: "Sujets perso à éviter, ton à proscrire, sujets sensibles" },
];
const PB_TONES = ['drôle', 'cash / direct', 'expert / pédago', 'inspirant', 'premium / élégant', 'proche / authentique', 'provocateur'];
const PB_OBJECTIVES = ['Notoriété', 'Clients / leads', 'Communauté', 'Autorité / expert', 'Recrutement'];

type Price = { service_name: string; amount_eur: string; no_discount: boolean };
type Hour = { weekday: number; open_time: string; close_time: string; closed: boolean };

export default function BrandKitOnboarding() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [completeness, setCompleteness] = useState(0);

  const [businessName, setBusinessName] = useState('');
  const [vertical, setVertical] = useState('restaurant');
  const [noPublicPrices, setNoPublicPrices] = useState(false);
  const [prices, setPrices] = useState<Price[]>([{ service_name: '', amount_eur: '', no_discount: false }]);
  const [hours, setHours] = useState<Hour[]>(DAYS.map((_, i) => ({ weekday: i, open_time: '09:00', close_time: '18:00', closed: i === 0 })));
  const [topics, setTopics] = useState<string[]>(['politique', 'religion']);
  const [forbiddenConfirmed, setForbiddenConfirmed] = useState(true);
  // Personal branding (founder 2026-06-23) : si activé, on travaille la marque
  // PERSONNELLE du client → exige du média réel de la personne + un brief riche
  // (histoire, valeurs, environnement) qui nourrit les générations de Léna.
  const [personalBranding, setPersonalBranding] = useState(false);
  const [personalBrandingBrief, setPersonalBrandingBrief] = useState('');
  const [pbProfile, setPbProfile] = useState<Record<string, string>>({});
  const [pbTones, setPbTones] = useState<string[]>([]);
  const [pbObjective, setPbObjective] = useState('');

  useEffect(() => {
    fetch('/api/brand-kit', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.kit) {
          setBusinessName(d.kit.business_name || '');
          setVertical(d.kit.vertical || 'restaurant');
          setNoPublicPrices(!!d.kit.no_public_prices);
          if (d.prices?.length) setPrices(d.prices.map((p: any) => ({ service_name: p.service_name, amount_eur: String(p.amount_eur), no_discount: p.no_discount })));
          if (d.hours?.length) setHours(DAYS.map((_, i) => d.hours.find((h: any) => h.weekday === i) || { weekday: i, open_time: '09:00', close_time: '18:00', closed: i === 0 }));
          if (d.forbidden_topics) setTopics(d.forbidden_topics);
          if (d.personal_branding != null) setPersonalBranding(!!d.personal_branding);
          if (d.personal_branding_brief) setPersonalBrandingBrief(d.personal_branding_brief);
          if (d.personal_branding_profile && typeof d.personal_branding_profile === 'object') {
            const pp = d.personal_branding_profile;
            setPbProfile(pp.fields || {});
            setPbTones(Array.isArray(pp.tones) ? pp.tones : []);
            setPbObjective(pp.objective || '');
          }
          setConfirmed(!!d.confirmed);
          setCompleteness(d.completeness || 0);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/brand-kit', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: businessName,
          vertical,
          no_public_prices: noPublicPrices,
          prices: noPublicPrices ? [] : prices.filter(p => p.service_name && p.amount_eur).map(p => ({ ...p, amount_eur: Number(p.amount_eur) })),
          hours: hours.map(h => ({ weekday: h.weekday, open_time: h.closed ? null : h.open_time, close_time: h.closed ? null : h.close_time, closed: h.closed })),
          offers: [],
          forbidden_topics: topics,
          forbidden_confirmed: forbiddenConfirmed,
          personal_branding: personalBranding,
          personal_branding_brief: personalBranding ? personalBrandingBrief.slice(0, 2000) : '',
          personal_branding_profile: personalBranding ? { fields: pbProfile, tones: pbTones, objective: pbObjective } : null,
        }),
      });
      const d = await r.json();
      setConfirmed(!!d.confirmed);
      setCompleteness(d.completeness || 0);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="min-h-dvh flex items-center justify-center text-white/60">Chargement…</div>;

  return (
    <div className="min-h-dvh max-w-2xl mx-auto px-4 py-8 text-white">
      <h1 className="text-2xl font-bold mb-1">🚀 Configure ton équipe — 5 min</h1>
      <p className="text-white/50 text-sm mb-6">Clara prépare ton brand kit : ces infos permettent à tes agents de ne JAMAIS inventer un prix, une promo ou un horaire.</p>

      <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-3 flex items-center justify-between">
        <span className="text-sm">Complétude</span>
        <span className={`font-bold ${confirmed ? 'text-emerald-400' : 'text-amber-400'}`}>{completeness}% {confirmed ? '· prêt ✓' : ''}</span>
      </div>

      {/* Nom + verticale */}
      <section className="mb-5">
        <label className="block text-sm font-medium mb-1">Nom du commerce</label>
        <input value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Ex : Le Comptoir" className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-2 text-sm" />
        <label className="block text-sm font-medium mt-3 mb-1">Secteur</label>
        <div className="grid grid-cols-2 gap-2">
          {VERTICALS.map(v => (
            <button key={v.v} onClick={() => setVertical(v.v)} className={`text-sm rounded-lg px-3 py-2 border ${vertical === v.v ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/10 bg-white/[0.03]'}`}>{v.label}</button>
          ))}
        </div>
      </section>

      {/* Horaires */}
      <section className="mb-5">
        <label className="block text-sm font-medium mb-1">Horaires</label>
        <div className="space-y-1.5">
          {hours.map((h, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="w-20 text-white/60">{DAYS[h.weekday]}</span>
              <button onClick={() => setHours(hs => hs.map((x, j) => j === i ? { ...x, closed: !x.closed } : x))} className={`text-xs px-2 py-1 rounded ${h.closed ? 'bg-white/10 text-white/50' : 'bg-emerald-500/15 text-emerald-300'}`}>{h.closed ? 'Fermé' : 'Ouvert'}</button>
              {!h.closed && <>
                <input type="time" value={h.open_time} onChange={e => setHours(hs => hs.map((x, j) => j === i ? { ...x, open_time: e.target.value } : x))} className="bg-white/[0.05] border border-white/10 rounded px-2 py-1" />
                <span className="text-white/40">→</span>
                <input type="time" value={h.close_time} onChange={e => setHours(hs => hs.map((x, j) => j === i ? { ...x, close_time: e.target.value } : x))} className="bg-white/[0.05] border border-white/10 rounded px-2 py-1" />
              </>}
            </div>
          ))}
        </div>
      </section>

      {/* Prix */}
      <section className="mb-5">
        <label className="flex items-center gap-2 text-sm font-medium mb-2">
          <input type="checkbox" checked={noPublicPrices} onChange={e => setNoPublicPrices(e.target.checked)} />
          Mon métier n'affiche pas de prix publics (sur devis)
        </label>
        {!noPublicPrices && (
          <div className="space-y-2">
            {prices.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={p.service_name} onChange={e => setPrices(ps => ps.map((x, j) => j === i ? { ...x, service_name: e.target.value } : x))} placeholder="Service / produit" className="flex-1 rounded-lg bg-white/[0.05] border border-white/10 px-3 py-2 text-sm" />
                <input value={p.amount_eur} onChange={e => setPrices(ps => ps.map((x, j) => j === i ? { ...x, amount_eur: e.target.value } : x))} placeholder="€" type="number" className="w-20 rounded-lg bg-white/[0.05] border border-white/10 px-3 py-2 text-sm" />
                <button onClick={() => setPrices(ps => ps.filter((_, j) => j !== i))} className="text-white/40 hover:text-red-400 px-2">✕</button>
              </div>
            ))}
            <button onClick={() => setPrices(ps => [...ps, { service_name: '', amount_eur: '', no_discount: false }])} className="text-xs text-emerald-400">+ Ajouter un prix</button>
          </div>
        )}
      </section>

      {/* Sujets interdits */}
      <section className="mb-6">
        <label className="block text-sm font-medium mb-1">Sujets à ne jamais aborder</label>
        <div className="flex flex-wrap gap-2">
          {Array.from(new Set([...TOPIC_SUGGESTIONS, ...topics])).map(t => {
            const on = topics.includes(t);
            return <button key={t} onClick={() => setTopics(ts => on ? ts.filter(x => x !== t) : [...ts, t])} className={`text-xs px-3 py-1.5 rounded-full border ${on ? 'border-red-500/50 bg-red-500/10 text-red-300' : 'border-white/10 bg-white/[0.03] text-white/60'}`}>{on ? '🚫 ' : '+ '}{t}</button>;
          })}
        </div>
      </section>

      {/* Personal branding */}
      <section className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={personalBranding} onChange={e => setPersonalBranding(e.target.checked)} />
          🎯 Personal branding — je mets MA personne en avant (fondateur·rice / expert·e / visage de la marque)
        </label>
        {personalBranding && (
          <div className="mt-3 space-y-3">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-200">
              ⚠️ Pour un personal branding crédible, on a besoin de <strong>vraies photos/vidéos de toi</strong> (ton visage, ton lieu, tes gestes). On ne fabrique pas un visage en IA — l'IA sert au décor / B-roll. Dépose tes médias dans ton espace (Fichiers) : non retouchés pour l'authenticité, ou retravaillés/inspirés selon ce qui sert le mieux.
            </div>
            <p className="text-xs text-white/50">📋 Plus tu remplis, plus ta marque sera percutante. Léna construit ton storytelling (origin story, coulisses, expertise, POV, séries) à partir de ça.</p>

            {/* Objectif #1 */}
            <div>
              <label className="block text-sm font-medium mb-1">Ton objectif n°1</label>
              <div className="flex flex-wrap gap-2">
                {PB_OBJECTIVES.map(o => (
                  <button key={o} type="button" onClick={() => setPbObjective(pbObjective === o ? '' : o)}
                    className={`text-xs px-3 py-1.5 rounded-full border ${pbObjective === o ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300' : 'border-white/10 bg-white/[0.03] text-white/60'}`}>{o}</button>
                ))}
              </div>
            </div>

            {/* Ton / personnalité */}
            <div>
              <label className="block text-sm font-medium mb-1">Ton ton / ta personnalité (plusieurs possibles)</label>
              <div className="flex flex-wrap gap-2">
                {PB_TONES.map(t => {
                  const on = pbTones.includes(t);
                  return <button key={t} type="button" onClick={() => setPbTones(ts => on ? ts.filter(x => x !== t) : [...ts, t])}
                    className={`text-xs px-3 py-1.5 rounded-full border ${on ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300' : 'border-white/10 bg-white/[0.03] text-white/60'}`}>{on ? '✓ ' : ''}{t}</button>;
                })}
              </div>
            </div>

            {/* Questions expertes */}
            {PB_QUESTIONS.map(q => (
              <div key={q.key}>
                <label className="block text-sm font-medium mb-1">{q.label}</label>
                <textarea
                  value={pbProfile[q.key] || ''}
                  onChange={e => setPbProfile(p => ({ ...p, [q.key]: e.target.value }))}
                  rows={q.big ? 3 : 2}
                  placeholder={q.ph}
                  className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-2 text-sm"
                />
              </div>
            ))}

            {/* Notes libres */}
            <div>
              <label className="block text-sm font-medium mb-1">Autre chose à savoir (libre)</label>
              <textarea
                value={personalBrandingBrief}
                onChange={e => setPersonalBrandingBrief(e.target.value)}
                rows={2}
                placeholder="Tout ce qui peut aider Léna à te représenter fidèlement."
                className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}
      </section>

      <button onClick={save} disabled={saving || !businessName} className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-3 font-bold disabled:opacity-50">
        {saving ? 'Enregistrement…' : confirmed ? 'Mettre à jour mon brand kit' : 'Valider mon brand kit'}
      </button>
      {confirmed && <p className="text-center text-emerald-400 text-sm mt-3">✓ Brand kit confirmé — tes agents publient en sécurité. Tu peux activer la publication auto.</p>}
    </div>
  );
}
