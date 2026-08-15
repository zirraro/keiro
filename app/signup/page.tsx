import { redirect } from 'next/navigation';

/**
 * `/signup` n'existait pas — et pourtant on y envoyait les gens.
 *
 * Le bouton « Créer mon compte gratuit » du mur d'essai pointait vers
 * `/signup?from=anon-gate`. La page n'a jamais existé : le visiteur qui venait
 * d'accepter de créer un compte recevait une page d'erreur. Aucune trace côté
 * serveur, aucune alerte — un 404 ne se plaint pas, il fait juste partir le
 * monde.
 *
 * Trouvé par un audit qui teste tous les liens internes du site contre la
 * production (`scripts/verifier-liens-internes.mjs`), maintenant joué à chaque
 * déploiement pour qu'on n'en découvre plus un par hasard.
 *
 * On garde l'adresse — c'est celle que tout le monde tape et que les liens
 * externes utilisent — et on renvoie sur le formulaire, ouvert du bon côté.
 * Les paramètres suivent : `from`, `plan` et `redirect` portent l'origine du
 * prospect, et on ne veut pas la perdre en route.
 */
export const dynamic = 'force-dynamic';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(params)) {
    if (typeof valeur === 'string') qs.set(cle, valeur);
    else if (Array.isArray(valeur) && valeur[0]) qs.set(cle, valeur[0]);
  }
  qs.set('mode', 'signup');
  redirect(`/login?${qs.toString()}`);
}
