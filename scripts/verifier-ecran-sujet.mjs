/**
 * Rejoue le détecteur « un écran est-il le sujet ? » sur les briefs réellement
 * observés en production.
 *
 * Une règle de qualité sans cas de test se dégrade sans que personne ne le
 * voie : c'est exactement ce qui est arrivé le 2026-08-13, où une première
 * version laissait passer « In the foreground, a tablet screen… » parce qu'elle
 * ne regardait que le début du brief.
 *
 *   node scripts/verifier-ecran-sujet.mjs
 */
import { readFileSync } from 'node:fs';

// Le module est en TypeScript ; on en extrait la fonction sans dépendre d'un
// compilateur, pour que la vérification tourne partout (poste, VPS, CI).
const src = readFileSync(new URL('../lib/visuals/ecran-sujet.ts', import.meta.url), 'utf8');

const MOTS_ECRAN = src.match(/const MOTS_ECRAN = String\.raw`([^`]+)`/)[1];
const POSITION_SUJET = src.match(/const POSITION_SUJET = String\.raw`([^`]+)`/)[1];

function ecranEstLeSujet(brief) {
  const t = String(brief || '');
  if (!t) return false;
  if (new RegExp(`(?:^|[.!?]\\s+)[^.!?]{0,40}\\b(?:${MOTS_ECRAN})\\b`, 'i').test(t)) return true;
  if (new RegExp(`\\b(?:${POSITION_SUJET})\\b[^.!?]{0,90}?\\b(?:${MOTS_ECRAN})\\b`, 'i').test(t)) return true;
  if (new RegExp(`\\b(?:${MOTS_ECRAN})\\b[^.!?]{0,60}?\\b(?:in the foreground|fills the frame|as the main subject)\\b`, 'i').test(t)) return true;
  return false;
}

// Les cas de référence, lus dans le même fichier pour qu'ils ne divergent pas.
const bloc = src.slice(src.indexOf('export const CAS_OBSERVES'));
const cas = [...bloc.matchAll(/attendu:\s*(true|false),[\s\S]*?brief:\s*(["'`])([\s\S]*?)\2,\n/g)]
  .map(m => ({ attendu: m[1] === 'true', brief: m[3] }));

let echecs = 0;
for (const c of cas) {
  const obtenu = ecranEstLeSujet(c.brief);
  const ok = obtenu === c.attendu;
  if (!ok) echecs++;
  console.log(
    `${ok ? '  ok  ' : 'ÉCHEC '} attendu=${String(c.attendu).padEnd(5)} obtenu=${String(obtenu).padEnd(5)} ${c.brief.slice(0, 70)}…`,
  );
}

console.log(
  echecs === 0
    ? `\n✓ ${cas.length} cas vérifiés — le détecteur d'écran-sujet tient.`
    : `\n✗ ${echecs} cas sur ${cas.length} en échec.`,
);
if (echecs > 0) process.exit(1);

// ── Détecteur de scènes vues mille fois ──
//
// Fondateur, 2026-08-13 : « tu as encore sorti un café latte en préparation,
// arrête ce genre de reel. » Troisième signalement du même cliché. Une image
// générique passe tous les contrôles de qualité ET ne sert à rien : c'est le
// trou que ce détecteur ferme, et ces cas-là empêchent qu'il se rouvre.
const blocCliches = /const CLICHES = \[([\s\S]*?)\];/.exec(src)[1];
const motifs = [...blocCliches.matchAll(/String\.raw`([^`]+)`/g)].map(m => m[1]);
const estCliche = (t) => motifs.some(c => new RegExp(c, 'i').test(t));

const casCliches = [
  [true, 'Close-up of a barista pouring milk into a cup, creating a perfect latte art heart, warm morning light.'],
  [true, 'A flat lay of an avocado toast on a marble table with a cup of coffee.'],
  [true, 'Two hands clinking glasses of wine at sunset on a terrace.'],
  [false, 'A roaster adjusting the grind on a worn espresso machine, coffee dust on the counter.'],
  [false, 'A baker lifting a tray of croissants out of the oven at dawn, steam catching the window light.'],
  [false, 'A florist wrapping a bouquet at her worktable, kraft paper and cut stems around her.'],
];

let echecsCliches = 0;
for (const [attendu, brief] of casCliches) {
  const obtenu = estCliche(brief);
  const ok = obtenu === attendu;
  if (!ok) echecsCliches++;
  console.log(`${ok ? '  ok  ' : 'ÉCHEC '} cliché=${String(attendu).padEnd(5)} obtenu=${String(obtenu).padEnd(5)} ${brief.slice(0, 60)}…`);
}
console.log(
  echecsCliches === 0
    ? `✓ ${casCliches.length} cas vérifiés — le détecteur de scènes trop vues tient.`
    : `✗ ${echecsCliches} cas sur ${casCliches.length} en échec.`,
);
if (echecsCliches > 0) process.exit(1);
