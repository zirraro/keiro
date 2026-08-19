import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Théo peut-il enfin modifier la fiche établissement ?
 *
 * ── Pourquoi cette route ──
 *
 * Fondateur, 19 août : « pour Théo ça dépend si Google a donné l'accès,
 * augmenté le quota — faut vérifier. »
 *
 * Il a raison de ne pas me croire sur parole. J'ai répondu « non, pas d'accès »
 * en testant le jeton de l'ENVIRONNEMENT, qui ne porte que la portée Search
 * Console. Or la vraie connexion de Théo stocke ses jetons sur le PROFIL
 * (`google_business_*`), avec la bonne portée `business.manage`, posée le
 * 15 août.
 *
 * Ces jetons sont chiffrés au repos (préfixe `gx1:`) et la clé ne vit que sur
 * le serveur. Les tester depuis un poste est impossible — je l'ai déjà fait
 * deux fois en concluant à tort que le jeton était mort. D'où cette route :
 * elle s'exécute là où la clé est, et rend le verdict en HTTPS.
 *
 * ── Ce qu'elle distingue, et qui n'est pas la même chose ──
 *
 *   · PORTÉE insuffisante → il faut que le client réautorise ;
 *   · QUOTA à zéro → Google n'a pas encore accordé l'accès en écriture, et
 *     aucune réautorisation n'y changera rien ;
 *   · les deux passent → Théo peut écrire, et on peut ouvrir la fonction.
 *
 * Confondre les deux fait attendre un accès qu'on a déjà, ou relancer un
 * client pour rien.
 */

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const email = req.nextUrl.searchParams.get('email') || 'mrzirraro@gmail.com';
  const supabase = sb();
  const { data: p } = await supabase
    .from('profiles')
    .select('id, google_business_access_token, google_business_refresh_token, google_business_token_expiry, google_place_id, google_place_nom')
    .eq('email', email)
    .maybeSingle();

  if (!p) return NextResponse.json({ ok: false, error: 'compte introuvable' });
  const out: Record<string, any> = {
    compte: email,
    fiche_choisie: (p as any).google_place_nom || '(aucune)',
    jeton_present: !!(p as any).google_business_refresh_token,
    expiration_stockee: (p as any).google_business_token_expiry,
  };

  if (!(p as any).google_business_refresh_token) {
    out.lecture = "Aucun jeton Google Business : le client doit connecter sa fiche depuis l'espace Théo.";
    return NextResponse.json({ ok: true, ...out });
  }

  // ── Déchiffrer et rafraîchir ──
  let jeton = '';
  try {
    const { decryptToken } = await import('@/lib/token-crypto');
    // `decryptToken` peut rendre null si le format n'est pas reconnu : on le
    // traite comme une chaîne vide plutôt que de laisser passer un null que
    // Google refuserait sans expliquer pourquoi.
    const refresh = String(decryptToken(String((p as any).google_business_refresh_token)) || '');
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        refresh_token: refresh,
        grant_type: 'refresh_token',
      }),
    });
    const j: any = await r.json();
    if (!j.access_token) {
      out.rafraichissement = `refusé — ${JSON.stringify(j).slice(0, 160)}`;
      out.lecture = "Le jeton de rafraîchissement ne fonctionne plus : le client doit reconnecter sa fiche.";
      return NextResponse.json({ ok: true, ...out });
    }
    jeton = j.access_token;
    out.portees = j.scope || '(non renvoyées)';
  } catch (e: any) {
    out.rafraichissement = `échec : ${e?.message}`;
    return NextResponse.json({ ok: true, ...out });
  }

  // ── Lecture : la portée est-elle bonne ? ──
  try {
    const r = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
      headers: { Authorization: `Bearer ${jeton}` },
    });
    const t = await r.text();
    out.comptes_business_http = r.status;
    if (r.ok) {
      const j = JSON.parse(t);
      out.comptes_trouves = (j.accounts || []).length;
      out.premier_compte = j.accounts?.[0]?.name || null;
    } else {
      out.comptes_business_erreur = t.slice(0, 220);
    }
  } catch (e: any) {
    out.comptes_business_erreur = e?.message;
  }

  /**
   * Le verdict, en distinguant les deux blocages possibles.
   *
   * `ACCESS_TOKEN_SCOPE_INSUFFICIENT` → portée manquante, le client réautorise.
   * `RATE_LIMIT_EXCEEDED` ou quota 0 → Google n'a pas ouvert l'écriture ; rien
   * à faire côté produit, seulement attendre la réponse à la demande déposée.
   */
  const err = String(out.comptes_business_erreur || '');
  out.lecture = out.comptes_business_http === 200
    ? `✅ Théo a l'accès : ${out.comptes_trouves} compte(s) Business lisible(s). L'écriture (horaires, description, avis) peut être ouverte.`
    : /SCOPE_INSUFFICIENT/.test(err)
      ? '❌ Portée insuffisante — le client doit reconnecter sa fiche en acceptant la gestion de fiche.'
      : /quota|RATE_LIMIT|429/i.test(err) || out.comptes_business_http === 429
        ? "❌ Quota à zéro — Google n'a pas encore accordé l'accès en écriture. Rien à corriger côté produit."
        : `❌ Refus Google (${out.comptes_business_http}) — voir le message brut.`;

  return NextResponse.json({ ok: true, ...out });
}
