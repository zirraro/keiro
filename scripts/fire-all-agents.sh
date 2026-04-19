#!/bin/bash
# Fire every agent endpoint in parallel. Run on the VPS.
set -u
source /opt/keiro/.env.local 2>/dev/null || true
TOKEN="${CRON_SECRET:-}"
BASE="http://localhost:3000"

if [ -z "$TOKEN" ]; then
  echo "FATAL: CRON_SECRET not set"
  exit 1
fi

echo "=== Firing all agents against $BASE ==="
date

hit() {
  local method="$1"
  local path="$2"
  local tmp
  tmp=$(mktemp)
  local code
  code=$(curl -s -o "$tmp" -w "%{http_code}" -X "$method" "$BASE$path" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    --max-time 120)
  local size
  size=$(wc -c < "$tmp")
  local head
  head=$(head -c 180 "$tmp" | tr -d '\n\r' | head -c 180)
  printf "[%-4s] %-50s HTTP %s  (%s bytes)  %s\n" "$method" "$path" "$code" "$size" "$head"
  rm -f "$tmp"
}

# Fire every agent in parallel (background jobs, then wait)
hit GET  "/api/agents/content?slot=morning" &
hit GET  "/api/agents/email/daily?slot=morning" &
hit POST "/api/agents/commercial" &
hit POST "/api/agents/dm-instagram?slot=morning" &
hit POST "/api/agents/dm-instagram/auto-reply" &
hit GET  "/api/agents/seo" &
hit GET  "/api/agents/gmaps" &
hit GET  "/api/agents/marketing" &
hit POST "/api/agents/ceo" &
hit POST "/api/agents/ops" &
hit POST "/api/agents/retention" &
hit GET  "/api/agents/weekly-trends" &
hit POST "/api/agents/comptable" &
hit GET  "/api/agents/orders" &
hit GET  "/api/agents/google-reviews" &
hit POST "/api/agents/whatsapp" &
hit POST "/api/agents/onboarding" &

wait
echo "=== Done ==="
