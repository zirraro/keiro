'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

/**
 * Ce que voit un client déjà connecté quand il arrive sur l'accueil.
 *
 * ── Le problème ──
 *
 * Fondateur, 18 août : « je me rends compte que la page d'accueil reste la même
 * quand on se connecte. Si on a un compte, faudrait une UX différente que celle
 * juste de présentation. »
 *
 * Il a raison, et la page n'avait aucune conscience de la connexion : pas un
 * appel à l'authentification dans tout le fichier. Un client qui paie recevait
 * donc mot pour mot l'argumentaire destiné à un inconnu — « Tester
 * gratuitement », le prix, les preuves. On lui vend ce qu'il a déjà acheté, et
 * on lui cache ce qu'il vient chercher : son espace.
 *
 * ── Pourquoi une bande et pas une redirection ──
 *
 * Renvoyer automatiquement un client connecté vers `/assistant` serait plus
 * radical, mais il arrive qu'on vienne sur l'accueil exprès — pour relire les
 * tarifs, montrer le produit à quelqu'un, retrouver un lien. Détourner ce
 * geste, c'est retirer le contrôle à l'utilisateur.
 *
 * La bande, elle, ne prend qu'une ligne, se place avant tout le reste, et
 * répond à la seule question qu'un client connecté se pose en arrivant : où
 * est-ce que je reprends ? Le reste de la page demeure accessible.
 *
 * Rien ne s'affiche tant qu'on ne sait pas : un bandeau qui apparaît puis
 * disparaît est pire que pas de bandeau du tout.
 */
export default function BandeauConnecte() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [prenom, setPrenom] = useState<string | null>(null);
  const [connecte, setConnecte] = useState(false);

  useEffect(() => {
    let vivant = true;
    supabase.auth.getUser()
      .then((res: any) => {
        if (!vivant) return;
        const u = res?.data?.user;
        if (!u) return;
        setConnecte(true);
        // Le prénom rend la bande personnelle sans coûter une requête de plus :
        // il est déjà dans le jeton.
        const brut = u.user_metadata?.full_name || u.user_metadata?.name || u.email || '';
        const p = String(brut).split(/[@\s.]/)[0];
        if (p) setPrenom(p.charAt(0).toUpperCase() + p.slice(1));
      })
      .catch(() => {});
    return () => { vivant = false; };
  }, [supabase]);

  if (!connecte) return null;

  return (
    <div className="w-full border-b border-white/10 bg-[#0c1a3a] light:bg-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3">
        <p className="text-sm text-white/80 min-w-0 truncate">
          {prenom ? (
            <>Bon retour, <span className="font-semibold text-white">{prenom}</span>.</>
          ) : (
            <>Vous êtes connecté.</>
          )}
          <span className="hidden sm:inline text-white/50"> Vos agents ont continué sans vous.</span>
        </p>
        <a
          href="/assistant"
          className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-[#0c1a3a] hover:bg-white/90 active:scale-95 transition min-h-[40px]"
        >
          Mon espace
          <span aria-hidden>→</span>
        </a>
      </div>
    </div>
  );
}
