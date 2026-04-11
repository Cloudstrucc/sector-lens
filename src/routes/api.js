'use strict';

const express = require('express');
const { SicService }    = require('../services/SicService');
const { SectorService } = require('../services/SectorService');
const { db }            = require('../config/database');
const { body, validationResult } = require('express-validator');

const router = express.Router();

/* ── Value parser ─────────────────────────────────────────────────────────────
 * Converts user-entered strings like "$4.2B", "12.6%", "9.1×", "340M" to the
 * raw numbers stored in the financials table.
 *
 * Currency metrics  → scaled to full units  ($4.2B → 4200000000)
 * Percent metrics   → stored as-is          (12.6% → 12.6)
 * Ratio metrics     → stored as-is          (9.1×  → 9.1)
 */
const PERCENT_KEYS = new Set([
  'gross_margin','net_margin','operating_margin',
  'roe','roa','tier1_capital_ratio','efficiency_ratio',
]);
const RATIO_KEYS = new Set(['debt_to_equity']);

function parseValue(str, key) {
  if (!str) return null;
  const s = String(str).trim().replace(/[$,\s]/g, '');
  // Percentage or ratio — strip suffix, return number directly
  if (s.endsWith('%')) return parseFloat(s);
  if (s.endsWith('×') || s.endsWith('x')) return parseFloat(s);
  // Scale by suffix
  const m = s.match(/^([+-]?\d+\.?\d*)([BMKbmk]?)$/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  const suffixes = { B:1e9, b:1e9, M:1e6, m:1e6, K:1e3, k:1e3 };
  const scaled = num * (suffixes[m[2]] || 1);
  // For percent/ratio keys with no suffix, store as-is
  if (PERCENT_KEYS.has(key) || RATIO_KEYS.has(key)) return num;
  return scaled;
}

/* GET /api/sics — full SIC code list for the browser modal */
router.get('/sics', async (req, res) => {
  try {
    // Base SIC list with entity counts
    const sics = await db('sic_codes as s')
      .leftJoin(
        db('organizations').select('sic_code').count('id as n').groupBy('sic_code').as('o'),
        's.sic_code', 'o.sic_code'
      )
      .select('s.sic_code', 's.name', 's.name_fr', 's.description',
              db.raw('COALESCE(o.n, s.entity_count, 0) as entity_count'))
      .orderBy('s.sic_code');

    // Countries per SIC — distinct country_code grouped by sic_code
    const countryRows = await db('organizations')
      .select('sic_code', 'country_code')
      .whereNotNull('country_code')
      .groupBy('sic_code', 'country_code');

    // Sources per SIC — distinct source_name grouped by sic_code
    const sourceRows = await db('organizations')
      .select('sic_code', 'source_name')
      .whereNotNull('source_name')
      .groupBy('sic_code', 'source_name');

    // Build lookup maps
    const countryMap = {};
    for (const r of countryRows) {
      if (!countryMap[r.sic_code]) countryMap[r.sic_code] = [];
      if (!countryMap[r.sic_code].includes(r.country_code))
        countryMap[r.sic_code].push(r.country_code);
    }

    // Shorten source names to acronyms for display
    const SOURCE_LABELS = {
      'SEC EDGAR XBRL':              'EDGAR',
      'Bank of Canada':              'BoC',
      'BANK_OF_CANADA':              'BoC',
      'OSFI':                        'OSFI',
      'FDIC BankFind':               'FDIC',
      'FDIC':                        'FDIC',
      'Financial Modeling Prep':     'FMP',
      'FMP':                         'FMP',
      'EBA':                         'EBA',
      'PROPUBLICA_990':              'ProPublica',
      'PROPUBLICA':                  'ProPublica',
      'STATCAN':                     'StatsCan',
      'GLEIF Global LEI':            'GLEIF',
      'ECB European Institutions':   'ECB',
      'World Bank / Global Institutions': 'World Bank',
    };

    const sourceMap = {};
    for (const r of sourceRows) {
      if (!sourceMap[r.sic_code]) sourceMap[r.sic_code] = [];
      const label = SOURCE_LABELS[r.source_name] || r.source_name;
      if (!sourceMap[r.sic_code].includes(label))
        sourceMap[r.sic_code].push(label);
    }

    // Merge into SIC list
    const result = sics.map(s => ({
      ...s,
      countries: countryMap[s.sic_code] || [],
      sources:   sourceMap[s.sic_code]  || [],
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/search — autocomplete JSON */
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json({ sics: [], orgs: [] });
  try {
    res.json(await SicService.searchAll(q));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/compare/submit ────────────────────────────────────────────────────
 * Saves (or updates) the manually entered org + financials, then returns the
 * orgId so the client can redirect to /org/:id for the full profile comparison.
 */
router.post('/compare/submit', [
  body('clientName').notEmpty().trim(),
  body('sic').notEmpty().trim(),
  body('metrics').isArray({ min: 1 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Client name, SIC code, and at least one metric are required.' });
  }

  try {
    const { clientName, sic, metrics } = req.body;
    const currentYear = new Date().getFullYear();

    // ── 1. Upsert organisation ─────────────────────────────────────────────
    let org = await db('organizations')
      .where({ name: clientName, sic_code: sic })
      .first();

    if (!org) {
      const [id] = await db('organizations').insert({
        name:            clientName,
        name_normalized: clientName.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim(),
        sic_code:        sic,
        type:            'Manual',
        description:     `Manually entered for comparison on ${new Date().toLocaleDateString('en-CA')}.`,
        created_at:      new Date().toISOString(),
        updated_at:      new Date().toISOString(),
      });
      org = await db('organizations').where('id', id).first();
    } else {
      await db('organizations').where('id', org.id).update({ updated_at: new Date().toISOString() });
    }

    // ── 2. Build financials row from entered metrics ───────────────────────
    const finRow = { org_id: org.id, fiscal_year: currentYear, period_type: 'manual', data_source: 'manual' };

    const KEY_TO_COL = {
      revenue:             'revenue',
      net_income:          'net_income',
      gross_profit:        'gross_profit',
      gross_margin:        'gross_margin',
      net_margin:          'net_margin',
      operating_margin:    'operating_margin',
      operating_income:    'operating_income',
      ebitda:              'ebitda',
      roe:                 'roe',
      roa:                 'roa',
      debt_to_equity:      'debt_to_equity',
      total_assets:        'total_assets',
      total_liabilities:   'total_liabilities',
      shareholders_equity: 'shareholders_equity',
      cash_and_equivalents:'cash_and_equivalents',
      tier1_capital_ratio: 'tier1_capital_ratio',
      efficiency_ratio:    'efficiency_ratio',
      loan_loss_provision: 'loan_loss_provision',
    };

    for (const m of metrics) {
      const col = KEY_TO_COL[m.key];
      if (col && m.clientVal) {
        const parsed = parseValue(m.clientVal, m.key);
        if (parsed !== null && !isNaN(parsed)) finRow[col] = parsed;
      }
    }

    // Also handle custom metrics by label match (best-effort)
    for (const m of metrics) {
      if (!m.key && m.label) {
        const guessKey = m.label.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const col = KEY_TO_COL[guessKey];
        if (col && m.clientVal) {
          const parsed = parseValue(m.clientVal, guessKey);
          if (parsed !== null && !isNaN(parsed)) finRow[col] = parsed;
        }
      }
    }

    // ── 3. Upsert financials ───────────────────────────────────────────────
    const existingFin = await db('financials')
      .where({ org_id: org.id, fiscal_year: currentYear, period_type: 'manual' })
      .first();

    if (existingFin) {
      await db('financials').where('id', existingFin.id).update(finRow);
    } else {
      await db('financials').insert(finRow);
    }

    res.json({ ok: true, orgId: org.id, redirect: `/org/${org.id}` });

  } catch (err) {
    console.error('/api/compare/submit error:', err);
    res.status(500).json({ error: 'Failed to save comparison. Please try again.' });
  }
});

/* POST /api/compare — legacy inline compare (kept for backwards compat) */
router.post('/compare', [
  body('sic').notEmpty(),
  body('metrics').isObject(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input.' });
  try {
    const { sic, metrics, clientName } = req.body;
    const benchmarks = await db('sector_benchmarks').where({ sic_code: sic, fiscal_year: 2023 });
    const benchMap = {};
    benchmarks.forEach(b => { benchMap[b.metric_name] = b; });
    const results = Object.entries(metrics).map(([key, clientVal]) => {
      const b = benchMap[key];
      const clientNum = parseFloat(String(clientVal).replace(/[^0-9.-]/g, ''));
      let comparison = null;
      if (b && !isNaN(clientNum)) {
        const pct = ((clientNum - b.median) / Math.abs(b.median)) * 100;
        comparison = { pct: pct.toFixed(1), above: clientNum >= b.median };
      }
      return { key, clientVal, sector_median: b ? b.median.toFixed(2) : null, comparison };
    });
    res.json({ clientName, sic, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/locale — locale toggle */
router.post('/locale', (req, res) => {
  const locale = req.body.locale === 'fr' ? 'fr' : 'en';
  req.session.locale = locale;
  if (req.session.user) {
    db('users').where('id', req.session.user.id).update({ preferred_locale: locale }).catch(() => {});
  }
  res.json({ ok: true, locale });
});

/* ── Ingest / Refresh endpoints ────────────────────────────────────────────── */
const IngestService = require('../services/IngestService');

/* POST /api/ingest/trigger — start a data refresh job */
router.post('/ingest/trigger', [
  body('scope').optional().isIn(['all','sic','country']),
  body('sic').optional().trim(),
  body('country').optional().trim().isLength({ max: 2 }),
], async (req, res) => {
  // Allow: logged-in users OR requests with the internal trigger key
  const triggerKey = process.env.INGEST_TRIGGER_KEY;
  const providedKey = req.headers['x-ingest-key'];
  const isAuthorized = req.session?.user ||
    (triggerKey && providedKey && providedKey === triggerKey);

  if (!isAuthorized) {
    return res.status(401).json({ error: 'Login required or provide X-Ingest-Key header.' });
  }

  try {
    await IngestService.ensureTables();
    const jobId = await IngestService.triggerJob({
      scope:       req.body.scope       || 'all',
      sic:         req.body.sic         || null,
      country:     req.body.country     || null,
      triggeredBy: req.session?.user ? `user:${req.session.user.id}` : 'system',
    });
    res.json({ ok: true, jobId, message: 'Data refresh started.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/ingest/status/:jobId — poll job progress */
router.get('/ingest/status/:jobId', async (req, res) => {
  try {
    const status = await IngestService.getJobStatus(req.params.jobId);
    if (!status) return res.status(404).json({ error: 'Job not found.' });
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/ingest/history — last 10 ingestion jobs */
/* GET /api/ingest/ping — test outbound network connectivity from Azure */
router.get('/ingest/ping', async (req, res) => {
  const triggerKey = process.env.INGEST_TRIGGER_KEY;
  const providedKey = req.headers['x-ingest-key'];
  if (!req.session?.user && !(triggerKey && providedKey === triggerKey)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const axios = require('axios');
  const userAgent = process.env.INGEST_USER_AGENT || 'SectorLens/1.0';
  const tests = [
    { name: 'SEC EDGAR tickers',    url: 'https://data.sec.gov/files/company_tickers_exchange.json' },
    { name: 'SEC EDGAR submissions',url: 'https://data.sec.gov/submissions/CIK0000320193.json' },
    { name: 'FDIC BankFind',        url: 'https://banks.fdic.gov/api/institutions?limit=1&output=json' },
    { name: 'ProPublica 990',       url: 'https://projects.propublica.org/nonprofits/api/v2/search.json?q=hospital&page=0' },
  ];

  const results = {};
  for (const t of tests) {
    try {
      const resp = await axios.get(t.url, {
        headers: { 'User-Agent': userAgent },
        timeout: 8000,
        validateStatus: () => true,
      });
      results[t.name] = { status: resp.status, ok: resp.status < 400, bytes: JSON.stringify(resp.data).length };
    } catch (e) {
      results[t.name] = { status: 0, ok: false, error: e.message };
    }
  }
  res.json({ userAgent, results });
});

router.get('/ingest/history', async (req, res) => {
  try {
    const history = await IngestService.getHistory(10);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;