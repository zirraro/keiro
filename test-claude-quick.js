// Test rapide de l'API Claude avec chargement automatique depuis .env.local
const fs = require('fs');
const path = require('path');

// Lire le fichier .env.local
const envPath = path.join(__dirname, '.env.local');
let apiKey = null;

try {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const match = envContent.match(/ANTHROPIC_API_KEY=(.+)/);
  if (match) {
    apiKey = match[1].trim();
  }
} catch (error) {
  console.error('\n❌ ERREUR: Impossible de lire .env.local\n', error.message);
  process.exit(1);
}

if (!apiKey) {
  console.error('\n❌ ERREUR: ANTHROPIC_API_KEY non trouvée dans .env.local\n');
  process.exit(1);
}

console.log('\n🔍 TEST DE VOTRE CLÉ API CLAUDE\n');
console.log('Clé API:', apiKey.substring(0, 20) + '...' + apiKey.substring(apiKey.length - 5));
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Modèles à tester (du plus récent au plus ancien)
const modelsToTest = [
  { name: 'Claude 3.5 Sonnet (v2)', id: 'claude-3-5-sonnet-20241022', tier: 'Premium' },
  { name: 'Claude 3.5 Sonnet (v1)', id: 'claude-3-5-sonnet-20240620', tier: 'Premium' },
  { name: 'Claude 3 Opus', id: 'claude-3-opus-20240229', tier: 'Premium' },
  { name: 'Claude 3 Sonnet', id: 'claude-3-sonnet-20240229', tier: 'Standard' },
  { name: 'Claude 3 Haiku', id: 'claude-3-haiku-20240307', tier: 'Économique' },
];

async function testModel(model) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model.id,
        max_tokens: 50,
        messages: [
          {
            role: 'user',
            content: 'Réponds juste "OK" si tu me reçois'
          }
        ]
      })
    });

    const data = await response.json();

    if (response.ok) {
      const answer = data.content[0]?.text || 'No response';
      console.log(`✅ ${model.name.padEnd(30)} → ACCESSIBLE`);
      console.log(`   Tier: ${model.tier} | Réponse: "${answer}"`);
      return { model, accessible: true, answer };
    } else {
      const errorMsg = data.error?.message || data.error?.type || 'Unknown error';
      console.log(`❌ ${model.name.padEnd(30)} → ${errorMsg}`);
      return { model, accessible: false, error: errorMsg };
    }
  } catch (error) {
    console.log(`❌ ${model.name.padEnd(30)} → ERREUR: ${error.message}`);
    return { model, accessible: false, error: error.message };
  }
}

async function runTests() {
  console.log('📊 TEST DES MODÈLES CLAUDE DISPONIBLES:\n');

  const results = [];

  for (const model of modelsToTest) {
    const result = await testModel(model);
    results.push(result);
    // Pause pour éviter rate limiting
    await new Promise(resolve => setTimeout(resolve, 800));
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📋 RÉSUMÉ:\n');

  const accessible = results.filter(r => r.accessible);
  const notAccessible = results.filter(r => !r.accessible);

  if (accessible.length > 0) {
    console.log('✅ MODÈLES ACCESSIBLES AVEC VOTRE CLÉ:');
    accessible.forEach(r => {
      console.log(`   - ${r.model.name} (${r.model.id})`);
      console.log(`     Tier: ${r.model.tier}`);
    });

    console.log('\n💡 RECOMMANDATIONS:');
    console.log(`   🏆 MEILLEUR MODÈLE: ${accessible[0].model.name}`);
    console.log(`      ID: ${accessible[0].model.id}`);
    console.log(`      → Utilisez ce modèle pour les meilleurs résultats\n`);

    if (accessible.length > 1) {
      console.log(`   💰 MODÈLE ÉCONOMIQUE: ${accessible[accessible.length - 1].model.name}`);
      console.log(`      ID: ${accessible[accessible.length - 1].model.id}`);
      console.log(`      → Bon rapport qualité/prix pour usage fréquent\n`);
    }
  }

  if (notAccessible.length > 0) {
    console.log('❌ MODÈLES NON ACCESSIBLES:');
    notAccessible.forEach(r => {
      console.log(`   - ${r.model.name}: ${r.error}`);
    });
    console.log('');
  }

  if (accessible.length === 0) {
    console.log('⚠️  ATTENTION: Aucun modèle accessible !');
    console.log('   Vérifiez que votre clé API est valide sur: https://console.anthropic.com/\n');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

runTests();
