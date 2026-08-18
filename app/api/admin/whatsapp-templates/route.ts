import { NextRequest, NextResponse } from 'next/server';
import { WA_TEMPLATES, META_LANG_CODE, type WaLang, type WaTemplate } from '@/lib/agents/whatsapp-templates';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Confronter notre banc de modèles WhatsApp à ce que Meta a réellement approuvé.
 *
 * ── Pourquoi ──
 *
 * J'ai annoncé au fondateur « 32 modèles, 12 familles, trois langues » comme un
 * livrable. C'était exact sur le contenu et faux sur l'effet : rien n'était
 * soumis à Meta, et WhatsApp n'envoie hors de la fenêtre de 24 heures QUE des
 * modèles pré-approuvés, langue par langue. Ces 96 variantes étaient du texte
 * dans un fichier.
 *
 * Les identifiants ne vivent que sur le serveur. Cette route s'exécute donc là
 * où ils sont, et rend son verdict en HTTPS — utilisable depuis n'importe quel
 * réseau, y compris ceux d'où SSH est refusé.
 *
 *   GET  → ce que Meta connaît, ce qui manque, langue par langue
 *   POST → soumet les manquants (`?appliquer=1` pour écrire vraiment)
 *
 * Le POST est volontairement explicite : soumettre un modèle est une action
 * visible côté Meta, qui la met en revue. On ne la déclenche pas par accident
 * en rafraîchissant une page.
 */

const GRAPH = 'https://graph.facebook.com/v21.0';

function conf() {
  return {
    token: process.env.WHATSAPP_ACCESS_TOKEN || '',
    // L'identifiant du compte professionnel se déduit du numéro quand il n'est
    // pas fourni : une variable de moins à tenir à jour.
    waba: process.env.WHATSAPP_WABA_ID || '',
    phone: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  };
}

async function trouverWaba(token: string, phone: string, waba: string): Promise<string | null> {
  if (waba) return waba;
  if (!phone) return null;
  try {
    const r = await fetch(`${GRAPH}/${phone}?fields=whatsapp_business_account`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j: any = await r.json();
    return j?.whatsapp_business_account?.id || null;
  } catch {
    return null;
  }
}

/** Tous nos modèles, à plat, sans doublon de nom. */
function nosModeles(): WaTemplate[] {
  const vus = new Set<string>();
  const out: WaTemplate[] = [];
  for (const fam of Object.values(WA_TEMPLATES)) {
    for (const t of fam.templates) {
      if (vus.has(t.name)) continue;
      vus.add(t.name);
      out.push(t);
    }
  }
  return out;
}

async function etatMeta(token: string, waba: string) {
  const connus = new Map<string, string>(); // `nom|langue` → statut
  let url = `${GRAPH}/${waba}/message_templates?limit=200&fields=name,language,status`;
  for (let page = 0; page < 6 && url; page++) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const j: any = await r.json();
    if (!Array.isArray(j?.data)) return { connus, erreur: JSON.stringify(j?.error || j).slice(0, 300) };
    for (const t of j.data) connus.set(`${t.name}|${t.language}`, t.status);
    url = j.paging?.next || '';
  }
  return { connus, erreur: null as string | null };
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const { token, phone } = conf();
  if (!token) return NextResponse.json({ ok: false, error: 'WHATSAPP_ACCESS_TOKEN absent du serveur' });
  const waba = await trouverWaba(token, phone, conf().waba);
  if (!waba) {
    /**
     * Une panne muette de plus si on s'arrête à « introuvable ».
     *
     * Trois causes possibles et indiscernables sans détail : le numéro n'est
     * pas configuré, le jeton n'a pas le droit de lire le compte rattaché, ou
     * Meta renvoie une erreur qu'on jette. On rend donc ce que Meta a dit.
     */
    let reponse = 'aucun appel effectué (WHATSAPP_PHONE_NUMBER_ID absent)';
    if (phone) {
      try {
        const r = await fetch(`${GRAPH}/${phone}?fields=whatsapp_business_account,display_phone_number,verified_name`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        reponse = `HTTP ${r.status} — ${(await r.text()).slice(0, 300)}`;
      } catch (e: any) {
        reponse = `échec réseau : ${e?.message}`;
      }
    }
    return NextResponse.json({
      ok: false,
      error: 'compte professionnel WhatsApp introuvable',
      phone_number_id: phone || '(absent)',
      waba_env: conf().waba || '(absent)',
      reponse_meta: reponse,
    });
  }

  const { connus, erreur } = await etatMeta(token, waba);
  if (erreur) return NextResponse.json({ ok: false, waba, erreur });

  const langues: WaLang[] = ['fr', 'es', 'en'];
  const manquants: string[] = [];
  const enRevue: string[] = [];
  const approuves: string[] = [];

  for (const t of nosModeles()) {
    for (const l of langues) {
      const cle = `${t.name}|${META_LANG_CODE[l]}`;
      const statut = connus.get(cle);
      if (!statut) manquants.push(`${t.name} (${l})`);
      else if (statut === 'APPROVED') approuves.push(`${t.name} (${l})`);
      else enRevue.push(`${t.name} (${l}) — ${statut}`);
    }
  }

  return NextResponse.json({
    ok: true,
    waba,
    nos_modeles: nosModeles().length,
    attendus: nosModeles().length * langues.length,
    chez_meta: connus.size,
    approuves: approuves.length,
    en_revue: enRevue.length,
    manquants: manquants.length,
    detail_manquants: manquants.slice(0, 40),
    detail_en_revue: enRevue.slice(0, 20),
  });
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const appliquer = req.nextUrl.searchParams.get('appliquer') === '1';
  const { token, phone } = conf();
  if (!token) return NextResponse.json({ ok: false, error: 'WHATSAPP_ACCESS_TOKEN absent du serveur' });
  const waba = await trouverWaba(token, phone, conf().waba);
  if (!waba) return NextResponse.json({ ok: false, error: 'compte professionnel WhatsApp introuvable' });

  const { connus, erreur } = await etatMeta(token, waba);
  if (erreur) return NextResponse.json({ ok: false, waba, erreur });

  const langues: WaLang[] = ['fr', 'es', 'en'];
  const aSoumettre: { t: WaTemplate; l: WaLang }[] = [];
  for (const t of nosModeles()) {
    for (const l of langues) {
      if (!connus.has(`${t.name}|${META_LANG_CODE[l]}`)) aSoumettre.push({ t, l });
    }
  }

  if (!appliquer) {
    return NextResponse.json({
      ok: true, simulation: true, waba,
      a_soumettre: aSoumettre.length,
      apercu: aSoumettre.slice(0, 20).map((x) => `${x.t.name} (${x.l})`),
      note: 'Ajouter ?appliquer=1 pour soumettre réellement à Meta.',
    });
  }

  let crees = 0;
  const echecs: string[] = [];
  for (const { t, l } of aSoumettre) {
    const v = t.langs[l];
    if (!v) continue;
    try {
      const r = await fetch(`${GRAPH}/${waba}/message_templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: t.name,
          language: META_LANG_CODE[l],
          category: t.category,
          components: [{
            type: 'BODY',
            text: v.body,
            // Meta exige un exemple pour chaque variable, sinon il refuse le
            // modèle sans expliquer laquelle manque.
            ...(v.example?.length ? { example: { body_text: [v.example] } } : {}),
          }],
        }),
      });
      const j: any = await r.json();
      if (r.ok && j.id) crees++;
      else echecs.push(`${t.name} (${l}) — ${String(j?.error?.error_user_msg || j?.error?.message || r.status).slice(0, 120)}`);
    } catch (e: any) {
      echecs.push(`${t.name} (${l}) — ${e?.message}`);
    }
  }

  return NextResponse.json({ ok: true, waba, soumis: crees, echecs: echecs.length, detail_echecs: echecs.slice(0, 20) });
}
