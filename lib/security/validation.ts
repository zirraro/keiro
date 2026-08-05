/**
 * VALIDATION DES ENTRÉES — exigence ASVS V5 pour le CASA.
 *
 * ── Pourquoi un module et pas du zod éparpillé ──
 *
 * Zod était déjà installé mais utilisé nulle part : chaque route lisait
 * `await req.json()` et se servait directement dans l'objet. Une entrée
 * inattendue traversait donc tout le traitement jusqu'à provoquer une erreur
 * quelque part au fond, avec un message technique renvoyé au client.
 *
 * Trois choses que ce module garantit et qu'un `req.json()` nu ne peut pas :
 *
 *   1. Le corps est un objet. `JSON.parse('null')` et `JSON.parse('"x"')`
 *      réussissent tous les deux — puis `body.champ` explose plus loin.
 *   2. Les champs texte sont bornés. Sans borne, un corps de 10 Mo part
 *      dans un prompt et coûte une fortune en jetons avant d'échouer.
 *   3. L'erreur renvoyée dit QUEL champ pose problème, sans jamais exposer
 *      la structure interne ni une trace d'exécution.
 *
 * ── Ce que ça n'est pas ──
 *
 * Ce n'est pas une protection contre l'injection : celle-là vit dans
 * `lib/safe-filter.ts` pour PostgREST et dans le paramétrage des requêtes.
 * La validation d'entrée réduit la surface, elle ne remplace pas
 * l'échappement en sortie.
 */
import { z } from 'zod';
import { NextResponse } from 'next/server';

/** Longueurs maximales par nature de champ, pour ne pas les redécider partout. */
export const BORNES = {
  identifiant: 128,
  nomCourt: 200,
  ligne: 500,
  paragraphe: 5_000,
  /**
   * Un corps d'email ou un contenu long. Au-delà, ce n'est plus une saisie
   * humaine : c'est soit une erreur, soit un abus.
   */
  texteLong: 50_000,
} as const;

export const champs = {
  uuid: z.string().uuid('identifiant invalide'),
  identifiant: z.string().min(1).max(BORNES.identifiant),
  nomCourt: z.string().trim().min(1).max(BORNES.nomCourt),
  ligne: z.string().trim().max(BORNES.ligne),
  paragraphe: z.string().trim().max(BORNES.paragraphe),
  texteLong: z.string().max(BORNES.texteLong),
  email: z.string().trim().email('adresse email invalide').max(320),
  url: z.string().trim().url('URL invalide').max(2_048),
  /** Un booléen qui accepte aussi les formes envoyées par un formulaire. */
  booleen: z.union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform(v => v === true || v === 'true'),
};

export interface EchecValidation {
  ok: false;
  reponse: NextResponse;
}
export interface SuccesValidation<T> {
  ok: true;
  donnees: T;
}

/**
 * Lit et valide le corps d'une requête.
 *
 * Renvoie soit les données typées, soit une réponse 400 prête à retourner —
 * jamais d'exception. Une validation qui lève oblige chaque appelant à
 * l'entourer d'un try/catch, et le premier oubli renvoie une 500 avec une
 * trace, ce qui est exactement ce que l'ASVS V7 interdit.
 */
export async function valider<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<SuccesValidation<z.infer<S>> | EchecValidation> {
  let brut: unknown;
  try {
    brut = await req.json();
  } catch {
    return {
      ok: false,
      reponse: NextResponse.json({ ok: false, error: 'Corps de requête illisible (JSON attendu)' }, { status: 400 }),
    };
  }

  // `JSON.parse` accepte null, un nombre ou une chaîne : ce sont des corps
  // syntaxiquement valides mais inutilisables, et ils passeraient un simple
  // try/catch pour échouer beaucoup plus loin.
  if (brut === null || typeof brut !== 'object' || Array.isArray(brut)) {
    return {
      ok: false,
      reponse: NextResponse.json({ ok: false, error: 'Le corps doit être un objet JSON' }, { status: 400 }),
    };
  }

  const resultat = schema.safeParse(brut);
  if (!resultat.success) {
    // On nomme les champs fautifs sans jamais renvoyer la structure du schéma
    // ni une trace : assez pour corriger, rien pour cartographier l'API.
    const details = resultat.error.issues.slice(0, 5).map(i => ({
      champ: i.path.join('.') || '(racine)',
      probleme: i.message,
    }));
    return {
      ok: false,
      reponse: NextResponse.json({ ok: false, error: 'Requête invalide', details }, { status: 400 }),
    };
  }

  return { ok: true, donnees: resultat.data };
}

/**
 * Valide les paramètres d'URL d'une requête GET.
 *
 * Les mêmes garanties que pour le corps : bornes et types. Un paramètre de
 * pagination non borné est le moyen le plus simple de faire lire cinquante
 * mille lignes à une base.
 */
export function validerParams<S extends z.ZodTypeAny>(
  url: URL,
  schema: S,
): SuccesValidation<z.infer<S>> | EchecValidation {
  const objet: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { objet[k] = v; });

  const resultat = schema.safeParse(objet);
  if (!resultat.success) {
    const details = resultat.error.issues.slice(0, 5).map(i => ({
      champ: i.path.join('.') || '(racine)',
      probleme: i.message,
    }));
    return {
      ok: false,
      reponse: NextResponse.json({ ok: false, error: 'Paramètres invalides', details }, { status: 400 }),
    };
  }
  return { ok: true, donnees: resultat.data };
}

/** Entier borné, pour les limites et paginations passées en paramètre. */
export function entierBorne(min: number, max: number, defaut: number) {
  return z.coerce.number().int().min(min).max(max).catch(defaut);
}

export { z };
