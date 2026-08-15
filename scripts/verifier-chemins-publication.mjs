#!/usr/bin/env node
/**
 * Refuse un déploiement où un chemin de publication MANUEL oublie la levée.
 *
 * ── Pourquoi ce contrôle existe ──
 *
 * Fondateur, 15 août 2026 : « attention, quand tu dis "je force TikTok sur le
 * chemin direct", ça doit être le chemin habituel ».
 *
 * Le même défaut s'est produit QUATRE FOIS dans la journée : une valeur qui se
 * perd entre deux chemins censés faire la même chose.
 *
 *   · le FORMAT, appliqué au prompt mais pas à l'enregistrement ;
 *   · le RÉSEAU, connu du post mais pas transmis à son contrôle ;
 *   · la LEVÉE d'espacement, passée par un chemin de publication et pas l'autre ;
 *   · la LEVÉE de plafond TikTok, sur un seul appel des six.
 *
 * À chaque fois invisible : un paramètre absent ne lève aucune erreur. Il vaut
 * `undefined`, donc `false`, donc « garde-fou actif ». Le code marche, il fait
 * juste autre chose que ce qu'on lui a demandé.
 *
 * ── Ce qu'on vérifie ──
 *
 * Les actions MANUELLES — celles qu'un humain déclenche — doivent transmettre
 * la levée à leurs appels de publication. Les CRONS ne doivent jamais le
 * faire : un plafond levé par une tâche de fond est un plafond qui n'existe
 * pas.
 *
 * On ne peut pas suivre le flot de données de façon fiable avec une expression
 * régulière. On vérifie donc une chose simple et vraie : dans le bloc de
 * chaque action manuelle, chaque appel de publication porte le drapeau.
 */

import { readFileSync } from 'node:fs';

const FICHIER = 'app/api/agents/content/route.ts';
const src = readFileSync(FICHIER, 'utf8');
const lignes = src.split('\n');

/** Les actions déclenchées par un humain, où la levée doit circuler. */
const ACTIONS_MANUELLES = ['publish_single', 'republish_single', 'regenerate_single'];

// On repère les bornes de chaque bloc `case '…': {` … jusqu'au prochain `case`.
const bornes = [];
lignes.forEach((l, i) => {
  const m = l.match(/^\s*case '([a-z_]+)':/);
  if (m) bornes.push({ action: m[1], debut: i });
});
bornes.forEach((b, i) => { b.fin = i + 1 < bornes.length ? bornes[i + 1].debut : lignes.length; });

const manquants = [];
for (const b of bornes) {
  if (!ACTIONS_MANUELLES.includes(b.action)) continue;
  for (let i = b.debut; i < b.fin; i++) {
    const l = lignes[i];
    if (!/await publish(ToTikTok|ToInstagram)\(/.test(l)) continue;
    // L'appel peut tenir sur plusieurs lignes : on regarde la fenêtre suivante.
    const fenetre = lignes.slice(i, Math.min(i + 6, b.fin)).join(' ');
    if (!/leverPlafond/.test(fenetre)) {
      manquants.push({ ligne: i + 1, action: b.action, extrait: l.trim().slice(0, 90) });
    }
  }
}

if (manquants.length) {
  console.error("\n❌ Un chemin de publication MANUEL ne transmet pas la levée de plafond :\n");
  for (const m of manquants) {
    console.error(`   ${FICHIER}:${m.ligne}  (action « ${m.action} »)`);
    console.error(`      ${m.extrait}`);
  }
  console.error("\n   Le fondateur ne pourra pas publier à la demande : le garde-fou");
  console.error("   refusera, et rien n'indiquera que le drapeau s'est perdu en route.");
  console.error("   Ajouter `body.leverPlafond === true` en dernier argument.\n");
  process.exit(1);
}

console.log('✅ chemins de publication : la levée circule sur toutes les actions manuelles');
