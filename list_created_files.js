const fs = require('fs');
const path = require('path');

console.log('\n╔═══════════════════════════════════════════════════════════════╗');
console.log('║  Fichiers créés pour l\'optimisation des mots-clés           ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

const baseDir = 'C:\\Users\\vcgle\\Documents\\GitHub\\keiro';

const files = [
  // Scripts
  { path: 'generate_keywords.js', desc: 'Génération via API Claude', emoji: '🤖' },
  { path: 'update_keywords.js', desc: 'Mise à jour de newsProviders.ts', emoji: '✏️' },
  { path: 'run_keyword_optimization.js', desc: 'Script principal (tout automatique)', emoji: '🚀' },
  { path: 'test_api_connection.js', desc: 'Test de connexion API', emoji: '🔍' },
  { path: 'list_created_files.js', desc: 'Ce script (liste les fichiers)', emoji: '📝' },

  // Lanceurs
  { path: 'optimize.bat', desc: 'Lanceur Windows', emoji: '🪟' },
  { path: 'optimize.sh', desc: 'Lanceur Linux/Mac', emoji: '🐧' },

  // Documentation
  { path: 'START_HERE.md', desc: 'Point de départ - Vue d\'ensemble', emoji: '🎯' },
  { path: 'QUICK_START.md', desc: 'Guide de démarrage rapide', emoji: '⚡' },
  { path: 'KEYWORD_OPTIMIZATION_README.md', desc: 'Documentation complète', emoji: '📚' },
  { path: 'NPM_SCRIPTS.md', desc: 'Guide des scripts npm', emoji: '💻' },
  { path: 'INSTALLATION_COMPLETE.txt', desc: 'Instructions d\'installation', emoji: '📋' },
  { path: 'SYSTEM_SUMMARY.txt', desc: 'Résumé complet du système', emoji: '📄' },
  { path: 'FILES_CREATED.md', desc: 'Liste détaillée des fichiers', emoji: '📂' },
];

console.log('📁 Fichiers créés:\n');

let totalSize = 0;
let existingCount = 0;

files.forEach((file, index) => {
  const fullPath = path.join(baseDir, file.path);
  const exists = fs.existsSync(fullPath);

  if (exists) {
    const stats = fs.statSync(fullPath);
    const sizeKb = (stats.size / 1024).toFixed(2);
    totalSize += stats.size;
    existingCount++;

    console.log(`${file.emoji}  ${file.path.padEnd(35)} ${exists ? '✅' : '❌'} (${sizeKb} KB)`);
    console.log(`   ${file.desc}`);
    if (index < files.length - 1) console.log('');
  } else {
    console.log(`${file.emoji}  ${file.path.padEnd(35)} ❌ MANQUANT`);
    console.log(`   ${file.desc}`);
    if (index < files.length - 1) console.log('');
  }
});

console.log('\n───────────────────────────────────────────────────────────────');
console.log(`\n📊 Statistiques:`);
console.log(`   Fichiers créés: ${existingCount}/${files.length}`);
console.log(`   Taille totale: ${(totalSize / 1024).toFixed(2)} KB`);

if (existingCount === files.length) {
  console.log('\n✅ Tous les fichiers ont été créés avec succès!\n');
} else {
  console.log(`\n⚠️  ${files.length - existingCount} fichier(s) manquant(s)\n`);
}

console.log('───────────────────────────────────────────────────────────────\n');
console.log('📖 Documentation disponible:');
console.log('   • START_HERE.md - Vue d\'ensemble et tutoriel complet');
console.log('   • QUICK_START.md - Démarrage rapide (2-5 minutes)');
console.log('   • NPM_SCRIPTS.md - Guide des scripts npm\n');
console.log('🚀 Prochaine étape:');
console.log('   1. Lisez START_HERE.md pour commencer');
console.log('   2. Puis exécutez: npm run keywords:optimize\n');
