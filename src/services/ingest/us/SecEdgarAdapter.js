'use strict';

/**
 * SecEdgarAdapter — SEC EDGAR Company Facts API
 * Uses the company_tickers.json file + submissions API for reliable company lookup
 * Auth: INGEST_USER_AGENT required
 */

const BaseAdapter = require('../BaseAdapter');

const EDGAR_BASE = 'https://data.sec.gov';

const CONCEPT_MAP = {
  Revenues:                                            'revenue',
  RevenueFromContractWithCustomerExcludingAssessedTax: 'revenue',
  SalesRevenueNet:                                     'revenue',
  InterestAndDividendIncomeOperating:                  'revenue',
  NetIncomeLoss:                                       'net_income',
  ProfitLoss:                                          'net_income',
  GrossProfit:                                         'gross_profit',
  OperatingIncomeLoss:                                 'operating_income',
  Assets:                                              'total_assets',
  Liabilities:                                         'total_liabilities',
  StockholdersEquity:                                  'shareholders_equity',
  LongTermDebt:                                        'total_debt',
};

class SecEdgarAdapter extends BaseAdapter {
  constructor() {
    super({ name: 'SEC EDGAR XBRL', countryCode: 'US', rateLimitMs: 150 });
  }

  async run(options = {}) {
    const targetSic     = options.sic          || null;
    const sicList       = options.sicList       || null;
    const maxOrgs       = options.maxOrgs       || 200;
    const maxOrgsPerSic = options.maxOrgsPerSic || 25;

    this.progress('Loading SEC EDGAR company index…');

    // Load the full company tickers JSON — this is a single small file
    // that lists ALL SEC filers with their CIK, ticker, and exchange
    const tickerData = await this.fetchWithRetry(
      `${EDGAR_BASE}/files/company_tickers_exchange.json`
    );

    if (!tickerData || !tickerData.data) {
      this._log('Could not load EDGAR company index — SEC may be blocking requests. Check INGEST_USER_AGENT.');
      return { orgs: 0, financials: 0, errors: 0 };
    }

    // tickerData.data is an object: { "0": [cik, name, ticker, exchange], "1": [...], ... }
    const allCompanies = Object.values(tickerData.data).map(row => ({
      cik:      String(row[0]).padStart(10, '0'),
      name:     row[1],
      ticker:   row[2],
      exchange: row[3],
    }));

    this._log('Loaded ' + allCompanies.length + ' companies from EDGAR index');

    // Build a CIK → SIC lookup using submissions API (sampled)
    // For efficiency, we look up SIC for each company as we process them
    // via their submissions JSON which includes SIC code

    let totalOrgs = 0, totalFin = 0, errors = 0;

    // Determine which companies to process
    let companies = allCompanies;

    if (targetSic || (sicList && sicList.length > 0)) {
      // We need to filter by SIC — fetch submissions for a sample of companies
      // and keep those matching the target SIC(s)
      const targetSics = new Set(targetSic ? [targetSic] : sicList);
      const sample = allCompanies.slice(0, Math.min(500, allCompanies.length));
      companies = [];

      for (const co of sample) {
        if (totalOrgs >= maxOrgs) break;
        try {
          const sub = await this.fetchWithRetry(
            `${EDGAR_BASE}/submissions/CIK${co.cik}.json`
          );
          if (!sub) continue;
          const sic = String(sub.sic || '').padStart(4, '0');
          if (targetSics.has(sic)) {
            companies.push({ ...co, sic });
          }
        } catch (e) { /* skip */ }
      }
      this._log('Found ' + companies.length + ' companies matching SIC filter');
    } else {
      // No SIC filter — take top companies by exchange (NYSE/NASDAQ listed = biggest)
      companies = allCompanies
        .filter(c => c.exchange === 'NYSE' || c.exchange === 'Nasdaq')
        .slice(0, maxOrgs);
    }

    this.progress('Processing ' + companies.length + ' SEC EDGAR companies…');

    for (const co of companies) {
      if (totalOrgs >= maxOrgs) break;
      try {
        // Get submissions to find SIC if not already known
        let sic = co.sic || targetSic || '9999';

        if (!co.sic && !targetSic) {
          const sub = await this.fetchWithRetry(
            `${EDGAR_BASE}/submissions/CIK${co.cik}.json`
          );
          if (sub && sub.sic) {
            sic = String(sub.sic).padStart(4, '0');
          }
        }

        const orgId = await this.upsertOrg({
          name:      co.name,
          sic_code:  sic,
          type:      'Public',
          ticker:    co.ticker || null,
          source_id: co.cik,
        });

        const fin = await this._fetchCompanyFacts(co.cik);
        if (fin && Object.keys(fin).length > 2) {
          await this.upsertFinancials(orgId, fin);
          totalFin++;
        }

        totalOrgs++;
        if (totalOrgs % 10 === 0) {
          this.progress('Processed ' + totalOrgs + ' companies (' + co.ticker + ')…');
        }
      } catch (e) {
        errors++;
        this._log('Error on ' + co.ticker + ': ' + e.message);
      }
    }

    this.progress('Complete — ' + totalOrgs + ' orgs, ' + totalFin + ' financials, ' + errors + ' errors');
    return { orgs: totalOrgs, financials: totalFin, errors };
  }

  async _fetchCompanyFacts(cik) {
    const data = await this.fetchWithRetry(
      `${EDGAR_BASE}/api/xbrl/companyfacts/${cik}.json`
    );
    if (!data || !data.facts) return null;

    const usgaap = data.facts['us-gaap'] || {};
    const result = {
      fiscal_year: new Date().getFullYear() - 1,
      period_type: 'annual',
    };

    for (const concept of Object.keys(CONCEPT_MAP)) {
      const col   = CONCEPT_MAP[concept];
      if (result[col]) continue;
      const units = usgaap[concept] && usgaap[concept].units && usgaap[concept].units.USD;
      if (!units) continue;

      const annual = units
        .filter(e => e.form === '10-K' && e.fp === 'FY' && e.val != null)
        .sort((a, b) => b.end.localeCompare(a.end));

      if (annual.length > 0) {
        result[col]        = annual[0].val;
        result.fiscal_year = parseInt(annual[0].end.substring(0, 4));
      }
    }

    if (result.revenue && result.net_income)
      result.net_margin = (result.net_income / result.revenue) * 100;
    if (result.revenue && result.gross_profit)
      result.gross_margin = (result.gross_profit / result.revenue) * 100;
    if (result.revenue && result.operating_income)
      result.operating_margin = (result.operating_income / result.revenue) * 100;
    if (result.net_income && result.shareholders_equity && result.shareholders_equity > 0)
      result.roe = (result.net_income / result.shareholders_equity) * 100;
    if (result.total_assets && result.total_liabilities) {
      const eq = result.total_assets - result.total_liabilities;
      if (eq > 0) result.debt_to_equity = result.total_liabilities / eq;
    }

    return result;
  }
}

module.exports = SecEdgarAdapter;