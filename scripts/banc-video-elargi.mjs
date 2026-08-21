/**
 * Banc vidéo élargi : 3 sujets × 3 modèles, en parallèle, jugés par ARK.
 *
 * ── Pourquoi élargir ──
 *
 * Le premier banc donnait 9/10 aux trois modèles sur UNE vidéo chacun, toutes
 * sur le même sujet (une boulangerie). Trois notes identiques sur un seul cas
 * ne disent pas que les modèles se valent — elles disent qu'on n'a pas assez
 * regardé. Le fondateur : « élargis le banc pour confirmer, de toute façon ça
 * nous fera des posts de préparés ensuite ».
 *
 * Trois sujets délibérément différents, parce qu'un modèle peut exceller sur
 * l'un et s'effondrer sur l'autre :
 *   · un GESTE de métier (mouvement précis, mains — le piège classique) ;
 *   · un LIEU sans personne (le modèle doit tenir sans visage à cacher) ;
 *   · une PERSONNE qui regarde l'objectif (le plus dur : visage et regard).
 *
 * ── Pourquoi en parallèle ──
 *
 * Séquentiel, neuf vidéos prendraient une heure : chaque génération dure deux
 * à trois minutes, et le juge ARK doit TÉLÉCHARGER la vidéo avant de l'analyser
 * (c'est ce qui a fait expirer le premier essai à 180 s). En parallèle, le banc
 * dure le temps de la plus lente.
 *
 * ── Ce qui est produit n'est pas perdu ──
 *
 * Les vidéos retenues sont stockées et listées à la fin : ce sont des posts
 * prêts, pas des déchets de test. C'est la remarque du fondateur, et elle
 * change le coût réel du banc — on paie des générations qu'on aurait faites
 * de toute façon.
 *
 * Usage : node --env-file=.env.local scripts/banc-video-elargi.mjs
 */

const GKEY = (process.env.GEMINI_API_KEY || '').trim();
const AKEY = (process.env.SEEDREAM_API_KEY || process.env.ARK_API_KEY || '').trim();
const USD_EUR = 0.925;

const SUJETS = [
  { nom: 'geste métier',
    prompt: 'Close-up of the hands of a florist in her thirties tying a raffia knot around a bouquet of seasonal flowers, morning light through a shop window. Documentary handheld feel, 50mm, natural light, no text anywhere.' },
  { nom: 'lieu sans personne',
    prompt: 'Slow push-in through an empty neighbourhood barber shop at opening time, leather chairs, warm lamps switching on, dust in a sunbeam. Documentary feel, 35mm, natural light, no people, no text anywhere.' },
  { nom: 'personne face caméra',
    prompt: 'A butcher in his fifties behind his counter looks up at the camera, wipes his hands on his apron and gives a short honest smile before going back to work. Documentary handheld, 50mm, natural light, no text anywhere.' },
];

const MODELES = [
  { label: 'seedance-1.5-pro', ark: true, id: 'seedance-1-5-pro-251215', eur10s: 1.10 },
  { label: 'veo-3.1-fast', id: 'veo-3.1-fast-generate-preview', usdSec: 0.12 },
  { label: 'veo-3.1-lite', id: 'veo-3.1-lite-generate-preview', usdSec: 0.08 },
];

let verrou = Promise.resolve();
async function rapatrier(url, etiquette, essai = 0) {
  // Un seul telechargement a la fois : trois echecs sur neuf au banc precedent
  // venaient de la saturation, pas des modeles.
  const precedent = verrou;
  let libere;
  verrou = new Promise((r) => { libere = r; });
  await precedent;
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const r = await fetch(url, { signal: AbortSignal.timeout(300000) });
    if (!r.ok) { if (essai < 2) { libere(); await new Promise(x=>setTimeout(x,5000)); return rapatrier(url, etiquette, essai+1); } return null; }
    const o = Buffer.from(await r.arrayBuffer());
    if (o.length < 1024) return null;
    const chemin = `veo/banc-${etiquette}-${Date.now()}-${o.length}.mp4`;
    const { error } = await sb.storage.from('generated-images').upload(chemin, o, { contentType: 'video/mp4', upsert: false });
    if (error) return null;
    return sb.storage.from('generated-images').getPublicUrl(chemin).data?.publicUrl || null;
  } catch (e) { if (essai < 2) { libere(); await new Promise(x=>setTimeout(x,5000)); return rapatrier(url, etiquette, essai+1); } console.log('  (rapatriement KO : '+e.message+')'); return null; }
  finally { libere(); }
}

async function veo(m, prompt, etiquette) {
  const t0 = Date.now();
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m.id}:predictLongRunning?key=${GKEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instances: [{ prompt }], parameters: { aspectRatio: '9:16', resolution: '1080p' } }),
    signal: AbortSignal.timeout(60000),
  });
  const t = await r.text();
  if (!r.ok) return { erreur: `HTTP ${r.status} ${t.slice(0, 90)}` };
  const name = JSON.parse(t).name;
  const fin = Date.now() + 480000;
  while (Date.now() < fin) {
    await new Promise((x) => setTimeout(x, 15000));
    const op = await (await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}?key=${GKEY}`)).json();
    if (!op.done) continue;
    if (op.error) return { erreur: String(op.error.message).slice(0, 90) };
    const s = op.response?.generateVideoResponse?.generatedSamples?.[0] || op.response?.generatedSamples?.[0];
    if (!s?.video?.uri) return { erreur: 'terminé sans vidéo' };
    const pub = await rapatrier(`${s.video.uri}${s.video.uri.includes('?') ? '&' : '?'}key=${GKEY}`, etiquette);
    if (!pub) return { erreur: 'rapatriement impossible' };
    return { uri: pub, secondes: Math.round((Date.now() - t0) / 1000) };
  }
  return { erreur: 'dépassement 8 min' };
}

async function seedance(m, prompt) {
  const t0 = Date.now();
  const r = await fetch('https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AKEY}` },
    body: JSON.stringify({ model: m.id, content: [{ type: 'text', text: `${prompt} --ratio 9:16 --dur 10` }] }),
    signal: AbortSignal.timeout(60000),
  });
  const t = await r.text();
  if (!r.ok) return { erreur: `HTTP ${r.status} ${t.slice(0, 90)}` };
  const id = JSON.parse(t).id;
  const fin = Date.now() + 480000;
  while (Date.now() < fin) {
    await new Promise((x) => setTimeout(x, 15000));
    const st = await (await fetch(`https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/${id}`, { headers: { Authorization: `Bearer ${AKEY}` } })).json();
    if (st.status === 'succeeded') return { uri: st.content?.video_url, secondes: Math.round((Date.now() - t0) / 1000) };
    if (st.status === 'failed') return { erreur: String(st.error?.message || 'échec').slice(0, 90) };
  }
  return { erreur: 'dépassement 8 min' };
}

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
- fluidite: 10 = mouvement naturel, 0 = saccadé, déformé ou mains anormales` },
      ] }],
      max_tokens: 400, temperature: 0,
    }),
    signal: AbortSignal.timeout(480000),
  });
  const d = await r.json();
  const t = d?.choices?.[0]?.message?.content || '';
  try { return { ...JSON.parse(t.replace(/```json|```/g, '').trim()), juge_ok: true }; }
  catch { return { juge_ok: false, defaut: 'juge illisible' }; }
}

(async () => {
  console.log('\nBANC VIDÉO ÉLARGI — 3 sujets × 3 modèles, en parallèle, juge ARK\n' + '='.repeat(74));

  const taches = [];
  for (const m of MODELES) {
    for (const s of SUJETS) {
      taches.push((async () => {
        const etiq = `${m.label}-${s.nom.replace(/\s+/g, '_')}`;
        const g = m.ark ? await seedance(m, s.prompt) : await veo(m, s.prompt, etiq);
        if (g.erreur) return { modele: m.label, sujet: s.nom, erreur: g.erreur };
        const j = await juger(g.uri);
        const eur = m.ark ? m.eur10s : +(m.usdSec * 10 * USD_EUR).toFixed(3);
        return { modele: m.label, sujet: s.nom, ...j, eur, secondes: g.secondes, uri: g.uri };
      })());
    }
  }

  const res = await Promise.all(taches);

  for (const r of res) {
    if (r.erreur) { console.log(`${r.modele.padEnd(18)} ${r.sujet.padEnd(22)} ÉCHEC — ${r.erreur}`); continue; }
    const txt = !r.juge_ok ? 'NON MESURÉ' : r.texte_parasite ? 'TEXTE PARASITE' : 'zéro texte';
    console.log(`${r.modele.padEnd(18)} ${r.sujet.padEnd(22)} note ${String(r.note ?? '?').padStart(2)}  réal ${String(r.realisme ?? '?').padStart(2)}  fluid ${String(r.fluidite ?? '?').padStart(2)}  ${txt.padEnd(15)} ${r.eur} €  ${r.secondes}s`);
    if (r.defaut) console.log(`${' '.repeat(41)}↳ ${r.defaut}`);
  }

  console.log('\n' + '='.repeat(74) + '\nSYNTHÈSE\n');
  for (const m of MODELES) {
    const l = res.filter((x) => x.modele === m.label && !x.erreur && x.juge_ok);
    if (!l.length) { console.log(`${m.label.padEnd(18)} aucun résultat exploitable`); continue; }
    const moy = (k) => (l.reduce((s, x) => s + (x[k] || 0), 0) / l.length).toFixed(1);
    const par = l.filter((x) => x.texte_parasite).length;
    console.log(`${m.label.padEnd(18)} note ${moy('note')} · réalisme ${moy('realisme')} · fluidité ${moy('fluidite')} · texte parasite ${par}/${l.length} · ${l[0].eur} € · ${moy('secondes')}s`);
  }

  // Ce qui est bon n'est pas un déchet de test : ce sont des posts prêts.
  const bonnes = res.filter((x) => !x.erreur && x.juge_ok && (x.note ?? 0) >= 8 && !x.texte_parasite);
  console.log(`\n${bonnes.length} vidéo(s) exploitables comme posts, déjà stockées :`);
  bonnes.forEach((b) => console.log(`  [${b.note}/10] ${b.sujet} — ${b.modele}\n    ${b.uri}`));
})();
