#!/bin/bash
# Force every agent to execute ONE concrete action immediately and
# report what it produced. Run on the VPS.
set -u
source /opt/keiro/.env.local 2>/dev/null || true
TOKEN="${CRON_SECRET:-}"
BASE="http://localhost:3000"
AUTH="Authorization: Bearer $TOKEN"
JSON="Content-Type: application/json"

[ -z "$TOKEN" ] && { echo "FATAL: CRON_SECRET not set"; exit 1; }

echo "=== Triggering one concrete action per agent ==="
date

run() {
  local label="$1"
  local method="$2"
  local path="$3"
  local body="${4:-}"
  echo ""
  echo "── $label ──"
  local cmd=(curl -s -o /tmp/out_$$ -w "HTTP %{http_code} in %{time_total}s" -X "$method" "$BASE$path" -H "$AUTH" -H "$JSON" --max-time 240)
  if [ -n "$body" ]; then
    cmd+=(-d "$body")
  fi
  "${cmd[@]}"
  echo ""
  head -c 400 "/tmp/out_$$"
  echo ""
  rm -f "/tmp/out_$$"
}

# Lucas (content) — generate and try to publish a trending post NOW
run "Lucas: trigger content execute_publication" POST /api/agents/content '{"action":"execute_publication"}'

# Lucas — force generate a fresh post if today has none
run "Lucas: morning slot (generate + auto-publish)" GET "/api/agents/content?slot=morning"

# Noah (CEO) — produce today's daily brief
run "Noah: CEO daily brief" POST /api/agents/ceo '{}'

# Ami (marketing) — run marketing analysis
run "Ami: marketing analysis" GET /api/agents/marketing

# Leo (SEO) — publish an SEO article
run "Leo: SEO article" GET /api/agents/seo

# Hugo (email) — send the morning daily batch
run "Hugo: email daily morning batch" GET "/api/agents/email/daily?slot=morning"

# Jade (DM Instagram) — prepare morning DM batch
run "Jade: DM prep slot=morning" POST "/api/agents/dm-instagram?slot=morning"

# Jade — auto-reply polling
run "Jade: DM auto-reply polling" POST /api/agents/dm-instagram/auto-reply

# Lena (Instagram comments) — fetch comments
run "Lena: fetch IG comments" POST /api/agents/instagram-comments '{"action":"fetch_comments"}'

# Ops — system health
run "Ops: health check" POST /api/agents/ops '{}'

# Commercial — prospection
run "Commercial: prospection cycle" POST /api/agents/commercial

# Theo (gmaps) — scrape a batch
run "Theo: Google Maps scrape" GET /api/agents/gmaps

# Weekly trends
run "Weekly trends" GET /api/agents/weekly-trends

# Orders processor
run "Orders processor" GET /api/agents/orders

# Google Reviews
run "Google Reviews check" GET /api/agents/google-reviews

echo ""
echo "=== Done ==="
date
