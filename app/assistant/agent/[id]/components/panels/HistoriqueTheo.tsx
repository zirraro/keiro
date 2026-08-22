'use client';

import { useEffect, useState } from 'react';

/**
 * Ce que Théo a écrit sous le nom du commerçant.
 *
 * Demande du fondateur (2026-08-06) : « on doit pouvoir voir l'historique au
 * besoin, pour voir le travail fait par Théo ou manuellement sur KeiroAI. »
 *
 * Un agent qui répond à la place de quelqu'un doit pouvoir être relu. Sans
 * ça, la seule façon de savoir ce qu'il a publié en son nom est d'aller le
 * lire sur Google, avis par avis.
 *
 * L'origine — Théo seul ou réponse validée par le client — est affichée en
 * premier : c'est la question qu'on se pose devant une réponse dont on ne se
 * souvient pas. Quand on ne la connaît pas (entrées antérieures au
 * 2026-08-06), on le dit plutôt que de deviner.
 */

interface Entree {
  date: string;
  type: 'reponse' | 'escalade';
  auteur: string | null;
  note: number | null;
  texte: string | null;
  origine: 'auto' | 'manuelle' | null;
  motif: string | null;
  echec: boolean;
}

function quand(iso: string): string {
  const j = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (j <= 0) return "aujourd'hui";
  if (j === 1) return 'hier';
  if (j < 7) return `il y a ${j} jours`;
  if (j < 31) return `il y a ${Math.floor(j / 7)} semaine${j >= 14 ? 's' : ''}`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export default function HistoriqueTheo() {
  const [entrees, setEntrees] = useState<Entree[] | null>(null);
  const [ouvert, setOuvert] = useState(false);

  useEffect(() => {
    if (!ouvert || entrees) return;
    fetch('/api/agents/google-reviews/historique', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setEntrees(d.entrees || []))
      .catch(() => setEntrees([]));
  }, [ouvert, entrees]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] mt-4 overflow-hidden">
      <button
        onClick={() => setOuvert(o => !o)}
        aria-expanded={ouvert}
        className="w-full min-h-[52px] px-4 flex items-center justify-between gap-3 text-left hover:bg-white/[0.03] active:bg-white/[0.06] transition-colors"
      >
        <span className="text-white text-sm font-semibold">Historique des réponses</span>
        <span className="text-white/40 text-lg leading-none flex-shrink-0">{ouvert ? '−' : '+'}</span>
      </button>

      {ouvert && (
        <div className="px-4 pb-4">
          {!entrees ? (
            <div className="h-4 w-32 bg-white/10 rounded animate-pulse" />
          ) : entrees.length === 0 ? (
            <p className="text-white/40 text-sm py-3">
              Aucune réponse envoyée pour l&apos;instant. Elles apparaîtront ici, avec leur date
              et qui les a validées.
            </p>
          ) : (
            <div className="space-y-2.5">
              {entrees.map((e, i) => (
                <div key={i} className="rounded-xl bg-white/[0.03] border border-white/10 p-3">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-white text-[13px] font-semibold">
                      {e.auteur || 'Avis Google'}
                    </span>
                    {e.note != null && (
                      <span className="text-amber-400 text-xs">{'★'.repeat(e.note)}</span>
                    )}
                    <span
                      className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                        e.type === 'escalade'
                          ? 'bg-amber-400/12 text-amber-300 border-amber-400/25'
                          : e.origine === 'manuelle'
                            ? 'bg-blue-400/12 text-blue-300 border-blue-400/25'
                            : e.origine === 'auto'
                              ? 'bg-emerald-400/12 text-emerald-300 border-emerald-400/25'
                              : 'bg-white/8 text-white/40 border-white/15'
                      }`}
                    >
                      {e.type === 'escalade'
                        ? 'Signalé'
                        : e.origine === 'manuelle'
                          ? 'Validé par toi'
                          : e.origine === 'auto'
                            ? 'Théo'
                            : 'Origine inconnue'}
                    </span>
                    <span className="text-white/35 text-xs ml-auto">{quand(e.date)}</span>
                  </div>

                  {e.texte && (
                    <p className="text-white/65 text-[13px] leading-relaxed">{e.texte}</p>
                  )}
                  {e.motif && (
                    <p className="text-white/35 text-[12px] leading-relaxed mt-1">{e.motif}</p>
                  )}
                  {e.echec && (
                    <p className="text-amber-300/80 text-[12px] mt-1">
                      Google a refusé l&apos;envoi — la réponse n&apos;est pas publiée.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
