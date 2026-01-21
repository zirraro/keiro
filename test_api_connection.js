// Charger les variables d'environnement depuis .env si le fichier existe
try {
  require('dotenv').config();
} catch (e) {
  // dotenv n'est pas installé ou .env n'existe pas, utiliser les variables d'environnement système
}

const Anthropic = require('@anthropic-ai/sdk');

console.log('🔍 Test de connexion à l\'API Anthropic Claude\n');

const apiKey = process.env.ANTHROPIC_API_KEY;

if (!apiKey) {
  console.error('❌ ANTHROPIC_API_KEY non trouvée dans les variables d\'environnement');
  console.error('\n💡 Pour définir la clé API:');
  console.error('   Windows CMD:  set ANTHROPIC_API_KEY=sk-ant-...');
  console.error('   Windows PS:   $env:ANTHROPIC_API_KEY="sk-ant-..."');
  console.error('   Linux/Mac:    export ANTHROPIC_API_KEY=sk-ant-...\n');
  process.exit(1);
}

console.log(`✅ Clé API détectée: ${apiKey.substring(0, 20)}...`);
console.log(`📏 Longueur de la clé: ${apiKey.length} caractères\n`);

const anthropic = new Anthropic({ apiKey });

async function testConnection() {
  try {
    console.log('📡 Envoi d\'une requête de test à Claude Haiku...\n');

    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: 'Réponds simplement "OK" si tu me reçois.'
        }
      ]
    });

    const response = message.content[0].text;

    console.log('✅ SUCCÈS! Réponse de Claude:');
    console.log(`   "${response}"\n`);
    console.log('📊 Détails de la réponse:');
    console.log(`   - Modèle: ${message.model}`);
    console.log(`   - Tokens utilisés: ${message.usage.input_tokens} input + ${message.usage.output_tokens} output`);
    console.log(`   - ID: ${message.id}\n`);
    console.log('🎉 La connexion à l\'API fonctionne parfaitement!');
    console.log('🚀 Vous pouvez maintenant lancer l\'optimisation des mots-clés.\n');

  } catch (error) {
    console.error('❌ ERREUR lors de la connexion à l\'API:\n');

    if (error.status === 401) {
      console.error('   🔐 Erreur d\'authentification (401)');
      console.error('   → Vérifiez que votre clé API est correcte');
      console.error('   → Obtenez une nouvelle clé sur: https://console.anthropic.com/\n');
    } else if (error.status === 429) {
      console.error('   ⏱️  Limite de taux dépassée (429)');
      console.error('   → Attendez quelques instants avant de réessayer\n');
    } else if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      console.error('   🌐 Problème de connexion réseau');
      console.error('   → Vérifiez votre connexion Internet');
      console.error('   → Vérifiez que vous n\'êtes pas derrière un proxy/firewall\n');
    } else {
      console.error(`   Erreur: ${error.message}\n`);
    }

    console.error('📋 Détails complets de l\'erreur:');
    console.error(error);
    process.exit(1);
  }
}

testConnection();
