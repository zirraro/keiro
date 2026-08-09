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
 * ── Le coût, annoncé parce qu'il est prélevé ──
 *
 * Les cadences rapprochées coûtent 1 crédit par point ; hebdomadaire et
 * mensuel restent gratuits. Le prix n'a été affiché qu'une fois le débit
 * réellement câblé dans /api/agents/ceo-reports (2026-08-06) : tant qu'il
 * n'était qu'un TODO, l'annoncer aurait été un mensonge d'interface, et le
 * taire après coup aurait fait découvrir un débit au client.
 *
 * À court de crédits, le client ne perd pas le service : il repasse sur la
 * cadence hebdomadaire gratuite. Disparaître sans rien dire est le
 * comportement qui nous a déjà coûté le plus cher.
 */

const FREQUENCES: Array<{ valeur: string; libelle: string; detail: string; cout?: string }> = [
  { valeur: 'daily', libelle: 'Chaque jour', detail: 'Le matin ce qui est prévu, le soir ce qui a tourné.', cout: '1 crédit par point' },
  { valeur: 'every_2_days', libelle: 'Tous les 2 jours', detail: 'Le bon rythme si tu regardes sans y penser tous les jours.', cout: '1 crédit par point' },
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

export default function ReglagesDebriefs({ en = false, replie = false }: { en?: boolean; replie?: boolean }) {
  // Repliable : dans Ami, ce bloc vit en bas de page et n'a pas à occuper de
  // la place tant qu'on ne vient pas le chercher.
  const [ouvert, setOuvert] = useState(!replie);
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
        {/* Replié, l'en-tête annonce déjà l'état — inutile d'ouvrir pour savoir
            si on reçoit quelque chose, et à quel rythme. */}
        <button
          type="button"
          onClick={() => setOuvert(o => !o)}
          aria-expanded={ouvert}
          className="min-w-0 text-left flex-1"
        >
          <h3 className="text-white text-sm font-semibold flex items-center gap-2">
            {en ? 'Your briefings' : 'Tes points réguliers'}
            <span className="text-white/35 text-base leading-none font-normal">{ouvert ? '−' : '+'}</span>
          </h3>
          <p className="text-white/50 text-xs mt-0.5 leading-relaxed">
            {!prefs.enabled
              ? (en ? 'Off — you receive nothing.' : 'Coupés — tu ne reçois rien.')
              : ouvert
                ? (en ? 'What your team plans, and what it actually did.' : "Ce que ton équipe prévoit, et ce qu'elle a réellement fait.")
                : (FREQUENCES.find(f => f.valeur === prefs.frequency)?.libelle || '') +
                  (prefs.email_enabled && prefs.inapp_enabled ? ' · ici et par email'
                    : prefs.email_enabled ? ' · par email'
                    : prefs.inapp_enabled ? ' · ici' : ' · aucun canal')}
          </p>
        </button>
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

      {ouvert && erreur && (
        <p className="mt-2 text-amber-300 text-[12px] leading-relaxed">
          {en
            ? "Couldn't save. Your previous setting still applies — try again."
            : "Impossible d'enregistrer. Ton réglage précédent s'applique toujours — réessaie."}
        </p>
      )}

      {ouvert && prefs.enabled && (
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
                    {f.cout && (
                      <span className="ml-auto text-white/35 text-[11px] font-medium">{f.cout}</span>
                    )}
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
                // Une coche verte et un rond vide se ressemblent trop : on ne
                // sait pas au premier coup d'oeil ce qui est actif, et rien ne
                // dit que c'est cliquable. Un interrupteur montre l'état ET
                // l'action, sans texte.
                <button
                  key={String(cle)}
                  type="button"
                  role="switch"
                  aria-checked={!!prefs[cle]}
                  aria-label={titre}
                  onClick={() => enregistrer({ [cle]: !prefs[cle] } as Partial<Prefs>)}
                  className={`text-left min-h-[56px] px-3 py-2.5 rounded-xl border transition-colors ${
                    prefs[cle]
                      ? 'bg-white/10 border-white/25'
                      : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.06] active:bg-white/[0.09]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`relative inline-flex shrink-0 w-9 h-5 rounded-full transition-colors ${
                      prefs[cle] ? 'bg-emerald-400' : 'bg-white/25'
                    }`}>
                      <span className={`absolute inset-y-0 my-auto w-4 h-4 rounded-full bg-white transition-transform ${
                        prefs[cle] ? 'translate-x-[18px]' : 'translate-x-[2px]'
                      }`} />
                    </span>
                    <span className="text-white text-[13px] font-semibold">{titre}</span>
                  </div>
                  <p className="text-white/45 text-[12px] leading-snug mt-1 pl-[46px]">{detail}</p>
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
