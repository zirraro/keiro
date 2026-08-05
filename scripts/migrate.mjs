/**
 * Applique une migration SQL via l'API Management de Supabase.
 *
 * Pourquoi cette voie plutôt qu'une connexion Postgres directe : la base n'est
 * joignable qu'en IPv6 depuis l'extérieur, ce qui bloque la plupart des postes
 * et des runners. L'ancien `run-migrations.mjs` passait par le pooler avec un
 * mot de passe en dur, aujourd'hui périmé — et les variables POSTGRES et PG du
 * projet pointent une base Neon héritée de Vercel qui n'a plus aucun rapport
 * avec le produit. L'API Management contourne tout ça et se révoque en un clic.
 *
 * Usage :
 *   node scripts/migrate.mjs supabase/migrations/mon-fichier.sql
 *   node scripts/migrate.mjs --sql "alter table … ;"
 *   node scripts/migrate.mjs --check "select 1"      (lecture seule, sans écrire)
 */
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
);

const TOKEN = env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) {
  console.error("SUPABASE_ACCESS_TOKEN absent de .env.local — voir https://supabase.com/dashboard/account/tokens");
  process.exit(1);
}
// La référence du projet se déduit de l'URL publique : une variable de moins
// à tenir à jour, et une source d'incohérence en moins.
const REF = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];

/**
 * Un seul aller-retour, avec reprise sur les pannes de passerelle.
 *
 * L'endpoint renvoie régulièrement des 502/504 en HTML sur les lots un peu
 * lourds — ce n'est pas une erreur SQL, et réessayer suffit. Distinguer les
 * deux évite de croire à un problème de migration là où il n'y a qu'un
 * hoquet d'infrastructure.
 */
async function requete(sql, essai = 1) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const texte = await res.text();
  if (res.ok) { try { return JSON.parse(texte); } catch { return texte; } }

  const passerelle = res.status >= 502 || texte.trimStart().startsWith('<');
  if (passerelle && essai < 4) {
    await new Promise(r => setTimeout(r, essai * 3000));
    return requete(sql, essai + 1);
  }
  throw new Error(passerelle
    ? `passerelle Supabase indisponible après ${essai} tentatives (HTTP ${res.status})`
    : `HTTP ${res.status} — ${texte.slice(0, 400)}`);
}

/**
 * Applique un script par étapes, séparées par une ligne `-- @@`.
 *
 * Un gros lot d'ALTER sur une table volumineuse dépasse le délai de la
 * passerelle. Découper rend aussi la reprise triviale : chaque étape étant
 * idempotente, on relance le fichier entier sans risque après un échec.
 */
export async function executerSql(sql) {
  const etapes = sql.split(/^--\s*@@.*$/m).map(e => e.trim()).filter(e => e && !/^(--[^\n]*\n?)+$/.test(e));
  const sorties = [];
  for (let i = 0; i < etapes.length; i++) {
    process.stdout.write(`  étape ${i + 1}/${etapes.length}… `);
    sorties.push(await requete(etapes[i]));
    console.log('ok');
  }

  // PostgREST sert l'API REST depuis un cache de schéma qu'il ne rafraîchit
  // pas tout seul. Sans ce signal, une table ou une colonne fraîchement créée
  // reste INVISIBLE côté application : les insertions échouent en silence si
  // l'appelant n'inspecte pas l'erreur — ce qui a fait croire, pendant des
  // mois, que le socle d'outcomes fonctionnait alors qu'il écrivait dans le
  // vide. On recharge donc systématiquement après une migration.
  if (/\b(create|alter|drop)\b/i.test(sql)) {
    process.stdout.write('  rechargement du cache PostgREST… ');
    await requete("notify pgrst, 'reload schema';");
    await new Promise(r => setTimeout(r, 3000));
    console.log('ok');
  }
  return sorties.length === 1 ? sorties[0] : sorties;
}

// Exécution directe uniquement — importé, le module n'exécute rien.
if (process.argv[1] && process.argv[1].endsWith('migrate.mjs')) {
  const args = process.argv.slice(2);
  const iSql = args.indexOf('--sql');
  const iCheck = args.indexOf('--check');

  let sql;
  if (iCheck !== -1) sql = args[iCheck + 1];
  else if (iSql !== -1) sql = args[iSql + 1];
  else if (args[0]) sql = fs.readFileSync(args[0], 'utf8');

  if (!sql) { console.error('Rien à exécuter. Passe un fichier .sql, --sql "…" ou --check "…".'); process.exit(1); }

  try {
    const out = await executerSql(sql);
    console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 1));
    console.log('\n✅ appliqué');
  } catch (e) {
    console.error('\n❌', e.message);
    process.exit(1);
  }
}
