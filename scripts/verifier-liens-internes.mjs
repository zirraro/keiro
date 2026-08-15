#!/usr/bin/env node
/**
 * Tout lien interne doit mener quelque part.
 *
 * ── Pourquoi ce garde-fou existe ──
 *
 * Deux liens morts trouvés le même jour, par hasard, sans les chercher :
 *   · le bouton de montée en gamme pointait sur `/tarifs` — la page s'appelle
 *     `/pricing` ;
 *   · le bouton « Créer mon compte gratuit » du mur d'essai pointait sur
 *     `/signup` — la page n'existait pas du tout.
 *
 * Les deux étaient sur le chemin de la conversion, c'est-à-dire sur les seuls
 * clics qui rapportent. Et les deux étaient invisibles : un lien mort ne lève
 * aucune erreur côté serveur, n'apparaît dans aucun journal, ne déclenche
 * aucune alerte. Il fait partir le visiteur, et personne ne l'apprend.
 *
 * ── Pourquoi en statique et pas contre la production ──
 *
 * Un contrôle qui interroge le site en ligne ne peut pas valider une page
 * qu'on est justement en train de mettre en ligne : il refuserait le
 * déploiement qui corrige le problème. On compare donc les liens du code à
 * l'arborescence des routes du même code — ce que Next servira une fois
 * déployé, on peut le savoir avant de déployer.
 */
import fs from 'node:fs';
import path from 'node:path';

const RACINE = process.cwd();
const APP = path.join(RACINE, 'app');
const IGNORE = new Set(['node_modules', '.next', '.next-build', '.next-anciens', '.git', 'dist', 'api']);

/** Les routes que Next servira : tout dossier d'`app/` contenant une page. */
function releverRoutes(dossier, prefixe = '') {
  const routes = new Set();
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    if (IGNORE.has(e.name) || e.name.startsWith('.') || e.name.startsWith('_')) continue;
    const p = path.join(dossier, e.name);
    // (groupes) et @slots ne changent pas l'URL ; [param] accepte n'importe quoi.
    const segment = /^\(.*\)$/.test(e.name) ? '' : `/${e.name}`;
    const chemin = prefixe + segment;
    if (fs.existsSync(path.join(p, 'page.tsx')) || fs.existsSync(path.join(p, 'page.ts'))) {
      routes.add(chemin || '/');
    }
    for (const r of releverRoutes(p, chemin)) routes.add(r);
  }
  return routes;
}

const routes = releverRoutes(APP);
if (fs.existsSync(path.join(APP, 'page.tsx'))) routes.add('/');

/** Une route dynamique ([slug]) accepte n'importe quelle valeur à sa place. */
const motifs = [...routes].map((r) => new RegExp(`^${r.replace(/\[\.\.\.[^\]]+\]/g, '.+').replace(/\[[^\]]+\]/g, '[^/]+')}$`));
const existe = (chemin) => routes.has(chemin) || motifs.some((m) => m.test(chemin));

const liens = new Map();
function parcourir(dossier) {
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    if (IGNORE.has(e.name) && e.name !== 'api') continue;
    if (e.name.startsWith('.')) continue;
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) { parcourir(p); continue; }
    if (!/\.tsx?$/.test(e.name)) continue;
    // Les routes d'API ne rendent pas de page : leurs chaînes ne sont pas des liens.
    if (p.includes(`${path.sep}api${path.sep}`)) continue;
    fs.readFileSync(p, 'utf8').split('\n').forEach((ligne, i) => {
      for (const m of ligne.matchAll(/href=["'{`]{1,2}(\/[a-z0-9\-/]*)(["'`?}#])/gi)) {
        const chemin = m[1].replace(/\/$/, '') || '/';
        if (chemin.startsWith('//')) continue;
        if (chemin.startsWith('/api')) continue;
        if (!liens.has(chemin)) liens.set(chemin, []);
        liens.get(chemin).push(`${path.relative(RACINE, p)}:${i + 1}`);
      }
    });
  }
}
parcourir(APP);

const morts = [...liens.entries()].filter(([c]) => !existe(c)).sort();

console.log(`[liens] ${liens.size} chemins internes référencés, ${routes.size} routes servies`);
if (!morts.length) {
  console.log('[liens] ✅ aucun lien interne mort');
  process.exit(0);
}

console.error(`\n[liens] ❌ ${morts.length} lien(s) interne(s) mort(s) — un visiteur qui clique tombe sur une page d'erreur :\n`);
for (const [chemin, sources] of morts) {
  console.error(`  ${chemin}`);
  for (const s of sources.slice(0, 4)) console.error(`      ${s}`);
}
console.error('\nCorrige le lien, ou crée la page. Un 404 sur le parcours ne se voit dans aucun journal.\n');
process.exit(1);
