#!/usr/bin/env bash
# ── SectorLens — Full SIC ingestion script ────────────────────────────────────
# Triggers SEC EDGAR ingestion for every SIC code in the database.
# Run this once to do an initial full population, then let nightly cron maintain.
#
# Usage:
#   chmod +x ingest-all-sics.sh
#   APP_URL=https://sectorlens.cloudstrucc.com \
#   INGEST_KEY=your-key \
#   ./ingest-all-sics.sh

set -euo pipefail

APP_URL="${APP_URL:-https://sectorlens.cloudstrucc.com}"
INGEST_KEY="${INGEST_KEY:-}"
DELAY="${DELAY:-30}"   # seconds between SIC triggers (avoids overwhelming the server)

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
info() { echo -e "${CYAN}[→]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }

if [ -z "$INGEST_KEY" ]; then
  echo "Usage: INGEST_KEY=your-key APP_URL=https://... ./ingest-all-sics.sh"
  exit 1
fi

# All SIC codes to ingest (covers every sector in the seed + common ones)
SICS=(
  # Finance & Banking
  "6020" "6021" "6022" "6035" "6099" "6141" "6153" "6159"
  "6211" "6282" "6311" "6321" "6331" "6411" "6500" "6512" "6552" "6726"
  # Technology & Software
  "7372" "7374" "7311" "7361" "7389"
  # Healthcare
  "8062" "8011" "8049" "8093" "8099"
  # Energy & Utilities
  "4911" "4922" "4941" "1311"
  # Retail & Consumer
  "5411" "5311" "5800" "5500" "5600" "5700" "5900"
  # Manufacturing
  "3674" "3711" "3700" "3600" "3500" "3400" "3300" "3200" "2800" "2000"
  # Transportation
  "4011" "4200" "4500" "4813"
  # Services
  "7011" "8111" "8221" "8711" "8742" "8731" "8200" "8300" "8399"
  # Construction & Real Estate
  "1500" "1600" "6512"
  # Agriculture & Mining
  "0100" "0200" "1000" "1200"
)

TOTAL=${#SICS[@]}
DONE=0
JOBS=()

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   SectorLens — Full SIC Ingestion                           ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  App URL    : $APP_URL"
echo "  SIC codes  : $TOTAL sectors"
echo "  Delay      : ${DELAY}s between triggers"
echo ""
warn "This will take approximately $(( TOTAL * DELAY / 60 )) minutes."
read -p "  Proceed? (y/N) " -n 1 -r; echo ""
[[ ! $REPLY =~ ^[Yy]$ ]] && { warn "Cancelled."; exit 0; }
echo ""

# ── Trigger all SIC codes ─────────────────────────────────────────────────────
for SIC in "${SICS[@]}"; do
  DONE=$(( DONE + 1 ))
  info "[$DONE/$TOTAL] Triggering ingestion for SIC $SIC…"

  RESP=$(curl -s -X POST "${APP_URL}/api/ingest/trigger" \
    -H "Content-Type: application/json" \
    -H "X-Ingest-Key: ${INGEST_KEY}" \
    -d "{\"scope\":\"sic\",\"sic\":\"${SIC}\"}" 2>/dev/null)

  JOB_ID=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('jobId','error'))" 2>/dev/null || echo "error")

  if [ "$JOB_ID" = "error" ] || [ -z "$JOB_ID" ]; then
    warn "SIC $SIC — trigger failed: $RESP"
  else
    log "SIC $SIC — job started: $JOB_ID"
    JOBS+=("$SIC:$JOB_ID")
  fi

  # Don't delay after the last one
  if [ "$DONE" -lt "$TOTAL" ]; then
    sleep "$DELAY"
  fi
done

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   All triggers fired — checking final status…               ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── Wait for all jobs to complete then show summary ───────────────────────────
info "Waiting 60s for jobs to settle before checking status…"
sleep 60

TOTAL_ORGS=0
TOTAL_FIN=0
TOTAL_ERR=0

for ENTRY in "${JOBS[@]}"; do
  SIC="${ENTRY%%:*}"
  JOB_ID="${ENTRY##*:}"

  STATUS=$(curl -s "${APP_URL}/api/ingest/status/${JOB_ID}" \
    -H "X-Ingest-Key: ${INGEST_KEY}" 2>/dev/null)

  STATE=$(echo "$STATUS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','?'))" 2>/dev/null || echo "?")
  ORGS=$(echo "$STATUS"  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('orgs_upserted',0))" 2>/dev/null || echo "0")
  FIN=$(echo "$STATUS"   | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('financials_upserted',0))" 2>/dev/null || echo "0")
  ERR=$(echo "$STATUS"   | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('errors',0))" 2>/dev/null || echo "0")

  TOTAL_ORGS=$(( TOTAL_ORGS + ORGS ))
  TOTAL_FIN=$(( TOTAL_FIN + FIN ))
  TOTAL_ERR=$(( TOTAL_ERR + ERR ))

  printf "  SIC %-6s  %-10s  orgs: %-5s  financials: %-5s  errors: %s\n" \
    "$SIC" "$STATE" "$ORGS" "$FIN" "$ERR"
done

echo ""
echo "  ─────────────────────────────────────────────────────────────"
printf "  TOTAL               orgs: %-5s  financials: %-5s  errors: %s\n" \
  "$TOTAL_ORGS" "$TOTAL_FIN" "$TOTAL_ERR"
echo ""
log "Full ingestion complete. Visit $APP_URL to see the data."
echo ""