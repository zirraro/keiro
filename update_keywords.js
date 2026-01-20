const fs = require('fs');

// Lire le fichier JSON généré
const keywordsJson = fs.readFileSync(
  'C:\\Users\\vcgle\\Documents\\GitHub\\keiro\\generated_keywords.json',
  'utf8'
);

// Parser le JSON
let keywords;
try {
  keywords = JSON.parse(keywordsJson);
  console.log('✅ Keywords JSON parsed successfully');
  console.log(`📊 Categories found: ${Object.keys(keywords).length}\n`);

  // Afficher le nombre de mots-clés par catégorie
  for (const [category, words] of Object.entries(keywords)) {
    console.log(`  ${category}: ${words.length} mots-clés`);
  }
  console.log('');
} catch (error) {
  console.error('❌ Error parsing JSON:', error);
  process.exit(1);
}

// Lire le fichier TypeScript
const tsFilePath = 'C:\\Users\\vcgle\\Documents\\GitHub\\keiro\\lib\\newsProviders.ts';
let tsContent = fs.readFileSync(tsFilePath, 'utf8');

// Convertir l'objet JavaScript en string formaté pour TypeScript
function formatKeywordsObject(obj) {
  let result = 'const CATEGORY_KEYWORDS: { [key: string]: string[] } = {\n';

  for (const [category, words] of Object.entries(obj)) {
    result += `  '${category}': [\n`;

    // Grouper les mots par lignes de ~10 mots pour une meilleure lisibilité
    const wordsPerLine = 10;
    for (let i = 0; i < words.length; i += wordsPerLine) {
      const chunk = words.slice(i, i + wordsPerLine);
      result += `    ${chunk.map(w => `'${w}'`).join(', ')}${i + wordsPerLine < words.length ? ',' : ''}\n`;
    }

    result += `  ],\n\n`;
  }

  result += '};';
  return result;
}

const newKeywordsBlock = formatKeywordsObject(keywords);

// Remplacer l'ancien bloc CATEGORY_KEYWORDS
// Pattern pour matcher l'ancien bloc (de "const CATEGORY_KEYWORDS" jusqu'à "};" avant la ligne vide)
const oldPattern = /const CATEGORY_KEYWORDS: \{ \[key: string\]: string\[\] \} = \{[\s\S]*?\n\};/;

if (!oldPattern.test(tsContent)) {
  console.error('❌ Could not find CATEGORY_KEYWORDS block in file');
  process.exit(1);
}

tsContent = tsContent.replace(oldPattern, newKeywordsBlock);

// Sauvegarder le fichier modifié
fs.writeFileSync(tsFilePath, tsContent, 'utf8');

console.log('✅ newsProviders.ts updated successfully!');
console.log(`📁 File location: ${tsFilePath}`);
console.log('\n🎉 Done! The CATEGORY_KEYWORDS object has been replaced with the new optimized keywords.');
