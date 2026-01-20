// Script de test pour vérifier votre clé API Anthropic et les modèles disponibles
// Usage: node test-anthropic-api.js VOTRE_CLE_API

const apiKey = process.argv[2];

if (!apiKey) {
  console.error('\n❌ ERREUR: Vous devez fournir votre clé API Anthropic comme argument');
  console.log('\nUsage:');
  console.log('  node test-anthropic-api.js sk-ant-api03-votre-cle-ici\n');
  process.exit(1);
}

console.log('\n🔍 TEST DE VOTRE CLÉ API ANTHROPIC\n');
console.log('Clé API:', apiKey.substring(0, 20) + '...' + apiKey.substring(apiKey.length - 5));
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Modèles à tester
const modelsToTest = [
  { name: 'Claude 3 Haiku', id: 'claude-3-haiku-20240307', tier: 'Gratuit/Payant' },
  { name: 'Claude 3 Sonnet', id: 'claude-3-sonnet-20240229', tier: 'Gratuit/Payant' },
  { name: 'Claude 3 Opus', id: 'claude-3-opus-20240229', tier: 'Payant' },
  { name: 'Claude 3.5 Sonnet (v1)', id: 'claude-3-5-sonnet-20240620', tier: 'Payant' },
  { name: 'Claude 3.5 Sonnet (v2)', id: 'claude-3-5-sonnet-20241022', tier: 'Payant' },
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
      console.log(`✅ ${model.name.padEnd(25)} (${model.tier.padEnd(15)}) → ACCESSIBLE`);
      console.log(`   Réponse: "${answer.substring(0, 40)}${answer.length > 40 ? '...' : ''}"`);
      return true;
    } else {
      console.log(`❌ ${model.name.padEnd(25)} (${model.tier.padEnd(15)}) → ERREUR: ${data.error?.type || data.error?.message || 'Unknown'}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ ${model.name.padEnd(25)} (${model.tier.padEnd(15)}) → ERREUR RÉSEAU: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('📊 TEST DES MODÈLES CLAUDE DISPONIBLES:\n');

  const results = [];

  for (const model of modelsToTest) {
    const accessible = await testModel(model);
    results.push({ model, accessible });

    // Pause entre les requêtes pour éviter rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📋 RÉSUMÉ:\n');

  const accessible = results.filter(r => r.accessible);
  const notAccessible = results.filter(r => !r.accessible);

  if (accessible.length > 0) {
    console.log('✅ MODÈLES ACCESSIBLES:');
    accessible.forEach(r => {
      console.log(`   - ${r.model.name} (${r.model.id})`);
    });
  }

  if (notAccessible.length > 0) {
    console.log('\n❌ MODÈLES NON ACCESSIBLES:');
    notAccessible.forEach(r => {
      console.log(`   - ${r.model.name} (${r.model.id})`);
    });
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (accessible.length > 0) {
    console.log('💡 RECOMMANDATION:');
    console.log(`   Utilisez: ${accessible[accessible.length - 1].model.id}`);
    console.log(`   (Meilleur modèle disponible pour votre clé)\n`);
  } else {
    console.log('⚠️  ATTENTION: Aucun modèle accessible !');
    console.log('   Vérifiez que votre clé API est valide et active.\n');
  }
}

runTests();
