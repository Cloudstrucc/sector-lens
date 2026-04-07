'use strict';

/**
 * FdicAdapter — FDIC BankFind Suite API
 * Covers: All FDIC-insured US banks and savings institutions (SIC 6020, 6021, 6022)
 * API:    https://banks.fdic.gov/api
 * Auth:   None required
 * Limit:  No published limit — 200ms delay
 */

const BaseAdapter = require('../BaseAdapter');

const FDIC_BASE   = 'https://banks.fdic.gov/api';
const SIC_MAP     = { '6020': '6020', '6021': '6021', '6022': '6022' };
const FISCAL_YEAR = new Date().getFullYear() - 1;

// FDIC field → our financials column mapping
const FIN_MAP = {
  asset:   'total_assets',
  netinc:  'net_income',
  intinc:  'revenue',       // Net interest income ≈ revenue for banks
  nonii:   null,             // Non-interest income (supplemental)
  dep:     null,             // Total deposits (balance sheet)
  eq:      'shareholders_equity',
  lnlsnet: null,             // Net loans
  roa:     'roa',
  roe:     'roe',
  nim:     null,             // Net interest margin (stored as-is)
  rbcrwaj: 'tier1_capital_ratio',
  effratio:'efficiency_ratio',
};

class FdicAdapter extends BaseAdapter {
  constructor() {
    super({ name: 'FDIC', countryCode: 'US', rateLimitMs: 200 });
  }

  async run(options = {}) {
    const limit   = options.limit || 500;
    const sicCode = options.sic   || null; // null = fetch all banking SICs

    this.progress('Starting FDIC BankFind ingestion…');

    let totalOrgs = 0, totalFin = 0, errors = 0;

    // Fetch institutions — can filter by SIC if provided
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        fields: 'name,cert,asset,repdte,stalp,stname,city,active',
        limit:  String(limit),
        offset: String(offset),
        sort_by: 'asset',
        sort_order: 'DESC',
        output: 'json',
        filters: 'active:1',
      });

      const data = await this.fetchWithRetry(`${FDIC_BASE}/institutions?${params}`);
      if (!data || !data.data || !data.data.length) { hasMore = false; break; }

      for (const item of data.data) {
        const inst = item.data;
        if (!inst || !inst.cert) continue;

        try {
          const orgId = await this.upsertOrg({
            name:         inst.name,
            sic_code:     '6022',   // All FDIC-insured banks map to State Commercial Banks as default
            type:         'Public',
            country_code: 'US',
            state:        inst.stalp,
            city:         inst.city,
            source_id:    String(inst.cert),
          });

          // Fetch financials for this institution
          const finData = await this._fetchFinancials(inst.cert);
          if (finData) {
            await this.upsertFinancials(orgId, finData);
            totalFin++;
          }

          totalOrgs++;
        } catch (err) {
          errors++;
          this._log(`Error processing FDIC cert ${inst.cert}: ${err.message}`);
        }
      }

      this.progress(`Processed ${totalOrgs} institutions…`, { orgs: totalOrgs });
      offset  += limit;
      hasMore  = data.data.length === limit;

      // Respect a reasonable cap for seeding — full run gets everything
      if (options.maxOrgs && totalOrgs >= options.maxOrgs) break;
    }

    this.progress(`Complete — ${totalOrgs} orgs, ${totalFin} financials, ${errors} errors`);
    return { orgs: totalOrgs, financials: totalFin, errors };
  }

  async _fetchFinancials(cert) {
    const params = new URLSearchParams({
      filters: `CERT:${cert}`,
      fields:  'repdte,asset,netinc,intinc,nonii,dep,eq,lnlsnet,roa,roe,nim,rbcrwaj,effratio,nonix',
      limit:   '4',
      sort_by: 'repdte',
      sort_order: 'DESC',
      output: 'json',
    });

    const data = await this.fetchWithRetry(`${FDIC_BASE}/financials?${params}`);
    if (!data || !data.data || !data.data.length) return null;

    // Use most recent annual report
    const raw = data.data[0]?.data;
    if (!raw) return null;

    const year = raw.repdte ? parseInt(raw.repdte.substring(0, 4)) : FISCAL_YEAR;

    return {
      fiscal_year:         year,
      period_type:         'annual',
      total_assets:        this.parseNum(raw.asset),
      net_income:          this.parseNum(raw.netinc),
      revenue:             this.parseNum(raw.intinc),
      shareholders_equity: this.parseNum(raw.eq),
      roa:                 this.parseNum(raw.roa),
      roe:                 this.parseNum(raw.roe),
      tier1_capital_ratio: this.parseNum(raw.rbcrwaj),
      efficiency_ratio:    this.parseNum(raw.effratio),
    };
  }
}

module.exports = FdicAdapter;
