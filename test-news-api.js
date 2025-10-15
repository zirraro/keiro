const fetch = require('node-fetch');

async function testNewsAPI() {
  try {
    // Test de l'API de base
    console.log("Test de l'API de base:");
    const baseResponse = await fetch("http://localhost:3006/api/news?topic=world&timeframe=24h&limit=3");
    const baseData = await baseResponse.json();
    console.log("Résultat API de base:", baseData);
    
    // Test de l'API de recherche
    console.log("\nTest de l'API de recherche:");
    const searchResponse = await fetch("http://localhost:3006/api/news/search?cat=world&timeframe=24h&limit=3");
    const searchData = await searchResponse.json();
    console.log("Résultat API de recherche:", searchData);
  } catch (error) {
    console.error("Erreur de test:", error);
  }
}

testNewsAPI();
