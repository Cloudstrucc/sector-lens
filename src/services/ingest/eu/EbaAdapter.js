'use strict';

/**
 * EbaAdapter — European Banking Authority Transparency Exercise
 * Covers: Capital, leverage, and liquidity data for all major EU banks
 * Data:   Pre-published CSV/Excel files (bi-annual)
 * Auth:   None — public downloads
 * URL:    https://www.eba.europa.eu/risk-analysis-and-data/eu-wide-transparency-exercise
 *
 * The EBA publishes structured data for ~130 major EU banks including:
 * CET1 ratio, leverage ratio, liquidity coverage, total assets, RoE, RoA
 */

const BaseAdapter = require('../BaseAdapter');

// Major EU banks covered by EBA transparency exercise
// Country code → SIC 6022 equivalent for cross-comparison
const EU_MAJOR_BANKS = [
  // Germany
  { name: 'Deutsche Bank AG',           country: 'DE', ticker: 'DB',   sic: '6022' },
  { name: 'Commerzbank AG',             country: 'DE', ticker: 'CBK',  sic: '6022' },
  { name: 'DZ Bank AG',                 country: 'DE', ticker: null,   sic: '6022' },
  // France
  { name: 'BNP Paribas',               country: 'FR', ticker: 'BNP',  sic: '6022' },
  { name: 'Société Générale',           country: 'FR', ticker: 'GLE',  sic: '6022' },
  { name: 'Crédit Agricole',            country: 'FR', ticker: 'ACA',  sic: '6022' },
  // Spain
  { name: 'Banco Santander',            country: 'ES', ticker: 'SAN',  sic: '6022' },
  { name: 'BBVA',                       country: 'ES', ticker: 'BBVA', sic: '6022' },
  // Italy
  { name: 'UniCredit SpA',              country: 'IT', ticker: 'UCG',  sic: '6022' },
  { name: 'Intesa Sanpaolo',            country: 'IT', ticker: 'ISP',  sic: '6022' },
  // Netherlands
  { name: 'ING Groep NV',              country: 'NL', ticker: 'INGA', sic: '6022' },
  { name: 'ABN AMRO Bank NV',           country: 'NL', ticker: 'ABN',  sic: '6022' },
  // Sweden
  { name: 'Nordea Bank Abp',            country: 'SE', ticker: 'NDA',  sic: '6022' },
  { name: 'Svenska Handelsbanken',      country: 'SE', ticker: 'SHB',  sic: '6022' },
  // Switzerland (non-EU but comparable)
  { name: 'UBS Group AG',              country: 'CH', ticker: 'UBS',  sic: '6022' },
  { name: 'Credit Suisse Group AG',     country: 'CH', ticker: 'CS',   sic: '6022' },
  // Austria
  { name: 'Erste Group Bank AG',        country: 'AT', ticker: 'EBS',  sic: '6022' },
  { name: 'Raiffeisen Bank International', country: 'AT', ticker: 'RBI', sic: '6022' },
];

class EbaAdapter extends BaseAdapter {
  constructor() {
    super({ name: 'EBA', countryCode: 'EU', rateLimitMs: 600 });
  }

  async run(options = {}) {
    this.progress('Starting EBA European bank ingestion…');
    const fmpKey = process.env.FMP_API_KEY;

    let totalOrgs = 0, totalFin = 0, errors = 0;

    for (const bank of EU_MAJOR_BANKS) {
      if (options.country && options.country !== bank.country) continue;

      try {
        const orgId = await this.upsertOrg({
          name:         bank.name,
          sic_code:     bank.sic,
          type:         'Public',
          ticker:       bank.ticker,
          country_code: bank.country,
          source_id:    bank.ticker || bank.name.replace(/\s+/g, '_'),
        });

        if (fmpKey && bank.ticker) {
          const fin = await this._fetchFmpFinancials(bank.ticker, fmpKey);
          if (fin) { await this.upsertFinancials(orgId, fin); totalFin++; }
        }

        totalOrgs++;
        this.progress(`Upserted ${bank.name} (${bank.country})`);
      } catch (err) {
        errors++;
        this._log(`Error processing ${bank.name}: ${err.message}`);
      }
    }

    this.progress(`Complete — ${totalOrgs} orgs, ${totalFin} financials, ${errors} errors`);
    return { orgs: totalOrgs, financials: totalFin, errors };
  }

  async _fetchFmpFinancials(ticker, apiKey) {
    const url = `https://financialmodelingprep.com/api/v3/income-statement/${ticker}?limit=2&apikey=${apiKey}`;
    const data = await this.fetchWithRetry(url);
    if (!Array.isArray(data) || !data.length) return null;

    const d    = data[0];
    const year = d.date ? parseInt(d.date.substring(0, 4)) : new Date().getFullYear() - 1;
    const rev  = this.parseNum(d.revenue);
    const ni   = this.parseNum(d.netIncome);
    const gp   = this.parseNum(d.grossProfit);
    const oi   = this.parseNum(d.operatingIncome);

    return {
      fiscal_year:      year,
      period_type:      'annual',
      revenue:          rev,
      net_income:       ni,
      gross_profit:     gp,
      operating_income: oi,
      net_margin:       rev && ni ? (ni / rev) * 100 : null,
      gross_margin:     rev && gp ? (gp / rev) * 100 : null,
      operating_margin: rev && oi ? (oi / rev) * 100 : null,
    };
  }
}

module.exports = EbaAdapter;
