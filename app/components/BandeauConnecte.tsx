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

  /**
   * ── Affirmer la connexion, pas la murmurer ──
   *
   * Fondateur, 18 août : « quand un client Keiro est connecté, mets plus en
   * avant qu'il est connecté sur la page d'accueil. »
   *
   * La première version était une ligne grise qui se fondait dans l'en-tête —
   * techniquement présente, visuellement absente. Or c'est le seul élément de
   * la page qui s'adresse à LUI : tout le reste parle à un inconnu qu'il faut
   * convaincre.
   *
   * Elle prend donc la couleur de la marque, une pastille verte qui dit l'état
   * en un coup d'œil, et un bouton plein. Sur mobile le texte secondaire
   * s'efface pour que le bouton reste entier — c'est lui qui compte.
   */
  return (
    <div className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 shadow-sm">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="relative flex h-2.5 w-2.5 flex-shrink-0" aria-hidden>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
          </span>
          <p className="text-sm text-white min-w-0 truncate">
            {prenom ? (
              <><span className="font-bold">{prenom}</span>, vos agents tournent.</>
            ) : (
              <span className="font-bold">Vos agents tournent.</span>
            )}
            <span className="hidden sm:inline text-white/75"> Ils ont continué pendant votre absence.</span>
          </p>
        </div>
        <a
          href="/assistant"
          className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-50 active:scale-95 transition min-h-[44px]"
        >
          Mon espace
          <span aria-hidden>→</span>
        </a>
      </div>
    </div>
  );
}
