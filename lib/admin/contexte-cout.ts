/**
 * Le contexte de facturation : à QUI imputer un appel d'API.
 *
 * ── Le problème constaté ──
 *
 * Le compteur de coûts attribuait l'agent en lisant la pile d'appels, ce qui
 * marche à peu près, et le client… pas du tout : sur sept jours, 100 % de la
 * dépense ressortait en « sans client ». Impossible dans ces conditions de
 * savoir quel commerce coûte cher, ni de piloter une marge par client — ce qui
 * est pourtant la seule question qui compte quand on facture à l'abonnement.
 *
 * La pile d'appels ne peut PAS porter cette information : l'identifiant du
 * client n'est pas dans les noms de fichiers, il est dans les données.
 *
 * ── La solution ──
 *
 * `AsyncLocalStorage` propage une valeur à travers les frontières asynchrones
 * sans la passer en paramètre à chaque fonction. On la pose une fois, à
 * l'entrée d'une exécution d'agent, et tout appel d'API déclenché en dessous —
 * même dix niveaux plus bas, même après plusieurs `await` — sait pour qui il
 * travaille.
 *
 * C'est la seule approche qui n'impose pas de faire transiter un `userId` par
 * la signature de chaque fonction du produit, ce qui serait invasif et se
 * perdrait au premier oubli.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface ContexteCout {
  userId?: string | null;
  agent?: string | null;
  /** Ce qui a déclenché l'exécution : cron, chat, webhook… */
  origine?: string | null;
}

const stockage = new AsyncLocalStorage<ContexteCout>();

/**
 * Exécute `travail` en imputant tous ses appels d'API au contexte donné.
 *
 * À poser au plus haut niveau utile — typiquement dès que l'identifiant du
 * client est connu dans une route d'agent. Poser trop bas laisserait hors
 * périmètre les appels faits en amont ; poser trop haut imputerait à un client
 * des appels qui ne le concernent pas.
 */
export function avecContexteCout<T>(contexte: ContexteCout, travail: () => T): T {
  return stockage.run(contexte, travail);
}

/** Le contexte courant, ou un objet vide hors de toute exécution d'agent. */
export function contexteCoutActuel(): ContexteCout {
  return stockage.getStore() || {};
}

/**
 * Enveloppe un gestionnaire de route en imputant sa dépense au bon client.
 *
 * Le client est lu dans la requête (`?user_id=`), qui est la façon dont le
 * worker déclenche les agents par client — donc l'essentiel de la dépense. Les
 * exécutions sans client identifiable gardent l'attribution par pile d'appels,
 * ce qui reste mieux que rien.
 */
export function avecContexteRoute(
  agent: string,
  gestionnaire: (req: any) => Promise<any>,
): (req: any) => Promise<any> {
  return (req: any) => {
    let userId: string | null = null;
    try { userId = req?.nextUrl?.searchParams?.get('user_id') || null; } catch { /* requête atypique */ }
    return avecContexteCout(
      { userId, agent, origine: req?.headers?.get?.('authorization') ? 'cron' : 'interface' },
      () => gestionnaire(req),
    );
  };
}
