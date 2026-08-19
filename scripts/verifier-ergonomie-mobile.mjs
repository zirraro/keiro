#!/usr/bin/env node
/**
 * L'ergonomie mobile, mesurée sur chaque page.
 *
 * ── Pourquoi ──
 *
 * Fondateur, plusieurs fois : « optimiser ABSOLUMENT TOUT pour mobile, le
 * commerçant vit sur son téléphone. » Puis, le 19 août : « vérifie bien toutes
 * les pages qu'elles soient bien ergonomiques mobile. »
 *
 * Vérifier « à l'œil » une trentaine de pages ne tient pas : on regarde les
 * deux qu'on vient de toucher et on déclare le reste bon. Ce contrôle compte
 * ce qui se compte, sur toutes les pages à la fois.
 *
 * ── Les trois défauts qu'il cherche ──
 *
 * · CIBLE TACTILE TROP PETITE — un bouton sans hauteur minimale se rate au
 *   pouce. Le seuil retenu est 44 px, celui d'Apple, appliqué déjà par une
 *   partie du produit (`min-h-[44px]`).
 * · TEXTE ILLISIBLE — en dessous de 12 px, un commerçant de 50 ans plisse les
 *   yeux. `text-[10px]` passe encore sur une étiquette, pas sur du contenu.
 * · DÉBORDEMENT HORIZONTAL — une largeur fixe en pixels sur un écran de 360 px
 *   fait scroller la page de côté, le pire défaut mobile qui soit.
 *
 * Le contrôle est indicatif, pas bloquant : il compte et classe, il ne casse
 * pas le déploiement. Une étiquette en 10 px n'est pas un bug ; trente le sont.
 */
import fs from 'node:fs';
import path from 'node:path';

const RACINE = process.cwd();
const IGNORE = new Set(['node_modules', '.next', '.next-build', '.next-anciens', '.git', 'dist', 'api']);

const pages = [];
function parcourir(dossier) {
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    if (IGNORE.has(e.name) || e.name.startsWith('.')) continue;
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) { parcourir(p); continue; }
    if (e.name === 'page.tsx') pages.push(p);
  }
}
parcourir(path.join(RACINE, 'app'));

const rapport = [];
for (const abs of pages) {
  const src = fs.readFileSync(abs, 'utf8');
  const rel = path.relative(RACINE, abs);

  // Boutons et liens cliquables, et combien portent une hauteur minimale.
  const cliquables = (src.match(/<button|<a\s/g) || []).length;
  const avecCible = (src.match(/min-h-\[4[4-9]px\]|min-h-\[5\dpx\]|h-1[12]\b|py-3|py-4/g) || []).length;

  // Texte trop petit pour du contenu.
  const minuscule = (src.match(/text-\[(?:[6-9]|10|11)px\]/g) || []).length;

  /**
   * Largeurs VRAIMENT figées qui débordent d'un écran de 360 px.
   *
   * `min-w-` dans un conteneur défilant est la BONNE pratique pour un tableau
   * large — ma première version les comptait comme des débordements et
   * signalait deux pages parfaitement saines. Un contrôle qui crie au loup se
   * fait ignorer, et le jour où il a raison personne ne l'écoute.
   */
  const largeurFixe = (src.match(/(?<!min-)(?<!max-)\bw-\[(?:3[7-9]\d|[4-9]\d{2}|\d{4,})px\]/g) || []).length;

  // Un point de rupture quelque part = la page a été pensée responsive.
  const responsive = /\bsm:|md:|lg:/.test(src);

  const score = [];
  if (cliquables > 6 && avecCible === 0) score.push(`${cliquables} éléments cliquables, aucune hauteur tactile`);
  if (minuscule > 12) score.push(`${minuscule} textes < 12 px`);
  if (largeurFixe > 0) score.push(`${largeurFixe} largeur(s) fixe(s) > 360 px`);
  if (!responsive && cliquables > 3) score.push('aucun point de rupture responsive');

  if (score.length) rapport.push({ rel, score, cliquables });
}

console.log(`[mobile] ${pages.length} pages analysées\n`);
if (!rapport.length) {
  console.log('✅ aucun défaut d\'ergonomie mobile marquant');
} else {
  rapport.sort((a, b) => b.score.length - a.score.length);
  console.log(`${rapport.length} page(s) à revoir, les plus atteintes d'abord :\n`);
  for (const r of rapport.slice(0, 15)) {
    console.log(`  ${r.rel}`);
    for (const s of r.score) console.log(`      · ${s}`);
  }
}
// Indicatif : on informe, on ne bloque pas un déploiement pour une étiquette.
process.exit(0);
