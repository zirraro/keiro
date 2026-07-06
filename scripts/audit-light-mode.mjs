#!/usr/bin/env node
/**
 * Audit MODE CLAIR — inventaire des utilitaires "dark-first" à risque sur fond
 * clair (protocole Fable 5, 07/07/2026). Léger (grep récursif, pas de browser).
 *
 * Usage :
 *   node scripts/audit-light-mode.mjs           # inventaire + top offenders
 *   node scripts/audit-light-mode.mjs --ci      # exit 1 si la dette AUGMENTE
 *                                                 vs scripts/.light-mode-baseline.json
 *
 * NB : un FILET DE SÉCURITÉ global existe dans app/globals.css (html.light …)
 * qui neutralise ces patterns au rendu. Ce script sert à (1) mesurer la dette,
 * (2) empêcher qu'elle EXPLOSE (garde-fou CI), (3) guider la migration tokens.
 */
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['app', 'components'];
const EXT = /\.(tsx|jsx)$/;

const PATTERNS = [
  { key: 'text-white (no dark:)', re: /text-white(?![\/-])/, guard: /dark:text-white/ },
  { key: 'light grey text 100-400', re: /text-(gray|slate|zinc|neutral)-(100|200|300|400)\b/ },
  { key: 'glass bg-white/x', re: /bg-white\/(5|10|15|20|25)\b/ },
  { key: 'border-white/x', re: /border-white\/(5|10|15|20|30)\b/ },
  { key: 'gradient clip text', re: /bg-clip-text/ },
  { key: 'hover:text-white (no dark:)', re: /hover:text-white/, guard: /dark:hover:text-white/ },
  { key: 'light placeholders', re: /placeholder-(white|gray-300|gray-400|slate-300|slate-400)/ },
];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (EXT.test(name)) out.push(p);
  }
  return out;
}

const files = ROOTS.flatMap(r => walk(r));
const counts = Object.fromEntries(PATTERNS.map(p => [p.key, 0]));
const perFile = {};

for (const f of files) {
  const lines = readFileSync(f, 'utf8').split('\n');
  for (const line of lines) {
    for (const p of PATTERNS) {
      if (p.re.test(line) && !(p.guard && p.guard.test(line))) {
        counts[p.key]++;
        perFile[f] = (perFile[f] || 0) + 1;
      }
    }
  }
}

const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(`\n🎨 Audit mode clair — ${files.length} fichiers scannés\n`);
for (const [k, v] of Object.entries(counts)) console.log(`  ${String(v).padStart(5)}  ${k}`);
console.log(`  ${String(total).padStart(5)}  TOTAL (dette dark-first)\n`);
console.log('Top 8 fichiers :');
Object.entries(perFile).sort((a, b) => b[1] - a[1]).slice(0, 8)
  .forEach(([f, n]) => console.log(`  ${String(n).padStart(4)}  ${f}`));

const BASELINE = 'scripts/.light-mode-baseline.json';
if (process.argv.includes('--ci')) {
  const prev = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).total : Infinity;
  if (total > prev) {
    console.error(`\n❌ CI: la dette dark-first a AUGMENTÉ (${prev} → ${total}). Utilise les tokens/variantes dark: sur le nouveau code.`);
    process.exit(1);
  }
  console.log(`\n✅ CI: dette stable ou en baisse (${prev} → ${total}).`);
} else {
  writeFileSync(BASELINE, JSON.stringify({ total, counts, at: 'run manually' }, null, 2));
  console.log(`\nBaseline écrite dans ${BASELINE} (le mode --ci échoue si le total augmente).`);
}
