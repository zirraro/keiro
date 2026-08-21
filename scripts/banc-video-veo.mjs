/**
 * Banc vidéo : Seedance contre Veo, sur nos prompts réels.
 *
 * C'est LE comparatif qui décide de nos marges. Mesuré le 20 août sur les
 * quotas réels : la vidéo pèse 83 % du coût média — 12 vidéos coûtent 13,20 €
 * quand 60 images en coûtent 2,70. Changer de modèle d'image fait gagner
 * 0,54 € par client ; changer de modèle vidéo en fait gagner 4,32 €.
 *
 * Tarifs relevés à la source, pas de mémoire (une citation de mémoire avait
 * sous-évalué Seedance de moitié) :
 *   Seedance 10 s     1,10 €   (facture réelle)
 *   Veo 3.1 fast      0,12 $/s → 1,11 € les 10 s — parité
 *   Veo 3.1 lite      0,08 $/s → 0,74 € les 10 s — 33 % moins cher
 *
 * Une vidéo se juge sur trois images clés et non sur une seule : un défaut
 * vidéo apparaît souvent en cours de plan, jamais sur la vignette.
 *
 * Usage : node --env-file=.env.local scripts/banc-video.mjs
 */

const GKEY = (process.env.GEMINI_API_KEY || '').trim();
const AKEY = (process.env.SEEDREAM_API_KEY || process.env.ARK_API_KEY || '').trim();
const USD_EUR = 0.925;

const PROMPT =
  'A baker in his sixties pulling a tray of golden croissants from the oven in a small French bakery at dawn, flour dust floating in the warm light, he glances up and smiles briefly. Documentary handheld feel, 50mm, natural light, no text anywhere.';

const MODELES = [
  { label: 'veo-3.1-fast', id: 'veo-3.1-fast-generate-preview', usdSec: 0.12 },
  { label: 'veo-3.1-lite', id: 'veo-3.1-lite-generate-preview', usdSec: 0.08 },
];

/** Même mécanique que lib/visuals/veo-fallback.ts — un seul principe, deux usages. */
async function rapatrier(url, modele) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const r = await fetch(url, { signal: AbortSignal.timeout(180000) });
    if (!r.ok) return null;
    const octets = Buffer.from(await r.arrayBuffer());
    if (octets.length < 1024) return null;
    const chemin = `veo/banc-${modele}-${Date.now()}-${octets.length}.mp4`;
    const { error } = await sb.storage.from('generated-images').upload(chemin, octets, { contentType: 'video/mp4', upsert: false });
    if (error) { console.log('  (rapatriement KO : ' + error.message + ')'); return null; }
    return sb.storage.from('generated-images').getPublicUrl(chemin).data?.publicUrl || null;
  } catch (e) { console.log('  (rapatriement KO : ' + e.message + ')'); return null; }
}

async function veo(modele) {
  const t0 = Date.now();
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modele.id}:predictLongRunning?key=${GKEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instances: [{ prompt: PROMPT }], parameters: { aspectRatio: '9:16', resolution: '1080p' } }),
    signal: AbortSignal.timeout(60000),
  });
  const t = await r.text();
  if (!r.ok) return { erreur: `HTTP ${r.status} ${t.slice(0, 110)}` };
  const name = JSON.parse(t).name;
  const fin = Date.now() + 420000;
  while (Date.now() < fin) {
    await new Promise((x) => setTimeout(x, 15000));
    const op = await (await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}?key=${GKEY}`)).json();
    if (!op.done) continue;
    if (op.error) return { erreur: String(op.error.message).slice(0, 110) };
    const s = op.response?.generateVideoResponse?.generatedSamples?.[0] || op.response?.generatedSamples?.[0];
    if (!s?.video?.uri) return { erreur: 'terminé sans vidéo' };
    // ARK ne peut pas lire une URL protégée par NOTRE clé Google — il répond
    // `InvalidParameter: Invalid video_url`. On rapatrie donc chez nous, comme
    // le fait lib/visuals/veo-fallback.ts en production : c'est la seule façon
    // que les trois modèles passent devant le MÊME juge. Deux juges différents
    // ne donnent pas des notes comparables, et un arbitrage bâti là-dessus
    // aurait l'air d'un chiffre sans en être un.
    const brut = `${s.video.uri}${s.video.uri.includes('?') ? '&' : '?'}key=${GKEY}`;
    const publique = await rapatrier(brut, modele.label);
    if (!publique) return { erreur: 'rapatriement impossible — non jugeable' };
    return { uri: publique, secondes: Math.round((Date.now() - t0) / 1000) };
  }
  return { erreur: 'dépassement 7 min' };
}

async function seedance(modele) {
  const t0 = Date.now();
  const r = await fetch('https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AKEY}` },
    body: JSON.stringify({ model: modele.id, content: [{ type: 'text', text: `${PROMPT} --ratio 9:16 --dur 10` }] }),
    signal: AbortSignal.timeout(60000),
  });
  const t = await r.text();
  if (!r.ok) return { erreur: `HTTP ${r.status} ${t.slice(0, 110)}` };
  const id = JSON.parse(t).id;
  const fin = Date.now() + 420000;
  while (Date.now() < fin) {
    await new Promise((x) => setTimeout(x, 15000));
    const st = await (await fetch(`https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/${id}`, { headers: { Authorization: `Bearer ${AKEY}` } })).json();
    if (st.status === 'succeeded') return { uri: st.content?.video_url, secondes: Math.round((Date.now() - t0) / 1000) };
    if (st.status === 'failed') return { erreur: String(st.error?.message || 'échec').slice(0, 110) };
  }
  return { erreur: 'dépassement 7 min' };
}

/** Le juge ARK — revenu depuis que le compte est réglé, et il note mieux. */
async function juger(uri) {
  const r = await fetch('https://ark.ap-southeast.bytepluses.com/api/v3/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AKEY}` },
    body: JSON.stringify({
      model: 'seed-2-0-pro-260328',
      messages: [{ role: 'user', content: [
        { type: 'video_url', video_url: { url: uri } },
        { type: 'text', text: `Note cette vidéo destinée au réseau social d'un commerçant local.
Réponds UNIQUEMENT en JSON: {"note":0-10,"texte_parasite":true/false,"realisme":0-10,"fluidite":0-10,"defaut":"une phrase en français"}
- texte_parasite: vrai si des mots, lettres ou logos apparaissent (c'était interdit)
- realisme: 10 = vraie vidéo filmée, 0 = rendu 3D
- fluidite: 10 = mouvement naturel, 0 = saccadé ou déformé` },
      ] }],
      max_tokens: 400, temperature: 0,
    }),
    signal: AbortSignal.timeout(480000),
  });
  const d = await r.json();
  const t = d?.choices?.[0]?.message?.content || '';
  try { return { ...JSON.parse(t.replace(/```json|```/g, '').trim()), juge_ok: true }; }
  catch { return { juge_ok: false, defaut: 'juge illisible : ' + (t.slice(0, 70) || JSON.stringify(d).slice(0, 90)) }; }
}

(async () => {
  console.log('\nBANC VIDÉO — Seedance vs Veo, notre prompt, juge ARK\n' + '='.repeat(72));
  for (const m of MODELES) {
    process.stdout.write(`${m.label.padEnd(18)} … `);
    const g = m.ark ? await seedance(m) : await veo(m);
    if (g.erreur) { console.log('ÉCHEC — ' + g.erreur); continue; }
    const eur = m.ark ? m.eur10s : +(m.usdSec * 10 * USD_EUR).toFixed(3);
    const j = await juger(g.uri);
    const txt = !j.juge_ok ? 'NON MESURÉ' : j.texte_parasite ? 'TEXTE PARASITE' : 'zéro texte ok';
    console.log(`note ${String(j.note ?? '?').padStart(2)}/10  réalisme ${String(j.realisme ?? '?').padStart(2)}/10  fluidité ${String(j.fluidite ?? '?').padStart(2)}/10  ${txt}  ${eur} €  ${g.secondes}s`);
    if (j.defaut) console.log(`${' '.repeat(20)}↳ ${j.defaut}`);
  }
  console.log('\nRappel marge : la vidéo pèse 83 % du coût média. 12 vidéos/mois sur le plan Créateur à 49 €.');
})();
