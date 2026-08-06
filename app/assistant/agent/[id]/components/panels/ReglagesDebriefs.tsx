'use client';

import { useEffect, useState, useCallback } from 'react';

/**
 * Les réglages des briefs et débriefs, chez Ami.
 *
 * Demande du fondateur (2026-08-06) : « dans les notifications tu mets des
 * notifs comme débrief du soir, ça doit être dans AMI. J'ai atterri sur Noah
 * ceo qui doit pas être accessible normalement. Tout est regroupé sous AMI. »
 *
 * ── Pourquoi cette page existait déjà à moitié ──
 *
 * La table `client_brief_preferences` porte depuis longtemps tout ce qu'il
 * faut — enabled, frequency, preferred_hour, email_enabled, inapp_enabled — et
 * /api/notifications/brief-preferences sait la lire et l'écrire. Il n'y avait
 * simplement AUCUNE interface branchée dessus : le client subissait des
 * réglages qu'il ne pouvait pas voir. Les seuls contrôles existants vivaient
 * dans le panneau de Noah, devenu inaccessible.
 *
 * ── Ce qu'on n'affiche pas ──
 *
 * Aucune mention de coût en crédits. Le débit du brief quotidien est resté un
 * TODO jamais câblé dans /api/agents/ceo-reports : annoncer un prix qu'on ne
 * prélève pas serait un mensonge d'interface, et le jour où on le câblerait,
 * le client découvrirait un débit qu'il croyait déjà payé.
 */

const FREQUENCES: Array<{ valeur: string; libelle: string; detail: string }> = [
  { valeur: 'daily', libelle: 'Chaque jour', detail: 'Le matin ce qui est prévu, le soir ce qui a tourné.' },
  { valeur: 'every_2_days', libelle: 'Tous les 2 jours', detail: 'Le bon rythme si tu regardes sans y penser tous les jours.' },
  { valeur: 'weekly', libelle: 'Chaque semaine', detail: 'Un seul point, le jour où ton audience est la plus active.' },
  { valeur: 'monthly', libelle: 'Chaque mois', detail: "Le strict nécessaire : ce qui a changé, et ce qu'Ami ajuste." },
];

interface Prefs {
  enabled: boolean;
  frequency: string;
  preferred_hour: number;
  email_enabled: boolean;
  inapp_enabled: boolean;
}

export default function ReglagesDebriefs({ en = false }: { en?: boolean }) {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [enregistre, setEnregistre] = useState(false);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    let annule = false;
    fetch('/api/notifications/brief-preferences', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (!annule && d) setPrefs({
        enabled: d.enabled ?? true,
        frequency: d.frequency || 'daily',
        preferred_hour: d.preferred_hour ?? 9,
        email_enabled: d.email_enabled ?? true,
        inapp_enabled: d.inapp_enabled ?? true,
      }); })
      .catch(() => { if (!annule) setErreur(true); });
    return () => { annule = true; };
  }, []);

  const enregistrer = useCallback(async (patch: Partial<Prefs>) => {
    setPrefs(p => (p ? { ...p, ...patch } : p));
    setErreur(false);
    try {
      const res = await fetch('/api/notifications/brief-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...(prefs || {}), ...patch }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setEnregistre(true);
      setTimeout(() => setEnregistre(false), 1800);
    } catch {
      // Un réglage qui échoue en silence est pire que pas de réglage : le
      // client croit avoir coupé ses notifications et continue d'en recevoir.
      setErreur(true);
    }
  }, [prefs]);

  if (!prefs) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 mb-4">
        <div className="h-4 w-40 bg-white/10 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 mb-4">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="min-w-0">
          <h3 className="text-white text-sm font-semibold">
            {en ? 'Your briefings' : 'Tes points réguliers'}
          </h3>
          <p className="text-white/50 text-xs mt-0.5 leading-relaxed">
            {en
              ? 'What your team plans, and what it actually did.'
              : "Ce que ton équipe prévoit, et ce qu'elle a réellement fait."}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {enregistre && <span className="text-emerald-400 text-[11px] font-semibold">Enregistré</span>}
          <button
            type="button"
            role="switch"
            aria-checked={prefs.enabled}
            aria-label={en ? 'Enable briefings' : 'Activer les points réguliers'}
            onClick={() => enregistrer({ enabled: !prefs.enabled })}
            className={`relative w-12 h-7 rounded-full transition-colors ${prefs.enabled ? 'bg-emerald-500' : 'bg-white/15'}`}
          >
            <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${prefs.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>

      {erreur && (
        <p className="mt-2 text-amber-300 text-[12px] leading-relaxed">
          {en
            ? "Couldn't save. Your previous setting still applies — try again."
            : "Impossible d'enregistrer. Ton réglage précédent s'applique toujours — réessaie."}
        </p>
      )}

      {prefs.enabled && (
        <>
          <div className="mt-4">
            <div className="text-white/40 text-[11px] uppercase tracking-wider font-semibold mb-2">
              {en ? 'How often' : 'À quelle fréquence'}
            </div>
            <div className="grid gap-1.5">
              {FREQUENCES.map(f => (
                <button
                  key={f.valeur}
                  onClick={() => enregistrer({ frequency: f.valeur })}
                  className={`text-left min-h-[52px] px-3 py-2.5 rounded-xl border transition-colors ${
                    prefs.frequency === f.valeur
                      ? 'bg-white/10 border-white/25'
                      : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.06] active:bg-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${prefs.frequency === f.valeur ? 'bg-emerald-400' : 'bg-white/20'}`} />
                    <span className="text-white text-[13px] font-semibold">{f.libelle}</span>
                  </div>
                  <p className="text-white/45 text-[12px] leading-snug mt-0.5 pl-4">{f.detail}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <div className="text-white/40 text-[11px] uppercase tracking-wider font-semibold mb-2">
              {en ? 'Where you get it' : 'Où tu le reçois'}
            </div>
            <div className="grid sm:grid-cols-2 gap-1.5">
              {([
                ['inapp_enabled', en ? 'In KeiroAI' : 'Dans KeiroAI', en ? 'In your notifications.' : 'Dans tes notifications.'],
                ['email_enabled', en ? 'By email' : 'Par email', en ? 'In your inbox, same time.' : 'Dans ta boîte mail, à la même heure.'],
              ] as Array<[keyof Prefs, string, string]>).map(([cle, titre, detail]) => (
                <button
                  key={String(cle)}
                  onClick={() => enregistrer({ [cle]: !prefs[cle] } as Partial<Prefs>)}
                  className={`text-left min-h-[52px] px-3 py-2.5 rounded-xl border transition-colors ${
                    prefs[cle] ? 'bg-white/10 border-white/25' : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.06]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-[13px] ${prefs[cle] ? 'text-emerald-400' : 'text-white/25'}`}>
                      {prefs[cle] ? '✓' : '○'}
                    </span>
                    <span className="text-white text-[13px] font-semibold">{titre}</span>
                  </div>
                  <p className="text-white/45 text-[12px] leading-snug mt-0.5 pl-5">{detail}</p>
                </button>
              ))}
            </div>
            {!prefs.inapp_enabled && !prefs.email_enabled && (
              <p className="mt-2 text-amber-300/80 text-[12px] leading-relaxed">
                {en
                  ? "Both channels are off — you won't receive anything."
                  : "Les deux canaux sont coupés — tu ne recevras rien."}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
