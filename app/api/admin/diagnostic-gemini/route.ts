import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Pourquoi Gemini ne répond plus depuis le serveur — la réponse, pas l'hypothèse.
 *
 * Fondateur, 18 août : « ça fonctionnait, alors qu'est-ce qui s'est passé ?
 * T'as fait un changement ? D'où le bug ? »
 *
 * Question juste. Le 17 août à 08 h 21 part le dernier appel Gemini réussi ;
 * après quoi l'API répond `400 FAILED_PRECONDITION — User location is not
 * supported`. J'ai conclu à un filtrage par plage d'adresses. C'est une
 * hypothèse, pas une preuve, et il en existe une autre que je n'avais pas
 * testée : le VPS sort peut-être en IPv6, et Google traite les deux familles
 * différemment. Ce parc a déjà eu ce problème — la connexion directe à
 * PostgreSQL est inaccessible en IPv6 depuis cette machine.
 *
 * Ce que ce contrôle établit, sans SSH — donc depuis n'importe quel réseau :
 *   · l'adresse IPv4 et l'adresse IPv6 vues de l'extérieur ;
 *   · la réponse de Gemini en laissant Node choisir ;
 *   · la réponse de Gemini en FORÇANT IPv4.
 *
 * Si le troisième test passe alors que le second échoue, la cause est la
 * famille d'adresses et le correctif tient en une ligne. Sinon, c'est bien la
 * plage qui est filtrée, et il faut passer par Vertex AI.
 */

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const cle = process.env.GEMINI_API_KEY;
  const resultat: Record<string, any> = { cle_presente: !!cle };

  const adresse = async (url: string) => {
    try {
      const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      return (await r.text()).trim();
    } catch (e: any) {
      return `indisponible (${e?.message})`;
    }
  };
  resultat.ipv4_sortante = await adresse('https://api.ipify.org');
  resultat.ipv6_sortante = await adresse('https://api6.ipify.org');

  const appel = async (dispatcher?: any) => {
    if (!cle) return 'pas de clé';
    try {
      const opts: any = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'ok' }] }],
          generationConfig: { maxOutputTokens: 8, thinkingConfig: { thinkingBudget: 0 } },
        }),
        signal: AbortSignal.timeout(20000),
      };
      if (dispatcher) opts.dispatcher = dispatcher;
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${cle}`,
        opts,
      );
      const t = await r.text();
      const msg = (t.match(/"message":\s*"([^"]{0,120})/) || [])[1];
      return `HTTP ${r.status}${msg ? ` — ${msg}` : ' — OK'}`;
    } catch (e: any) {
      return `échec (${e?.message})`;
    }
  };

  resultat.gemini_par_defaut = await appel();

  // ── Le même appel, mais en refusant IPv6 ──
  try {
    const { Agent } = await import('undici');
    const ipv4Seul = new Agent({ connect: { family: 4 } as any });
    resultat.gemini_force_ipv4 = await appel(ipv4Seul);
  } catch (e: any) {
    resultat.gemini_force_ipv4 = `undici indisponible (${e?.message})`;
  }

  resultat.lecture =
    String(resultat.gemini_force_ipv4).startsWith('HTTP 200') && !String(resultat.gemini_par_defaut).startsWith('HTTP 200')
      ? "La famille d'adresses est en cause : forcer IPv4 suffit."
      : String(resultat.gemini_par_defaut).startsWith('HTTP 200')
        ? 'Gemini répond normalement — le blocage a cessé.'
        : "Les deux familles sont refusées : c'est bien la plage d'adresses du datacenter qui est filtrée, il faut passer par Vertex AI.";

  return NextResponse.json({ ok: true, ...resultat });
}
