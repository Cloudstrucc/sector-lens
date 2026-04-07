# SectorLens

**Commercial banking intelligence for SIC-based sector analysis.**

SectorLens gives commercial bankers and credit analysts instant access to sector-level financial benchmarks, peer comparisons, and loan-readiness indicators — searchable by SIC code or organization name. Data is sourced from publicly available financial filings (SEC EDGAR, FDIC, IRS 990, and more).

[![Node.js](https://img.shields.io/badge/Node.js-20%20LTS-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express)](https://expressjs.com)
[![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite)](https://sqlite.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Table of Contents

- [SectorLens](#sectorlens)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [Tech Stack](#tech-stack)
  - [Prerequisites](#prerequisites)
  - [Getting Started](#getting-started)
    - [Clone the repository](#clone-the-repository)
    - [macOS (Apple Silicon / arm64)](#macos-apple-silicon--arm64)
    - [macOS (Intel / x64)](#macos-intel--x64)
    - [Windows](#windows)
    - [Linux](#linux)
  - [Environment Variables](#environment-variables)
  - [Database Setup](#database-setup)
  - [Running the App](#running-the-app)
  - [Project Structure](#project-structure)
  - [Data Sources](#data-sources)
  - [Data Ingestion](#data-ingestion)
    - [Environment variables](#environment-variables-1)
    - [Automatic nightly ingestion](#automatic-nightly-ingestion)
    - [Manual trigger — via the UI](#manual-trigger--via-the-ui)
    - [Manual trigger — via API (authenticated session)](#manual-trigger--via-api-authenticated-session)
    - [Manual trigger — via API key (no login required)](#manual-trigger--via-api-key-no-login-required)
    - [Poll job status](#poll-job-status)
    - [View ingestion history](#view-ingestion-history)
    - [Deploy script shortcuts](#deploy-script-shortcuts)
    - [Data sources and adapters](#data-sources-and-adapters)
  - [Deployment (Azure)](#deployment-azure)
    - [Key Azure configuration](#key-azure-configuration)
    - [Deploy via Azure CLI](#deploy-via-azure-cli)
  - [Contributing](#contributing)
  - [License](#license)

---

## Features

- 🔍 **Search** by SIC code or organization name (wildcard)
- 📊 **Sector dashboards** with KPI tiles, peer comparison charts, and benchmark medians
- 🏢 **Organization profiles** with 5-year financial trends and banker's assessment panel
- ⚖️ **Compare tool** — enter a client's numbers against the sector median
- 📈 **KPI drill-down** — distribution, rankings, and statistical context per metric
- 🌙 **Dark mode** with persistent preference
- 🌐 **EN / FR** bilingual interface
- 🔐 **Auth** — register, login, invitation code redemption
- 💳 **Subscription tiers** — Free Trial, Essential, Professional, Enterprise

---

## Tech Stack

| Layer             | Technology                                |
| ----------------- | ----------------------------------------- |
| Runtime           | Node.js 20 LTS                            |
| Web framework     | Express.js 4.x                            |
| Templating        | express-handlebars 7.x                    |
| Client reactivity | Alpine.js 3.x (CDN, no build step)        |
| Charts            | Chart.js 4.x (CDN)                        |
| Database          | SQLite via `better-sqlite3`             |
| Query builder     | Knex.js 3.x                               |
| Auth              | `express-session` + `bcrypt`          |
| i18n              | `i18next` + `i18next-http-middleware` |
| Security          | `helmet` + `express-rate-limit`       |

---

## Prerequisites

- **Node.js 18+** — [nodejs.org](https://nodejs.org) (LTS recommended)
- **npm 9+** — included with Node.js
- **Git** — [git-scm.com](https://git-scm.com)

> `better-sqlite3` uses prebuilt native binaries for most platforms. You generally **do not** need Python or build tools. If `npm install` fails with a build error, see the platform-specific notes below.

---

## Getting Started

### Clone the repository

```bash
git clone https://github.com/your-org/sectorlens.git
cd sectorlens
```

---

### macOS (Apple Silicon / arm64)

Tested on macOS 13+ (Ventura, Sonoma) with M1/M2/M3 chips.

```bash
# 1. Install Node.js via Homebrew (recommended)
brew install node

# 2. Verify versions
node --version   # should be >= 18
npm --version    # should be >= 9

# 3. Install dependencies
npm install

# 4. Copy and configure environment
cp .env.example .env
# Edit .env — at minimum set SESSION_SECRET (see Environment Variables)

# 5. Create the data directory
mkdir -p data

# 6. Run migrations and seed data
npm run db:migrate
npm run db:seed

# 7. Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

> **Note for arm64:** If `npm install` fails on `better-sqlite3`, ensure you have the Xcode Command Line Tools:
>
> ```bash
> xcode-select --install
> ```

---

### macOS (Intel / x64)

Tested on macOS 12+ (Monterey and later) with Intel chips.

```bash
# 1. Install Node.js via Homebrew
brew install node

# 2. Verify versions
node --version
npm --version

# 3. Install dependencies
npm install

# 4. Copy and configure environment
cp .env.example .env
# Edit .env — set SESSION_SECRET

# 5. Create data directory
mkdir -p data

# 6. Migrate and seed
npm run db:migrate
npm run db:seed

# 7. Start
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

### Windows

Tested on Windows 10/11 with PowerShell and Git Bash.

```powershell
# 1. Install Node.js from https://nodejs.org (LTS installer)
#    During installation, check "Automatically install the necessary tools"
#    to get build tools for native modules.

# 2. Verify
node --version
npm --version

# 3. Clone (if not done already)
git clone https://github.com/your-org/sectorlens.git
cd sectorlens

# 4. Install dependencies
npm install

# 5. Copy environment file
copy .env.example .env
# Edit .env in Notepad or VS Code — set SESSION_SECRET

# 6. Create data directory
mkdir data

# 7. Migrate and seed
npm run db:migrate
npm run db:seed

# 8. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

> **Windows build tools:** If `npm install` fails on `better-sqlite3`, run this in an **Administrator** PowerShell, then retry `npm install`:
>
> ```powershell
> npm install --global windows-build-tools
> ```
>
> Or install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) manually.

---

### Linux

Tested on Ubuntu 20.04+, Debian 11+, and Fedora 38+.

**Ubuntu / Debian:**

```bash
# 1. Install Node.js 20 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Install build essentials (needed for better-sqlite3 if no prebuilt binary)
sudo apt-get install -y build-essential python3

# 3. Verify
node --version
npm --version

# 4. Install dependencies
npm install

# 5. Configure environment
cp .env.example .env
# nano .env — set SESSION_SECRET

# 6. Create data directory
mkdir -p data

# 7. Migrate and seed
npm run db:migrate
npm run db:seed

# 8. Start
npm run dev
```

**Fedora / RHEL / CentOS:**

```bash
# Install Node.js 20
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs gcc gcc-c++ make python3

npm install
cp .env.example .env
mkdir -p data
npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Environment Variables

Copy `.env.example` to `.env` and set the following:

| Variable                    | Required      | Description                                                     |
| --------------------------- | ------------- | --------------------------------------------------------------- |
| `NODE_ENV`                | No            | `development` or `production`                               |
| `PORT`                    | No            | HTTP port (default:`3000`)                                    |
| `SESSION_SECRET`          | **Yes** | Random 64-char hex string for session signing                   |
| `DB_PATH`                 | No            | Path to SQLite file (default:`./data/sectorlens.db`)          |
| `DB_DIR`                  | No            | Directory for SQLite file (default:`./data`)                  |
| `FMP_API_KEY`             | No            | Financial Modeling Prep API key (for live data ingestion)       |
| `SMTP_HOST`               | No            | SMTP server for transactional email                             |
| `INGEST_ENABLED`          | No            | Set `true` to enable nightly scheduled ingestion              |
| `INGEST_USER_AGENT`       | No            | Required by SEC EDGAR — e.g.`SectorLens/1.0 (you@email.com)` |
| `INGEST_TRIGGER_KEY`      | No            | Secret key for triggering ingestion via API without login       |
| `FMP_API_KEY`             | No            | Financial Modeling Prep API key (enables CA/EU financials)      |
| `COMPANIES_HOUSE_API_KEY` | No            | UK Companies House API key                                      |
| `SMTP_PORT`               | No            | SMTP port (default:`587`)                                     |
| `SMTP_USER`               | No            | SMTP username                                                   |
| `SMTP_PASS`               | No            | SMTP password                                                   |

**Generate a session secret:**

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Database Setup

SectorLens uses **SQLite** — no separate database server is needed. The database file is created automatically at `./data/sectorlens.db`.

```bash
# Create tables
npm run db:migrate

# Load seed data (SIC codes, sample organizations, financials, benchmarks)
npm run db:seed

# Reset everything and start fresh
npm run db:reset
```

---

## Running the App

| Command                | Description                                      |
| ---------------------- | ------------------------------------------------ |
| `npm run dev`        | Development server with auto-reload (nodemon)    |
| `npm start`          | Production server                                |
| `npm run db:migrate` | Create/update database tables                    |
| `npm run db:seed`    | Load seed data (upsert — safe on existing data) |
| `npm run db:reset`   | Drop all tables (destructive)                    |

**First-time setup (any platform):**

```bash
npm install
cp .env.example .env   # then edit .env
mkdir -p data
npm run db:migrate
npm run db:seed
npm run dev
```

---

## Project Structure

```
sectorlens/
├── src/
│   ├── app.js                    # Express app factory
│   ├── server.js                 # HTTP server entry point
│   ├── config/
│   │   ├── database.js           # SQLite/Knex connection + migration runner
│   │   └── i18n.js               # i18next configuration
│   ├── middleware/
│   │   └── auth.js               # Auth guard + session locals
│   ├── routes/
│   │   ├── index.js              # Home, search, locale toggle
│   │   ├── auth.js               # Login, register, invite
│   │   ├── sector.js             # Sector dashboard, org list, KPI detail
│   │   ├── org.js                # Organization profile
│   │   ├── api.js                # JSON API (compare, search)
│   │   └── account.js            # User account page
│   ├── services/
│   │   ├── SectorService.js      # Benchmarks, dashboard data
│   │   ├── OrgService.js         # Org list, profile, peer data
│   │   ├── SicService.js         # SIC code search
│   │   ├── IngestService.js      # Ingestion orchestrator + job queue
│   │   └── ingest/
│   │       ├── BaseAdapter.js    # Shared fetch-retry, rate limit, upsert helpers
│   │       ├── FmpAdapter.js     # Financial Modeling Prep (multi-country)
│   │       ├── us/               # FDIC, SEC EDGAR, ProPublica
│   │       ├── ca/               # OSFI, StatCan
│   │       ├── uk/               # Companies House
│   │       ├── eu/               # EBA
│   │       └── oecd/             # OECD.Stat
│   ├── db/
│   │   └── seeds/
│   │       └── index.js          # Seed data (SIC codes, orgs, financials)
│   ├── views/
│   │   ├── layouts/main.hbs      # Base HTML layout
│   │   ├── partials/             # nav, modals (login/register/trial/redeem)
│   │   ├── home.hbs
│   │   ├── sector-dashboard.hbs
│   │   ├── org-list.hbs
│   │   ├── org-profile.hbs
│   │   ├── kpi-detail.hbs
│   │   ├── search-results.hbs
│   │   ├── account.hbs
│   │   └── error.hbs
│   └── public/
│       ├── css/main.css          # Full design system
│       └── js/app.js             # Alpine.js app component
├── locales/
│   ├── en/translation.json
│   └── fr/translation.json
├── data/                         # SQLite DB (gitignored)
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## Data Sources

| Source                        | Coverage                          | URL                                            |
| ----------------------------- | --------------------------------- | ---------------------------------------------- |
| OSHA SIC Manual               | SIC code taxonomy                 | https://www.osha.gov/data/sic-manual           |
| SEC EDGAR XBRL API            | All US public company financials  | https://data.sec.gov                           |
| FDIC BankFind Suite           | All FDIC-insured banks (SIC 60xx) | https://banks.fdic.gov/api                     |
| ProPublica Nonprofit Explorer | IRS 990 data for US nonprofits    | https://projects.propublica.org/nonprofits/api |
| Financial Modeling Prep       | Normalized financial statements   | https://financialmodelingprep.com              |
| USASpending.gov               | Federal/municipal financial data  | https://api.usaspending.gov                    |

> The current release ships with **seed data** for ~30 SIC codes and ~130 sample organizations covering banking, software, retail, utilities, healthcare, insurance, and more. Live API ingestion via `IngestService.js` populates all remaining sectors — see [Data Ingestion](#data-ingestion).

---

## Data Ingestion

SectorLens ships with seed data for demo purposes. Live financial data is populated via the ingestion pipeline, which pulls from SEC EDGAR, FDIC BankFind, ProPublica, and other sources.

### Environment variables

Add these to your `.env` (locally) and Azure App Settings (production) before triggering ingestion:

| Variable                    | Required      | Description                                                                |
| --------------------------- | ------------- | -------------------------------------------------------------------------- |
| `INGEST_ENABLED`          | No            | Set `true` to enable nightly scheduled ingestion                         |
| `INGEST_CRON_SCHEDULE`    | No            | Cron expression (default:`0 2 * * *` — 2am UTC daily)                   |
| `INGEST_COUNTRIES`        | No            | Comma-separated country codes to ingest (e.g.`US,CA`)                    |
| `INGEST_USER_AGENT`       | **Yes** | Required by SEC EDGAR — e.g.`SectorLens/1.0 (your@email.com)`           |
| `INGEST_TRIGGER_KEY`      | No            | Secret key for triggering ingestion via API without a login session        |
| `FMP_API_KEY`             | No            | Financial Modeling Prep API key — enables Canadian and EU bank financials |
| `COMPANIES_HOUSE_API_KEY` | No            | UK Companies House API key — enables UK company data                      |

### Automatic nightly ingestion

When `INGEST_ENABLED=true`, the scheduler fires automatically at `INGEST_CRON_SCHEDULE` (default 2am UTC) and runs all configured adapters for the countries listed in `INGEST_COUNTRIES`.

### Manual trigger — via the UI

Navigate to any sector dashboard (e.g. `/sector/6022`) and click the **↻ Refresh** button in the top bar. This triggers a scoped ingestion for that SIC code only and shows live progress.

### Manual trigger — via API (authenticated session)

```bash
# Login and save cookie
curl -c cookies.txt -X POST https://your-app.azurewebsites.net/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","password":"yourpassword"}'

# Trigger full ingestion
curl -b cookies.txt -X POST https://your-app.azurewebsites.net/api/ingest/trigger \
  -H "Content-Type: application/json" \
  -d '{"scope":"all"}'

# Trigger for a single SIC code
curl -b cookies.txt -X POST https://your-app.azurewebsites.net/api/ingest/trigger \
  -H "Content-Type: application/json" \
  -d '{"scope":"sic","sic":"6022"}'
```

### Manual trigger — via API key (no login required)

Set `INGEST_TRIGGER_KEY` in your environment, then:

```bash
# Trigger full ingestion
curl -X POST https://your-app.azurewebsites.net/api/ingest/trigger \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Key: your-trigger-key" \
  -d '{"scope":"all"}'

# Trigger for a specific SIC code
curl -X POST https://your-app.azurewebsites.net/api/ingest/trigger \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Key: your-trigger-key" \
  -d '{"scope":"sic","sic":"6022"}'

# Trigger for a specific country
curl -X POST https://your-app.azurewebsites.net/api/ingest/trigger \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Key: your-trigger-key" \
  -d '{"scope":"country","country":"CA"}'
```

### Poll job status

All trigger calls return a `jobId`. Poll it to track progress:

```bash
curl https://your-app.azurewebsites.net/api/ingest/status/job_xxxxx
```

Response:

```json
{
  "jobId": "job_1234567890_abc123",
  "status": "running",
  "adapters_total": 9,
  "adapters_done": 3,
  "orgs_upserted": 847,
  "financials_upserted": 2341,
  "errors": 0,
  "elapsed_seconds": 142,
  "log": [
    { "adapter": "FDIC", "status": "ok", "orgs": 421, "financials": 421 },
    { "adapter": "SEC_EDGAR", "status": "ok", "orgs": 380, "financials": 380 },
    { "adapter": "PROPUBLICA_990", "status": "running", "orgs": 46, "financials": 46 }
  ]
}
```

### View ingestion history

```bash
curl -H "X-Ingest-Key: your-trigger-key" \
  https://your-app.azurewebsites.net/api/ingest/history
```

### Deploy script shortcuts

If using the included `deploy-azure.sh`:

```bash
./deploy-azure.sh --seed      # upsert SIC codes + seed orgs into live DB (no data loss)
./deploy-azure.sh --migrate   # run schema migrations on live DB
```

### Data sources and adapters

| Adapter                 | Coverage                                   | Auth                                  |
| ----------------------- | ------------------------------------------ | ------------------------------------- |
| FDIC BankFind           | All FDIC-insured US banks (SIC 60xx)       | None — free                          |
| SEC EDGAR XBRL          | All US public companies across all SICs    | None —`INGEST_USER_AGENT` required |
| ProPublica 990          | All US nonprofits — IRS Form 990          | None — free                          |
| OSFI Canada             | Canadian federally regulated banks         | None — uses FMP for financials       |
| Statistics Canada       | Canadian sector-level financial statistics | None — free                          |
| Companies House UK      | UK registered companies                    | `COMPANIES_HOUSE_API_KEY`           |
| EBA Europe              | Major EU bank capital and leverage data    | None — uses FMP for financials       |
| OECD.Stat               | Pan-OECD macro and sector statistics       | None — free                          |
| Financial Modeling Prep | Normalized financials for all tickers      | `FMP_API_KEY`                       |

---

## Deployment (Azure)

SectorLens is designed to run on **Azure App Service** (Linux, Node.js 20 LTS).

### Key Azure configuration

- **Plan:** B1 Linux (Basic) — ~$13/month
- **Runtime:** Node.js 20 LTS
- **Startup command:** `node src/server.js`
- **SQLite persistence:** Set `DB_PATH=/home/data/sectorlens.db` — Azure App Service's `/home` directory persists across deployments
- **Environment variables:** Configure all `.env` values as **Application Settings** in the Azure Portal

### Deploy via Azure CLI

```bash
# Login
az login

# Create resource group
az group create --name sectorlens-rg --location eastus

# Create App Service plan
az appservice plan create --name sectorlens-plan --resource-group sectorlens-rg --sku B1 --is-linux

# Create web app
az webapp create --name sectorlens --resource-group sectorlens-rg --plan sectorlens-plan --runtime "NODE:20-lts"

# Set startup command
az webapp config set --name sectorlens --resource-group sectorlens-rg --startup-file "node src/server.js"

# Set environment variables
az webapp config appsettings set --name sectorlens --resource-group sectorlens-rg --settings \
  NODE_ENV=production \
  SESSION_SECRET=<your-secret> \
  DB_PATH=/home/data/sectorlens.db \
  DB_DIR=/home/data

# Deploy from local git or zip
az webapp deploy --name sectorlens --resource-group sectorlens-rg --src-path ./sectorlens.zip --type zip
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'feat: add your feature'`
4. Push: `git push origin feature/your-feature`
5. Open a pull request

Please follow the existing code style and add meaningful commit messages.

---

## License

MIT © 2025 [Cloudstrucc Inc](https://www.cloudstrucc.com).
