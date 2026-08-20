/**
 * Banc de comparaison des modèles d'images, sur NOS prompts réels.
 *
 * Le fondateur : « donne-moi les coûts images pour comparer à Seedream, et
 * comme ça on compare aussi la compréhension de nos super-prompts et
 * sous-prompts, et là les qualités des modèles ».
 *
 * Trois choses mesurées ensemble, parce que séparément elles ne décident rien :
 *   · le COÛT réel par image, tarif officiel ;
 *   · la COMPRÉHENSION de nos consignes — la plus dure étant « zéro texte »,
 *     que tous les modèles ratent une fois sur trois, et le réalisme photo ;
 *   · la QUALITÉ jugée par notre propre juge, pas par mon impression.
 *
 * Seedream est absent du banc malgré la question : le compte ByteDance est en
 * impayé (403 AccountOverdueError), il rendrait zéro sur tout et ce serait un
 * faux résultat. Sa colonne est renseignée au tarif connu, à comparer dès que
 * le compte est rechargé.
 *
 * Usage : node --env-file=.env.local scripts/banc-modeles-images.mjs
 */

const KEY = (process.env.GEMINI_API_KEY || '').trim();
if (!KEY) { console.error('GEMINI_API_KEY absente'); process.exit(1); }

const USD_EUR = 0.925;

const ARK = 'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations';
const CLE_ARK = (process.env.SEEDREAM_API_KEY || process.env.ARK_API_KEY || '').trim();

const MODELES = [
  // Seedream est enfin comparable : le compte ByteDance a été réglé le 20 août.
  // C'est la mesure qui manquait ce matin — « moins cher » était vérifié,
  // « meilleur » ne l'était pas.
  { id: 'seedream-4-5-251128', label: 'seedream-4.5', usd: 0.0486, ark: true },
  { id: 'gemini-2.5-flash-image',   label: 'gemini-2.5-flash',  usd: 0.039 },
  { id: 'gemini-3.1-flash-image',   label: 'gemini-3.1-flash',  usd: 0.067 },
  { id: 'gemini-3-pro-image',       label: 'gemini-3-pro',      usd: 0.134 },
];

// Le suffixe réel de lib/visuals/image-provider.ts — on teste NOS consignes,
// pas un prompt de démonstration écrit pour l'occasion.
const REGLE_TEXTE =
  'ZERO text in the image: no words, letters, numbers, captions, signage, labels, logos or watermarks (text is added later as an overlay).';
const SUFFIXE =
  'EDITORIAL DOCUMENTARY photograph: 50mm or 80mm prime lens, Kodak Portra 400 film aesthetic, natural diffused window light or golden hour (no studio strobes, no ring light), shallow depth of field, real candid moment, gentle 35mm grain, true-to-life muted colors. Real people with authentic skin texture and correct hands, diverse in age and origin, caught mid-action rather than posing. Absolutely NOT a 3D render, NOT an illustration, NOT a stock photo, no plastic or porcelain skin, no neon or oversaturated colors, no AI portrait artifacts.';

const FORMATS = [
  { nom: 'post 4:5',   ratio: '4:5',
    brief: "Interior of a small French neighbourhood beauty salon at golden hour, a beautician in her forties finishing a client's manicure, both mid-conversation" },
  { nom: 'story 9:16', ratio: '9:16',
    brief: 'A baker in his sixties pulling a tray of croissants from the oven in a small French bakery at dawn, flour dust in the light' },
  { nom: 'carrousel 1:1', ratio: '1:1',
    brief: 'Close-up of hands of a young mechanic of North African origin adjusting a bicycle derailleur in a bright repair workshop' },
];

async function generer(modele, brief, ratio) {
  const t0 = Date.now();

  // Seedream ne prend pas d'aspectRatio : c'est la taille qui porte le format.
  if (modele.ark) {
    const taille = ratio === '9:16' ? '1080x1920' : ratio === '4:5' ? '1080x1350' : '1024x1024';
    const r = await fetch(ARK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CLE_ARK}` },
      body: JSON.stringify({
        model: modele.id,
        prompt: `${brief}. ${REGLE_TEXTE} ${SUFFIXE}`.slice(0, 2000),
        size: taille,
        watermark: false,
        response_format: 'b64_json',
      }),
      signal: AbortSignal.timeout(180000),
    });
    const txt = await r.text();
    if (!r.ok) return { erreur: `HTTP ${r.status} ${txt.slice(0, 110)}` };
    const m = txt.match(/"b64_json":\s*"([A-Za-z0-9+/=]+)"/);
    if (!m) return { erreur: "pas d'image (b64) dans la réponse" };
    return { b64: m[1], secondes: Math.round((Date.now() - t0) / 100) / 10 };
  }

  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modele.id}:generateContent?key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${brief}. ${REGLE_TEXTE} ${SUFFIXE}` }] }],
      generationConfig: { imageConfig: { aspectRatio: ratio } },
    }),
    signal: AbortSignal.timeout(180000),
  });
  const txt = await r.text();
  if (!r.ok) return { erreur: `HTTP ${r.status} ${txt.slice(0, 120)}` };
  const m = txt.match(/"data":\s*"([A-Za-z0-9+/=]+)"/);
  if (!m) return { erreur: 'pas d\'image dans la réponse' };
  return { b64: m[1], secondes: Math.round((Date.now() - t0) / 100) / 10 };
}

// Le juge : mêmes critères que lib/visuals/image-qa.ts, appliqués ici en direct
// parce que le juge ARK est lui aussi coupé par l'impayé.
async function juger(b64, essai = 0) {
  // Le juge se fait jeter en 429 quand les images s'enchaînent : on attend et
  // on repasse, au lieu de compter la note manquante comme un contrôle réussi.
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [
        { inline_data: { mime_type: 'image/png', data: b64 } },
        { text: `Tu notes une image destinée à un post de commerçant local.
Réponds UNIQUEMENT en JSON: {"note":0-10,"texte_parasite":true/false,"realisme":0-10,"defaut":"une phrase"}
- note: qualité éditoriale globale
- texte_parasite: vrai si des mots/lettres/logos apparaissent (c'était interdit)
- realisme: 10 = vraie photo, 0 = rendu 3D ou illustration
- defaut: le problème le plus important, en français, une phrase` },
      ] }],
      // thinkingBudget: 0 — SANS ça, Gemini 2.5 dépense tout le budget de
      // sortie en réflexion et rend un texte vide. C'est ce qui a fait échouer
      // les 9 jugements du premier passage.
      generationConfig: { temperature: 0, maxOutputTokens: 800, thinkingConfig: { thinkingBudget: 0 } },
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (r.status === 429 && essai < 4) {
    await new Promise((res) => setTimeout(res, 20000 * (essai + 1)));
    return juger(b64, essai + 1);
  }
  const d = await r.json();
  const t = d?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
  try {
    const o = JSON.parse(t.replace(/```json|```/g, '').trim());
    return { ...o, juge_ok: true };
  } catch {
    return { note: null, juge_ok: false, defaut: 'juge illisible : ' + (t.slice(0, 60) || JSON.stringify(d).slice(0, 80)) };
  }
}

(async () => {
  console.log('\nBANC MODÈLES IMAGES — nos prompts réels, notre juge\n' + '='.repeat(72));
  const lignes = [];

  for (const modele of MODELES) {
    for (const f of FORMATS) {
      process.stdout.write(`${modele.label.padEnd(18)} ${f.nom.padEnd(14)} … `);
      const g = await generer(modele, f.brief, f.ratio);
      if (g.erreur) { console.log('ÉCHEC — ' + g.erreur); lignes.push({ modele: modele.label, format: f.nom, echec: g.erreur }); continue; }
      const j = await juger(g.b64);
      const ko = Math.round(g.b64.length * 0.75 / 1024);
      // Ne JAMAIS afficher « zéro texte ok » quand le juge n'a pas répondu :
      // au premier passage, un champ absent passait pour un contrôle réussi.
      // L'absence de contrôle n'est pas un bon résultat, c'est un trou.
      const texte = !j.juge_ok ? 'NON MESURÉ' : j.texte_parasite ? 'TEXTE PARASITE' : 'zéro texte ok';
      console.log(`note ${String(j.note ?? '?').padStart(2)}/10  réalisme ${String(j.realisme ?? '?').padStart(2)}/10  ${texte}  ${g.secondes}s  ${ko}Ko`);
      if (j.defaut) console.log(`${' '.repeat(33)}↳ ${j.defaut}`);
      lignes.push({ modele: modele.label, format: f.nom, ...j, secondes: g.secondes, eur: +(modele.usd * USD_EUR).toFixed(4) });
    }
  }

  console.log('\n' + '='.repeat(72) + '\nSYNTHÈSE PAR MODÈLE\n');
  for (const modele of MODELES) {
    const l = lignes.filter(x => x.modele === modele.label && !x.echec && x.note != null);
    if (!l.length) { console.log(`${modele.label.padEnd(18)} aucun résultat exploitable`); continue; }
    const moy = (k) => (l.reduce((s, x) => s + (x[k] || 0), 0) / l.length).toFixed(1);
    const parasites = l.filter(x => x.texte_parasite).length;
    const eur = (modele.usd * USD_EUR).toFixed(4);
    console.log(`${modele.label.padEnd(18)} note ${moy('note')}/10 · réalisme ${moy('realisme')}/10 · texte parasite ${parasites}/${l.length} · ${eur} €/image · ${moy('secondes')}s`);
  }
  console.log(`\nSeedream (référence)  0,0450 €/image — non testé : compte ByteDance en impayé\n`);
})();
