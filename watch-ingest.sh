#!/usr/bin/env bash
# ── SectorLens — Ingest Job Watcher ──────────────────────────────────────────
# Usage:
#   ./watch-ingest.sh <job_id>
#   ./watch-ingest.sh <job_id> --url https://your-app.azurewebsites.net

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"

load_env() {
  local key="$1"
  if [ -f "$ENV_FILE" ]; then
    grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d'=' -f2- \
      | sed "s/^['\"]//;s/['\"]$//"
  fi
}

KEY=$(load_env "INGEST_TRIGGER_KEY")
APP_URL=$(load_env "APP_URL")

JOB_ID="${1:-}"
shift || true

while [[ $# -gt 0 ]]; do
  case $1 in
    --url)  APP_URL="$2"; shift 2 ;;
    --key)  KEY="$2";     shift 2 ;;
    *) shift ;;
  esac
done

if [ -z "$JOB_ID" ]; then
  echo "Usage: ./watch-ingest.sh <job_id> [--url URL] [--key KEY]"
  exit 1
fi

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
YELLOW='\033[1;33m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'

format_status() {
  python3 - << PYEOF
import sys, json, os

raw = sys.stdin.read()
try:
    d = json.loads(raw)
except:
    print("  [error] Could not parse response")
    sys.exit(0)

status      = d.get('status', '?')
done        = d.get('adapters_done', 0)
total       = d.get('adapters_total', 0)
orgs        = d.get('orgs_upserted', 0)
fin         = d.get('financials_upserted', 0)
errors      = d.get('errors', 0)
elapsed     = max(0, int(d.get('elapsed_seconds', 0) or 0))
last_msg    = d.get('last_message', '') or ''
log         = d.get('log', []) or []

# ANSI
GRN = '\033[0;32m'; RED = '\033[0;31m'; CYN = '\033[0;36m'
YLW = '\033[1;33m'; BLD = '\033[1m';    DIM = '\033[2m'; NC = '\033[0m'

# Progress bar
pct = int(done * 100 / total) if total > 0 else 0
filled = pct // 5
bar = '█' * filled + '░' * (20 - filled)

mins = elapsed // 60
secs = elapsed % 60

print()
print(f"  {BLD}SectorLens Ingestion — {d.get('jobId','')} {NC}")
print(f"  {DIM}{'─' * 58}{NC}")
print(f"  Status   : {GRN if status=='complete' else YLW if status=='running' else RED}{status.upper()}{NC}")
print(f"  Progress : [{bar}] {pct}%  ({done}/{total} adapters)")
print(f"  Results  : {GRN}{orgs}{NC} orgs   {GRN}{fin}{NC} financials   {'🔴 ' + str(errors) + ' errors' if errors else GRN + '0 errors' + NC}")
print(f"  Elapsed  : {mins}m {secs}s")
print(f"  {DIM}{'─' * 58}{NC}")

# Build adapter display
# Map known adapter names to short labels
LABELS = {
    'FDIC BankFind':                    'FDIC BankFind',
    'SEC EDGAR XBRL':                   'SEC EDGAR',
    'ProPublica 990':                   'ProPublica 990',
    'Statistics Canada':                'StatsCan',
    'Companies House UK':               'Companies House',
    'Bank of Canada / Canadian Institutions': 'Bank of Canada',
    'ECB European Institutions':        'ECB / Europe',
    'World Bank / Global Institutions': 'World Bank',
    'GLEIF Global LEI':                 'GLEIF LEI',
    'OECD.Stat':                        'OECD.Stat',
    'Financial Modeling Prep':          'FMP',
    'OSFI Canadian Banks':              'OSFI Canada',
    'EBA European Banks':               'EBA Europe',
}

# Print completed adapters from log
for i, entry in enumerate(log, 1):
    name   = entry.get('adapter', '?')
    label  = LABELS.get(name, name)
    orgs_  = entry.get('orgs', 0)
    fin_   = entry.get('financials', 0)
    err_   = entry.get('errors', 0)
    st     = entry.get('status', 'ok')
    icon   = f'{GRN}✅{NC}' if st == 'ok' and not err_ else f'{RED}❌{NC}'
    note   = ''
    if orgs_ == 0 and fin_ == 0:
        note = f'{DIM}(skipped / unavailable){NC}'
    else:
        note = f'{GRN}{orgs_}{NC} orgs  {GRN}{fin_}{NC} fin'
        if err_:
            note += f'  {RED}{err_} errors{NC}'
    print(f"  {icon} {i:>2}/{total}  {BLD}{label:<22}{NC}  {note}")

# Print currently running adapter
if status == 'running' and done < total:
    i = done + 1
    print(f"  {YLW}⏳{NC} {i:>2}/{total}  {YLW}{'Running…':<22}{NC}  {DIM}{last_msg}{NC}")

# Print remaining adapters
for i in range(done + 2, total + 1):
    print(f"  {DIM}◌  {i:>2}/{total}  {'Queued':<22}  —{NC}")

print(f"  {DIM}{'─' * 58}{NC}")

if status == 'complete':
    print(f"  {GRN}{BLD}✓ Job complete — {orgs} orgs, {fin} financials, {errors} errors{NC}")
elif status == 'failed':
    print(f"  {RED}{BLD}✗ Job failed — check Azure logs{NC}")
else:
    print(f"  {DIM}Refreshing every 10s… (Ctrl+C to stop){NC}")
print()
PYEOF
}

echo ""
echo "  Watching job: $JOB_ID"
echo "  App URL: $APP_URL"
echo ""

while true; do
  clear
  STATUS=$(curl -s "${APP_URL}/api/ingest/status/${JOB_ID}" \
    -H "X-Ingest-Key: ${KEY}" 2>/dev/null)

  echo "$STATUS" | format_status

  STATE=$(echo "$STATUS" | python3 -c \
    "import sys,json; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null || echo "?")

  [ "$STATE" = "complete" ] || [ "$STATE" = "failed" ] && break

  sleep 10
done