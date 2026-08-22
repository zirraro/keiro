/**
 * Audit mobile de TOUTE l'application, pas seulement de la galerie.
 *
 * Fondateur : « et pour web et pour mobile », sur toutes les fonctions.
 * Règle de fond : « optimiser ABSOLUMENT TOUT pour mobile — le commerçant vit
 * sur son téléphone ».
 *
 * Deux mesures, choisies parce qu'elles se corrigent sans casser une mise en
 * page :
 *   · les textes sous 12 px, illisibles sur un écran de téléphone ;
 *   · les largeurs fixes au-delà de 375 px (un iPhone SE), qui forcent un
 *     défilement horizontal de toute la page.
 *
 * Ce que cet audit NE mesure PAS, et il faut le dire : l'absence de point de
 * rupture. Un fichier sans `sm:`/`md:` s'affiche à l'identique sur téléphone et
 * sur 27 pouces — c'est souvent un vrai problème, parfois non (un composant
 * déjà fluide n'en a pas besoin). Le compter comme un défaut produirait un
 * chiffre alarmant et faux. Il se traite écran par écran, à l'œil.
 */

import fs from 'node:fs';
import path from 'node:path';

function parcourir(dossier, sortie = []) {
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name);
    if (e.isDirectory() && !['node_modules', '.next', '.git'].includes(e.name)) parcourir(p, sortie);
    else if (e.name.endsWith('.tsx')) sortie.push(p);
  }
  return sortie;
}

const fichiers = [...parcourir('app'), ...(fs.existsSync('components') ? parcourir('components') : [])];

let totalPetits = 0;
let totalLarges = 0;
const parFichier = [];

for (const p of fichiers) {
  const s = fs.readFileSync(p, 'utf8');
  const petits = (s.match(/text-\[10px\]|text-\[11px\]|text-\[9px\]/g) || []).length;
  // Au-delà de 375 px, la page déborde sur un iPhone SE.
  const larges = (s.match(/\bw-\[(?:[4-9]\d{2}|\d{4,})px\]|\bmin-w-\[(?:[4-9]\d{2}|\d{4,})px\]/g) || []).length;
  totalPetits += petits;
  totalLarges += larges;
  if (petits + larges > 0) parFichier.push({ p: p.split(path.sep).join('/'), petits, larges });
}

console.log(`\nAUDIT MOBILE — ${fichiers.length} pages et composants\n${'='.repeat(66)}`);
console.log(`textes < 12 px        : ${totalPetits}`);
console.log(`largeurs > 375 px     : ${totalLarges}`);
console.log(`fichiers concernés    : ${parFichier.length}\n`);

parFichier
  .sort((a, b) => (b.petits + b.larges * 3) - (a.petits + a.larges * 3))
  .slice(0, 12)
  .forEach((f) => console.log(`  ${String(f.petits).padStart(4)} petits  ${String(f.larges).padStart(2)} larges  ${f.p}`));

if (totalPetits + totalLarges === 0) console.log('  aucun défaut mécanique détecté');
