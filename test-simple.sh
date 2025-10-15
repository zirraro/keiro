#!/bin/bash
echo "Test de l'API de recherche:"
curl -s "http://localhost:3006/api/news/search?cat=technology&limit=2"
