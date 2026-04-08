'use strict';

/**
 * OsfiAdapter — Office of the Superintendent of Financial Institutions (Canada)
 * Covers: All Schedule I, II, III banks and trust companies operating in Canada
 * Data:   Quarterly CSV/XML data files published at osfi-bsif.gc.ca
 * Auth:   None — public downloads
 * SICs:   6020, 6021, 6022 (Canadian banks map to same SIC groups)
 *
 * OSFI publishes "Selected Financial Data" for all regulated institutions.
 * Direct download URL pattern:
 *   https://www.osfi-bsif.gc.ca/Eng/wt-ow/Pages/OSFI-BSIF-Data.aspx
 * The most reliable programmatic source is the OSFI Open Data portal CSV exports.
 */

const BaseAdapter = require('../BaseAdapter');

// OSFI publishes pre-formatted Excel/CSV files. These are stable URLs.
const OSFI_BASE = 'https://www.osfi-bsif.gc.ca';

// Major Canadian banks — Schedule I (domestic) — with known data
const MAJOR_CA_BANKS = [
  { name: 'Royal Bank of Canada',             ticker: 'RY',   sic: '6022', type: 'Public' },
  { name: 'Toronto-Dominion Bank',            ticker: 'TD',   sic: '6022', type: 'Public' },
  { name: 'Bank of Nova Scotia',              ticker: 'BNS',  sic: '6022', type: 'Public' },
  { name: 'Bank of Montreal',                 ticker: 'BMO',  sic: '6022', type: 'Public' },
  { name: 'Canadian Imperial Bank of Commerce',ticker:'CM',  sic: '6022', type: 'Public' },
  { name: 'National Bank of Canada',          ticker: 'NA',   sic: '6022', type: 'Public' },
  { name: 'HSBC Bank Canada',                 ticker: null,   sic: '6022', type: 'Private' },
  { name: 'Laurentian Bank of Canada',        ticker: 'LB',   sic: '6022', type: 'Public' },
  { name: 'Canadian Western Bank',            ticker: 'CWB',  sic: '6022', type: 'Public' },
  { name: 'Equitable Bank',                   ticker: 'EQB',  sic: '6022', type: 'Public' },
  { name: 'ATB Financial',                    ticker: null,   sic: '6022', type: 'Municipal' },
  { name: 'Credit Union Central of Canada',   ticker: null,   sic: '6022', type: 'NGO' },
];

class OsfiAdapter extends BaseAdapter {
  constructor() {
    super({ name: 'OSFI', countryCode: 'CA', rateLimitMs: 500 });
  }

  async run(options = {}) {
    this.progress('Starting OSFI Canadian bank ingestion…');

    let totalOrgs = 0, totalFin = 0, errors = 0;

    // Phase 1: Seed known major Canadian banks from FMP if key available,
    //          otherwise insert entity records for manual financial lookup
    const fmpKey = process.env.FMP_API_KEY;

    for (const bank of MAJOR_CA_BANKS) {
      try {
        const orgId = await this.upsertOrg({
          name:         bank.name,
          sic_code:     bank.sic,
          type:         bank.type,
          ticker:       bank.ticker,
          country_code: 'CA',
          source_id:    bank.ticker || bank.name.replace(/\s+/g, '_'),
        });

        // If FMP key available, fetch real financials
        if (fmpKey && bank.ticker) {
          const fin = await this._fetchFmpFinancials(bank.ticker, fmpKey);
          if (fin) { await this.upsertFinancials(orgId, fin); totalFin++; }
        }

        totalOrgs++;
        this.progress(`Upserted ${bank.name}`);
      } catch (err) {
        errors++;
        this._log(`Error processing ${bank.name}: ${err.message}`);
      }
    }

    // Phase 2: Try OSFI data portal for additional institutions
    await this._fetchOsfiInstitutions(options);

    this.progress(`Complete — ${totalOrgs} orgs, ${totalFin} financials, ${errors} errors`);
    return { orgs: totalOrgs, financials: totalFin, errors };
  }

  async _fetchFmpFinancials(ticker, apiKey) {
    const url = `https://financialmodelingprep.com/stable/income-statement?symbol=${ticker}&limit=2&apikey=${apiKey}`;
    const data = await this.fetchWithRetry(url);
    if (!Array.isArray(data) || !data.length) return null;

    const d    = data[0]; // most recent
    const year = d.date ? parseInt(d.date.substring(0, 4)) : new Date().getFullYear() - 1;

    const revenue        = this.parseNum(d.revenue);
    const net_income     = this.parseNum(d.netIncome);
    const gross_profit   = this.parseNum(d.grossProfit);
    const op_income      = this.parseNum(d.operatingIncome);

    return {
      fiscal_year:      year,
      period_type:      'annual',
      revenue,
      net_income,
      gross_profit,
      operating_income: op_income,
      net_margin:       revenue && net_income     ? (net_income / revenue) * 100     : null,
      gross_margin:     revenue && gross_profit   ? (gross_profit / revenue) * 100   : null,
      operating_margin: revenue && op_income      ? (op_income / revenue) * 100      : null,
    };
  }

  async _fetchOsfiInstitutions(options = {}) {
    // OSFI's data is primarily published as Excel files. Until OSFI releases a
    // formal REST API, we rely on FMP for financials and OSFI entity list for
    // discovery. This method is a placeholder for direct OSFI file parsing.
    this._log('OSFI direct file parsing — not yet implemented. Using FMP + static list.');
  }
}

module.exports = OsfiAdapter;