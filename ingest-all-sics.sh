#!/usr/bin/env bash
set -euo pipefail

APP_URL="${APP_URL:-https://sectorlens.cloudstrucc.com}"
INGEST_KEY="${INGEST_KEY:-}"
DELAY="${DELAY:-30}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GREEN}[ok]${NC} $1"; }
info() { echo -e "${CYAN}[->]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }

if [ -z "$INGEST_KEY" ]; then
  echo "Usage: INGEST_KEY=your-key APP_URL=https://... ./ingest-all-sics.sh"
  exit 1
fi

SICS=(
  6020 6021 6022 6035 6099 6141 6153 6159
  6211 6282 6311 6321 6331 6411 6512 6552 6726
  7372 7374 7311 7361 7389
  8062 8011 8049 8093 8099
  4911 4922 4941 1311
  5411 5311 5800 5500 5600 5700 5900
  3674 3711 3600 3500 3400 3300 2800 2000
  4011 4200 4500 4813
  7011 8111 8221 8711 8742 8731 8200 8399
  1500 1600
)

TOTAL=${#SICS[@]}
DONE=0
declare -a JOBS

echo ""
echo "App URL   : $APP_URL"
echo "SIC codes : $TOTAL sectors"
echo "Delay     : ${DELAY}s between triggers"
echo ""
warn "This will take approximately $(( TOTAL * DELAY / 60 )) minutes."
read -p "  Proceed? (y/N) " -n 1 -r; echo ""
[[ ! $REPLY =~ ^[Yy]$ ]] && { warn "Cancelled."; exit 0; }
echo ""

for SIC in "${SICS[@]}"; do
  DONE=$(( DONE + 1 ))
  info "[$DONE/$TOTAL] Triggering SIC $SIC..."

  RESP=$(curl -s -X POST "${APP_URL}/api/ingest/trigger" \
    -H "Content-Type: application/json" \
    -H "X-Ingest-Key: ${INGEST_KEY}" \
    -d "{\"scope\":\"sic\",\"sic\":\"${SIC}\"}" 2>/dev/null)

  JOB_ID=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('jobId','error'))" 2>/dev/null || echo "error")

  if [ "$JOB_ID" = "error" ] || [ -z "$JOB_ID" ]; then
    warn "SIC $SIC failed: $RESP"
  else
    log "SIC $SIC started: $JOB_ID"
    JOBS+=("${SIC}:${JOB_ID}")
  fi

  if [ "$DONE" -lt "$TOTAL" ]; then
    sleep "$DELAY"
  fi
done

echo ""
info "All triggers fired. Waiting 60s before checking status..."
sleep 60

TOTAL_ORGS=0
TOTAL_FIN=0

for ENTRY in "${JOBS[@]}"; do
  SIC="${ENTRY%%:*}"
  JOB_ID="${ENTRY##*:}"

  STATUS=$(curl -s "${APP_URL}/api/ingest/status/${JOB_ID}" \
    -H "X-Ingest-Key: ${INGEST_KEY}" 2>/dev/null)

  STATE=$(echo "$STATUS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','?'))" 2>/dev/null || echo "?")
  ORGS=$(echo "$STATUS"  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('orgs_upserted',0))" 2>/dev/null || echo "0")
  FIN=$(echo "$STATUS"   | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('financials_upserted',0))" 2>/dev/null || echo "0")

  TOTAL_ORGS=$(( TOTAL_ORGS + ORGS ))
  TOTAL_FIN=$(( TOTAL_FIN + FIN ))

  printf "  SIC %-6s  %-10s  orgs: %-5s  fin: %s\n" "$SIC" "$STATE" "$ORGS" "$FIN"
done

echo ""
echo "  TOTAL   orgs: $TOTAL_ORGS   financials: $TOTAL_FIN"
echo ""
log "Done. Visit $APP_URL"
