'use strict';

/**
 * SecEdgarAdapter — SEC EDGAR XBRL Company Facts API
 * Strategy: Use EDGAR submissions API to find companies by SIC,
 *           then fetch companyfacts for real 10-K financial data.
 * Auth:   INGEST_USER_AGENT required (set in env)
 */

const BaseAdapter = require('../BaseAdapter');

const EDGAR_BASE = 'https://data.sec.gov';

// Well-known CIKs for major companies — used as fallback when
// the company_tickers_exchange.json index is unavailable
const KNOWN_CIKS = {
  // SIC 6022 — State Commercial Banks
  '6022': [
    '0000019617', // JPMorgan Chase
    '0000070858', // Bank of America
    '0000072971', // Wells Fargo
    '0000831001', // Citigroup
    '0000036104', // US Bancorp
    '0000092122', // PNC Financial
    '0000049196', // Truist Financial
    '0001562762', // Ally Financial
    '0000354963', // KeyCorp
    '0001281761', // Regions Financial
    '0001540947', // Citizens Financial
    '0000035527', // Fifth Third Bancorp
    '0000049196', // Huntington Bancshares
    '0000036270', // M&T Bank
    '0000109380', // Zions Bancorporation
    '0000028412', // Comerica
    '0001067983', // Western Alliance
    '0000018349', // Glacier Bancorp
  ],
  // SIC 7372 — Prepackaged Software
  '7372': [
    '0000789019', // Microsoft
    '0000320193', // Apple
    '0001652044', // Alphabet (Google)
    '0001326801', // Meta
    '0001108524', // Salesforce
    '0001341439', // Oracle (new)
    '0001018724', // Amazon
    '0001341439', // Oracle
    '0001571123', // Snowflake
    '0001467373', // ServiceNow
    '0001373715', // Workday
    '0001682852', // CrowdStrike
    '0001101239', // Adobe
    '0001639920', // HubSpot
  ],
  // SIC 3674 — Semiconductors
  '3674': [
    '0001045810', // NVIDIA
    '0000002488', // AMD
    '0000050863', // Intel
    '0000813272', // Qualcomm
    '0000097476', // Texas Instruments
    '0000796343', // Broadcom
    '0000006951', // Applied Materials
    '0000707179', // KLA Corp
    '0000723254', // Lam Research
  ],
  // SIC 4911 — Electric Services
  '4911': [
    '0000753308', // NextEra Energy
    '0000018888', // Duke Energy
    '0000092122', // Southern Company
    '0000018888', // Dominion Energy
    '0000004904', // American Electric Power
    '0000049648', // Exelon
    '0000086312', // Sempra Energy
  ],
  // SIC 1311 — Crude Petroleum & Natural Gas
  '1311': [
    '0000034088', // ExxonMobil
    '0000093410', // Chevron
    '0001163165', // ConocoPhillips
    '0000821189', // EOG Resources
    '0001038357', // Pioneer Natural Resources
    '0001090012', // Devon Energy
    '0000797468', // Occidental Petroleum
  ],
  // SIC 8062 — Hospitals
  '8062': [
    '0000860730', // HCA Healthcare
    '0000352915', // Universal Health Services
    '0001360853', // Tenet Healthcare
  ],
  // SIC 6311 — Life Insurance
  '6311': [
    '0001099219', // MetLife
    '0001137774', // Prudential Financial
    '0000040533', // Lincoln National
    '0000100517', // Unum Group
    '0000004977', // Aflac
  ],
  // SIC 6331 — Property & Casualty Insurance
  '6331': [
    '0001067983', // Berkshire Hathaway
    '0000005765', // AIG
    '0000086312', // Travelers
    '0000899051', // Allstate
    '0000021175', // Chubb
  ],
  // SIC 4813 — Telephone Communications
  '4813': [
    '0000732717', // AT&T
    '0000101830', // Verizon
    '0001283699', // T-Mobile
  ],
  // SIC 3711 — Motor Vehicles
  '3711': [
    '0001318605', // Tesla
    '0000037996', // Ford
    '0000040987', // GM
  ],
  // SIC 5411 — Grocery Stores
  '5411': [
    '0000056873', // Kroger
    '0000107687', // Walmart (also retail)
    '0000891482', // Sprouts Farmers Market
  ],
};

// XBRL concept → DB column mapping (priority order)
const CONCEPT_MAP = [
  ['RevenueFromContractWithCustomerExcludingAssessedTax', 'revenue'],
  ['Revenues',                                           'revenue'],
  ['SalesRevenueNet',                                    'revenue'],
  ['InterestAndDividendIncomeOperating',                 'revenue'],
  ['NetIncomeLoss',                                      'net_income'],
  ['ProfitLoss',                                         'net_income'],
  ['GrossProfit',                                        'gross_profit'],
  ['OperatingIncomeLoss',                                'operating_income'],
  ['Assets',                                             'total_assets'],
  ['Liabilities',                                        'total_liabilities'],
  ['StockholdersEquity',                                 'shareholders_equity'],
  ['RetainedEarningsAccumulatedDeficit',                 'retained_earnings'],
  ['LongTermDebt',                                       'total_debt'],
];

class SecEdgarAdapter extends BaseAdapter {
  constructor() {
    super({ name: 'SEC EDGAR XBRL', countryCode: 'US', rateLimitMs: 120 });
  }

  async run(options = {}) {
    const targetSic     = options.sic          || null;
    const sicList       = options.sicList       || null;
    const maxOrgs       = options.maxOrgs       || 300;
    const maxOrgsPerSic = options.maxOrgsPerSic || 18;

    this.progress('Starting SEC EDGAR ingestion…');

    // Try loading full company index first
    const indexCompanies = await this._loadCompanyIndex();
    const useIndex = indexCompanies && indexCompanies.length > 100;

    if (useIndex) {
      this._log(`Loaded ${indexCompanies.length} companies from EDGAR index`);
    } else {
      this._log('EDGAR index unavailable — using known CIK list');
    }

    let totalOrgs = 0, totalFin = 0, errors = 0;

    // Determine SICs to process
    const sicsToProcess = targetSic ? [targetSic]
      : (sicList || Object.keys(KNOWN_CIKS));

    for (const sic of sicsToProcess) {
      if (totalOrgs >= maxOrgs) break;

      let companies = [];

      if (useIndex) {
        // Filter index by SIC using submissions lookup (sampled)
        const sample = indexCompanies.slice(0, 200);
        for (const co of sample) {
          if (companies.length >= maxOrgsPerSic) break;
          try {
            const sub = await this.fetchWithRetry(
              `${EDGAR_BASE}/submissions/CIK${co.cik}.json`
            );
            if (sub && String(sub.sic).padStart(4,'0') === sic) {
              companies.push({ ...co, sic });
            }
          } catch (e) { /* skip */ }
        }
      } else {
        // Use hardcoded known CIKs
        const knownCiks = KNOWN_CIKS[sic] || [];
        companies = knownCiks.slice(0, maxOrgsPerSic).map(cik => ({
          cik: cik.replace(/^0+/, '').padStart(10, '0'),
          name: null, ticker: null, sic,
        }));
      }

      for (const co of companies) {
        if (totalOrgs >= maxOrgs) break;
        try {
          // Get company name from submissions if not known
          let name = co.name;
          let ticker = co.ticker;

          if (!name) {
            const sub = await this.fetchWithRetry(
              `${EDGAR_BASE}/submissions/CIK${co.cik}.json`
            );
            if (!sub) continue;
            name   = sub.name;
            ticker = sub.tickers && sub.tickers[0] || null;
          }

          if (!name) continue;

          const orgId = await this.upsertOrg({
            name, sic_code: sic, type: 'Public',
            ticker, source_id: co.cik, source_name: 'SEC_EDGAR',
          });

          const fin = await this._fetchFacts(co.cik);
          if (fin && Object.keys(fin).length > 2) {
            await this.upsertFinancials(orgId, fin);
            totalFin++;
          }

          totalOrgs++;
          if (totalOrgs % 10 === 0) {
            this.progress(`Processed ${totalOrgs} EDGAR companies…`);
          }
        } catch (e) {
          errors++;
          this._log(`Error CIK ${co.cik}: ${e.message}`);
        }
      }

      if (companies.length > 0) {
        this.progress(`SIC ${sic}: ${companies.length} companies processed`);
      }
    }

    this.progress(`Complete — ${totalOrgs} orgs, ${totalFin} financials, ${errors} errors`);
    return { orgs: totalOrgs, financials: totalFin, errors };
  }

  async _loadCompanyIndex() {
    try {
      // Try gzip-capable fetch of the company tickers exchange file
      const data = await this.fetchWithRetry(
        `${EDGAR_BASE}/files/company_tickers_exchange.json`,
        { headers: { 'Accept-Encoding': 'gzip, deflate, br' } }
      );
      if (!data || !data.data) return null;
      return Object.values(data.data).map(row => ({
        cik:      String(row[0]).padStart(10, '0'),
        name:     row[1],
        ticker:   row[2],
        exchange: row[3],
      })).filter(c => c.exchange === 'NYSE' || c.exchange === 'Nasdaq');
    } catch (e) {
      return null;
    }
  }

  async _fetchFacts(cik) {
    const data = await this.fetchWithRetry(
      `${EDGAR_BASE}/api/xbrl/companyfacts/${cik}.json`
    );
    if (!data || !data.facts) return null;

    const usgaap = data.facts['us-gaap'] || {};
    const result = { fiscal_year: new Date().getFullYear() - 1, period_type: 'annual' };

    for (const [concept, col] of CONCEPT_MAP) {
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

    // Derive margins
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
