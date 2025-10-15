#!/bin/bash
echo "Test de l'API de base:"
curl -s "http://localhost:3006/api/news?topic=world&limit=2" | jq

echo -e "\nTest de l'API de recherche (catégorie: technology):"
curl -s "http://localhost:3006/api/news/search?cat=technology&limit=2" | jq
