#!/usr/bin/env node
/**
 * Applique les migrations SQL en attente, depuis le VPS.
 *
 * ── Pourquoi ce script existe ──
 *
 * Le projet n'avait plus aucun moyen d'appliquer une migration depuis des mois.
 * Le jeton Management de Supabase est révoqué, et la connexion directe à
 * Postgres est injoignable depuis le poste du fondateur : le DNS de Supabase ne
 * résout qu'en IPv6, que son réseau ne route pas. D'où la note « migrations
 * impossibles, passer par l'éditeur SQL à la main » — et des fonctionnalités
 * repoussées faute de pouvoir créer une table.
 *
 * La contrainte était mal située. Elle vient du RÉSEAU du poste, pas de
 * Supabase : le VPS OVH, lui, a une IPv6 et joint la base sans difficulté. Le
 * chemin existait depuis le début, personne ne l'avait essayé de là.
 *
 * Ce script tourne donc pendant le déploiement, sur le VPS.
 *
 * ── Garde-fous ──
 *
 * · Les migrations déjà passées sont enregistrées dans `_migrations` : rejouer
 *   le script ne rejoue rien.
 * · Chaque fichier s'exécute dans UNE transaction : une migration à moitié
 *   appliquée n'existe pas.
 * · Une base injoignable N'INTERROMPT PAS le déploiement. Le code doit tolérer
 *   l'absence d'une table (et le dire), plutôt que de bloquer la mise en ligne
 *   d'un correctif sans rapport.
 * · Ordre alphabétique des fichiers, qui est l'ordre chronologique vu la
 *   convention de nommage (AAAAMMJJ_sujet.sql).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const DOSSIER = 'supabase/migrations';

/**
 * Les migrations antérieures à ce jour ne sont pas rejouées.
 *
 * Elles ont été appliquées à la main dans l'éditeur SQL pendant la période où
 * ce script n'existait pas. Les rejouer irait de l'échec bénin (IF NOT EXISTS)
 * à la perte de données (une insertion de démonstration relancée sur une base
 * vivante). On part donc d'aujourd'hui, et on marque tout le passé comme acquis.
 */
const DEBUT = '20260811';

function chaineConnexion() {
  const direct = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (direct) return direct;
  const mdp = process.env.SUPABASE_DB_PASSWORD;
  const projet = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').match(/https:\/\/([a-z0-9]+)\./)?.[1];
  if (!mdp || !projet) return null;
  return `postgresql://postgres:${encodeURIComponent(mdp)}@db.${projet}.supabase.co:5432/postgres`;
}

const url = chaineConnexion();
if (!url) {
  console.log('▶ migrations : pas de connexion configurée (DATABASE_URL ou SUPABASE_DB_PASSWORD) — ignorées');
  process.exit(0);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });

try {
  await client.connect();
} catch (e) {
  // On ne fait PAS échouer le déploiement : une base injoignable est un
  // problème à voir, pas une raison d'empêcher la mise en ligne du reste.
  console.log(`▶ migrations : base injoignable (${e?.message?.slice(0, 80)}) — ignorées`);
  process.exit(0);
}

try {
  await client.query(`
    create table if not exists _migrations (
      nom text primary key,
      applique_le timestamptz not null default now()
    );
  `);

  const { rows } = await client.query('select nom from _migrations');
  const deja = new Set(rows.map(r => r.nom));

  const fichiers = readdirSync(DOSSIER).filter(f => f.endsWith('.sql')).sort();
  const aPasser = fichiers.filter(f => f >= DEBUT && !deja.has(f));

  // Le passé est marqué comme acquis, une fois pour toutes.
  const anciennes = fichiers.filter(f => f < DEBUT && !deja.has(f));
  if (anciennes.length) {
    for (const f of anciennes) {
      await client.query('insert into _migrations (nom) values ($1) on conflict do nothing', [f]);
    }
    console.log(`▶ migrations : ${anciennes.length} antérieures marquées comme déjà appliquées (elles l'ont été à la main)`);
  }

  if (!aPasser.length) {
    console.log('▶ migrations : rien à appliquer');
    process.exit(0);
  }

  for (const fichier of aPasser) {
    const sql = readFileSync(join(DOSSIER, fichier), 'utf8');
    process.stdout.write(`▶ migration ${fichier} … `);
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into _migrations (nom) values ($1)', [fichier]);
      await client.query('commit');
      console.log('appliquée');
    } catch (e) {
      await client.query('rollback').catch(() => {});
      console.log('ÉCHEC');
      console.error(`  ${e?.message?.slice(0, 300)}`);
      // Une migration cassée doit se voir et s'arrêter là : appliquer la
      // suivante sur une base dans un état non prévu ferait pire.
      process.exit(1);
    }
  }
} finally {
  await client.end().catch(() => {});
}
