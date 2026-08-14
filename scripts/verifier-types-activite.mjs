#!/usr/bin/env node
/**
 * Refuse un déploiement qui écrirait un type d'activité que la base rejette.
 *
 * ── Pourquoi ce contrôle existe ──
 *
 * Le 14 août 2026 : 467 mails de prospection envoyés sur la semaine, zéro
 * ouverture et zéro clic dans l'historique du CRM. Le suivi fonctionnait
 * pourtant — les fiches prospects portaient bien les dates. C'est la ligne
 * d'historique qui était refusée par une contrainte CHECK devenue périmée :
 * 40 des 51 types que le code écrit étaient rejetés en silence.
 *
 * Personne ne l'a vu pendant des mois pour deux raisons cumulées : la base
 * refusait sans que le code lise le refus, et rien ne comparait jamais ce que
 * le code écrit à ce que la base accepte.
 *
 * Le premier trou est bouché par lib/crm/journal.ts (on lit le retour). Le
 * second l'est ici : à chaque déploiement, on relit les types du code et on les
 * confronte à la règle de la migration. Un agent qui invente un type demain
 * casse le déploiement, au lieu de perdre son historique sans le dire.
 *
 * C'est le même principe que scripts/verifier-ecran-sujet.mjs : la règle ne
 * vaut que si quelque chose la rejoue.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RACINE = process.cwd();
const IGNORE = new Set(['node_modules', '.next', '.next-build', '.next-anciens', '.git', 'dist', 'scripts']);

/**
 * La règle, recopiée de supabase/migrations/20260814_crm_activities_types.sql.
 * Elle doit rester alignée avec la contrainte : si l'une change, l'autre aussi.
 */
const FAMILLES = /^(email|dm|comment|commercial|retention|prospect|sequence)_[a-z0-9_]+$/;
const SIMPLES = new Set([
  'action', 'appel', 'call', 'autre', 'note', 'image', 'email', 'reply',
  'initial', 'interested', 'enrichment', 'milestone', 'unsubscribe',
  'followup_1', 'followup_2', 'reactivation', 'neutral_reply',
  'meeting_request', 'signup_converted', 'onboarding_email',
  'autonomy_upgrade', 'client_followed', 'generate_weekly', 'high_usage',
  'red_alert', 'token_revoked', 'note_commercial', 'reply_ready_manual',
]);

const accepte = (type) => FAMILLES.test(type) || SIMPLES.has(type);

function parcourir(dossier, fichiers = []) {
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    if (IGNORE.has(e.name) || e.name.startsWith('.')) continue;
    const p = join(dossier, e.name);
    if (e.isDirectory()) parcourir(p, fichiers);
    else if (/\.tsx?$/.test(e.name) && statSync(p).size < 4_000_000) fichiers.push(p);
  }
  return fichiers;
}

const refuses = [];
const dynamiques = [];

for (const fichier of parcourir(RACINE)) {
  const source = readFileSync(fichier, 'utf8');
  // On ne lit que les fichiers qui touchent réellement à la table.
  if (!source.includes('crm_activities') && !source.includes('consignerActivite')) continue;

  const lignes = source.split('\n');
  lignes.forEach((ligne, i) => {
    const litteral = ligne.match(/\btype:\s*'([^']+)'/);
    if (litteral && !accepte(litteral[1])) {
      refuses.push({ fichier: relative(RACINE, fichier), ligne: i + 1, type: litteral[1] });
    }
    // Un type construit à l'exécution ne peut pas être vérifié ici. On le
    // signale pour que son préfixe soit couvert par une famille ouverte.
    const gabarit = ligne.match(/\btype:\s*`([^`]+)`/);
    if (gabarit) {
      const prefixe = gabarit[1].split('$')[0];
      if (!/^(email|dm|comment|commercial|retention|prospect|sequence)_/.test(prefixe)) {
        dynamiques.push({ fichier: relative(RACINE, fichier), ligne: i + 1, gabarit: gabarit[1] });
      }
    }
  });
}

if (dynamiques.length) {
  console.log('⚠ types construits à l\'exécution, hors famille ouverte :');
  for (const d of dynamiques) console.log(`   ${d.fichier}:${d.ligne} → \`${d.gabarit}\``);
  console.log('   Leur préfixe doit correspondre à une famille de la contrainte, sinon ils seront rejetés.');
}

if (refuses.length) {
  console.error('\n❌ types d\'activité que la base REFUSERA (l\'historique serait perdu en silence) :');
  for (const r of refuses) console.error(`   ${r.fichier}:${r.ligne} → '${r.type}'`);
  console.error('\n   Corriger le type, ou étendre la contrainte dans');
  console.error('   supabase/migrations/20260814_crm_activities_types.sql ET la liste de ce script.');
  process.exit(1);
}

console.log(`✅ types d'activité : tous acceptés par la contrainte${dynamiques.length ? ` (${dynamiques.length} dynamique(s) à surveiller)` : ''}`);
