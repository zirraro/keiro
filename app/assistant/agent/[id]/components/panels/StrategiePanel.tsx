'use client';

import { useEffect, useState, useCallback } from 'react';

/**
 * La stratégie du client, en français, et modifiable.
 *
 * Demande du fondateur (2026-08-08) : « on doit être capable, dans l'espace du
 * client, de lui dire quelle est sa stratégie — peut-être un espace dans son
 * onglet planning — et il doit pouvoir l'ajuster. »
 *
 * ── Ce que ce panneau n'est pas ──
 *
 * Un formulaire de plus. L'application porte déjà 67 réglages ; en ajouter une
 * page ne ferait qu'un endroit supplémentaire que personne n'ouvre. Un
 * commerçant ne veut pas lire « auto_mode_instagram : true » — il veut savoir
 * ce qui est publié pour lui, à quel rythme, sur quoi, et pouvoir corriger.
 *
 * D'où la forme : une stratégie ÉCRITE EN PHRASES, dont les mots importants
 * sont eux-mêmes les commandes. On lit « 3 publications par semaine sur
 * Instagram et TikTok » et on clique sur « 3 » pour le changer. Pas de champ,
 * pas d'étiquette technique, pas de bouton « Enregistrer ».
 *
 * ── Les quatre leviers, et pas quarante ──
 *
 * Un boulanger ajustera réalistement quatre choses : la fréquence, les
 * réseaux, ce qu'il veut mettre en avant ce mois-ci, ce qu'il veut éviter. Le
 * reste relève du métier de l'agent et n'a pas à remonter ici.
 *
 * ── Le mode d'échec qu'on refuse ──
 *
 * Qu'il change quelque chose et qu'il ne se passe rien. Chaque commande écrit
 * donc sur une clé que Léna lit RÉELLEMENT — posts_per_day_*, *_enabled,
 * custom_instructions — via l'API de réglages existante. Aucun champ inventé :
 * un réglage fantôme est pire que pas de réglage, parce qu'il donne
 * l'impression d'avoir agi.
 */

interface Reglages {
  posts_per_day_ig: number;
  posts_per_day_tt: number;
  posts_per_day_li: number;
  ig_enabled: boolean;
  tt_enabled: boolean;
  li_enabled: boolean;
  custom_instructions: string;
}

const DEFAUTS: Reglages = {
  posts_per_day_ig: 1, posts_per_day_tt: 1, posts_per_day_li: 0,
  ig_enabled: true, tt_enabled: true, li_enabled: false,
  custom_instructions: '',
};

/** Le rythme, dit comme on le dit à voix haute. */
function phraseRythme(r: Reglages): string {
  const actifs: string[] = [];
  if (r.ig_enabled && r.posts_per_day_ig > 0) actifs.push('Instagram');
  if (r.tt_enabled && r.posts_per_day_tt > 0) actifs.push('TikTok');
  if (r.li_enabled && r.posts_per_day_li > 0) actifs.push('LinkedIn');
  if (!actifs.length) return 'Aucun réseau actif — rien ne part pour l\'instant.';

  const parJour = (r.ig_enabled ? r.posts_per_day_ig : 0)
    + (r.tt_enabled ? r.posts_per_day_tt : 0)
    + (r.li_enabled ? r.posts_per_day_li : 0);
  const parSemaine = Math.round(parJour * 7);

  const liste = actifs.length === 1 ? actifs[0]
    : `${actifs.slice(0, -1).join(', ')} et ${actifs[actifs.length - 1]}`;
  return `${parSemaine} publication${parSemaine > 1 ? 's' : ''} par semaine sur ${liste}.`;
}

export default function StrategiePanel({ en = false, replie = false }: { en?: boolean; replie?: boolean }) {
  // Replié par défaut quand on le demande : le fondateur veut que le planning
  // et le catalogue de réglages restent au premier plan, et que la stratégie
  // soit là quand on la cherche — pas devant en permanence.
  const [ouvert, setOuvert] = useState(!replie);
  const [r, setR] = useState<Reglages | null>(null);
  const [enregistre, setEnregistre] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [consigne, setConsigne] = useState('');

  useEffect(() => {
    let annule = false;
    fetch('/api/agents/settings?agent_id=content', { credentials: 'include' })
      .then(x => x.json())
      .then(d => {
        if (annule) return;
        const s = d.settings || {};
        const lu: Reglages = {
          posts_per_day_ig: Number(s.posts_per_day_ig ?? DEFAUTS.posts_per_day_ig),
          posts_per_day_tt: Number(s.posts_per_day_tt ?? DEFAUTS.posts_per_day_tt),
          posts_per_day_li: Number(s.posts_per_day_li ?? DEFAUTS.posts_per_day_li),
          ig_enabled: s.ig_enabled ?? DEFAUTS.ig_enabled,
          tt_enabled: s.tt_enabled ?? DEFAUTS.tt_enabled,
          li_enabled: s.li_enabled ?? DEFAUTS.li_enabled,
          custom_instructions: String(s.custom_instructions || ''),
        };
        setR(lu);
        setConsigne(lu.custom_instructions);
      })
      .catch(() => { if (!annule) setErreur('Impossible de lire ta stratégie.'); });
    return () => { annule = true; };
  }, []);

  const ecrire = useCallback(async (patch: Partial<Reglages>) => {
    setR(prev => (prev ? { ...prev, ...patch } : prev));
    setErreur(null);
    try {
      const res = await fetch('/api/agents/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ agent_id: 'content', ...patch }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setEnregistre(true);
      setTimeout(() => setEnregistre(false), 1600);
    } catch {
      // Un réglage qui échoue en silence fait croire au client qu'il a agi.
      setErreur("Ce changement n'a pas été enregistré — réessaie.");
    }
  }, []);

  if (!r) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 mb-4">
        <div className="h-4 w-48 bg-white/10 rounded animate-pulse" />
      </div>
    );
  }

  const RESEAUX: Array<{ cle: 'ig' | 'tt' | 'li'; nom: string; actif: boolean; parJour: number }> = [
    { cle: 'ig', nom: 'Instagram', actif: r.ig_enabled, parJour: r.posts_per_day_ig },
    { cle: 'tt', nom: 'TikTok', actif: r.tt_enabled, parJour: r.posts_per_day_tt },
    { cle: 'li', nom: 'LinkedIn', actif: r.li_enabled, parJour: r.posts_per_day_li },
  ];

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] mb-4 overflow-hidden">
      {/* L'en-tête est le bouton : replié, il montre déjà l'essentiel — la
          phrase qui résume ce qui part. On sait donc ce qu'il y a dedans sans
          l'ouvrir, ce qui est tout l'intérêt d'un repli. */}
      <button
        onClick={() => setOuvert(o => !o)}
        aria-expanded={ouvert}
        className="w-full text-left px-4 sm:px-5 py-4 flex items-start justify-between gap-3 hover:bg-white/[0.03] active:bg-white/[0.06] transition-colors"
      >
        <div className="min-w-0">
          <h3 className="text-white font-bold text-base">Ta stratégie en ce moment</h3>
          <p className="text-white/55 text-[13px] mt-0.5 leading-relaxed">
            {ouvert ? 'Touche ce que tu veux changer.' : phraseRythme(r)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {enregistre && <span className="text-emerald-400 text-[11px] font-semibold">Pris en compte</span>}
          <span className="text-white/40 text-lg leading-none">{ouvert ? '−' : '+'}</span>
        </div>
      </button>

      {ouvert && (
      <div className="px-4 sm:px-5 pb-5">

      {erreur && (
        <p className="mb-3 text-amber-300 text-[12px] leading-relaxed">{erreur}</p>
      )}

      {/* La phrase qui résume tout — c'est elle qu'on lit en premier. */}
      <p className="text-white text-[15px] leading-relaxed mb-4">{phraseRythme(r)}</p>

      {/* ── Les réseaux, avec leur cadence ── */}
      <div className="space-y-2 mb-4">
        {RESEAUX.map(res => (
          <div
            key={res.cle}
            className={`rounded-xl border p-3 transition-colors ${
              res.actif && res.parJour > 0 ? 'border-white/20 bg-white/[0.05]' : 'border-white/10 bg-white/[0.02]'
            }`}
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <button
                onClick={() => ecrire({ [`${res.cle}_enabled`]: !res.actif } as Partial<Reglages>)}
                className="min-h-[44px] inline-flex items-center gap-2.5 pr-2"
                role="switch"
                aria-checked={res.actif}
                aria-label={`${res.nom} — ${res.actif ? 'actif' : 'coupé'}`}
              >
                <span className={`relative inline-flex shrink-0 w-9 h-5 rounded-full transition-colors ${
                  res.actif ? 'bg-emerald-400' : 'bg-white/25'
                }`}>
                  <span className={`absolute inset-y-0 my-auto w-4 h-4 rounded-full bg-white transition-transform ${
                    res.actif ? 'translate-x-[18px]' : 'translate-x-[2px]'
                  }`} />
                </span>
                <span className="text-white text-[14px] font-semibold">{res.nom}</span>
              </button>

              {res.actif && (
                <div className="flex items-center gap-1.5">
                  <span className="text-white/40 text-[12px] mr-1">par jour</span>
                  {[0, 1, 2, 3].map(n => (
                    <button
                      key={n}
                      onClick={() => ecrire({ [`posts_per_day_${res.cle}`]: n } as Partial<Reglages>)}
                      className={`min-h-[44px] min-w-[44px] rounded-lg text-[14px] font-semibold transition-colors ${
                        res.parJour === n
                          ? 'bg-white/15 text-white'
                          : 'text-white/40 hover:text-white/75 hover:bg-white/[0.06]'
                      }`}
                      aria-label={`${n} publication${n > 1 ? 's' : ''} par jour sur ${res.nom}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Ce qu'il veut pousser, ou éviter ── */}
      <div>
        <label htmlFor="consigne-strategie" className="block text-white/40 text-[11px] uppercase tracking-wider font-semibold mb-2">
          Ce que tu veux mettre en avant, ou éviter
        </label>
        <textarea
          id="consigne-strategie"
          value={consigne}
          onChange={e => setConsigne(e.target.value)}
          onBlur={() => { if (consigne !== r.custom_instructions) ecrire({ custom_instructions: consigne }); }}
          rows={2}
          placeholder="Ex. : on ferme du 1er au 20 août · mets en avant la formule brunch · ne parle plus des livraisons"
          className="w-full min-h-[72px] bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-base sm:text-[14px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/25 resize-none leading-relaxed"
        />
        <p className="text-white/35 text-[12px] mt-1.5 leading-relaxed">
          Écris-le comme tu le dirais. Ton équipe en tient compte dès la prochaine publication.
        </p>
      </div>
      </div>
      )}
    </div>
  );
}
