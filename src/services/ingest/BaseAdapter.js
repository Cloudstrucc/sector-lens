'use strict';

const axios = require('axios');
const { db } = require('../../config/database');

const USER_AGENT = process.env.INGEST_USER_AGENT ||
  'SectorLens/1.0 (contact@sectorlens.com; financial data ingestion)';

class BaseAdapter {
  constructor(options = {}) {
    this.name          = options.name          || 'BaseAdapter';
    this.countryCode   = options.countryCode   || 'US';
    this.rateLimitMs   = options.rateLimitMs   || 300;   // ms between requests
    this.maxRetries    = options.maxRetries     || 3;
    this.timeoutMs     = options.timeoutMs      || 30000;
    this._lastRequest  = 0;
    this._onProgress   = null; // set by IngestService
  }

  /* ── HTTP ──────────────────────────────────────────────────────────────── */

  async fetchWithRetry(url, opts = {}) {
    // Honour rate limit
    const now   = Date.now();
    const wait  = this.rateLimitMs - (now - this._lastRequest);
    if (wait > 0) await this._sleep(wait);
    this._lastRequest = Date.now();

    const headers = {
      'User-Agent': USER_AGENT,
      'Accept':     'application/json',
      ...(opts.headers || {}),
    };

    let lastErr;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const resp = await axios.get(url, {
          headers,
          timeout:          this.timeoutMs,
          validateStatus:   s => s < 500,
          ...(opts.axiosOpts || {}),
        });

        if (resp.status === 429) {
          const retryAfter = parseInt(resp.headers['retry-after'] || '60', 10);
          this._log(`Rate limited — waiting ${retryAfter}s`);
          await this._sleep(retryAfter * 1000);
          continue;
        }
        if (resp.status === 404) return null;
        if (resp.status >= 400) {
          this._log(`HTTP ${resp.status} for ${url}`);
          return null;
        }
        return resp.data;
      } catch (err) {
        lastErr = err;
        if (attempt < this.maxRetries) {
          await this._sleep(1000 * attempt);
        }
      }
    }
    this._log(`Failed after ${this.maxRetries} retries: ${url} — ${lastErr?.message}`);
    return null;
  }

  async fetchCSV(url, opts = {}) {
    const now  = Date.now();
    const wait = this.rateLimitMs - (now - this._lastRequest);
    if (wait > 0) await this._sleep(wait);
    this._lastRequest = Date.now();

    try {
      const resp = await axios.get(url, {
        headers:       { 'User-Agent': USER_AGENT, ...(opts.headers || {}) },
        timeout:       this.timeoutMs,
        responseType:  'text',
      });
      return resp.data;
    } catch (err) {
      this._log(`CSV fetch failed: ${url} — ${err.message}`);
      return null;
    }
  }

  /* ── DB upsert helpers ─────────────────────────────────────────────────── */

  async upsertOrg(data) {
    const required = ['name', 'sic_code'];
    for (const f of required) {
      if (!data[f]) { this._log(`upsertOrg: missing ${f}`); return null; }
    }

    const normalized = data.name.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();

    // Try to find by external source ID first, then by name+SIC
    let existing = null;
    if (data.source_id) {
      existing = await db('organizations')
        .where({ source_name: this.name, source_id: String(data.source_id) })
        .first();
    }
    if (!existing) {
      existing = await db('organizations')
        .where({ name_normalized: normalized, sic_code: data.sic_code })
        .first();
    }

    const row = {
      name:              data.name,
      name_normalized:   normalized,
      sic_code:          data.sic_code,
      type:              data.type              || 'Public',
      ticker:            data.ticker            || null,
      country_code:      data.country_code      || this.countryCode,
      state:             data.state             || null,
      city:              data.city              || null,
      description:       data.description       || null,
      employee_count:    data.employee_count     || null,
      founded_year:      data.founded_year       || null,
      credit_rating:     data.credit_rating      || null,
      source_id:         data.source_id ? String(data.source_id) : null,
      source_name:       this.name,
      last_ingested_at:  new Date().toISOString(),
      updated_at:        new Date().toISOString(),
    };

    if (existing) {
      await db('organizations').where('id', existing.id).update(row);
      return existing.id;
    } else {
      row.created_at = new Date().toISOString();
      const [id] = await db('organizations').insert(row);
      return id;
    }
  }

  async upsertFinancials(orgId, data) {
    if (!orgId) return;
    const fiscal_year  = data.fiscal_year  || new Date().getFullYear() - 1;
    const period_type  = data.period_type  || 'annual';

    const row = {
      org_id:              orgId,
      fiscal_year,
      period_type,
      data_source:         this.name,
      revenue:             data.revenue             ?? null,
      net_income:          data.net_income           ?? null,
      gross_profit:        data.gross_profit         ?? null,
      operating_income:    data.operating_income     ?? null,
      ebitda:              data.ebitda               ?? null,
      total_assets:        data.total_assets         ?? null,
      total_liabilities:   data.total_liabilities    ?? null,
      shareholders_equity: data.shareholders_equity  ?? null,
      cash_and_equivalents:data.cash_and_equivalents ?? null,
      total_debt:          data.total_debt           ?? null,
      cogs:                data.cogs                 ?? null,
      loan_loss_provision: data.loan_loss_provision  ?? null,
      tier1_capital_ratio: data.tier1_capital_ratio  ?? null,
      efficiency_ratio:    data.efficiency_ratio     ?? null,
      net_margin:          data.net_margin           ?? null,
      gross_margin:        data.gross_margin         ?? null,
      operating_margin:    data.operating_margin     ?? null,
      roe:                 data.roe                  ?? null,
      roa:                 data.roa                  ?? null,
      debt_to_equity:      data.debt_to_equity       ?? null,
    };

    const existing = await db('financials')
      .where({ org_id: orgId, fiscal_year, period_type })
      .first();

    if (existing) {
      await db('financials').where('id', existing.id).update(row);
    } else {
      await db('financials').insert(row);
    }
  }

  /* ── Utilities ─────────────────────────────────────────────────────────── */

  parseNum(val) {
    if (val == null || val === '' || val === 'N/A') return null;
    const n = parseFloat(String(val).replace(/[$,%,×,x]/g, '').replace(/,/g, ''));
    return isNaN(n) ? null : n;
  }

  // Parse abbreviated values: "4.2B" → 4200000000, "340M" → 340000000
  parseCurrency(val) {
    if (val == null || val === '') return null;
    const s = String(val).replace(/[$,\s]/g, '').trim();
    const m = s.match(/^([+-]?\d+\.?\d*)([BMKbmk]?)$/);
    if (!m) return this.parseNum(s);
    const multipliers = { B:1e9, b:1e9, M:1e6, m:1e6, K:1e3, k:1e3 };
    return parseFloat(m[1]) * (multipliers[m[2]] || 1);
  }

  progress(message, counts = {}) {
    this._log(message);
    if (this._onProgress) this._onProgress({ adapter: this.name, message, ...counts });
  }

  _log(msg) {
    console.log(`  [${this.name}] ${msg}`);
  }

  _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // Abstract — each adapter implements this
  async run(options = {}) {
    throw new Error(`${this.name}.run() not implemented`);
  }
}

module.exports = BaseAdapter;
