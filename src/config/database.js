'use strict';

const path     = require('path');
const fs       = require('fs');
const knex     = require('knex');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/sectorlens.db');
const DB_DIR  = path.dirname(DB_PATH);

// Ensure the data directory exists before opening the connection.
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
  console.log(`  Created database directory: ${DB_DIR}`);
}

// Open DB — if the file is corrupt, delete it and start fresh
let rawDb;
try {
  rawDb = new Database(DB_PATH);
  rawDb.pragma('journal_mode = WAL');
  rawDb.pragma('foreign_keys = ON');
} catch (err) {
  if (err.code === 'SQLITE_CORRUPT' || err.message?.includes('malformed')) {
    console.warn(`  ⚠ Database corrupt — deleting and recreating: ${DB_PATH}`);
    try { fs.unlinkSync(DB_PATH); } catch (_) {}
    try { fs.unlinkSync(DB_PATH + '-wal'); } catch (_) {}
    try { fs.unlinkSync(DB_PATH + '-shm'); } catch (_) {}
    rawDb = new Database(DB_PATH);
    rawDb.pragma('journal_mode = WAL');
    rawDb.pragma('foreign_keys = ON');
    console.log('  ✓ Fresh database created');
  } else {
    throw err;
  }
}

// Knex query builder (used by services and migrations)
const db = knex({
  client: 'better-sqlite3',
  connection: { filename: DB_PATH },
  useNullAsDefault: true,
  pool: { min: 1, max: 1 },
});

/* ── Migrations ─────────────────────────────────────────── */
async function runMigrations() {
  const hasSic = await db.schema.hasTable('sic_codes');
  if (!hasSic) {
    await db.schema.createTable('sic_codes', t => {
      t.string('sic_code', 4).primary();
      t.string('division', 2);
      t.string('major_group', 2);
      t.string('name').notNullable();
      t.string('name_fr');
      t.text('description');
      t.integer('entity_count').defaultTo(0);
    });
    console.log('  ✓ sic_codes');
  }

  const hasOrgs = await db.schema.hasTable('organizations');
  if (!hasOrgs) {
    await db.schema.createTable('organizations', t => {
      t.increments('id').primary();
      t.string('sic_code', 4).references('sic_code').inTable('sic_codes');
      t.string('name').notNullable();
      t.string('name_normalized');
      t.string('type').defaultTo('Public'); // Public | Private | NGO | Municipal
      t.string('ticker');
      t.string('cik');
      t.string('fdic_cert');
      t.string('ein');
      t.string('country').defaultTo('US');
      t.string('state');
      t.string('city');
      t.string('fiscal_year_end').defaultTo('December');
      t.integer('founded_year');
      t.integer('employee_count');
      t.string('credit_rating');
      t.string('credit_outlook');
      t.string('credit_agency');
      t.text('description');
      t.timestamps(true, true);
    });
    console.log('  ✓ organizations');
  }

  // Add ingestion tracking columns if they don't exist yet (idempotent)
  const hasSourceName = await db.schema.hasColumn('organizations', 'source_name');
  if (!hasSourceName) {
    await db.schema.table('organizations', t => {
      t.string('source_id');
      t.string('source_name');
      t.string('country_code').defaultTo('US');
      t.timestamp('last_ingested_at');
    });
  }

  const hasFinancials = await db.schema.hasTable('financials');
  if (!hasFinancials) {
    await db.schema.createTable('financials', t => {
      t.increments('id').primary();
      t.integer('org_id').references('id').inTable('organizations').notNullable();
      t.integer('fiscal_year').notNullable();
      t.string('period_type').defaultTo('annual');
      t.decimal('revenue', 20, 4);
      t.decimal('net_income', 20, 4);
      t.decimal('gross_profit', 20, 4);
      t.decimal('operating_income', 20, 4);
      t.decimal('ebitda', 20, 4);
      t.decimal('total_assets', 20, 4);
      t.decimal('total_liabilities', 20, 4);
      t.decimal('shareholders_equity', 20, 4);
      t.decimal('cash_and_equivalents', 20, 4);
      t.decimal('total_debt', 20, 4);
      t.decimal('cogs', 20, 4);
      t.decimal('loan_loss_provision', 20, 4);
      t.decimal('tier1_capital_ratio', 10, 4);
      t.decimal('efficiency_ratio', 10, 4);
      t.decimal('net_margin', 10, 4);
      t.decimal('gross_margin', 10, 4);
      t.decimal('operating_margin', 10, 4);
      t.decimal('roe', 10, 4);
      t.decimal('roa', 10, 4);
      t.decimal('debt_to_equity', 10, 4);
      t.string('data_source').defaultTo('seed');
      t.timestamp('ingested_at').defaultTo(db.fn.now());
      t.unique(['org_id', 'fiscal_year', 'period_type']);
    });
    console.log('  ✓ financials');
  }

  const hasBenchmarks = await db.schema.hasTable('sector_benchmarks');
  if (!hasBenchmarks) {
    await db.schema.createTable('sector_benchmarks', t => {
      t.increments('id').primary();
      t.string('sic_code', 4).references('sic_code').inTable('sic_codes');
      t.integer('fiscal_year').notNullable();
      t.string('metric_name').notNullable();
      t.decimal('p25', 20, 4);
      t.decimal('median', 20, 4);
      t.decimal('p75', 20, 4);
      t.decimal('mean_val', 20, 4);
      t.decimal('min_val', 20, 4);
      t.decimal('max_val', 20, 4);
      t.integer('entity_count').defaultTo(0);
      t.timestamp('calculated_at').defaultTo(db.fn.now());
      t.unique(['sic_code', 'fiscal_year', 'metric_name']);
    });
    console.log('  ✓ sector_benchmarks');
  }

  const hasUsers = await db.schema.hasTable('users');
  if (!hasUsers) {
    await db.schema.createTable('users', t => {
      t.increments('id').primary();
      t.string('email').unique().notNullable();
      t.string('password_hash').notNullable();
      t.string('first_name');
      t.string('last_name');
      t.string('institution');
      t.string('job_title');
      t.string('subscription_tier').defaultTo('free_trial'); // free_trial | essential | professional | enterprise
      t.string('subscription_status').defaultTo('active');
      t.string('preferred_locale').defaultTo('en');
      t.string('invitation_code');
      t.datetime('trial_expires_at');
      t.timestamps(true, true);
      t.datetime('last_login_at');
    });
    console.log('  ✓ users');
  }

  const hasInvites = await db.schema.hasTable('invitation_codes');
  if (!hasInvites) {
    await db.schema.createTable('invitation_codes', t => {
      t.increments('id').primary();
      t.string('code').unique().notNullable();
      t.string('email');
      t.string('created_by');
      t.boolean('redeemed').defaultTo(false);
      t.datetime('redeemed_at');
      t.datetime('expires_at');
      t.timestamp('created_at').defaultTo(db.fn.now());
    });
    console.log('  ✓ invitation_codes');
  }

  const hasSessions = await db.schema.hasTable('sessions');
  if (!hasSessions) {
    await db.schema.createTable('sessions', t => {
      t.string('sid').primary();
      t.text('sess').notNullable();
      t.datetime('expired').notNullable();
    });
    console.log('  ✓ sessions');
  }

  const hasStrategies = await db.schema.hasTable('user_strategies');
  if (!hasStrategies) {
    await db.schema.createTable('user_strategies', t => {
      t.increments('id').primary();
      t.integer('user_id').references('id').inTable('users').onDelete('CASCADE');
      t.string('strategy_type').defaultTo('preset'); // preset | text | document
      t.string('preset_key').nullable();             // conservative | balanced | growth | real_estate | abl | osfi_b20
      t.text('plain_text').nullable();               // free-text strategy description
      t.text('document_name').nullable();            // original filename
      t.text('document_extracted').nullable();       // AI-extracted params JSON
      t.text('override_params').nullable();          // merged final params JSON
      t.timestamps(true, true);
    });
    console.log('  ✓ user_strategies');
  }

  // Expand SIC codes to full EDGAR list if still using minimal set
  try {
    const count = await db('sic_codes').count('sic_code as n').first();
    if (Number(count.n) < 200) {
      const sicExpansion = require('../db/seeds/sic-expansion');
      await sicExpansion.run(db);
    }
  } catch (e) {
    console.warn('  SIC expansion skipped:', e.message);
  }

  console.log('Migrations complete.');
}

/* ── Seeds ──────────────────────────────────────────────── */
async function runSeeds() {
  const seeds = require('../db/seeds/index-old');
  await seeds.run(db);
}

async function resetDb() {
  const tables = ['sessions', 'invitation_codes', 'users', 'sector_benchmarks', 'financials', 'organizations', 'sic_codes'];
  for (const t of tables) {
    const exists = await db.schema.hasTable(t);
    if (exists) await db.schema.dropTable(t);
  }
  console.log('Database reset. Run db:migrate then db:seed.');
}

module.exports = { db, rawDb, runMigrations, runSeeds, resetDb };
