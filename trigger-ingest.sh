#!/usr/bin/env bash
# ── SectorLens — Manual Ingest Trigger ────────────────────────────────────────
# Reads INGEST_TRIGGER_KEY and APP_URL from .env automatically.
#
# Usage:
#   ./trigger-ingest.sh                    # full ingestion (all adapters)
#   ./trigger-ingest.sh --sic 6022         # single SIC code
#   ./trigger-ingest.sh --scope all        # explicit full run
#   ./trigger-ingest.sh --watch            # trigger + poll until complete
#
# Environment (read from .env automatically):
#   INGEST_TRIGGER_KEY   — your ingest API key
#   APP_URL              — your app URL (optional, auto-detected from Azure)

set -euo pipefail

# ── Load .env ─────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"

load_env() {
  local key="$1"
  if [ -f "$ENV_FILE" ]; then
    grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d'=' -f2- \
      | sed "s/^['\"]//;s/['\"]$//"
  fi
}

INGEST_KEY=$(load_env "INGEST_TRIGGER_KEY")
APP_URL=$(load_env "APP_URL")

# ── Parse flags ───────────────────────────────────────────────────────────────
SCOPE="all"
SIC=""
WATCH=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --sic)      SIC="$2";   SCOPE="sic"; shift 2 ;;
    --scope)    SCOPE="$2"; shift 2 ;;
    --watch)    WATCH=true;  shift ;;
    --key)      INGEST_KEY="$2"; shift 2 ;;
    --url)      APP_URL="$2";    shift 2 ;;
    --help|-h)
      echo "Usage: ./trigger-ingest.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --sic CODE     Trigger ingestion for a specific SIC code"
      echo "  --scope all    Full ingestion (default)"
      echo "  --watch        Poll and display progress until complete"
      echo "  --key KEY      Override INGEST_TRIGGER_KEY from .env"
      echo "  --url URL      Override APP_URL from .env"
      echo "  -h, --help     Show this help"
      exit 0
      ;;
    *) echo "Unknown flag: $1 (use --help)"; exit 1 ;;
  esac
done

# ── Validate ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
info() { echo -e "${CYAN}[→]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

if [ -z "$INGEST_KEY" ]; then
  err "INGEST_TRIGGER_KEY not found in .env and not provided via --key"
fi

# Auto-detect app URL from Azure if not set
if [ -z "$APP_URL" ]; then
  if command -v az &>/dev/null; then
    RG="${AZURE_RESOURCE_GROUP:-sectorlens-rg}"
    FOUND_APP=$(az webapp list --resource-group "$RG" --query "[0].defaultHostName" -o tsv 2>/dev/null || true)
    if [ -n "$FOUND_APP" ]; then
      APP_URL="https://${FOUND_APP}"
      warn "APP_URL not in .env — auto-detected: $APP_URL"
    fi
  fi
fi

if [ -z "$APP_URL" ]; then
  err "APP_URL not found in .env and could not be auto-detected. Add APP_URL=https://your-app.azurewebsites.net to .env"
fi

# ── Build request body ────────────────────────────────────────────────────────
if [ "$SCOPE" = "sic" ] && [ -n "$SIC" ]; then
  BODY="{\"scope\":\"sic\",\"sic\":\"${SIC}\"}"
  LABEL="SIC $SIC"
else
  BODY="{\"scope\":\"all\"}"
  LABEL="all sectors"
fi

# ── Trigger ───────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   SectorLens — Ingest Trigger                               ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  App URL : $APP_URL"
echo "  Scope   : $LABEL"
echo ""

info "Triggering ingestion…"
RESP=$(curl -s -X POST "${APP_URL}/api/ingest/trigger" \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Key: ${INGEST_KEY}" \
  -d "$BODY" 2>/dev/null)

JOB_ID=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('jobId',''))" 2>/dev/null || echo "")

if [ -z "$JOB_ID" ]; then
  err "Trigger failed. Response: $RESP"
fi

log "Job started: $JOB_ID"
echo ""

# ── Poll progress (if --watch) ────────────────────────────────────────────────
if $WATCH; then
  info "Watching progress (Ctrl+C to stop watching — job continues in background)"
  echo ""
  while true; do
    STATUS=$(curl -s "${APP_URL}/api/ingest/status/${JOB_ID}" \
      -H "X-Ingest-Key: ${INGEST_KEY}" 2>/dev/null)

    STATE=$(echo "$STATUS"   | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','?'))" 2>/dev/null || echo "?")
    DONE=$(echo "$STATUS"    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('adapters_done',0))" 2>/dev/null || echo "0")
    TOTAL=$(echo "$STATUS"   | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('adapters_total',0))" 2>/dev/null || echo "0")
    ORGS=$(echo "$STATUS"    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('orgs_upserted',0))" 2>/dev/null || echo "0")
    FIN=$(echo "$STATUS"     | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('financials_upserted',0))" 2>/dev/null || echo "0")
    ERRORS=$(echo "$STATUS"  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('errors',0))" 2>/dev/null || echo "0")
    ELAPSED=$(echo "$STATUS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('elapsed_seconds',0))" 2>/dev/null || echo "0")
    MSG=$(echo "$STATUS"     | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('last_message','') or '')" 2>/dev/null || echo "")

    # Progress bar
    if [ "$TOTAL" -gt 0 ]; then
      PCT=$(( DONE * 100 / TOTAL ))
      FILLED=$(( PCT / 5 ))
      BAR=$(printf '█%.0s' $(seq 1 $FILLED 2>/dev/null || echo ""))
      EMPTY=$(printf '░%.0s' $(seq 1 $(( 20 - FILLED )) 2>/dev/null || echo ""))
    else
      PCT=0; BAR=""; EMPTY="░░░░░░░░░░░░░░░░░░░░"
    fi

    printf "\r  [%s%s] %3d%%  adapters: %s/%s  orgs: %s  fin: %s  errors: %s  (%ss)    " \
      "$BAR" "$EMPTY" "$PCT" "$DONE" "$TOTAL" "$ORGS" "$FIN" "$ERRORS" "$ELAPSED"

    if [ "$STATE" = "complete" ] || [ "$STATE" = "failed" ]; then
      echo ""
      echo ""
      if [ "$STATE" = "complete" ]; then
        log "Job complete — $ORGS orgs, $FIN financials, $ERRORS errors"
      else
        err "Job failed. Check Azure logs: az webapp log tail --name <app> -g sectorlens-rg"
      fi
      break
    fi

    sleep 5
  done
else
  echo "  Poll status:"
  echo "  curl \"${APP_URL}/api/ingest/status/${JOB_ID}\" \\"
  echo "    -H \"X-Ingest-Key: \${INGEST_TRIGGER_KEY}\""
  echo ""
  echo "  Or watch live:"
  echo "  ./trigger-ingest.sh --watch --sic ${SIC:-all}"
  echo ""
fi