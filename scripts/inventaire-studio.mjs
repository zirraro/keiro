#!/usr/bin/env node
/**
 * Inventaire fonctionnel de Studio et de la page d'édition.
 *
 * ── Pourquoi ──
 *
 * En regroupant les deux pages, j'ai annoncé au fondateur que « toutes les
 * fonctions sont là » sur la foi d'un typecheck. Or le typecheck prouve que le
 * code compile, pas qu'un bouton fait encore quelque chose : un `onClick` qui
 * appelle une route supprimée compile parfaitement.
 *
 * Et j'avais déjà oublié une fonction entière — l'animation d'une photo en
 * vidéo — en décrivant Studio de mémoire.
 *
 * Ce contrôle établit trois choses, sans navigateur :
 *   · combien d'éléments interactifs porte chaque page ;
 *   · quelles routes d'API elles appellent, et si ces routes existent ;
 *   · quels liens internes elles posent, et si ces pages existent.
 *
 * Une route appelée qui n'existe pas est un bouton mort — le défaut exact
 * qu'on a trouvé sur `/signup` et sur `/tarifs`, chaque fois sur le chemin de
 * la conversion, chaque fois invisible.
 */
import fs from 'node:fs';
import path from 'node:path';

const RACINE = process.cwd();
const PAGES = ['app/generate/page.tsx', 'app/studio/page.tsx'];

/** Une route d'API existe-t-elle sur le disque ? */
function routeExiste(chemin) {
  // Les routes vivent sous `app/` : `/api/x` est servi par `app/api/x/route.ts`.
  // Premier jet sans ce préfixe : le contrôle annonçait 34 cibles mortes dont
  // `/api/seedream/i2i`, qui existe. Un contrôle qui crie au loup se fait
  // ignorer, et le jour où il a raison personne ne l'écoute.
  const p = chemin.split('?')[0].replace(/^\//, '');
  const base = path.join(RACINE, 'app', p);
  return fs.existsSync(path.join(base, 'route.ts'))
    || fs.existsSync(path.join(base, 'route.tsx'))
    || fs.existsSync(`${base}.ts`);
}

/** Une page existe-t-elle ? (routes dynamiques comprises) */
function pageExiste(chemin) {
  const p = chemin.split(/[?#]/)[0].replace(/\/$/, '') || '/';
  if (p === '/') return fs.existsSync(path.join(RACINE, 'app/page.tsx'));
  const direct = path.join(RACINE, 'app', p, 'page.tsx');
  if (fs.existsSync(direct)) return true;
  // Un segment dynamique accepte n'importe quelle valeur à sa place.
  const parent = path.join(RACINE, 'app', path.dirname(p));
  if (!fs.existsSync(parent)) return false;
  return fs.readdirSync(parent).some((d) => /^\[.+\]$/.test(d)
    && fs.existsSync(path.join(parent, d, 'page.tsx')));
}

let totalMorts = 0;

for (const rel of PAGES) {
  const abs = path.join(RACINE, rel);
  if (!fs.existsSync(abs)) { console.log(`\n${rel} — ABSENTE`); continue; }
  const src = fs.readFileSync(abs, 'utf8');

  const clics = (src.match(/onClick=/g) || []).length;
  const changements = (src.match(/onChange=/g) || []).length;
  const soumissions = (src.match(/onSubmit=/g) || []).length;

  // Les routes appelées : fetch('/api/…') sous toutes ses formes.
  const routes = [...new Set(
    [...src.matchAll(/fetch\(\s*[`'"](\/api\/[a-zA-Z0-9\-_/[\]]+)/g)].map((m) => m[1]),
  )].filter((r) => !r.includes('['));

  // Les liens internes posés par la page.
  const liens = [...new Set(
    [...src.matchAll(/href=[`'"{]{1,2}(\/[a-z0-9\-/]*)/gi)].map((m) => m[1]),
  )].filter((l) => !l.startsWith('/api'));

  const routesMortes = routes.filter((r) => !routeExiste(r));
  const liensMorts = liens.filter((l) => !pageExiste(l));
  totalMorts += routesMortes.length + liensMorts.length;

  console.log(`\n── ${rel}`);
  console.log(`   ${clics} clics · ${changements} champs · ${soumissions} formulaire(s)`);
  console.log(`   ${routes.length} route(s) d'API appelée(s) · ${liens.length} lien(s) interne(s)`);
  if (routesMortes.length) {
    console.log(`   ❌ route(s) appelée(s) qui n'existent pas :`);
    for (const r of routesMortes) console.log(`      ${r}`);
  }
  if (liensMorts.length) {
    console.log(`   ❌ lien(s) vers une page inexistante :`);
    for (const l of liensMorts) console.log(`      ${l}`);
  }
  if (!routesMortes.length && !liensMorts.length) {
    console.log(`   ✅ toutes les cibles existent`);
  }
}

console.log(totalMorts === 0
  ? `\n✅ Inventaire terminé : aucune cible manquante.`
  : `\n❌ ${totalMorts} cible(s) manquante(s) — un bouton qui n'aboutit pas ne lève aucune erreur.`);
process.exit(totalMorts === 0 ? 0 : 1);
