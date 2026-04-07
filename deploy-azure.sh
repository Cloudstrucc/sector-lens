#!/usr/bin/env bash
set -euo pipefail

# ── Parse flags ────────────────────────────────────────────────────────────────
UPDATE_ONLY=false
SETTINGS_ONLY=false
RESET=false

for arg in "$@"; do
  case $arg in
    --update-only)   UPDATE_ONLY=true ;;
    --settings-only) SETTINGS_ONLY=true ;;
    --reset)         RESET=true ;;
    --help|-h)
      echo "Usage: ./deploy-azure.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  (no flags)       Normal deploy — creates resources if needed, deploys code"
      echo "  --update-only    Deploy code only (skip resource creation/checks)"
      echo "  --settings-only  Update App Settings only (no code deploy)"
      echo "  --reset          FULL RESET: wipe SQLite DB, re-apply all env vars from .env,"
      echo "                   run fresh migrations + seed on next boot. Data will be LOST."
      echo "  -h, --help       Show this help"
      echo ""
      echo "Environment variable overrides:"
      echo "  AZURE_RESOURCE_GROUP  Resource group name     (default: sectorlens-rg)"
      echo "  AZURE_APP_NAME        App Service name        (auto-discovered if blank)"
      echo "  AZURE_LOCATION        Azure region            (default: canadacentral)"
      echo "  AZURE_SKU             App Service plan SKU    (default: B1)"
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg  (use --help for usage)"
      exit 1
      ;;
  esac
done

# ── Configuration ──────────────────────────────────────────────────────────────
RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-sectorlens-rg}"
APP_NAME="${AZURE_APP_NAME:-}"
LOCATION="${AZURE_LOCATION:-canadacentral}"
SKU="${AZURE_SKU:-B1}"
NODE_VERSION="20-lts"
PLAN_NAME=""          # derived from APP_NAME below

# ── Colors & logging ───────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
info() { echo -e "${CYAN}[→]${NC} $1"; }

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   SectorLens — Azure App Service Deployment                 ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── Preflight checks ───────────────────────────────────────────────────────────
info "Running preflight checks..."

if ! command -v az &> /dev/null; then
  err "Azure CLI not found. Install: https://learn.microsoft.com/en-us/cli/azure/install-azure-cli"
fi

if ! az account show &> /dev/null; then
  err "Not logged in to Azure. Run: az login"
fi

if ! command -v zip &> /dev/null; then
  err "'zip' not found. Install via Homebrew (macOS): brew install zip"
fi

if ! command -v python3 &> /dev/null; then
  err "'python3' not found. Required for .env parsing."
fi

SUBSCRIPTION=$(az account show --query "name" -o tsv)
log "Azure subscription: $SUBSCRIPTION"

if [ ! -f "package.json" ]; then
  err "No package.json found. Run this script from the sectorlens project root."
fi

if [ ! -f "src/server.js" ]; then
  err "No src/server.js found. Run this script from the sectorlens project root."
fi

# ── Discover existing resources ────────────────────────────────────────────────
EXISTING_APP=false
EXISTING_RG=false

if az group show --name "$RESOURCE_GROUP" &> /dev/null; then
  EXISTING_RG=true
  log "Found existing resource group: $RESOURCE_GROUP"
fi

if [ -z "$APP_NAME" ]; then
  if $EXISTING_RG; then
    FOUND_APPS=$(az webapp list --resource-group "$RESOURCE_GROUP" --query "[].name" -o tsv 2>/dev/null || true)
    if [ -n "$FOUND_APPS" ]; then
      APP_COUNT=$(echo "$FOUND_APPS" | wc -l | tr -d ' ')
      if [ "$APP_COUNT" -eq 1 ]; then
        APP_NAME="$FOUND_APPS"
        EXISTING_APP=true
        log "Found existing app: $APP_NAME"
      else
        echo ""
        echo "  Multiple apps found in $RESOURCE_GROUP:"
        echo "$FOUND_APPS" | nl -ba
        echo ""
        read -p "  Enter number or app name: " APP_CHOICE
        [ -z "$APP_CHOICE" ] && err "No app selected."
        if [[ "$APP_CHOICE" =~ ^[0-9]+$ ]]; then
          APP_NAME=$(echo "$FOUND_APPS" | sed -n "${APP_CHOICE}p")
          [ -z "$APP_NAME" ] && err "Invalid selection: $APP_CHOICE"
        else
          APP_NAME="$APP_CHOICE"
        fi
        EXISTING_APP=true
      fi
    else
      APP_NAME="sectorlens-$(openssl rand -hex 4)"
      warn "No existing apps found. Will create: $APP_NAME"
    fi
  else
    APP_NAME="sectorlens-$(openssl rand -hex 4)"
  fi
else
  if $EXISTING_RG && az webapp show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
    EXISTING_APP=true
    log "Found existing app: $APP_NAME"
  fi
fi

PLAN_NAME="${APP_NAME}-plan"

# ── Show deployment plan ───────────────────────────────────────────────────────
echo ""
if $RESET; then
  echo -e "  ┌──────────────────────────────────────────┐"
  echo -e "  │  ${RED}${BOLD}MODE: FULL RESET / REINSTALL${NC}              │"
  echo -e "  │  SQLite DB will be ${RED}DESTROYED${NC}              │"
  echo -e "  │  All env vars re-applied from .env       │"
  echo -e "  │  All user + financial data will be ${RED}LOST${NC}  │"
  echo -e "  └──────────────────────────────────────────┘"
elif $SETTINGS_ONLY; then
  echo "  ┌─────────────────────────────────────┐"
  echo "  │  MODE: Update App Settings only      │"
  echo "  └─────────────────────────────────────┘"
elif $EXISTING_APP; then
  echo "  ┌─────────────────────────────────────┐"
  echo "  │  MODE: Update existing deployment    │"
  echo "  └─────────────────────────────────────┘"
else
  echo "  ┌─────────────────────────────────────┐"
  echo "  │  MODE: Fresh deployment              │"
  echo "  └─────────────────────────────────────┘"
fi
echo ""
echo "  Resource Group : $RESOURCE_GROUP $(if $EXISTING_RG; then echo '(exists)'; else echo '(will create)'; fi)"
echo "  App Name       : $APP_NAME $(if $EXISTING_APP; then echo '(exists)'; else echo '(will create)'; fi)"
echo "  Location       : $LOCATION"
if ! $EXISTING_APP; then
  echo "  Plan / SKU     : $PLAN_NAME / $SKU"
fi
echo "  Node.js        : $NODE_VERSION"
echo ""

$UPDATE_ONLY  && ! $EXISTING_APP && err "--update-only requires an existing app in $RESOURCE_GROUP"
$SETTINGS_ONLY && ! $EXISTING_APP && err "--settings-only requires an existing app in $RESOURCE_GROUP"
$RESET        && ! $EXISTING_APP && err "--reset requires an existing app. Run a normal deploy first."

# ── Confirmation ───────────────────────────────────────────────────────────────
if $RESET; then
  echo -e "  ${RED}${BOLD}⚠  WARNING: This will DELETE /home/data/sectorlens.db on the server.${NC}"
  echo -e "  ${RED}${BOLD}   All registered users, subscriptions, and financial data will be lost.${NC}"
  echo -e "  ${RED}${BOLD}   Migrations + seed data will re-run automatically on next boot.${NC}"
  echo ""
  read -p "  Type 'RESET' to confirm: " CONFIRM_RESET
  if [ "$CONFIRM_RESET" != "RESET" ]; then
    warn "Reset cancelled."
    exit 0
  fi
  echo ""
else
  read -p "  Proceed? (y/N) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    warn "Deployment cancelled."
    exit 0
  fi
fi

# ── Helper: read setting from .env, fall back to prompt ───────────────────────
ENV_FILE=""
[ -f ".env" ]            && ENV_FILE=".env"
[ -f ".env.production" ] && ENV_FILE=".env.production"

read_setting() {
  local KEY="$1" PROMPT="$2" DEFAULT="$3" IS_SECRET="${4:-false}" VALUE=""

  if [ -n "$ENV_FILE" ]; then
    VALUE=$(grep -E "^${KEY}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d'=' -f2- \
            | sed 's/^["'"'"']//;s/["'"'"']$//' || true)
  fi

  # Skip obvious placeholder values
  case "$VALUE" in
    *CHANGE_ME*|*CHANGE-ME*|*your-*|*localhost*) VALUE="" ;;
  esac

  if [ -n "$VALUE" ]; then
    if $IS_SECRET; then
      echo -e "${GREEN}[✓]${NC}   $KEY = ********** (from ${ENV_FILE})" >&2
    else
      echo -e "${GREEN}[✓]${NC}   $KEY = $VALUE (from ${ENV_FILE})" >&2
    fi
    echo "$VALUE"
    return
  fi

  # Interactive prompt
  if $IS_SECRET; then
    read -s -p "  Enter $PROMPT (required): " VALUE
    echo "" >&2
  else
    [ -n "$DEFAULT" ] && read -p "  Enter $PROMPT [$DEFAULT]: " VALUE \
                      || read -p "  Enter $PROMPT: " VALUE
    [ -z "$VALUE" ] && VALUE="$DEFAULT"
  fi

  # Return empty string — callers decide if empty is an error
  echo "$VALUE"
}

# ── Settings-only mode ─────────────────────────────────────────────────────────
if $SETTINGS_ONLY; then
  info "Updating App Settings for: $APP_NAME"
  echo ""

  echo "  Leave blank to keep existing values."
  echo ""

  read -s -p "  SESSION_SECRET (new, or blank to keep): " NEW_SESSION_SECRET; echo ""
  read -p "  SMTP_HOST (or blank to keep): " NEW_SMTP_HOST
  read -p "  SMTP_USER (or blank to keep): " NEW_SMTP_USER
  read -s -p "  SMTP_PASS (or blank to keep): " NEW_SMTP_PASS; echo ""
  read -p "  FMP_API_KEY (Financial Modeling Prep, or blank): " NEW_FMP_KEY

  SETTINGS_ARGS=()
  [ -n "$NEW_SESSION_SECRET" ] && SETTINGS_ARGS+=("SESSION_SECRET=$NEW_SESSION_SECRET")
  [ -n "$NEW_SMTP_HOST" ]      && SETTINGS_ARGS+=("SMTP_HOST=$NEW_SMTP_HOST")
  [ -n "$NEW_SMTP_USER" ]      && SETTINGS_ARGS+=("SMTP_USER=$NEW_SMTP_USER")
  [ -n "$NEW_SMTP_PASS" ]      && SETTINGS_ARGS+=("SMTP_PASS=$NEW_SMTP_PASS")
  [ -n "$NEW_FMP_KEY" ]        && SETTINGS_ARGS+=("FMP_API_KEY=$NEW_FMP_KEY")

  if [ ${#SETTINGS_ARGS[@]} -gt 0 ]; then
    az webapp config appsettings set \
      --name "$APP_NAME" \
      --resource-group "$RESOURCE_GROUP" \
      --settings "${SETTINGS_ARGS[@]}" \
      --output none
    log "Updated ${#SETTINGS_ARGS[@]} setting(s)"
    info "Restarting app to apply changes..."
    az webapp restart --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --output none
    log "App restarted"
  else
    warn "No settings changed."
  fi

  echo ""
  log "Done. No code deployed."
  APP_URL="https://${APP_NAME}.azurewebsites.net"
  echo ""
  echo "  App URL: $APP_URL"
  echo ""
  exit 0
fi

# ── Create resources (fresh deploy only) ──────────────────────────────────────
if ! $UPDATE_ONLY && ! $EXISTING_APP; then
  info "Gathering required settings for first-time deployment..."
  echo ""

  # ── Session secret — try .env first, then auto-generate ──────────────────────
  SESSION_SECRET=""
  if [ -n "$ENV_FILE" ]; then
    SESSION_SECRET=$(grep -E "^SESSION_SECRET=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d'=' -f2- | sed "s/^['\"']//;s/['\"']$//" || true)
    case "$SESSION_SECRET" in *CHANGE_ME*|*CHANGE-ME*|*dev-secret*|*CHANGE-IN-PRODUCTION*) SESSION_SECRET="" ;; esac
  fi
  if [ -z "$SESSION_SECRET" ]; then
    read -s -p "  SESSION_SECRET (press Enter to auto-generate): " SESSION_SECRET
    echo ""
  fi
  if [ -z "$SESSION_SECRET" ]; then
    SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))" 2>/dev/null || openssl rand -hex 64)
    warn "Auto-generated SESSION_SECRET (save this value!):"
    echo "  ${SESSION_SECRET}" >&2
    echo ""
  else
    log "SESSION_SECRET loaded"
  fi

  # ── Optional SMTP + API settings ──────────────────────────────────────────────
  # Read from .env if present, otherwise prompt (all optional — blank = skip)
  _read_optional() {
    local KEY="$1" PROMPT="$2" DEFAULT="${3:-}" VAL=""
    if [ -n "$ENV_FILE" ]; then
      VAL=$(grep -E "^${KEY}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d'=' -f2- | sed "s/^['\"']//;s/['\"']$//" || true)
      case "$VAL" in *CHANGE_ME*|*CHANGE-ME*|*your-*|*localhost*) VAL="" ;; esac
    fi
    if [ -n "$VAL" ]; then
      log "$KEY loaded from ${ENV_FILE}"
      echo "$VAL"; return
    fi
    [ -n "$DEFAULT" ] && read -p "  $PROMPT [$DEFAULT]: " VAL || read -p "  $PROMPT (blank to skip): " VAL
    [ -z "$VAL" ] && VAL="$DEFAULT"
    echo "$VAL"
  }

  SMTP_HOST=$(   _read_optional "SMTP_HOST"    "SMTP host")
  SMTP_PORT=$(   _read_optional "SMTP_PORT"    "SMTP port"     "587")
  SMTP_USER=$(   _read_optional "SMTP_USER"    "SMTP username")
  SMTP_PASS=""
  if [ -n "$SMTP_HOST" ]; then
    if [ -n "$ENV_FILE" ]; then
      SMTP_PASS=$(grep -E "^SMTP_PASS=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d'=' -f2- | sed "s/^['\"']//;s/['\"']$//" || true)
    fi
    if [ -z "$SMTP_PASS" ]; then
      read -s -p "  SMTP password (blank to skip): " SMTP_PASS; echo ""
    else
      log "SMTP_PASS loaded from ${ENV_FILE}"
    fi
  fi
  FMP_API_KEY=$( _read_optional "FMP_API_KEY"  "Financial Modeling Prep API key")

  echo ""
  info "Creating resource group: $RESOURCE_GROUP ($LOCATION)..."
  az group create \
    --name "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --output none
  log "Resource group ready"

  info "Creating App Service plan: $PLAN_NAME ($SKU Linux)..."
  az appservice plan create \
    --name "$PLAN_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --sku "$SKU" \
    --is-linux \
    --output none
  log "App Service plan ready"

  info "Creating Web App: $APP_NAME (Node.js $NODE_VERSION)..."
  az webapp create \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --plan "$PLAN_NAME" \
    --runtime "NODE:${NODE_VERSION}" \
    --output none
  log "Web App created"

  info "Configuring startup command and persistent storage..."
  az webapp config set \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --startup-file "boot.sh" \
    --output none

  # Enable persistent file system so /home/data/sectorlens.db survives deploys
  az webapp config appsettings set \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --settings \
      WEBSITES_ENABLE_APP_SERVICE_STORAGE=true \
      SCM_DO_BUILD_DURING_DEPLOYMENT=true \
    --output none
  log "Startup + storage configured"

  info "Applying App Settings..."
  INIT_SETTINGS=(
    "NODE_ENV=production"
    "PORT=8080"
    "DB_PATH=/home/data/sectorlens.db"
    "DB_DIR=/home/data"
    "SESSION_SECRET=${SESSION_SECRET}"
    "WEBSITE_NODE_DEFAULT_VERSION=~20"
    "SCM_DO_BUILD_DURING_DEPLOYMENT=true"
    "WEBSITES_ENABLE_APP_SERVICE_STORAGE=true"
  )
  [ -n "$SMTP_HOST" ]    && INIT_SETTINGS+=("SMTP_HOST=${SMTP_HOST}")
  [ -n "$SMTP_PORT" ]    && INIT_SETTINGS+=("SMTP_PORT=${SMTP_PORT}")
  [ -n "$SMTP_USER" ]    && INIT_SETTINGS+=("SMTP_USER=${SMTP_USER}")
  [ -n "$SMTP_PASS" ]    && INIT_SETTINGS+=("SMTP_PASS=${SMTP_PASS}")
  [ -n "$FMP_API_KEY" ]  && INIT_SETTINGS+=("FMP_API_KEY=${FMP_API_KEY}")

  az webapp config appsettings set \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --settings "${INIT_SETTINGS[@]}" \
    --output none
  log "App Settings applied (${#INIT_SETTINGS[@]} values)"
fi

# ── RESET: stop app + delete SQLite DB ────────────────────────────────────────
if $RESET; then
  info "Stopping app for reset..."
  az webapp stop --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --output none
  log "App stopped"

  info "Deleting SQLite database via Kudu REST API..."
  KUDU_CREDS=$(az webapp deployment list-publishing-credentials \
    --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" \
    --query "{u:publishingUserName,p:publishingPassword}" -o tsv 2>/dev/null)
  KUDU_USER=$(echo "$KUDU_CREDS" | awk '{print $1}')
  KUDU_PASS=$(echo "$KUDU_CREDS" | awk '{print $2}')

  # Delete database file via Kudu VFS API
  curl -s -X DELETE \
    -u "${KUDU_USER}:${KUDU_PASS}" \
    "https://${APP_NAME}.scm.azurewebsites.net/api/vfs/home/data/sectorlens.db" \
    -o /dev/null && log "Database deleted" || warn "Could not delete DB via Kudu (may not exist yet)"

  info "Re-applying App Settings from .env..."
fi

# ── Auto-sync .env settings to Azure ──────────────────────────────────────────
if [ -f ".env" ] && ! $SETTINGS_ONLY; then
  info "Syncing .env settings to Azure App Settings..."

  # Keys that are dev-only or explicitly overridden for production
  SKIP_KEYS="PORT|NODE_ENV|DB_PATH|DB_DIR"

  SETTINGS_JSON=$(mktemp /tmp/sl-settings-XXXXX.json)

  python3 - <<PYEOF
import json, re

skip   = set("$SKIP_KEYS".split("|"))
out    = []

with open(".env") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = re.match(r'^([A-Za-z_][A-Za-z0-9_]*)=(.*)', line)
        if not m:
            continue
        key, val = m.group(1), m.group(2).strip()
        # Strip surrounding quotes
        if len(val) >= 2 and val[0] == val[-1] and val[0] in ('"', "'"):
            val = val[1:-1]
        if key in skip:
            continue
        # Skip obvious placeholder values
        if any(p in val for p in ("CHANGE_ME", "CHANGE-ME", "your-", "<", "CHANGE-IN-PRODUCTION")):
            continue
        # Skip localhost-specific values
        if "localhost" in val and key not in ("SESSION_SECRET",):
            continue
        out.append({"name": key, "value": val, "slotSetting": False})

# Always enforce production values
out += [
    {"name": "NODE_ENV",                          "value": "production",  "slotSetting": False},
    {"name": "PORT",                              "value": "8080",        "slotSetting": False},
    {"name": "DB_PATH",                           "value": "/home/data/sectorlens.db", "slotSetting": False},
    {"name": "DB_DIR",                            "value": "/home/data",  "slotSetting": False},
    {"name": "SCM_DO_BUILD_DURING_DEPLOYMENT",    "value": "true",       "slotSetting": False},
    {"name": "WEBSITES_ENABLE_APP_SERVICE_STORAGE","value": "true",       "slotSetting": False},
    {"name": "WEBSITE_NODE_DEFAULT_VERSION",      "value": "~20",         "slotSetting": False},
]

with open("$SETTINGS_JSON", "w") as f:
    json.dump(out, f)
print(f"  {len(out)} settings prepared")
PYEOF

  SETTING_COUNT=$(python3 -c "import json; print(len(json.load(open('$SETTINGS_JSON'))))" 2>/dev/null || echo "0")

  if [ "$SETTING_COUNT" -gt 0 ]; then
    az webapp config appsettings set \
      --name "$APP_NAME" \
      --resource-group "$RESOURCE_GROUP" \
      --settings "@${SETTINGS_JSON}" \
      --output none
    log "Synced $SETTING_COUNT settings from .env to Azure"
  else
    warn "No .env settings to sync (all were placeholders or skipped)"
  fi

  rm -f "$SETTINGS_JSON"
fi

# ── Package and deploy via ZIP ─────────────────────────────────────────────────
info "Packaging application (source only — Azure builds node_modules on Linux)..."
mkdir -p data

DEPLOY_ZIP="/tmp/sectorlens-deploy-$(date +%s).zip"

zip -r "$DEPLOY_ZIP" . \
  --exclude "*.git*" \
  --exclude ".env" \
  --exclude ".env.*" \
  --exclude "deploy-azure.sh" \
  --exclude "node_modules/*" \
  --exclude "data/*.db" \
  --exclude "data/*.db-wal" \
  --exclude "data/*.db-shm" \
  --exclude ".DS_Store" \
  --exclude "*.log" \
  --exclude "*.zip" \
  > /dev/null

DEPLOY_SIZE=$(du -sh "$DEPLOY_ZIP" | cut -f1)
log "Package ready: $DEPLOY_SIZE (npm install will run on Azure Linux)"

info "Deploying to Azure (this may take 3–6 minutes for fresh npm install)..."
az webapp deploy \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --src-path "$DEPLOY_ZIP" \
  --type zip \
  --async true \
  --output none

# ── Poll Kudu for deployment completion ────────────────────────────────────────
info "Waiting for deployment to complete..."

KUDU_CREDS=$(az webapp deployment list-publishing-credentials \
  --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" \
  --query "{u:publishingUserName,p:publishingPassword}" -o tsv 2>/dev/null)
KUDU_USER=$(echo "$KUDU_CREDS" | awk '{print $1}')
KUDU_PASS=$(echo "$KUDU_CREDS" | awk '{print $2}')

DEPLOY_DONE=false
for i in $(seq 1 36); do   # max ~6 minutes
  sleep 10
  STATUS=$(curl -s -u "${KUDU_USER}:${KUDU_PASS}" \
    "https://${APP_NAME}.scm.azurewebsites.net/api/deployments/latest" 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null || echo "")
  if [ "$STATUS" = "4" ]; then
    DEPLOY_DONE=true
    break
  elif [ "$STATUS" = "3" ]; then
    echo ""
    err "Deployment failed. View logs: az webapp log tail --name $APP_NAME -g $RESOURCE_GROUP"
  fi
  printf "."
done
echo ""

if $DEPLOY_DONE; then
  log "Deployment complete"
else
  warn "Deployment may still be in progress — check logs if the app doesn't respond"
fi

rm -f "$DEPLOY_ZIP"

# ── Start app + health check (reset mode stopped the app earlier) ──────────────
if $RESET; then
  info "Starting app..."
  az webapp start --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --output none
  log "App started"
fi

info "Waiting for app to initialize (20s)..."
sleep 20

APP_URL="https://${APP_NAME}.azurewebsites.net"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${APP_URL}/" 2>/dev/null || echo "000")

if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "302" ]; then
  log "App is responding (HTTP $HTTP_STATUS)"
else
  warn "App returned HTTP $HTTP_STATUS — may still be warming up"
  warn "Check logs: az webapp log tail --name $APP_NAME -g $RESOURCE_GROUP"
fi

# ── Done ───────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
if $RESET; then
echo "║   Full Reset Complete!                                      ║"
elif $EXISTING_APP; then
echo "║   Deployment Update Complete!                               ║"
else
echo "║   Fresh Deployment Complete!                                ║"
fi
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  App URL:        $APP_URL"
echo "  Resource Group: $RESOURCE_GROUP"
echo "  App Name:       $APP_NAME"
echo ""
if $RESET; then
  echo -e "  ${GREEN}Status:${NC}  Fresh database — migrations + seed will run on first request"
  echo ""
fi
echo "  Commands:"
echo "  ─────────────────────────────────────────────────────────────"
echo "  Redeploy code:    ./deploy-azure.sh --update-only"
echo "  Update settings:  ./deploy-azure.sh --settings-only"
echo "  Full reset:       ./deploy-azure.sh --reset"
echo "  View logs:        az webapp log tail --name $APP_NAME -g $RESOURCE_GROUP"
echo "  Restart app:      az webapp restart --name $APP_NAME -g $RESOURCE_GROUP"
echo "  SSH into app:     az webapp ssh --name $APP_NAME -g $RESOURCE_GROUP"
echo "  Delete all:       az group delete --name $RESOURCE_GROUP --yes --no-wait"
echo ""
if ! $EXISTING_APP && ! $RESET; then
  warn "SQLite is single-instance only. Do NOT enable auto-scaling on this App Service Plan."
  warn "Scale path: migrate to Turso (cloud SQLite) if multi-instance is needed."
  echo ""
fi
