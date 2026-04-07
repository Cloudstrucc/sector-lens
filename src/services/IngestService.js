'use strict';

/**
 * IngestService — Central ingestion orchestrator
 *
 * Responsibilities:
 *  - Job creation + status tracking in ingest_jobs table
 *  - Running all adapters in the correct order with concurrency control
 *  - Nightly cron scheduling via node-cron
 *  - User-triggered scoped refresh (by SIC or country)
 *  - Benchmark recalculation after ingestion completes
 *  - Per-adapter error isolation (one failing adapter never kills the job)
 */

const cron  = require('node-cron');
const { db } = require('../config/database');
const { SectorService } = require('./SectorService');

// ── Adapter imports ────────────────────────────────────────────────────────────
const FdicAdapter            = require('./ingest/us/FdicAdapter');
const SecEdgarAdapter        = require('./ingest/us/SecEdgarAdapter');
const ProPublicaAdapter      = require('./ingest/us/ProPublicaAdapter');
const OsfiAdapter            = require('./ingest/ca/OsfiAdapter');
const StatCanAdapter         = require('./ingest/ca/StatCanAdapter');
const CompaniesHouseAdapter  = require('./ingest/uk/CompaniesHouseAdapter');
const EbaAdapter             = require('./ingest/eu/EbaAdapter');
const OecdStatAdapter        = require('./ingest/oecd/OecdStatAdapter');
const FmpAdapter             = require('./ingest/FmpAdapter');

// ── Adapter registry ───────────────────────────────────────────────────────────
// Order matters: entity-discovery adapters run before enrichment adapters
const ALL_ADAPTERS = [
  // ── US ──────────────────────────────────────────────────────────────────────
  {
    id:          'fdic',
    name:        'FDIC BankFind',
    countryCode: 'US',
    sics:        ['6020','6021','6022'],
    priority:    1,
    Factory:     FdicAdapter,
    defaultOpts: { maxOrgs: 500 },
  },
  {
    id:          'sec_edgar',
    name:        'SEC EDGAR XBRL',
    countryCode: 'US',
    sics:        null,   // all SICs
    priority:    2,
    Factory:     SecEdgarAdapter,
    defaultOpts: { maxOrgs: 1000 },
  },
  {
    id:          'propublica',
    name:        'ProPublica 990',
    countryCode: 'US',
    sics:        null,   // nonprofits across all industries
    priority:    3,
    Factory:     ProPublicaAdapter,
    defaultOpts: { maxOrgs: 300 },
  },
  // ── Canada ───────────────────────────────────────────────────────────────────
  {
    id:          'osfi',
    name:        'OSFI Canada',
    countryCode: 'CA',
    sics:        ['6022'],
    priority:    4,
    Factory:     OsfiAdapter,
    defaultOpts: {},
  },
  {
    id:          'statcan',
    name:        'Statistics Canada',
    countryCode: 'CA',
    sics:        null,
    priority:    5,
    Factory:     StatCanAdapter,
    defaultOpts: {},
  },
  // ── UK ───────────────────────────────────────────────────────────────────────
  {
    id:          'companies_house',
    name:        'Companies House UK',
    countryCode: 'GB',
    sics:        null,
    priority:    6,
    Factory:     CompaniesHouseAdapter,
    defaultOpts: { maxOrgs: 200 },
  },
  // ── EU ───────────────────────────────────────────────────────────────────────
  {
    id:          'eba',
    name:        'EBA European Banks',
    countryCode: 'EU',
    sics:        ['6022'],
    priority:    7,
    Factory:     EbaAdapter,
    defaultOpts: {},
  },
  // ── Pan-OECD ─────────────────────────────────────────────────────────────────
  {
    id:          'oecd_stat',
    name:        'OECD.Stat',
    countryCode: null,   // all OECD members
    sics:        null,
    priority:    8,
    Factory:     OecdStatAdapter,
    defaultOpts: {},
  },
  // ── Enrichment (runs last — needs entity records to exist) ────────────────────
  {
    id:          'fmp',
    name:        'Financial Modeling Prep',
    countryCode: null,   // multi-country
    sics:        null,
    priority:    99,
    Factory:     FmpAdapter,
    defaultOpts: { exchange: 'NASDAQ,NYSE,TSX', maxOrgs: 200 },
    requiresKey: 'FMP_API_KEY',
  },
];

// ── In-memory job state ────────────────────────────────────────────────────────
const activeJobs = new Map(); // jobId → { status, progress, adapters }

const IngestService = {

  /* ── Schema migration for ingest tables ──────────────────────────────────── */
  async ensureTables() {
    const hasJobs = await db.schema.hasTable('ingest_jobs');
    if (!hasJobs) {
      await db.schema.createTable('ingest_jobs', t => {
        t.increments('id').primary();
        t.string('job_id').unique().notNullable();
        t.string('status').defaultTo('pending');         // pending|running|complete|failed
        t.string('triggered_by').defaultTo('cron');      // cron|user|boot
        t.text('scope');                                  // JSON: {type, sic, country}
        t.integer('adapters_total').defaultTo(0);
        t.integer('adapters_done').defaultTo(0);
        t.integer('orgs_upserted').defaultTo(0);
        t.integer('financials_upserted').defaultTo(0);
        t.integer('errors').defaultTo(0);
        t.text('error_detail');
        t.timestamp('started_at').defaultTo(db.fn.now());
        t.timestamp('completed_at');
      });
    }

    const hasLog = await db.schema.hasTable('ingest_log');
    if (!hasLog) {
      await db.schema.createTable('ingest_log', t => {
        t.increments('id').primary();
        t.string('job_id').notNullable();
        t.string('adapter_id').notNullable();
        t.string('adapter_name').notNullable();
        t.string('status').defaultTo('ok');
        t.integer('orgs_upserted').defaultTo(0);
        t.integer('financials_upserted').defaultTo(0);
        t.integer('errors').defaultTo(0);
        t.text('error_message');
        t.timestamp('started_at').defaultTo(db.fn.now());
        t.timestamp('completed_at');
      });
    }

    // Add ingestion columns to organizations if not present
    const hasSource = await db.schema.hasColumn('organizations', 'source_name');
    if (!hasSource) {
      await db.schema.table('organizations', t => {
        t.string('country_code').defaultTo('US');
        t.string('source_id');
        t.string('source_name');
        t.timestamp('last_ingested_at');
      });
    }
  },

  /* ── Trigger a job ───────────────────────────────────────────────────────── */
  async triggerJob(options = {}) {
    await this.ensureTables();

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const scope = {
      type:    options.scope    || 'all',   // all|sic|country
      sic:     options.sic      || null,
      country: options.country  || null,
    };

    await db('ingest_jobs').insert({
      job_id:       jobId,
      status:       'pending',
      triggered_by: options.triggeredBy || 'user',
      scope:        JSON.stringify(scope),
    });

    // Run async — don't await so the HTTP response returns immediately
    setImmediate(() => this._runJob(jobId, scope, options).catch(err => {
      console.error(`[IngestService] Job ${jobId} crashed:`, err.message);
      db('ingest_jobs').where('job_id', jobId)
        .update({ status: 'failed', error_detail: err.message, completed_at: new Date().toISOString() })
        .catch(() => {});
    }));

    return jobId;
  },

  /* ── Core job runner ─────────────────────────────────────────────────────── */
  async _runJob(jobId, scope, options = {}) {
    console.log(`[IngestService] Job ${jobId} starting (scope: ${JSON.stringify(scope)})`);

    const adapters = this._selectAdapters(scope);

    await db('ingest_jobs').where('job_id', jobId).update({
      status:         'running',
      adapters_total: adapters.length,
    });

    activeJobs.set(jobId, { status: 'running', adapters_done: 0, total: adapters.length });

    let totalOrgs = 0, totalFin = 0, totalErrors = 0;

    // When running a full sweep with SEC EDGAR, iterate by SIC for better coverage
    const secEdgarIdx = adapters.findIndex(a => a.id === 'sec_edgar');
    if (scope.type === 'all' && secEdgarIdx !== -1) {
      const allSics = await db('sic_codes').pluck('sic_code');
      adapters[secEdgarIdx] = {
        ...adapters[secEdgarIdx],
        defaultOpts: { ...adapters[secEdgarIdx].defaultOpts, sicList: allSics, maxOrgsPerSic: 25 },
      };
    }

    let totalOrgs = 0, totalFin = 0, totalErrors = 0;

    for (const adapterDef of adapters) {
      // Skip adapters that require a missing API key
      if (adapterDef.requiresKey && !process.env[adapterDef.requiresKey]) {
        console.log(`[IngestService] Skipping ${adapterDef.name} — ${adapterDef.requiresKey} not set`);
        await this._logAdapter(jobId, adapterDef, 'skipped', 0, 0, 0, 'API key not configured');
        continue;
      }

      const adapterStart = new Date();
      let adapterResult  = { orgs: 0, financials: 0, errors: 0 };

      try {
        console.log(`[IngestService] Running ${adapterDef.name}…`);
        const adapter = new adapterDef.Factory();
        adapter._onProgress = (p) => {
          // Update in-memory state for polling
          const job = activeJobs.get(jobId);
          if (job) job.lastMessage = p.message;
        };

        const runOpts = { ...adapterDef.defaultOpts };
        if (scope.sic && adapterDef.sics) runOpts.sic = scope.sic;
        if (scope.country && adapterDef.countryCode) runOpts.country = scope.country;

        adapterResult = await Promise.race([
          adapter.run(runOpts),
          new Promise((_, rej) =>
            setTimeout(() => rej(new Error('Adapter timeout (30 min)')), 30 * 60 * 1000)
          ),
        ]);

        await this._logAdapter(jobId, adapterDef, 'ok',
          adapterResult.orgs, adapterResult.financials, adapterResult.errors, null, adapterStart);

      } catch (err) {
        console.error(`[IngestService] Adapter ${adapterDef.name} failed:`, err.message);
        adapterResult.errors++;
        await this._logAdapter(jobId, adapterDef, 'failed', 0, 0, 1, err.message, adapterStart);
      }

      totalOrgs   += adapterResult.orgs   || 0;
      totalFin    += adapterResult.financials || 0;
      totalErrors += adapterResult.errors  || 0;

      // Update job progress
      const job = activeJobs.get(jobId);
      if (job) job.adapters_done = (job.adapters_done || 0) + 1;

      await db('ingest_jobs').where('job_id', jobId).update({
        adapters_done:       (await db('ingest_jobs').where('job_id', jobId).first()).adapters_done + 1,
        orgs_upserted:       totalOrgs,
        financials_upserted: totalFin,
        errors:              totalErrors,
      });
    }

    // Recalculate sector benchmarks after all data is loaded
    try {
      console.log('[IngestService] Recalculating sector benchmarks…');
      await SectorService.recalculateBenchmarks();
      console.log('[IngestService] Benchmarks updated');
    } catch (err) {
      console.error('[IngestService] Benchmark recalculation failed:', err.message);
    }

    await db('ingest_jobs').where('job_id', jobId).update({
      status:       totalErrors > totalOrgs * 0.5 ? 'failed' : 'complete',
      completed_at: new Date().toISOString(),
    });

    activeJobs.delete(jobId);
    console.log(`[IngestService] Job ${jobId} complete — orgs: ${totalOrgs}, fin: ${totalFin}, errors: ${totalErrors}`);
  },

  /* ── Job status ──────────────────────────────────────────────────────────── */
  async getJobStatus(jobId) {
    const job = await db('ingest_jobs').where('job_id', jobId).first();
    if (!job) return null;

    const log = await db('ingest_log')
      .where('job_id', jobId)
      .orderBy('started_at', 'asc');

    const mem = activeJobs.get(jobId) || {};
    const elapsed = job.started_at
      ? Math.round((Date.now() - new Date(job.started_at).getTime()) / 1000)
      : 0;

    return {
      jobId,
      status:              job.status,
      adapters_total:      job.adapters_total,
      adapters_done:       job.adapters_done,
      orgs_upserted:       job.orgs_upserted,
      financials_upserted: job.financials_upserted,
      errors:              job.errors,
      error_detail:        job.error_detail,
      started_at:          job.started_at,
      completed_at:        job.completed_at,
      elapsed_seconds:     elapsed,
      last_message:        mem.lastMessage || null,
      log: log.map(l => ({
        adapter:    l.adapter_name,
        status:     l.status,
        orgs:       l.orgs_upserted,
        financials: l.financials_upserted,
        errors:     l.errors,
        error:      l.error_message,
      })),
    };
  },

  async getHistory(limit = 10) {
    return db('ingest_jobs')
      .orderBy('started_at', 'desc')
      .limit(limit)
      .select('job_id','status','triggered_by','scope',
              'adapters_total','adapters_done',
              'orgs_upserted','financials_upserted','errors',
              'started_at','completed_at');
  },

  /* ── Helpers ─────────────────────────────────────────────────────────────── */
  _selectAdapters(scope) {
    let adapters = [...ALL_ADAPTERS].sort((a, b) => a.priority - b.priority);

    if (scope.type === 'sic' && scope.sic) {
      adapters = adapters.filter(a =>
        !a.sics || a.sics.includes(scope.sic) || a.priority === 99
      );
    }
    if (scope.type === 'country' && scope.country) {
      adapters = adapters.filter(a =>
        !a.countryCode ||
        a.countryCode === scope.country ||
        a.countryCode === 'EU' ||   // EU adapter always included
        a.countryCode === null       // Pan-OECD always included
      );
    }

    return adapters;
  },

  async _logAdapter(jobId, adapterDef, status, orgs, fin, errors, errorMsg, startTime) {
    await db('ingest_log').insert({
      job_id:            jobId,
      adapter_id:        adapterDef.id,
      adapter_name:      adapterDef.name,
      status,
      orgs_upserted:     orgs,
      financials_upserted: fin,
      errors,
      error_message:     errorMsg || null,
      started_at:        startTime ? startTime.toISOString() : new Date().toISOString(),
      completed_at:      new Date().toISOString(),
    });
  },

  /* ── Scheduled nightly ingestion ─────────────────────────────────────────── */
  startScheduler() {
    if (process.env.INGEST_ENABLED === 'false') {
      console.log('[IngestService] Scheduler disabled (INGEST_ENABLED=false)');
      return;
    }

    const schedule = process.env.INGEST_CRON_SCHEDULE || '0 2 * * *'; // 2am UTC daily
    console.log(`[IngestService] Scheduler started — runs at: ${schedule}`);

    cron.schedule(schedule, async () => {
      console.log('[IngestService] Nightly ingestion triggered');
      try {
        await this.ensureTables();
        await this.triggerJob({ triggeredBy: 'cron', scope: 'all' });
      } catch (err) {
        console.error('[IngestService] Scheduled job error:', err.message);
      }
    });
  },
};

module.exports = IngestService;