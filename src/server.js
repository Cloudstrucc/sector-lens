'use strict';

require('dotenv').config();

const { createApp }    = require('./app');
const IngestService    = require('./services/IngestService');

const PORT = process.env.PORT || 3000;

async function start() {
  console.log('SectorLens starting…');
  console.log(`  Environment : ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Database    : ${process.env.DB_PATH || './data/sectorlens.db'}`);

  // Ensure ingest tracking tables exist
  await IngestService.ensureTables();

  const app = await createApp();

  app.listen(PORT, () => {
    console.log(`✓ Server listening on http://localhost:${PORT}`);
    // Start nightly scheduler after server is up
    IngestService.startScheduler();
  });
}

start().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});

