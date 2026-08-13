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
process.exit(echecs === 0 ? 0 : 1);
