#!/bin/bash

echo "--- Tests de l'API ---"
echo "Test de l'API de base:"
curl -s "http://localhost:3006/api/news?topic=world&limit=2" | jq

echo -e "\n--- Tests par catégorie ---"
categories=("sports" "gaming" "restauration" "health" "environment" "technology" "science" "world" "business")

for cat in "${categories[@]}"; do
  echo -e "\n— ${cat^^} —"
  result=$(curl -s "http://localhost:3006/api/news/search?cat=${cat}&limit=2")
  # Afficher d'abord le nombre d'éléments
  echo "$result" | jq '.items | length'
  # Puis afficher le premier élément s'il existe
  echo "$result" | jq '.items[0] | if . != null then {title,source,topic} else "Aucun résultat" end'
done
