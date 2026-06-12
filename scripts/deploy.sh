#!/usr/bin/env bash
# KeiroAI deploy — pull, build, reload, then PROVE it went live from OUTSIDE.
# A deploy is only "done" when https://keiroai.com/api/version returns the SHA
# we just built. Run on the VPS from /opt/keiro: bash scripts/deploy.sh
set -euo pipefail

cd /opt/keiro

echo "▶ git pull --rebase"
git pull --rebase

EXPECTED_SHA="$(git rev-parse --short HEAD)"
echo "▶ target commit: $EXPECTED_SHA"

echo "▶ npm ci"
npm ci --no-audit --no-fund

echo "▶ npm run build"
npm run build

echo "▶ pm2 reload"
pm2 reload keiro-app --update-env
pm2 reload keiro-worker --update-env || true

# Give the app a moment to come up, then verify from the PUBLIC URL (apex + www).
sleep 4
fail=0
for host in "https://keiroai.com" "https://www.keiroai.com"; do
  got="$(curl -fsS --max-time 15 "$host/api/version?ts=$(date +%s)" | grep -oE '"shortSha":"[^"]+"' | cut -d'"' -f4 || echo "ERR")"
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
