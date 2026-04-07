#!/bin/sh
# ── SectorLens Azure App Service startup script ───────────────────────────────
set -e

echo "[startup] SectorLens boot sequence..."

# 1. Ensure persistent data directory exists
mkdir -p /home/data
echo "[startup] Data directory ready: /home/data"

# 2. Run DB migrations — process.exit() required or Knex pool hangs
echo "[startup] Running database migrations..."
node -e "
  require('./src/config/database').runMigrations()
    .then(() => process.exit(0))
    .catch(e => { console.error('[startup] Migration error:', e.message); process.exit(1); });
"

# 3. Seed if empty — same process.exit() pattern
SEED_CHECK=$(node -e "
  const { db } = require('./src/config/database');
  db('sic_codes').count('sic_code as n').first()
    .then(r => { console.log(Number(r.n)); process.exit(0); })
    .catch(() => { console.log(0); process.exit(0); });
")

if [ "$SEED_CHECK" = "0" ]; then
  echo "[startup] Empty database — seeding initial data..."
  node -e "
    require('./src/config/database').runSeeds()
      .then(() => process.exit(0))
      .catch(e => { console.error('[startup] Seed error:', e.message); process.exit(1); });
  "
  echo "[startup] Seed complete"
else
  echo "[startup] Database already seeded ($SEED_CHECK SIC codes)"
fi

# 4. Hand off to the app
echo "[startup] Starting application..."
exec node src/server.js