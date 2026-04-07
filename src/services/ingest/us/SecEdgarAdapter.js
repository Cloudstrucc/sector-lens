'use strict';

/**
 * SecEdgarAdapter — SEC EDGAR XBRL Company Facts API
 * Covers: All SEC-registered US public companies across all SIC codes
 * API:    https://data.sec.gov/api/xbrl
 * Auth:   None — but INGEST_USER_AGENT header is REQUIRED (or you get blocked)
 * Limit:  10 req/sec
 */

const BaseAdapter = require('../BaseAdapter');

const EDGAR_BASE = 'https://data.sec.gov';
const EFTS_BASE  = 'https://efts.sec.gov';

// US GAAP XBRL concepts → financials columns
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
  CashAndCashEquivalentsAtCarryingValue:               'cash_and_equivalents',
  LongTermDebt:                                        'total_debt',
};

class SecEdgarAdapter extends BaseAdapter {
  constructor() {
    super({ name: 'SEC EDGAR XBRL', countryCode: 'US', rateLimitMs: 120 });
  }

  async run(options = {}) {
    const targetSic      = options.sic     || null;
    const sicList        = options.sicList  || null;  // array of all SICs for full sweep
    const maxOrgs        = options.maxOrgs  || 200;
    const maxOrgsPerSic  = options.maxOrgsPerSic || 25;

    // Full sweep mode — iterate through every SIC code
    if (sicList && sicList.length > 0 && !targetSic) {
      this.progress(`SEC EDGAR full sweep — ${sicList.length} SIC codes, ${maxOrgsPerSic} orgs each…`);
      let totalOrgs = 0, totalFin = 0, errors = 0;

      for (const sic of sicList) {
        if (totalOrgs >= maxOrgs * 5) break; // safety cap
        try {
          const companies = await this._getCompaniesBySic(sic, maxOrgsPerSic);
          for (const co of companies) {
            try {
              const orgId = await this.upsertOrg({
                name: co.name, sic_code: sic, type: 'Public',
                ticker: co.ticker || null, source_id: co.cik,
              });
              const fin = await this._fetchCompanyFacts(co.cik);
              if (fin && Object.keys(fin).length > 2) {
                await this.upsertFinancials(orgId, fin); totalFin++;
              }
              totalOrgs++;
            } catch (err) { errors++; }
          }
          this.progress(`SIC ${sic}: ${totalOrgs} total orgs so far…`);
        } catch (err) {
          errors++;
          this._log(`SIC ${sic} error: ${err.message}`);
        }
      }

      this.progress(`Complete — ${totalOrgs} orgs, ${totalFin} financials, ${errors} errors`);
      return { orgs: totalOrgs, financials: totalFin, errors };
    }

    // Single SIC or top-companies mode
    this.progress(`Starting SEC EDGAR ingestion${targetSic ? ` for SIC ${targetSic}` : ' (top companies)'}…`);
    let totalOrgs = 0, totalFin = 0, errors = 0;

    // Get companies for the target SIC using EDGAR company search
    const companies = await this._getCompaniesBySic(targetSic, maxOrgs);
    this.progress(`Found ${companies.length} companies in SEC EDGAR`);

    for (const co of companies) {
      if (totalOrgs >= maxOrgs) break;
      try {
        const orgId = await this.upsertOrg({
          name:      co.name,
          sic_code:  co.sic || targetSic || '9999',
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

        if (totalOrgs % 20 === 0) {
          this.progress(`Processed ${totalOrgs} SEC EDGAR companies…`, { orgs: totalOrgs });
        }
      } catch (err) {
        errors++;
        this._log(`Error on CIK ${co.cik}: ${err.message}`);
      }
    }

    this.progress(`Complete — ${totalOrgs} orgs, ${totalFin} financials, ${errors} errors`);
    return { orgs: totalOrgs, financials: totalFin, errors };
  }

  async _getCompaniesBySic(sic, limit = 200) {
    if (!sic) {
      // No SIC filter — get top companies by ticker from the full company list
      const data = await this.fetchWithRetry(
        `${EDGAR_BASE}/files/company_tickers_exchange.json`
      );
      if (!data?.data) return [];
      return Object.values(data.data)
        .slice(0, limit)
        .map(([cik, name, ticker]) => ({
          cik: String(cik).padStart(10, '0'), name, ticker,
        }));
    }

    // Use EDGAR full-text search to find companies by SIC code
    const url = `${EDGAR_BASE}/cgi-bin/browse-edgar?action=getcompany&SIC=${sic}&dateb=&owner=include&count=${Math.min(limit, 100)}&search_text=&output=atom`;
    const xml = await this.fetchWithRetry(url, {
      headers: { Accept: 'application/xml, text/xml, */*' },
      axiosOpts: { responseType: 'text' },
    });

    if (!xml || typeof xml !== 'string') return [];

    // Parse CIKs and company names from the Atom XML response
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
    return entries.slice(0, limit).map(m => {
      const block  = m[1];
      const cikM   = block.match(/CIK=(\d+)/);
      const nameM  = block.match(/<company-name>([^<]+)<\/company-name>/) ||
                     block.match(/<name>([^<]+)<\/name>/);
      const tickerM= block.match(/<assigned-sic-description>([^<]+)/);
      return {
        cik:    cikM   ? cikM[1].padStart(10, '0') : null,
        name:   nameM  ? nameM[1].trim()            : 'Unknown',
        ticker: null,
        sic,
      };
    }).filter(c => c.cik);
  }

  async _fetchCompanyFacts(cik) {
    const url  = `${EDGAR_BASE}/api/xbrl/companyfacts/${cik}.json`;
    const data = await this.fetchWithRetry(url);
    if (!data?.facts) return null;

    const usgaap = data.facts['us-gaap'] || {};
    const result = { fiscal_year: new Date().getFullYear() - 1, period_type: 'annual' };

    for (const [concept, col] of Object.entries(CONCEPT_MAP)) {
      if (result[col]) continue; // already filled by a higher-priority concept
      const units = usgaap[concept]?.units?.USD;
      if (!units) continue;

      const annual = units
        .filter(e => e.form === '10-K' && e.fp === 'FY' && e.val != null)
        .sort((a, b) => b.end.localeCompare(a.end));

      if (annual.length > 0) {
        result[col]        = annual[0].val;
        result.fiscal_year = parseInt(annual[0].end.substring(0, 4));
      }
    }

    // Derive margin ratios
    if (result.revenue && result.net_income) {
      result.net_margin = (result.net_income / result.revenue) * 100;
    }
    if (result.revenue && result.gross_profit) {
      result.gross_margin = (result.gross_profit / result.revenue) * 100;
    }
    if (result.revenue && result.operating_income) {
      result.operating_margin = (result.operating_income / result.revenue) * 100;
    }
    if (result.net_income && result.shareholders_equity && result.shareholders_equity > 0) {
      result.roe = (result.net_income / result.shareholders_equity) * 100;
    }
    if (result.total_assets && result.total_liabilities) {
      const equity = result.total_assets - result.total_liabilities;
      if (equity > 0) result.debt_to_equity = result.total_liabilities / equity;
    }

    return result;
  }
}

module.exports = SecEdgarAdapter;