#!/bin/bash

echo "========================================"
echo " Optimisation Mots-clés Actualités"
echo "========================================"
echo ""

# Vérifier si ANTHROPIC_API_KEY est défini
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "❌ ERREUR: La variable ANTHROPIC_API_KEY n'est pas définie!"
    echo ""
    echo "Définissez-la avec:"
    echo "  export ANTHROPIC_API_KEY=sk-ant-..."
    echo ""
    echo "Ou ajoutez-la dans votre ~/.bashrc ou ~/.zshrc"
    echo ""
    exit 1
fi

echo "✅ Clé API détectée: ${ANTHROPIC_API_KEY:0:20}..."
echo ""

# Exécuter le script principal
node run_keyword_optimization.js

echo ""
echo "✅ Terminé!"
