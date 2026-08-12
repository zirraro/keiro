'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Le carnet de réservations du commerçant.
 *
 * ── Ce que cet écran doit faire, et rien d'autre ──
 *
 * Fondateur, 2026-08-11 : « ça doit être ultra facile et pratique ». Un gérant
 * l'ouvre entre deux services, sur son téléphone, souvent d'une main. Il vient
 * pour trois gestes : voir ce qui arrive aujourd'hui, confirmer une demande,
 * noter qui n'est pas venu.
 *
 * Tout le reste — statistiques, filtres, historique — encombrerait ces trois
 * gestes. Ce qui est à confirmer passe donc en tête, sans qu'on ait à
 * chercher : c'est la seule chose qui attend une décision.
 *
 * Le vocabulaire vient du métier renseigné à l'onboarding : le restaurateur
 * lit « couverts », l'hôtelier « nuits ». On ne le lui redemande jamais.
 */

interface Reservation {
  id: string;
  client_nom: string | null;
  client_telephone: string | null;
  canal: string;
  date_prevue: string | null;
  heure_prevue: string | null;
  quantite: number | null;
  objet: string | null;
  statut: string;
  demande_brute: string | null;
}

const CANAUX: Record<string, { label: string; icone: string }> = {
  dm_instagram: { label: 'Instagram', icone: '📸' },
  whatsapp: { label: 'WhatsApp', icone: '💬' },
  email: { label: 'Email', icone: '✉️' },
  tiktok: { label: 'TikTok', icone: '🎵' },
  telephone: { label: 'Téléphone', icone: '📞' },
  site: { label: 'Site', icone: '🌐' },
  manuel: { label: 'Saisie', icone: '✍️' },
};

const STATUTS: Record<string, { label: string; couleur: string }> = {
  a_confirmer: { label: 'À confirmer', couleur: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  confirmee: { label: 'Confirmée', couleur: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  annulee: { label: 'Annulée', couleur: 'bg-white/5 text-white/40 border-white/10' },
  honoree: { label: 'Venu', couleur: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  absent: { label: 'Absent', couleur: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
};

function jour(d: string | null): string {
  if (!d) return 'Date à préciser';
  const dt = new Date(`${d}T12:00:00Z`);
  const auj = new Date().toISOString().slice(0, 10);
  const demain = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  if (d === auj) return "Aujourd'hui";
  if (d === demain) return 'Demain';
  return dt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function ReservationsPanel() {
  const [chargement, setChargement] = useState(true);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [profil, setProfil] = useState<{ objet: string; unite: string } | null>(null);
  const [compteurs, setCompteurs] = useState({ a_confirmer: 0, aujourdhui: 0, a_venir: 0 });
  const [occupe, setOccupe] = useState<string>('');

  const charger = useCallback(() => {
    setChargement(true);
    fetch('/api/reservations', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setReservations(d.reservations || []);
          setProfil(d.profil || null);
          setCompteurs(d.compteurs || { a_confirmer: 0, aujourdhui: 0, a_venir: 0 });
        }
      })
      .catch(() => {})
      .finally(() => setChargement(false));
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const changerStatut = useCallback(async (id: string, statut: string) => {
    setOccupe(id);
    // Mise à jour optimiste : le gérant confirme en marchant, l'écran ne doit
    // pas le faire attendre un aller-retour réseau.
    setReservations(prev => prev.map(r => (r.id === id ? { ...r, statut } : r)));
    try {
      await fetch('/api/reservations', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, statut }),
      });
    } catch { charger(); }
    finally { setOccupe(''); }
  }, [charger]);

  if (chargement) {
    return <div className="text-white/40 text-sm py-8 text-center">Chargement du carnet…</div>;
  }

  const aConfirmer = reservations.filter(r => r.statut === 'a_confirmer');
  const reste = reservations.filter(r => r.statut !== 'a_confirmer');

  const carte = (r: Reservation) => {
    const canal = CANAUX[r.canal] || CANAUX.manuel;
    const statut = STATUTS[r.statut] || STATUTS.a_confirmer;
    return (
      <div key={r.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-white font-semibold text-sm truncate">
              {r.client_nom || 'Client'}
              {r.quantite ? <span className="text-white/50 font-normal"> · {r.quantite} {profil?.unite || ''}</span> : null}
            </div>
            <div className="text-white/50 text-xs mt-0.5">
              {jour(r.date_prevue)}{r.heure_prevue ? ` à ${String(r.heure_prevue).slice(0, 5)}` : ''}
              {r.objet ? ` · ${r.objet}` : ''}
            </div>
          </div>
          <span className={`shrink-0 text-[10px] px-2 py-1 rounded-full border ${statut.couleur}`}>{statut.label}</span>
        </div>

        {r.demande_brute && (
          <p className="text-white/40 text-[11px] italic line-clamp-2">« {r.demande_brute} »</p>
        )}

        <div className="flex items-center justify-between gap-2">
          <span className="text-white/35 text-[10px]">{canal.icone} {canal.label}</span>
          <div className="flex gap-1.5">
            {r.statut === 'a_confirmer' && (
              <>
                <button
                  type="button" disabled={occupe === r.id}
                  onClick={() => changerStatut(r.id, 'confirmee')}
                  className="min-h-[44px] px-3 rounded-lg bg-emerald-500/20 text-emerald-200 text-xs font-semibold hover:bg-emerald-500/30 disabled:opacity-50"
                >Confirmer</button>
                <button
                  type="button" disabled={occupe === r.id}
                  onClick={() => changerStatut(r.id, 'annulee')}
                  className="min-h-[44px] px-3 rounded-lg bg-white/5 text-white/60 text-xs hover:bg-white/10 disabled:opacity-50"
                >Refuser</button>
              </>
            )}
            {r.statut === 'confirmee' && (
              <>
                <button
                  type="button" disabled={occupe === r.id}
                  onClick={() => changerStatut(r.id, 'honoree')}
                  className="min-h-[44px] px-3 rounded-lg bg-sky-500/20 text-sky-200 text-xs font-semibold hover:bg-sky-500/30 disabled:opacity-50"
                >Venu</button>
                <button
                  type="button" disabled={occupe === r.id}
                  onClick={() => changerStatut(r.id, 'absent')}
                  className="min-h-[44px] px-3 rounded-lg bg-white/5 text-white/60 text-xs hover:bg-white/10 disabled:opacity-50"
                >Absent</button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        {[
          { n: compteurs.a_confirmer, l: 'à confirmer' },
          { n: compteurs.aujourdhui, l: "aujourd'hui" },
          { n: compteurs.a_venir, l: 'à venir' },
        ].map(c => (
          <div key={c.l} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
            <div className="text-2xl font-bold text-white tabular-nums">{c.n}</div>
            <div className="text-[11px] text-white/45">{c.l}</div>
          </div>
        ))}
      </div>

      {aConfirmer.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-white/70 text-xs font-bold uppercase tracking-wide">
            En attente de ta réponse
          </h3>
          {aConfirmer.map(carte)}
        </div>
      )}

      {reste.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-white/70 text-xs font-bold uppercase tracking-wide">Le carnet</h3>
          {reste.map(carte)}
        </div>
      )}

      {reservations.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center">
          <p className="text-white/70 text-sm font-semibold mb-1">Aucune réservation pour l'instant</p>
          <p className="text-white/45 text-xs leading-relaxed">
            Dès qu'un client demandera une {profil?.objet || 'réservation'} par message privé,
            WhatsApp ou email, elle apparaîtra ici — et tu recevras une alerte
            pour confirmer d'un geste.
          </p>
        </div>
      )}
    </div>
  );
}
