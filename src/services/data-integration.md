# SectorLens — Data Ingestion Guide

This document covers all data sources used by SectorLens, how to register for API keys, what each source provides, estimated organization coverage per SIC code, and step-by-step instructions for running ingestion locally and in production.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Data Sources](#data-sources)
3. [Environment Setup](#environment-setup)
4. [Running Ingestion](#running-ingestion)
5. [SIC Coverage by Source](#sic-coverage-by-source)
6. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

SectorLens uses a pipeline of **13 adapters** that run sequentially during each ingestion job. Each adapter pulls from a different data source, upserts organizations and financials into the SQLite database, and reports progress via the job status API.

```
IngestService
├── FDIC BankFind          (US banks — 4,500+ institutions)
├── SEC EDGAR XBRL         (All US public companies — 10,000+)
├── ProPublica 990         (US nonprofits — Form 990 data)
├── Statistics Canada      (CA macro sector data)
├── Companies House UK     (UK registered companies)
├── Bank of Canada         (25 major CA institutions — hardcoded)
├── ECB / European Banks   (30 major EU institutions — hardcoded)
├── World Bank / Global    (32 global institutions — hardcoded)
├── GLEIF LEI              (Global entity registry)
├── OECD.Stat              (Macro statistics — 38 OECD members)
└── Financial Modeling Prep (~200 major US tickers)
```

Jobs run nightly at **2am UTC** via cron and can be triggered manually at any time via the trigger script or the API.

---

## Data Sources

### 1. SEC EDGAR XBRL

**The primary source — covers all US public companies with real 10-K financial data.**

| Property     | Value                                                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Base URL     | `https://data.sec.gov`                                                                                               |
| Auth         | None required                                                                                                          |
| Rate limit   | 10 req/sec (120ms delay enforced)                                                                                      |
| Coverage     | ~10,000 NYSE / Nasdaq / OTC listed companies                                                                           |
| SICs covered | All 124 SIC codes                                                                                                      |
| Financials   | Revenue, net income, gross profit, operating income, total assets, shareholders equity, all derived margins and ratios |

**How it works:**

1. Downloads `data.sec.gov/files/company_tickers_exchange.json` — full list of listed companies with CIKs
2. Checks each company's SIC code via `data.sec.gov/submissions/CIK{n}.json`
3. Fetches XBRL financial facts from `data.sec.gov/api/xbrl/companyfacts/CIK{n}.json`

**Registration:** No registration required. Completely free and public.

**Azure note:** `www.sec.gov` (company search UI) is blocked on Azure B1 shared IPs. The adapter uses `data.sec.gov` exclusively which is **not blocked** (confirmed returning HTTP 200 from Azure B1).

---

### 2. FDIC BankFind Suite

**Covers all FDIC-insured US banks and savings institutions.**

| Property     | Value                                                                      |
| ------------ | -------------------------------------------------------------------------- |
| Base URL     | `https://banks.fdic.gov/api`                                             |
| Auth         | None required                                                              |
| Rate limit   | 60s retry-after when limited (adapter skips if >5s)                        |
| Coverage     | ~4,500 active FDIC-insured institutions                                    |
| SICs covered | 6020, 6021, 6022, 6035                                                     |
| Financials   | Total assets, net income, ROA, ROE, Tier 1 capital ratio, efficiency ratio |

**Registration:** No registration required. Public API.

**Azure note:** `banks.fdic.gov` is blocked on Azure B1. The adapter detects this and falls back to FMP for the top 20 US banks automatically. To get full FDIC coverage (4,500+ banks), run ingestion from your local machine pointing at a local DB.

---

### 3. Financial Modeling Prep (FMP)

**Covers major US public companies with real income statement data.**

| Property     | Value                                                                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base URL     | `https://financialmodelingprep.com/stable/`                                                                                                        |
| Auth         | `FMP_API_KEY`required in `.env`                                                                                                                  |
| Rate limit   | ~250 requests/day (free tier)                                                                                                                        |
| Coverage     | ~200 major US tickers across 25 SIC codes                                                                                                            |
| SICs covered | 6022, 7372, 3674, 4911, 4813, 1311, 8062, 6311, 6331, 6211, 6726, 5411, 5800, 3711, 4011, 4200, 4500, 2800, 8731, 8742, 2000, 7011, 7311, 4922, 5311 |
| Financials   | Revenue, net income, gross profit, operating income, total assets, shareholders equity, all margins                                                  |

**Registration:**

1. Go to **https://financialmodelingprep.com/register**
2. Create a free account
3. From your dashboard, copy your API key
4. Add to `.env`: `FMP_API_KEY=your_key_here`

**Free tier limitations:**

* US NYSE/Nasdaq stocks only
* ~250 API calls per day
* International tickers (TSX, Euronext) require a paid plan

**Upgrading:** The Starter plan (~$14/month) unlocks international stocks and higher limits. Visit https://financialmodelingprep.com/developer/docs/pricing or email `support@financialmodelingprep.com`.

> **Important:** Use the `/stable/` endpoint. The legacy `/api/v3/` and `/api/v4/` endpoints were deprecated in August 2025 and return an error for all users.

---

### 4. ProPublica Nonprofit Explorer

**Covers all US nonprofits that file IRS Form 990.**

| Property     | Value                                                      |
| ------------ | ---------------------------------------------------------- |
| Base URL     | `https://projects.propublica.org/nonprofits/api/v2`      |
| Auth         | None required                                              |
| Rate limit   | No published limit (500ms delay applied)                   |
| Coverage     | ~300 nonprofits per run (highest revenue)                  |
| SICs covered | 8062, 8200, 8399, 8641, 8661, 8699, 7929, 8322, 8300, 8111 |
| Financials   | Total revenue, net income, total assets (from Form 990)    |

**Registration:** No registration required. Completely free.

**How it works:** Searches for the top nonprofits by revenue and maps NTEE (National Taxonomy of Exempt Entities) major group codes to the nearest SIC code:

| NTEE Group          | Maps to SIC |
| ------------------- | ----------- |
| A — Arts & Culture | 7929        |
| B — Education      | 8200        |
| E — Health         | 8062        |
| P — Human Services | 8399        |
| R — Civil Rights   | 8641        |
| X — Religion       | 8661        |

---

### 5. Bank of Canada

**Covers major Canadian financial institutions with real 2024 data.**

| Property     | Value                                                            |
| ------------ | ---------------------------------------------------------------- |
| Base URL     | `https://www.bankofcanada.ca/valet/`                           |
| Auth         | None required                                                    |
| Coverage     | 25 hardcoded Canadian institutions                               |
| SICs covered | 6022, 6311, 6331, 6726, 4011, 4600, 1311, 7372                   |
| Financials   | Real 2024 annual data (revenue, net income, assets, all margins) |

**Registration:** No registration required.

**Institutions covered:** RBC, TD Bank, Scotiabank, BMO, CIBC, National Bank, Manulife, Sun Life, Great-West Lifeco, Intact Financial, Fairfax Financial, Brookfield Asset Management, CP Rail, CN Rail, Enbridge, TC Energy, Canadian Natural Resources, Suncor, Shopify, OpenText, and more.

---

### 6. ECB / European Banking Authority

**Covers major European financial institutions with real 2024 data.**

| Property     | Value                              |
| ------------ | ---------------------------------- |
| Auth         | None required                      |
| Coverage     | 30 hardcoded European institutions |
| SICs covered | 6022, 6311, 6331, 7372, 3674       |
| Countries    | DE, FR, ES, IT, NL, SE, CH, DK, NO |
| Financials   | Real 2024 data                     |

**Registration:** No registration required.

**Institutions covered:** Deutsche Bank, Commerzbank, BNP Paribas, Société Générale, Crédit Agricole, AXA, Santander, BBVA, UniCredit, Intesa Sanpaolo, ING, ASML, SAP, Siemens, UBS, Nordea, Swedbank, and more.

---

### 7. World Bank / Global Institutions

**Covers major financial institutions from 8 countries.**

| Property     | Value                            |
| ------------ | -------------------------------- |
| Auth         | None required                    |
| Coverage     | 32 hardcoded global institutions |
| SICs covered | 6022, 6311, 6726                 |
| Countries    | JP, AU, GB, CN, IN, SG, KR, BR   |
| Financials   | Real 2024 data                   |

**Registration:** No registration required.

**Institutions covered:** MUFG, SMFG, Mizuho (Japan), CBA, Westpac, ANZ (Australia), HSBC, Barclays, Lloyds (UK), ICBC, CCB (China), HDFC, ICICI (India), DBS, OCBC (Singapore), KB Financial (Korea), Itaú, Bradesco (Brazil).

---

### 8. GLEIF Global LEI Registry

**Entity discovery — organization names and metadata, no financials.**

| Property     | Value                               |
| ------------ | ----------------------------------- |
| Base URL     | `https://api.gleif.org/api/v1/`   |
| Auth         | None required                       |
| Coverage     | 2M+ legal entities worldwide        |
| SICs covered | 10 major SIC codes (keyword search) |
| Financials   | None (org discovery only)           |

**Registration:** No registration required. Completely free.

**What it does:** Searches the GLEIF LEI (Legal Entity Identifier) registry using industry keywords to discover organizations not found in other sources. Useful for filling in smaller sectors.

---

### 9. UK Companies House

**Covers all UK registered companies.**

| Property     | Value                                              |
| ------------ | -------------------------------------------------- |
| Base URL     | `https://api.company-information.service.gov.uk` |
| Auth         | `COMPANIES_HOUSE_API_KEY`required                |
| Rate limit   | 600 requests/5 minutes                             |
| Coverage     | ~3 million UK companies                            |
| SICs covered | All SIC codes (mapped from UK SIC 2007)            |
| Financials   | Annual accounts where filed                        |

**Registration:**

1. Go to **https://developer.company-information.service.gov.uk**
2. Sign in or create a free account
3. Click **"Create an application"**
4. Select **"Live"** environment
5. Copy your API key
6. Add to `.env`: `COMPANIES_HOUSE_API_KEY=your_key_here`

> The adapter is skipped entirely if `COMPANIES_HOUSE_API_KEY` is not set in `.env`.

---

### 10. Statistics Canada

**Macro-level financial sector statistics.**

| Property | Value                                                              |
| -------- | ------------------------------------------------------------------ |
| Base URL | `https://www150.statcan.gc.ca/t1/tbl1/en/dtbl/`                  |
| Auth     | None required                                                      |
| Coverage | Sector-level aggregates (not individual orgs)                      |
| Status   | ⚠️ Currently returning no data — StatCan table IDs have changed |

No registration required. Currently not producing results; under investigation.

---

### 11. OECD.Stat

**Macro financial statistics for 38 OECD member countries.**

| Property | Value                                                                 |
| -------- | --------------------------------------------------------------------- |
| Base URL | `https://stats.oecd.org/SDMX-JSON/data`                             |
| Auth     | None required                                                         |
| Coverage | Country/sector financial aggregates                                   |
| Status   | ⚠️ Currently returning no data — SDMX dataset IDs may have changed |

No registration required. Currently not producing results; under investigation.

---

## Environment Setup

### Prerequisites

```bash
# Required
node --version   # Must be 20+
npm --version    # 9+
sqlite3 --version

# For production deployment
az --version     # Azure CLI

# For macOS — install watch for live monitoring
brew install watch
```

### 1. Install dependencies

```bash
git clone https://github.com/your-org/sectorlens.git
cd sectorlens
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and set these values:

```bash
# ── Core ───────────────────────────────────────────────────
NODE_ENV=development
PORT=3000
SESSION_SECRET=<run: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">

# ── Database ───────────────────────────────────────────────
DB_PATH=./data/sectorlens.db
DB_DIR=./data

# ── App URL — IMPORTANT ────────────────────────────────────
# For local dev:
APP_URL=http://localhost:3000
# For Azure production (update after deploy):
# APP_URL=https://your-app.azurewebsites.net

# ── Ingest key — generate a secure random key ──────────────
INGEST_TRIGGER_KEY=<run: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
INGEST_ENABLED=true
INGEST_CRON_SCHEDULE=0 2 * * *
INGEST_USER_AGENT=SectorLens/1.0 (your@email.com)
INGEST_COUNTRIES=US,CA

# ── API Keys ───────────────────────────────────────────────
FMP_API_KEY=your_fmp_key_here
COMPANIES_HOUSE_API_KEY=                 # Optional
```

### 3. Initialize the database

```bash
mkdir -p data
npm run db:migrate   # Creates schema
npm run db:seed      # Seeds 124 SIC codes + seed organizations
```

### 4. Start dev server

```bash
# Dev (auto-restarts on file changes)
npm run dev

# Production-style (no auto-restart)
node src/server.js
```

---

## Running Ingestion

### Make scripts executable (first time only)

```bash
chmod +x trigger-ingest.sh watch-ingest.sh
```

### Full ingestion — all adapters, all sectors

```bash
# Local dev
APP_URL=http://localhost:3000 ./trigger-ingest.sh --watch

# Azure production (reads APP_URL from .env)
./trigger-ingest.sh --watch
```

**Expected duration:**

* Local dev: 20–40 minutes (no Azure network restrictions)
* Azure: 45–90 minutes (EDGAR rate limited at 120ms/request)

### Single sector ingestion

```bash
# Test with a well-populated sector first
./trigger-ingest.sh --sic 6022 --watch   # State Commercial Banks
./trigger-ingest.sh --sic 7372 --watch   # Prepackaged Software
./trigger-ingest.sh --sic 8062 --watch   # Hospitals
```

### Watch a job already in progress

```bash
# Get the job ID from the trigger output, then:
./watch-ingest.sh job_1234567890_abc123

# Or with an explicit URL
./watch-ingest.sh job_1234567890_abc123 --url https://your-app.azurewebsites.net
```

### Check org counts after ingestion

```bash
# One-time check
curl -s "https://your-app.azurewebsites.net/api/sics" | python3 -c "
import json,sys
sics = json.load(sys.stdin)
populated = [s for s in sics if s.get('entity_count',0) > 0]
total = sum(s.get('entity_count',0) for s in sics)
print(f'Sectors populated : {len(populated)}/124')
print(f'Total orgs        : {total}')
"

# Live monitoring (refreshes every 10s)
watch -n 10 'curl -s "https://your-app.azurewebsites.net/api/sics" | python3 -c "
import json,sys
sics = json.load(sys.stdin)
total = sum(s.get(\"entity_count\",0) for s in sics)
populated = len([s for s in sics if s.get(\"entity_count\",0) > 0])
print(f\"Total orgs: {total} | Sectors: {populated}/124\")
"'
```

### Full deployment + ingestion workflow

```bash
# 1. Deploy code to Azure
./deploy-azure.sh --update-only

# 2. Wait for deployment to complete (~3-5 minutes), then trigger
./trigger-ingest.sh --watch

# 3. After completion, sync entity_count in the SIC browser
az webapp ssh --name your-app-name --resource-group your-rg
# Inside SSH session:
cp /home/data/sectorlens.db /tmp/sl.db
sqlite3 /tmp/sl.db "
  UPDATE sic_codes
  SET entity_count = (
    SELECT count(*) FROM organizations
    WHERE organizations.sic_code = sic_codes.sic_code
  );
  SELECT count(*) || ' sectors updated' FROM sic_codes WHERE entity_count > 0;
"
cp /tmp/sl.db /home/data/sectorlens.db
exit

# 4. Verify
curl -s "https://your-app.azurewebsites.net/api/sics" | python3 -c "
import json,sys
sics = json.load(sys.stdin)
total = sum(s.get('entity_count',0) for s in sics)
print(f'Total orgs: {total}')
"
```

---

## SIC Coverage by Source

Estimated organization counts per SIC code after a **full ingestion run** with all sources active. EDGAR is the dominant source.

| SIC                           | Sector Name                   | EDGAR  | FDIC   | FMP | ProPublica | Hardcoded     | **Total Est.** |
| ----------------------------- | ----------------------------- | ------ | ------ | --- | ---------- | ------------- | -------------------- |
| **6022**                | State Commercial Banks        | ~1,200 | ~4,500 | 20  | —         | 25 CA + 30 EU | **~5,700**     |
| **7372**                | Prepackaged Software          | ~2,000 | —     | 15  | —         | 2 CA          | **~2,020**     |
| **6726**                | Investment Offices            | ~500   | —     | 8   | —         | 10            | **~518**       |
| **3674**                | Semiconductors                | ~300   | —     | 15  | —         | —            | **~315**       |
| **6021**                | National Commercial Banks     | ~150   | ~300   | 4   | —         | —            | **~454**       |
| **6035**                | Savings Institutions          | ~150   | ~300   | 4   | —         | —            | **~454**       |
| **8062**                | Hospitals                     | ~400   | —     | —  | 100        | —            | **~500**       |
| **8399**                | Social Services NEC           | ~30    | —     | —  | 200        | —            | **~230**       |
| **8200**                | Educational Services          | ~50    | —     | —  | 200        | —            | **~250**       |
| **6311**                | Life Insurance                | ~200   | —     | 10  | —         | 8             | **~218**       |
| **6331**                | Fire/Marine/Casualty          | ~150   | —     | 5   | —         | 5             | **~160**       |
| **6211**                | Security Brokers              | ~200   | —     | 8   | —         | —            | **~208**       |
| **1311**                | Crude Petroleum & Gas         | ~200   | —     | 15  | —         | 4 CA          | **~219**       |
| **4911**                | Electric Services             | ~100   | —     | 15  | —         | —            | **~115**       |
| **2800**                | Chemicals                     | ~150   | —     | 10  | —         | —            | **~160**       |
| **5800**                | Eating & Drinking Places      | ~100   | —     | 10  | —         | —            | **~110**       |
| **4813**                | Telephone Communications      | ~80    | —     | 10  | —         | —            | **~90**        |
| **4200**                | Trucking & Warehousing        | ~80    | —     | 10  | —         | —            | **~90**        |
| **8731**                | Commercial Research           | ~100   | —     | —  | 50         | —            | **~150**       |
| **4500**                | Air Transportation            | ~50    | —     | 10  | —         | —            | **~60**        |
| **3711**                | Motor Vehicles                | ~50    | —     | 9   | —         | —            | **~59**        |
| **5411**                | Grocery Stores                | ~50    | —     | 7   | —         | —            | **~57**        |
| **4011**                | Railroads                     | ~30    | —     | 9   | —         | 2 CA          | **~41**        |
| **8711**                | Engineering Services          | ~100   | —     | —  | 20         | —            | **~120**       |
| **8742**                | Management Consulting         | ~80    | —     | 4   | —         | —            | **~84**        |
| **6321**                | Accident & Health Insurance   | ~80    | —     | 8   | —         | —            | **~88**        |
| **4922**                | Natural Gas Distribution      | ~40    | —     | 8   | —         | —            | **~48**        |
| **5311**                | Department Stores             | ~30    | —     | 8   | —         | —            | **~38**        |
| **7011**                | Hotels & Motels               | ~80    | —     | —  | —         | —            | **~80**        |
| **2000**                | Food & Kindred Products       | ~100   | —     | 12  | —         | —            | **~112**       |
| **4600**                | Pipelines                     | ~30    | —     | —  | —         | 2 CA          | **~32**        |
| **8699**                | Membership Organizations NEC  | ~30    | —     | —  | 50         | —            | **~80**        |
| **7929**                | Entertainment                 | ~50    | —     | —  | 100        | —            | **~150**       |
| **6512**                | Nonresidential Bldg Operators | ~60    | —     | —  | —         | —            | **~60**        |
| **6282**                | Investment Advice             | ~150   | —     | —  | —         | —            | **~150**       |
| **5900**                | Miscellaneous Retail          | ~60    | —     | —  | —         | —            | **~60**        |
| **Manufacturing (all)** | SICs 2100–3900               | ~800   | —     | 40  | —         | 10 EU         | **~850**       |
| **Construction (all)**  | SICs 1500–1740               | ~80    | —     | —  | —         | —            | **~80**        |
| **Mining (all)**        | SICs 1000–1400               | ~100   | —     | —  | —         | —            | **~100**       |
| **Agriculture (all)**   | SICs 0100–0900               | ~20    | —     | —  | —         | —            | **~20**        |
| **Government (all)**    | SICs 9100–9700               | ~20    | —     | —  | —         | —            | **~20**        |

> **Grand total estimated: ~15,000–20,000 organizations** after a full ingestion run with no network restrictions. On Azure B1 with FDIC blocked, expect ~5,000–8,000 organizations (EDGAR + FMP + ProPublica + hardcoded sources).

---

## Troubleshooting

### Rate limit skip: "skipping source (limit > 5s threshold)"

An adapter received a `429` response with a `retry-after` header greater than 5 seconds. The adapter skips gracefully and moves to the next one. This is expected for FDIC (60s retry-after). The data from that source will be missing for this run but will be retried on the next nightly job.

### FDIC fallback to FMP

`banks.fdic.gov` is network-blocked on Azure B1. The adapter automatically falls back to FMP for the top 20 US banks. To get full FDIC bank coverage locally:

```bash
# Run locally — FDIC is reachable from your Mac
APP_URL=http://localhost:3000 ./trigger-ingest.sh --sic 6022 --watch
```

### EDGAR returns 0 companies

Check that `data.sec.gov` is reachable from Azure:

```bash
az webapp ssh --name your-app --resource-group your-rg
curl -s -o /dev/null -w "%{http_code}" \
  "https://data.sec.gov/files/company_tickers_exchange.json" \
  -H "User-Agent: SectorLens/1.0 (your@email.com)"
# Must return 200
```

### FMP "Premium Query Parameter" error

Free tier only covers NYSE/Nasdaq US stocks. International tickers are automatically skipped. Upgrade at https://financialmodelingprep.com/developer/docs/pricing.

### "Cannot find module 'knex'" on Azure startup

`boot.sh` must set the correct `NODE_PATH` before running migrations:

```sh
export NODE_PATH=/home/site/wwwroot/node_modules:$NODE_PATH
cd /home/site/wwwroot
```

### Entity counts stale in SIC browser

Sync manually via SSH:

```bash
az webapp ssh --name your-app --resource-group your-rg
cp /home/data/sectorlens.db /tmp/sl.db
sqlite3 /tmp/sl.db "UPDATE sic_codes SET entity_count = (SELECT count(*) FROM organizations WHERE organizations.sic_code = sic_codes.sic_code);"
cp /tmp/sl.db /home/data/sectorlens.db
```

### Job status returns 404

Job state is in-memory and lost on container restart. Trigger a new job:

```bash
./trigger-ingest.sh --watch
```
