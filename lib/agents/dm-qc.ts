/**
 * CONTRÔLE QUALITÉ DES DM DE PROSPECTION (founder 15/07 : « contrôle qualité
 * comme pour les générations »). Même philosophie que le vision-gate des visuels
 * (lib/visuals/qa-check.ts) : score 0-10, < seuil → on régénère ou on écarte.
 *
 * Deux niveaux, du moins cher au plus cher :
 *  1. DÉTERMINISTE (gratuit) : détecte les fautes exactes signalées par le
 *     founder — faux sens du follow, faux avant/après, visuel prétendu fait,
 *     marqueurs "IA"/corporate, personnalisation générique, nom du commerce
 *     inventé, longueur. Un seul hard-flag = échec immédiat (pas d'appel LLM).
 *  2. LLM (Haiku, ~€0.002) : score la qualité réelle (personnalisé, véridique,
 *     naturel). Fail-open (7/10) si pas de clé/erreur pour ne jamais bloquer.
 */

export type DMQC = { pass: boolean; score: number; flags: string[]; notes: string };

const PASS_THRESHOLD = 6; // aligné sur le vision-gate visuel

// Fautes rédhibitoires (les cas exacts qui ont grillé des DM).
const FORBIDDEN: Array<[string, RegExp]> = [
  ['faux_follow', /(cool|content|sympa|merci|ravi)[^.!?]{0,30}(que tu (me )?suis|de (me )?suivre|(ton|votre) (follow|abonnement))/i],
  ['avant_apres', /avant[\s/_-]*apr[eè]s/i],
  ['visuel_pretendu_fait', /(je t['e ]?ai fait|j['e ]?ai (fait|cr[eé]{2}|retravaill[eé]|refait|modifi[eé]|prepar[eé]))[^.!?]{0,40}(visuel|photo|image|avant|montage|pour (toi|ton|votre|vous))/i],
  ['visuel_pretendu_fait2', /voici (ton|votre|le) (visuel|montage|rendu)/i],
  ['marqueur_ia', /\b(intelligence artificielle|automatis[eé]e?s?|machine learning|algorithme? de l['e ]?ia)\b/i],
  ['corporate', /\b(cordialement|bien à vous|je me permets|j['e ]?esp[eè]re que ce message vous trouve|permettez-moi)\b/i],
  ['salutation_lettre', /^\s*(bonjour|cher(e|ère)?|madame|monsieur|hello|dear)\b/i],
  ['mention_prix', /\b\d{1,3}\s?(€|euros?)\b/i], // pas de prix au 1er DM
  ['lien', /https?:\/\//i], // pas de lien au 1er DM
];

// Personnalisation générique = échec (doit citer un détail réel).
const GENERIC_DETAIL = /^(leur|ton|ta|tes|votre|vos|le|la|les|ce|cette)\s+(compte|page|profil|style|contenu|feed|univers|activit[eé]|business|com|présence)\.?$/i;

// Sur-familiarité = ton trop décontracté (founder 15/07 : pro mais décontracté).
// Soft-flag (baisse le score via le LLM), pas hard-fail.
const OVER_CASUAL = /\b(yo|frr+|wesh|grave|insane|dead|ça claque|trop de la balle|c'est chaud|askip|mdr|lol)\b/i;

/** Le nom du commerce, s'il apparaît, doit correspondre (au moins un token fort). */
function nameLooksWrong(text: string, company?: string | null): boolean {
  const c = String(company || '').trim();
  if (!c || c.length < 3) return false;
  const strongTokens = c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/).filter(t => t.length >= 4 && !['paris','store','concept','shop','cafe','resto','group','maison'].includes(t));
  if (!strongTokens.length) return false;
  const t = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  // Si AUCUN token fort du vrai nom n'apparaît MAIS qu'un mot en Majuscule
  // ressemblant à un nom propre est présent → risque d'invention. Heuristique
  // douce : on ne flag que si le vrai nom est totalement absent du texte.
  return !strongTokens.some(tok => t.includes(tok));
}

export function deterministicDMChecks(dm: any, prospect: any): { hardFail: boolean; flags: string[] } {
  const flags: string[] = [];
  const text = String(dm?.dm_text || '');
  for (const [name, re] of FORBIDDEN) if (re.test(text)) flags.push(name);
  const detail = String(dm?.personalization_detail || '').trim();
  if (!detail || detail.length < 12 || GENERIC_DETAIL.test(detail)) flags.push('generic_detail');
  if (text.length > 620) flags.push('too_long');
  if (text.length < 25) flags.push('too_short');
  // Le nom absent n'est pas rédhibitoire seul (le DM peut dire "ton compte"),
  // on le remonte en flag informatif pour le score LLM, pas en hardFail.
  const softFlags: string[] = [];
  if (nameLooksWrong(text, prospect?.company)) softFlags.push('name_absent');
  if (OVER_CASUAL.test(text)) softFlags.push('over_casual');
  return { hardFail: flags.length > 0, flags: [...flags, ...softFlags] };
}

export async function assessDMQuality(dm: any, prospect: any): Promise<DMQC> {
  const det = deterministicDMChecks(dm, prospect);
  const hard = det.flags.filter(f => f !== 'name_absent');
  if (hard.length > 0) {
    return { pass: false, score: 2, flags: det.flags, notes: `deterministic: ${hard.join(', ')}` };
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { pass: true, score: 7, flags: det.flags, notes: 'no-api-key (open)' };

  try {
    const realCtx = (() => {
      const bn: any = prospect?.business_notes;
      if (bn && typeof bn === 'object') return [bn.website_description, ...(bn.signals || [])].filter(Boolean).join(' · ').slice(0, 200);
      return typeof bn === 'string' ? bn.slice(0, 160) : '';
    })();
    const system = `Tu audites des DM Instagram de prospection à froid pour des commerces. Note la qualité de CE DM. JSON STRICT :
{"score":0-10,"notes":"une phrase","flags":["generic","invented_name","false_claim","ai_tone","wrong_follow","no_specific_detail"]}

Barème (10 = un humain expert l'aurait écrit, 6 = envoyable, <6 = à régénérer) :
- VÉRIDIQUE : aucune affirmation fausse. Le DM ne doit PAS prétendre avoir déjà fait un visuel/avant-après, ni remercier d'un follow (c'est l'expéditeur qui découvre le prospect). Nom du commerce = "${prospect?.company || '?'}" — s'il cite un AUTRE nom = invented_name, score ≤ 3.
- PERSONNALISÉ : cite un détail RÉEL et spécifique (plat, post, produit, déco). "ta page"/"ton compte" seul = no_specific_detail, score ≤ 5.
- NATUREL + TON JUSTE : indistinguable d'un humain. Registre PROFESSIONNEL MAIS DÉCONTRACTÉ — sérieux et crédible, jamais sur-familier. Pénalise FORT ("over_casual", score ≤ 5) le slang d'ado : "yo", "frr", "grave", "insane", "dead", "ça claque", "c'est chaud", excès de "haha". Tutoiement OK, ponctuation normale, pas de langage SMS.
Contexte réel du commerce : "${realCtx || 'inconnu'}". Type : ${prospect?.type || 'commerce'}.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system,
        messages: [{ role: 'user', content: `DM à auditer :\n"${String(dm?.dm_text || '').slice(0, 700)}"\n\nDétail de perso annoncé : "${String(dm?.personalization_detail || '').slice(0, 200)}"\n\nRends le JSON.` }],
      }),
    });
    if (!res.ok) return { pass: true, score: 7, flags: det.flags, notes: `api ${res.status} (open)` };
    const data = await res.json();
    const txt = (data.content?.[0]?.text || '').trim();
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return { pass: true, score: 7, flags: det.flags, notes: 'no-json (open)' };
    const parsed = JSON.parse(m[0]);
    const score = Math.max(0, Math.min(10, Number(parsed.score ?? 7)));
    const flags = [...det.flags, ...(Array.isArray(parsed.flags) ? parsed.flags.slice(0, 6).map(String) : [])];
    return { pass: score >= PASS_THRESHOLD, score, flags, notes: String(parsed.notes || '').slice(0, 160) };
  } catch (err: any) {
    return { pass: true, score: 7, flags: det.flags, notes: `qa-error (open): ${err?.message?.slice(0, 60)}` };
  }
}
