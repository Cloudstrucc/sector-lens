'use strict';

/**
 * SecEdgarAdapter — SEC EDGAR XBRL Company Facts API
 *
 * Strategy (Azure-compatible — only uses data.sec.gov which is reachable):
 *  1. Fetch company_tickers_exchange.json to get all NYSE/NASDAQ listed companies
 *  2. For each company check SIC via submissions/CIK.json
 *  3. Fetch XBRL companyfacts for matching companies
 *
 * Why not www.sec.gov/cgi-bin/browse-edgar?
 *   → www.sec.gov blocks Azure datacenter IPs.
 *   → data.sec.gov returns HTTP 200 from Azure B1 (confirmed).
 */

const BaseAdapter = require('../BaseAdapter');

const EDGAR_BASE = 'https://data.sec.gov';

// XBRL concept → DB column (priority order)
const CONCEPT_MAP = [
  ['RevenueFromContractWithCustomerExcludingAssessedTax', 'revenue'],
  ['Revenues',                                           'revenue'],
  ['SalesRevenueNet',                                    'revenue'],
  ['SalesRevenueGoodsNet',                               'revenue'],
  ['InterestAndDividendIncomeOperating',                 'revenue'],
  ['NetIncomeLoss',                                      'net_income'],
  ['ProfitLoss',                                         'net_income'],
  ['GrossProfit',                                        'gross_profit'],
  ['OperatingIncomeLoss',                                'operating_income'],
  ['Assets',                                             'total_assets'],
  ['Liabilities',                                        'total_liabilities'],
  ['StockholdersEquity',                                 'shareholders_equity'],
  ['StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest', 'shareholders_equity'],
  ['LongTermDebt',                                       'total_debt'],
];

class SecEdgarAdapter extends BaseAdapter {
  constructor() {
    super({ name: 'SEC EDGAR XBRL', countryCode: 'US', rateLimitMs: 120 });
    this._companyIndex = null; // cached after first load
  }

  async run(options = {}) {
    const targetSic     = options.sic          || null;
    const sicList       = options.sicList       || null;
    const maxOrgs       = options.maxOrgs       || 3000;
    const maxOrgsPerSic = options.maxOrgsPerSic || 200;

    this.progress('Starting SEC EDGAR ingestion…');

    // Load company index once (all NYSE/NASDAQ listed companies with CIKs)
    this._companyIndex = await this._loadCompanyIndex();
    if (!this._companyIndex || !this._companyIndex.length) {
      this._log('Could not load company index — aborting');
      return { orgs: 0, financials: 0, errors: 0 };
    }
    this._log(`Loaded ${this._companyIndex.length} listed companies from EDGAR`);

    // Build SIC → companies map by checking each company's submissions
    // We do this lazily per SIC to avoid loading all 10k+ submissions upfront
    let totalOrgs = 0, totalFin = 0, errors = 0;

    // Determine SICs to process
    let sicsToProcess;
    if (targetSic) {
      sicsToProcess = [targetSic];
    } else if (sicList?.length) {
      sicsToProcess = sicList;
    } else {
      // Full run — get all SIC codes from DB
      try {
        const { db } = require('../../config/database');
        sicsToProcess = await db('sic_codes').pluck('sic_code');
        this._log(`Full run: processing ${sicsToProcess.length} SIC codes`);
      } catch (e) {
        sicsToProcess = Object.keys(KNOWN_SICS);
      }
    }

    // Pre-build a SIC lookup by scanning submissions for all index companies
    // Scan in batches to stay within rate limits
    this.progress('Building SIC index from EDGAR submissions…');
    const sicMap = await this._buildSICMap(sicsToProcess, maxOrgsPerSic);
    this._log(`SIC index built: ${Object.keys(sicMap).length} SICs with companies`);

    // Now process each SIC
    for (const sic of sicsToProcess) {
      if (totalOrgs >= maxOrgs) break;

      const companies = sicMap[sic] || [];
      if (!companies.length) {
        this._log(`SIC ${sic}: no companies found`);
        continue;
      }

      this._log(`SIC ${sic}: processing ${companies.length} companies`);
      let sicOrgs = 0, sicFin = 0;

      for (const co of companies) {
        if (totalOrgs >= maxOrgs) break;
        try {
          const orgId = await this.upsertOrg({
            name:        co.name,
            sic_code:    sic,
            type:        'Public',
            ticker:      co.ticker || null,
            source_id:   co.cik,
            source_name: 'SEC_EDGAR',
          });

          const fin = await this._fetchFacts(co.cik);
          if (fin && Object.keys(fin).length > 2) {
            await this.upsertFinancials(orgId, fin);
            totalFin++;
            sicFin++;
          }

          totalOrgs++;
          sicOrgs++;

          if (totalOrgs % 50 === 0) {
            this.progress(`Processed ${totalOrgs} EDGAR companies…`);
          }
        } catch (e) {
          errors++;
          if (!e.message?.includes('FOREIGN KEY')) {
            this._log(`Error CIK ${co.cik}: ${e.message}`);
          }
        }
      }

      this._log(`SIC ${sic}: ${sicOrgs} orgs, ${sicFin} financials`);
    }

    this.progress(`Complete — ${totalOrgs} orgs, ${totalFin} financials, ${errors} errors`);
    return { orgs: totalOrgs, financials: totalFin, errors };
  }

  /**
   * Load all NYSE/NASDAQ listed companies from data.sec.gov
   */
  async _loadCompanyIndex() {
    const ua = process.env.INGEST_USER_AGENT || 'SectorLens/1.0 (contact@sectorlens.com)';
    try {
      const res = await fetch(`${EDGAR_BASE}/files/company_tickers_exchange.json`, {
        headers: { 'User-Agent': ua },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) {
        this._log(`company_tickers_exchange.json returned ${res.status}`);
        return null;
      }
      const data = await res.json();
      const companies = Object.values(data.data || {}).map(row => ({
        cik:      String(row[0]).padStart(10, '0'),
        name:     row[1],
        ticker:   row[2],
        exchange: row[3],
      }));
      // Include NYSE, Nasdaq, and also OTC for broader coverage
      return companies.filter(c =>
        ['NYSE', 'Nasdaq', 'OTC'].includes(c.exchange)
      );
    } catch (e) {
      this._log(`Failed to load company index: ${e.message}`);
      return null;
    }
  }

  /**
   * Build a map of SIC → companies by fetching submissions for each company.
   * Processes companies in batches and assigns each to its SIC.
   */
  async _buildSICMap(targetSics, maxPerSic = 200) {
    const ua = process.env.INGEST_USER_AGENT || 'SectorLens/1.0 (contact@sectorlens.com)';
    const sicSet = new Set(targetSics);
    const sicMap = {};
    const counts = {};

    // Shuffle to get diverse coverage across SICs rather than sequential
    const companies = [...this._companyIndex].sort(() => Math.random() - 0.5);

    let checked = 0;
    const total = companies.length;

    for (const co of companies) {
      // Stop early if all SICs are sufficiently filled
      const allFull = targetSics.every(s => (counts[s] || 0) >= maxPerSic);
      if (allFull) break;

      try {
        const res = await fetch(`${EDGAR_BASE}/submissions/CIK${co.cik}.json`, {
          headers: { 'User-Agent': ua },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) continue;

        const sub = await res.json();
        const sic = String(sub.sic || '').padStart(4, '0');

        if (sicSet.has(sic) && (counts[sic] || 0) < maxPerSic) {
          if (!sicMap[sic]) sicMap[sic] = [];
          sicMap[sic].push({
            cik:    co.cik,
            name:   sub.name || co.name,
            ticker: sub.tickers?.[0] || co.ticker || null,
          });
          counts[sic] = (counts[sic] || 0) + 1;
        }
      } catch (e) { /* skip timeouts */ }

      checked++;
      if (checked % 100 === 0) {
        const filled = Object.keys(sicMap).length;
        this.progress(`SIC index: checked ${checked}/${total} companies, ${filled} SICs found…`);
      }

      await new Promise(r => setTimeout(r, this.rateLimitMs));
    }

    return sicMap;
  }

  /**
   * Fetch XBRL financial facts for a company from the companyfacts API.
   */
  async _fetchFacts(cik) {
    const paddedCik = String(cik).replace(/^0+/, '').padStart(10, '0');
    const data = await this.fetchWithRetry(
      `${EDGAR_BASE}/api/xbrl/companyfacts/CIK${paddedCik}.json`
    );
    if (!data?.facts) return null;

    const usgaap = data.facts['us-gaap'] || {};
    const result = { fiscal_year: new Date().getFullYear() - 1, period_type: 'annual' };

    for (const [concept, col] of CONCEPT_MAP) {
      if (result[col]) continue;
      const units = usgaap[concept]?.units?.USD;
      if (!units?.length) continue;

      const annual = units
        .filter(e => e.form === '10-K' && e.fp === 'FY' && e.val != null && e.val > 0)
        .sort((a, b) => b.end.localeCompare(a.end));

      if (annual.length > 0) {
        result[col]        = annual[0].val;
        result.fiscal_year = parseInt(annual[0].end.substring(0, 4));
      }
    }

    const { revenue: rev, net_income: ni, gross_profit: gp,
            operating_income: oi, total_assets: ta,
            total_liabilities: tl, shareholders_equity: se } = result;

    if (rev && ni)          result.net_margin       = (ni / rev) * 100;
    if (rev && gp)          result.gross_margin     = (gp / rev) * 100;
    if (rev && oi)          result.operating_margin = (oi / rev) * 100;
    if (ni  && se && se > 0) result.roe             = (ni / se)  * 100;
    if (ni  && ta && ta > 0) result.roa             = (ni / ta)  * 100;
    if (ta  && tl) {
      const eq = ta - tl;
      if (eq > 0) result.debt_to_equity = tl / eq;
    }

    return result;
  }
}

// Fallback SIC list for full runs when DB is unavailable
const KNOWN_SICS = {
  '6022':1,'6021':1,'6035':1,'6211':1,'6311':1,'6331':1,'6726':1,
  '7372':1,'3674':1,'4911':1,'4813':1,'1311':1,'8062':1,'6321':1,
  '4011':1,'4200':1,'4500':1,'5800':1,'3711':1,'2800':1,'5411':1,
};

module.exports = SecEdgarAdapter;