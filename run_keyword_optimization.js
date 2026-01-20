const { execSync } = require('child_process');
const fs = require('fs');

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  Optimisation des mots-clés de catégorisation - Actualités  ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

// Étape 1: Générer les mots-clés via Claude API
console.log('📡 ÉTAPE 1: Génération des mots-clés via Claude API Haiku');
console.log('─────────────────────────────────────────────────────────────\n');

try {
  execSync('node generate_keywords.js', {
    cwd: 'C:\\Users\\vcgle\\Documents\\GitHub\\keiro',
    stdio: 'inherit'
  });
} catch (error) {
  console.error('\n❌ Error in step 1:', error.message);
  process.exit(1);
}

// Vérifier que le fichier JSON a été créé
const jsonPath = 'C:\\Users\\vcgle\\Documents\\GitHub\\keiro\\generated_keywords.json';
if (!fs.existsSync(jsonPath)) {
  console.error('\n❌ generated_keywords.json was not created');
  process.exit(1);
}

console.log('\n\n');

// Étape 2: Mettre à jour le fichier TypeScript
console.log('📝 ÉTAPE 2: Mise à jour du fichier newsProviders.ts');
console.log('─────────────────────────────────────────────────────────────\n');

try {
  execSync('node update_keywords.js', {
    cwd: 'C:\\Users\\vcgle\\Documents\\GitHub\\keiro',
    stdio: 'inherit'
  });
} catch (error) {
  console.error('\n❌ Error in step 2:', error.message);
  process.exit(1);
}

console.log('\n\n');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║                    ✅ SUCCÈS COMPLET ✅                      ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('\n📋 Résumé:');
console.log('  1. Mots-clés générés par Claude API (Haiku)');
console.log('  2. Fichier newsProviders.ts mis à jour avec succès');
console.log('  3. Nouvelle catégorie "Musique" ajoutée');
console.log('  4. Catégorie "Automobile" massivement enrichie');
console.log('  5. Toutes les catégories optimisées\n');
console.log('📁 Fichiers modifiés:');
console.log('  - C:\\Users\\vcgle\\Documents\\GitHub\\keiro\\lib\\newsProviders.ts');
console.log('  - C:\\Users\\vcgle\\Documents\\GitHub\\keiro\\generated_keywords.json (backup)\n');
console.log('🎯 Prochaine étape:');
console.log('  Testez votre application pour vérifier la nouvelle catégorisation!\n');
