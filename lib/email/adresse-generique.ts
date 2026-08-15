/**
 * Les adresses génériques brûlent la réputation qui fait arriver les autres.
 *
 * ── Ce que la base dit, mesuré le 16 août sur 3 423 prospects avec email ──
 *
 *                        envoyées   en échec           ont ouvert
 *   contact@, info@…       1 573     1 100  (69,9 %)     126  (8,0 %)
 *   nominatives            1 045       122  (11,7 %)     183  (17,5 %)
 *
 * Six fois plus d'échecs, deux fois moins d'ouvertures. Les génériques font
 * 60 % du volume envoyé et 90 % des échecs.
 *
 * ── Pourquoi c'est le vrai sujet, et pas l'objet du mail ──
 *
 * Le digest lisait 4,4 % d'ouverture contre 25 % de repère et concluait « c'est
 * l'objet, ou la délivrabilité ». C'est la délivrabilité, et sa cause est ici :
 * 1 100 adresses mortes signalent à Gmail qu'on envoie à l'aveugle. La
 * réputation qui en résulte fait tomber en indésirable les adresses
 * nominatives, qui elles ouvrent à 17,5 %. On ne perd pas les mauvaises
 * adresses : on perd les bonnes à cause des mauvaises.
 *
 * L'authentification, elle, est correcte — je l'ai vérifiée : DKIM Brevo posé
 * sur les sélecteurs brevo1/brevo2, domaine authentifié côté Brevo. Ce n'est
 * pas le problème.
 *
 * ── Pourquoi on ne les supprime pas ──
 *
 * 126 génériques ont ouvert. Chez un commerçant seul, `contact@` est souvent la
 * SEULE adresse qui existe. Les interdire, c'est renoncer à un tiers du marché
 * adressable. On les plafonne donc au lieu de les bannir : elles passent après
 * les nominatives, et ne peuvent occuper qu'une part minoritaire d'un envoi.
 *
 * Le contrôle MX avant envoi existe déjà et ne suffit pas : ces domaines ont un
 * MX parfaitement valide, c'est la BOÎTE qui n'existe pas. Le DNS ne peut pas
 * le dire.
 */

/**
 * Les préfixes de boîtes de service — celles qui n'appartiennent à personne.
 *
 * `mail` est dans la liste à cause d'un artefact vu en base :
 * `maile-commerce@chezlecaviste.com`, du texte de page recollé par le
 * scraping. Ce genre d'adresse n'a jamais eu de destinataire.
 */
const PREFIXES_GENERIQUES = [
  'contact', 'info', 'infos', 'hello', 'bonjour', 'accueil', 'commercial',
  'direction', 'service', 'services', 'mail', 'email', 'admin', 'secretariat',
  'secretariat', 'reservation', 'reservations', 'boutique', 'shop', 'noreply',
  'no-reply', 'contactez-nous', 'nous-contacter', 'welcome', 'office',
];

/**
 * Une adresse de service plutôt qu'une personne.
 *
 * On compare le début de la partie locale, pas l'égalité stricte :
 * `contact.paris@`, `contact-boutique@` et `contactez-nous@` sont le même
 * animal, et `maile-commerce@` aussi.
 */
export function estAdresseGenerique(email: string | null | undefined): boolean {
  if (!email) return false;
  const locale = String(email).split('@')[0]?.toLowerCase().trim();
  if (!locale) return false;
  return PREFIXES_GENERIQUES.some(
    (p) => locale === p || locale.startsWith(`${p}.`) || locale.startsWith(`${p}-`) || locale.startsWith(`${p}_`) || locale.startsWith(p),
  );
}

/**
 * La part maximale d'un envoi qui peut partir vers des adresses génériques.
 *
 * 25 % : à ce niveau, même si toutes rebondissaient, le taux de rebond global
 * resterait sous le seuil de 5 % qui déclenche les restrictions Brevo, compte
 * tenu des ~12 % d'échec des nominatives. On garde donc une marge réelle tout
 * en continuant à toucher les commerces qui n'ont que cette adresse.
 */
export const PART_MAX_GENERIQUES = 0.25;

/**
 * Ordonne une file d'envoi : nominatives d'abord, génériques plafonnées.
 *
 * Le plafond peut faire envoyer MOINS que le quota du jour quand il ne reste
 * que des génériques. C'est voulu : envoyer à 70 % d'adresses mortes coûte plus
 * cher que de ne pas envoyer, parce que la facture est payée par les prospects
 * suivants. Le nombre écarté est retourné pour être journalisé — un plafond
 * silencieux se lit comme « on a tout traité », ce qui serait faux.
 */
export function ordonnerFileEnvoi<T extends { email?: string | null }>(
  file: T[],
  quota: number,
): { file: T[]; generiquesEcartees: number } {
  const nominatives = file.filter((p) => !estAdresseGenerique(p.email));
  const generiques = file.filter((p) => estAdresseGenerique(p.email));
  const plafond = Math.max(1, Math.floor(quota * PART_MAX_GENERIQUES));
  const retenues = generiques.slice(0, plafond);
  return {
    file: [...nominatives, ...retenues],
    generiquesEcartees: Math.max(0, generiques.length - retenues.length),
  };
}
