'use strict';

/**
 * SecEdgarAdapter — SEC EDGAR XBRL Company Facts API
 * Covers: All SEC-registered US public companies across all SIC codes
 * API:    https://data.sec.gov/api/xbrl
 * Auth:   None — User-Agent header with email is REQUIRED or you get blocked
 * Limit:  10 req/sec (100ms min delay)
 */

const BaseAdapter = require('../BaseAdapter');

const EDGAR_BASE  = 'https://data.sec.gov';
const EFTS_BASE   = 'https://efts.sec.gov';

// XBRL concept → financials column mapping (US GAAP concepts)
const CONCEPT_MAP = {
  // Revenue
  'Revenues':                                   'revenue',
  'RevenueFromContractWithCustomerExcludingAssessedTax': 'revenue',
  'SalesRevenueNet':                            'revenue',
  'InterestAndDividendIncomeOperating':         'revenue', // banks
  // Net income
  'NetIncomeLoss':                              'net_income',
  'ProfitLoss':                                 'net_income',
  // Gross profit
  'GrossProfit':                                'gross_profit',
  // Operating income
  'OperatingIncomeLoss':                        'operating_income',
  // EBITDA proxy
  'EarningsBeforeInterestTaxesDepreciationAndAmortization': 'ebitda',
  // Balance sheet
  'Assets':                                     'total_assets',
  'Liabilities':                                'total_liabilities',
  'StockholdersEquity':                         'shareholders_equity',
  'CashAndCashEquivalentsAtCarryingValue':      'cash_and_equivalents',
  'LongTermDebt':                               'total_debt',
  // Banking
  'ProvisionForLoanAndLeaseLosses':             'loan_loss_provision',
};

class SecEdgarAdapter extends BaseAdapter {
  constructor() {
    super({ name: 'SEC_EDGAR', countryCode: 'US', rateLimitMs: 120 });
  }

  async run(options = {}) {
    const targetSic = options.sic || null;
    this.progress(`Starting SEC EDGAR ingestion${targetSic ? ` for SIC ${targetSic}` : ' (all SICs)'}…`);

    // Step 1: get the full company list mapped by SIC
    const companiesBySic = await this._fetchCompanyList(targetSic);
    const sics = Object.keys(companiesBySic);
    this.progress(`Found ${sics.length} SIC codes, ${Object.values(companiesBySic).flat().length} companies`);

    let totalOrgs = 0, totalFin = 0, errors = 0;

    for (const sic of sics) {
      const companies = companiesBySic[sic];
      for (const co of companies) {
        if (options.maxOrgs && totalOrgs >= options.maxOrgs) break;
        try {
          const orgId = await this.upsertOrg({
            name:      co.name,
            sic_code:  sic,
            type:      'Public',
            ticker:    co.tickers?.[0] || null,
            source_id: co.cik,
          });

          const fin = await this._fetchCompanyFacts(co.cik, sic);
          if (fin && Object.keys(fin).length > 2) {
            await this.upsertFinancials(orgId, fin);
            totalFin++;
          }
          totalOrgs++;
        } catch (err) {
          errors++;
          this._log(`Error processing CIK ${co.cik}: ${err.message}`);
        }
      }
      this.progress(`SIC ${sic}: ${companies.length} companies processed`, { orgs: totalOrgs });
    }

    this.progress(`Complete — ${totalOrgs} orgs, ${totalFin} financials, ${errors} errors`);
    return { orgs: totalOrgs, financials: totalFin, errors };
  }

  async _fetchCompanyList(targetSic = null) {
    // SEC provides a full company tickers JSON (all ~10k companies)
    const data = await this.fetchWithRetry(`${EDGAR_BASE}/files/company_tickers_exchange.json`);
    if (!data || !data.data) return {};

    const bySic = {};
    for (const [, entry] of Object.entries(data.data)) {
      // entry = [cik, name, ticker, exchange]
      const [cik, name, ticker] = entry;
      if (!cik || !name) continue;

      // We need to look up SIC per company — batch via submissions endpoint
      // For efficiency, only look up SIC if targetSic is set; otherwise use a pre-built index
      const key = targetSic || 'unknown';
      if (!bySic[key]) bySic[key] = [];
      bySic[key].push({ cik: String(cik).padStart(10, '0'), name, tickers: ticker ? [ticker] : [] });
    }

    // If a specific SIC is requested, filter to companies in that SIC
    if (targetSic) {
      return await this._filterBySic(bySic['unknown'] || [], targetSic);
    }

    return bySic;
  }

  async _filterBySic(companies, targetSic) {
    // Use SEC full-text search to find companies by SIC
    const url = `${EDGAR_BASE}/cgi-bin/browse-edgar?action=getcompany&SIC=${targetSic}&dateb=&owner=include&count=100&search_text=&output=atom`;
    const xml = await this.fetchWithRetry(url, {
      headers: { Accept: 'application/xml, text/xml' },
    });

    if (!xml) return { [targetSic]: [] };

    // Parse company CIKs from Atom feed
    const cikMatches = [...String(xml).matchAll(/CIK=(\d+)/g)].map(m => m[1]);
    const nameMatches = [...String(xml).matchAll(/<company-name>([^<]+)<\/company-name>/g)].map(m => m[1]);

    const result = cikMatches.slice(0, 100).map((cik, i) => ({
      cik:     cik.padStart(10, '0'),
      name:    nameMatches[i] || `Company ${cik}`,
      tickers: [],
    }));

    return { [targetSic]: result };
  }

  async _fetchCompanyFacts(cik, sic) {
    const url = `${EDGAR_BASE}/api/xbrl/companyfacts/${cik}.json`;
    const data = await this.fetchWithRetry(url);
    if (!data || !data.facts) return null;

    const usgaap = data.facts['us-gaap'] || {};
    const result = { fiscal_year: new Date().getFullYear() - 1, period_type: 'annual' };

    for (const [concept, col] of Object.entries(CONCEPT_MAP)) {
      if (!usgaap[concept]?.units?.USD) continue;
      const entries = usgaap[concept].units.USD
        .filter(e => e.form === '10-K' && e.fp === 'FY')
        .sort((a, b) => b.end.localeCompare(a.end));

      if (entries.length > 0) {
        result[col]        = entries[0].val;
        result.fiscal_year = parseInt(entries[0].end.substring(0, 4));
      }
    }

    // Derive margins if base values available
    if (result.revenue && result.net_income) {
      result.net_margin = (result.net_income / result.revenue) * 100;
    }
    if (result.revenue && result.gross_profit) {
      result.gross_margin = (result.gross_profit / result.revenue) * 100;
    }
    if (result.revenue && result.operating_income) {
      result.operating_margin = (result.operating_income / result.revenue) * 100;
    }
    if (result.net_income && result.shareholders_equity) {
      result.roe = (result.net_income / result.shareholders_equity) * 100;
    }
    if (result.total_assets && result.total_liabilities && result.shareholders_equity) {
      result.debt_to_equity = result.total_liabilities / result.shareholders_equity;
    }

    return result;
  }
}

module.exports = SecEdgarAdapter;
