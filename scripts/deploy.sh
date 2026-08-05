#!/usr/bin/env bash
# KeiroAI deploy — pull, build, reload, then PROVE it went live from OUTSIDE.
# A deploy is only "done" when https://keiroai.com/api/version returns the SHA
# we just built. Run on the VPS from /opt/keiro: bash scripts/deploy.sh
set -euo pipefail

cd /opt/keiro

echo "▶ git pull --rebase"
git pull --rebase

# Normalise to 7 chars to match /api/version's shortSha.
EXPECTED_SHA="$(git rev-parse --short=7 HEAD)"
echo "▶ target commit: $EXPECTED_SHA"

echo "▶ npm ci"
npm ci --no-audit --no-fund

# Build PROPRE, jamais incrémental.
#
# Incident 2026-08-05 : un build par-dessus un .next existant a laissé des
# manifestes manquants (route_client-reference-manifest.js). Les routes
# concernées répondaient 500, et le client voyait sa galerie, ses vidéos et
# tous ses brouillons VIDES — alors que rien n'avait été perdu en base. Un
# client ne doit jamais voir ça, et le symptôme ne ressemble en rien à sa
# cause : impossible à diagnostiquer vite.
#
# Reconstruire de zéro coûte une minute de plus par déploiement. C'est le prix
# à payer pour que ce mode de panne n'existe plus.
echo "▶ build propre (suppression de .next)"
rm -rf .next
npm run build

# Filet de sécurité : si un manifeste manque malgré tout, on arrête AVANT le
# reload plutôt que de mettre en ligne une application aux routes mortes.
echo "▶ vérification des manifestes de routes"
missing=0
while IFS= read -r routedir; do
  if [ ! -f "$routedir/route_client-reference-manifest.js" ]; then
    echo "  ✗ manifeste manquant : $routedir"
    missing=$((missing + 1))
  fi
done < <(find .next/server/app/api -name 'route.js' -exec dirname {} \; 2>/dev/null)
if [ "$missing" -gt 0 ]; then
  echo "✗ $missing manifeste(s) manquant(s) — déploiement interrompu, l'application resterait cassée."
  exit 1
fi
echo "  ✓ manifestes complets"

echo "▶ pm2 reload"
pm2 reload keiro-app --update-env
pm2 reload keiro-worker --update-env || true

# Give the app a moment to come up, then verify from the PUBLIC URL (apex + www).
sleep 4
fail=0
for host in "https://keiroai.com" "https://www.keiroai.com"; do
  got="$(curl -fsSL --max-time 15 "$host/api/version?ts=$(date +%s)" | grep -oE '"shortSha":"[^"]+"' | cut -d'"' -f4 || echo "ERR")"
  got="${got:0:7}"
  if [ "$got" = "$EXPECTED_SHA" ]; then
    echo "✅ $host serves $got"
  else
    echo "❌ $host serves '$got' — expected '$EXPECTED_SHA' (cache or routing issue)"
    fail=1
  fi
done

if [ "$fail" = "1" ]; then
  echo "🚨 DEPLOY NOT LIVE on the public URL. Investigate cache/proxy/DNS before declaring done."
  exit 1
fi
echo "🎉 Deploy verified live on public URL ($EXPECTED_SHA)."
