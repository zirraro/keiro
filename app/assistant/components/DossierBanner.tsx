'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * Le bandeau qui complète le dossier — une question à la fois, sur place.
 *
 * ── Ce qui a changé et pourquoi ──
 *
 * L'ancienne version affichait un pourcentage calculé sur dix champs figés,
 * identiques pour tous les métiers. Un plombier voyait « dossier à 40 % » sans
 * savoir ce qui manquait, et le compteur montait en remplissant des champs qui
 * ne changeaient rien à la qualité de ses posts.
 *
 * On affiche désormais ce qui bloque vraiment : « il me reste 2 informations
 * essentielles ». C'est plus court à lire, plus honnête, et surtout ça se
 * termine — un pourcentage qui plafonne à 80 % décourage, une liste de deux
 * éléments se traite.
 *
 * ── Une question à la fois, répondable sur place ──
 *
 * L'ancien bouton renvoyait vers un chat. Chaque redirection perd du monde, et
 * la question qui débloque le plus la qualité mérite d'être répondable là où
 * elle est posée. Le lien vers Clara reste, pour ceux qui préfèrent parler,
 * déposer un document ou tout faire d'un coup.
 */

interface DossierBannerProps {
  profile: Record<string, any> | null;
  claraAvatarUrl: string | null;
}

interface Besoin {
  cle: string;
  question: string;
  a_quoi_ca_sert: string;
  priorite: 'essentiel' | 'important' | 'optionnel';
  type: string;
  exemple?: string;
  options?: string[];
  agents: string[];
}

/** Les prénoms, jamais les identifiants techniques ni le mot « agent ». */
const PRENOMS: Record<string, string> = {
  content: 'Léna', email: 'Hugo', dm: 'Jade', chatbot: 'Clara',
  commercial: 'Léo', seo: 'Théo', whatsapp: 'Stella',
};

function prenoms(ids: string[]): string {
  const noms = [...new Set(ids.map(i => PRENOMS[i]).filter(Boolean))];
  if (!noms.length) return 'ton équipe';
  if (noms.length === 1) return noms[0];
  return noms.slice(0, -1).join(', ') + ' et ' + noms[noms.length - 1];
}

export default function DossierBanner({ claraAvatarUrl }: DossierBannerProps) {
  const [masque, setMasque] = useState(false);
  const [besoins, setBesoins] = useState<Besoin[] | null>(null);
  const [restantsEssentiels, setRestantsEssentiels] = useState(0);
  const [reponse, setReponse] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const charger = useCallback(() => {
    fetch('/api/onboarding/besoins', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (!d?.ok) return;
        setBesoins(d.besoins || []);
        setRestantsEssentiels(d.par_priorite?.essentiel ?? 0);
      })
      .catch(() => { /* le bandeau disparaît, il ne casse jamais la page */ });
  }, []);

  useEffect(() => { charger(); }, [charger]);

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('keiro_dossier_banner_dismissed') === 'true') {
      setMasque(true);
    }
  }, []);

  // On priorise l'essentiel, à défaut l'important. L'optionnel n'a jamais sa
  // place ici : le réclamer donnerait l'impression d'un dossier interminable
  // alors que tout ce qui compte est déjà renseigné.
  const question = besoins?.find(b => b.priorite === 'essentiel')
    ?? besoins?.find(b => b.priorite === 'important')
    ?? null;

  const envoyer = async () => {
    if (!question || !reponse.trim() || envoi) return;
    setEnvoi(true);
    try {
      const res = await fetch('/api/onboarding/besoins', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'dossier', infos: [{ cle: question.cle, valeur: reponse.trim() }] }),
      }).then(r => r.json());

      // Nommer qui en tiendra compte rend la redistribution visible. Sans ça,
      // le client a l'impression de remplir un formulaire de plus.
      const avertis: string[] = res?.agents_avertis?.length ? res.agents_avertis : question.agents;
      setConfirmation(`C'est noté — ${prenoms(avertis)} en ${avertis.length > 1 ? 'tiennent' : 'tient'} compte dès maintenant.`);
      setReponse('');
      charger();
      setTimeout(() => setConfirmation(null), 6000);
    } catch {
      setConfirmation("Je n'ai pas réussi à enregistrer, réessaie dans un instant.");
    } finally {
      setEnvoi(false);
    }
  };

  const fermer = () => {
    setMasque(true);
    if (typeof window !== 'undefined') localStorage.setItem('keiro_dossier_banner_dismissed', 'true');
  };

  if (masque || !besoins || !question) return null;

  return (
    <div className="relative bg-gradient-to-r from-[#0891b2]/20 to-[#2563eb]/20 border border-[#0891b2]/30 rounded-2xl p-4 sm:p-5 mb-6">
      <button
        onClick={fermer}
        className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
        aria-label="Masquer"
      >
        <svg className="w-3.5 h-3.5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-[#0891b2] to-[#2563eb] flex items-center justify-center">
          {claraAvatarUrl
            ? <img src={claraAvatarUrl} alt="Clara" className="w-full h-full object-cover" style={{ objectPosition: 'top center' }} />
            : <span className="text-lg">🚀</span>}
        </div>

        <div className="flex-1 min-w-0 pr-6">
          {restantsEssentiels > 0 && (
            <p className="text-white/50 text-xs font-medium mb-1.5">
              {restantsEssentiels === 1
                ? 'Il me reste 1 information essentielle à te demander'
                : `Il me reste ${restantsEssentiels} informations essentielles à te demander`}
            </p>
          )}

          <p className="text-white text-sm font-semibold leading-snug">{question.question} ?</p>
          <p className="text-white/60 text-xs mt-1 leading-relaxed">{question.a_quoi_ca_sert}</p>

          {confirmation ? (
            <p className="mt-3 text-[#5eead4] text-xs font-medium">{confirmation}</p>
          ) : (
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              {question.type === 'choix' && question.options?.length ? (
                <select
                  value={reponse}
                  onChange={e => setReponse(e.target.value)}
                  className="flex-1 bg-white/10 border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#0891b2]"
                >
                  <option value="">Choisis…</option>
                  {question.options.map(o => <option key={o} value={o} className="text-neutral-900">{o}</option>)}
                </select>
              ) : (
                <input
                  type="text"
                  value={reponse}
                  onChange={e => setReponse(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') envoyer(); }}
                  placeholder={question.exemple ? `Ex. : ${question.exemple}` : 'Ta réponse…'}
                  className="flex-1 min-w-0 bg-white/10 border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-white/35 focus:outline-none focus:border-[#0891b2]"
                />
              )}
              <button
                onClick={envoyer}
                disabled={!reponse.trim() || envoi}
                className="flex-shrink-0 px-4 py-2.5 bg-white/15 hover:bg-white/25 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {envoi ? '…' : 'Envoyer'}
              </button>
            </div>
          )}

          <a
            href="/assistant/agent/onboarding"
            className="inline-block mt-2.5 text-white/45 hover:text-white/70 text-xs underline underline-offset-2 transition-colors"
          >
            Tout compléter avec Clara, ou déposer un document
          </a>
        </div>
      </div>
    </div>
  );
}
