'use client';

import { useEffect, useState } from 'react';

/**
 * Ce que chaque agent a livré, regroupé chez Ami.
 *
 * Demande du fondateur (2026-08-09) : « on veut le moins de stats possible dans
 * les agents pour que ce soit plus simple et plus clair. C'est Ami qui regroupe
 * les stats et qui explique. Fluide et compréhensible par réseau social, et par
 * tâches/agents. »
 *
 * ── Ce qu'on montre, et ce qu'on tait ──
 *
 * Une livraison, pas une activité. « 12 publications dont 4 reels » a du sens
 * pour un commerçant ; « 60 exécutions de l'agent contenu » n'en a aucun — il
 * ne sait pas ce qu'est une exécution et ça ne lui dit pas si son compte
 * avance.
 *
 * ── La variation, seulement quand elle veut dire quelque chose ──
 *
 * Une hausse de 300 % sur trois observations n'est pas une tendance, c'est du
 * bruit. En dessous de cinq observations, on affiche le chiffre sans le
 * comparer. Mieux vaut ne rien conclure que conclure faux — c'est ce qui
 * distingue un tableau de bord d'un générateur de fausses certitudes.
 */

interface Metrique {
  valeur: number | null;
  echantillon: number;
  precedent: number | null;
  variationPct: number | null;
}

interface Canal {
  canal: string;
  agent: string;
  actif: boolean;
  metriques: Record<string, Metrique>;
}

/** Le nom que le client connaît, et ce que l'agent fait pour lui. */
const AGENTS: Record<string, { nom: string; fait: string }> = {
  contenu: { nom: 'Léna', fait: 'publie sur tes réseaux' },
  dm: { nom: 'Jade', fait: 'répond à tes messages' },
  email: { nom: 'Hugo', fait: 'gère ta boîte mail' },
  prospection: { nom: 'Léo', fait: 'trouve des clients' },
  whatsapp: { nom: 'Stella', fait: 'confirme tes rendez-vous' },
};

/** Les métriques techniques traduites en français courant. */
const LIBELLES: Record<string, string> = {
  publications: 'publications', posts: 'publications', reels: 'reels',
  vues: 'vues', portee: 'personnes touchées', reach: 'personnes touchées',
  engagement: 'interactions', likes: 'likes', commentaires: 'commentaires',
  dm_envoyes: 'messages envoyés', dm_repondus: 'messages traités',
  reponses: 'réponses reçues', conversations: 'conversations',
  emails_envoyes: 'emails envoyés', ouvertures: 'ouvertures', clics: 'clics',
  prospects: 'prospects ajoutés', qualifies: 'prospects qualifiés',
  rendez_vous: 'rendez-vous', confirmations: 'confirmations',
};

/** Le seuil sous lequel une variation ne veut rien dire. */
const ECHANTILLON_MINIMUM = 5;

function Variation({ m }: { m: Metrique }) {
  if (m.variationPct === null || m.echantillon < ECHANTILLON_MINIMUM) return null;
  const hausse = m.variationPct > 0;
  const stable = Math.abs(m.variationPct) < 5;
  if (stable) return <span className="text-white/35 text-xs">stable</span>;
  return (
    <span className={`text-xs font-semibold ${hausse ? 'text-emerald-400' : 'text-amber-400'}`}>
      {hausse ? '+' : ''}{m.variationPct}%
    </span>
  );
}

/** Ce que le client a choisi de suivre, gardé sur son appareil. */
const CLE_CHOIX = 'keiro_agents_suivis';

export default function ResultatsParAgent({ en = false }: { en?: boolean }) {
  const [canaux, setCanaux] = useState<Canal[] | null>(null);
  const [inactifs, setInactifs] = useState<string[]>([]);

  /**
   * Le client choisit les agents qu'il veut suivre.
   *
   * Demande du fondateur (2026-08-09) : « le client doit avoir le choix des
   * stats également. »
   *
   * Un commerçant qui n'utilise ni WhatsApp ni la prospection n'a pas à faire
   * défiler leurs blocs pour atteindre ce qui l'intéresse. Le choix vit en
   * local : c'est une préférence d'affichage, pas une donnée métier, et la
   * faire transiter par le serveur ajouterait une latence pour rien.
   */
  const [masques, setMasques] = useState<string[]>([]);
  const [choisir, setChoisir] = useState(false);

  useEffect(() => {
    try {
      const brut = localStorage.getItem(CLE_CHOIX);
      if (brut) setMasques(JSON.parse(brut));
    } catch { /* préférence illisible : on montre tout, c'est le bon défaut */ }
  }, []);

  const basculer = (canal: string) => {
    setMasques(prev => {
      const suivant = prev.includes(canal) ? prev.filter(c => c !== canal) : [...prev, canal];
      try { localStorage.setItem(CLE_CHOIX, JSON.stringify(suivant)); } catch { /* quota */ }
      return suivant;
    });
  };

  useEffect(() => {
    let annule = false;
    fetch('/api/agents/marketing/resultats?jours=7', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (annule) return;
        setCanaux(d.canaux || []);
        setInactifs(d.canauxInactifs || []);
      })
      .catch(() => { if (!annule) setCanaux([]); });
    return () => { annule = true; };
  }, []);

  if (!canaux) {
    return <div className="h-20 rounded-2xl bg-white/[0.03] border border-white/10 animate-pulse mb-4" />;
  }

  const actifs = canaux.filter(c => c.actif && Object.values(c.metriques).some(m => m.valeur !== null));

  if (!actifs.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 mb-4">
        <h3 className="text-white text-sm font-semibold mb-1">Ce que ton équipe a fait</h3>
        <p className="text-white/45 text-[13px] leading-relaxed">
          Rien à mesurer sur les sept derniers jours. Dès que tes agents auront travaillé,
          leurs résultats apparaîtront ici — c&apos;est le seul endroit où ils sont regroupés.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 mb-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-white text-sm font-semibold">Ce que ton équipe a fait</h3>
          <p className="text-white/45 text-[12px] mt-0.5 leading-relaxed">
            Sept derniers jours, par agent.
          </p>
        </div>
        <button
          onClick={() => setChoisir(c => !c)}
          className="min-h-[44px] px-3 -mr-1 rounded-lg text-white/45 hover:text-white/80 text-[12px] font-medium transition-colors flex-shrink-0"
        >
          {choisir ? 'Terminé' : 'Choisir'}
        </button>
      </div>

      {/* Le choix ne s'ouvre qu'à la demande : affiché en permanence, il
          prendrait la place de ce qu'on vient lire. */}
      {choisir && (
        <div className="mb-3 rounded-xl bg-white/[0.03] border border-white/10 p-3">
          <p className="text-white/45 text-[12px] mb-2 leading-relaxed">
            Décoche ce que tu ne veux pas suivre. Les chiffres continuent d&apos;être mesurés,
            ils ne s&apos;affichent simplement plus ici.
          </p>
          <div className="flex flex-wrap gap-2">
            {actifs.map(c => {
              const visible = !masques.includes(c.canal);
              return (
                <button
                  key={c.canal}
                  onClick={() => basculer(c.canal)}
                  role="switch"
                  aria-checked={visible}
                  className={`min-h-[44px] inline-flex items-center gap-2 px-3 rounded-full border text-[13px] font-medium transition-colors ${
                    visible ? 'bg-white/10 border-white/25 text-white' : 'bg-white/[0.02] border-white/10 text-white/40'
                  }`}
                >
                  <span className={`relative inline-flex shrink-0 w-8 h-[18px] rounded-full transition-colors ${
                    visible ? 'bg-emerald-400' : 'bg-white/25'
                  }`}>
                    <span className={`absolute inset-y-0 my-auto w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      visible ? 'translate-x-[16px]' : 'translate-x-[2px]'
                    }`} />
                  </span>
                  {AGENTS[c.canal]?.nom || c.agent}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-2.5">
        {actifs.filter(c => !masques.includes(c.canal)).map(c => {
          const a = AGENTS[c.canal] || { nom: c.agent, fait: '' };
          const mesures = Object.entries(c.metriques)
            .filter(([, m]) => m.valeur !== null)
            .slice(0, 4);

          return (
            <div key={c.canal} className="rounded-xl bg-white/[0.03] border border-white/10 p-3">
              <div className="flex items-baseline gap-2 mb-2 flex-wrap">
                <span className="text-white text-[14px] font-semibold">{a.nom}</span>
                {a.fait && <span className="text-white/40 text-[12px]">{a.fait}</span>}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {mesures.map(([cle, m]) => (
                  <div key={cle}>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-white text-[17px] font-bold leading-none tabular-nums">
                        {m.valeur}
                      </span>
                      <Variation m={m} />
                    </div>
                    <div className="text-white/40 text-xs mt-0.5 leading-snug">
                      {LIBELLES[cle] || cle.replace(/_/g, ' ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {inactifs.length > 0 && (
        <p className="mt-3 pt-3 border-t border-white/10 text-white/35 text-[12px] leading-relaxed">
          Sans activité cette semaine : {inactifs.map(i => AGENTS[i]?.nom || i).join(', ')}.
          {' '}Ce n&apos;est pas une panne — ces agents n&apos;avaient rien à faire, ou ne sont pas activés.
        </p>
      )}
    </div>
  );
}
