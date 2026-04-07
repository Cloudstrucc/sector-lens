'use strict';

/**
 * FmpAdapter — Financial Modeling Prep
 * Covers: Normalized income statements, balance sheets, ratios for US + international tickers
 * API:    https://financialmodelingprep.com/api/v3
 * Auth:   API key required (free tier: 250 req/day)
 * Limit:  ~1 req/sec on free tier
 *
 * Best used as a financial data enrichment layer on top of entity lists
 * from FDIC, OSFI, EBA, etc. — much faster than parsing raw XBRL.
 */

const BaseAdapter = require('./BaseAdapter');

const FMP_BASE = 'https://financialmodelingprep.com/api/v3';

class FmpAdapter extends BaseAdapter {
  constructor() {
    super({ name: 'FMP', countryCode: 'US', rateLimitMs: 1200 }); // free tier safe
    this.apiKey = process.env.FMP_API_KEY || '';
  }

  async run(options = {}) {
    if (!this.apiKey) {
      this._log('No FMP_API_KEY set — skipping FMP ingestion');
      return { orgs: 0, financials: 0, errors: 0 };
    }

    const tickers  = options.tickers  || [];
    const exchange = options.exchange || 'NASDAQ,NYSE,TSX';
    const maxOrgs  = options.maxOrgs  || 100;

    this.progress(`Starting FMP ingestion for ${tickers.length || 'screened'} tickers…`);

    // If no tickers provided, screen by exchange
    const tickerList = tickers.length
      ? tickers
      : await this._screenTickers(exchange, maxOrgs);

    let totalOrgs = 0, totalFin = 0, errors = 0;

    for (const ticker of tickerList.slice(0, maxOrgs)) {
      try {
        const profile = await this._fetchProfile(ticker);
        if (!profile) continue;

        const sic = this._mapSic(profile.sector, profile.industry);
        const orgId = await this.upsertOrg({
          name:         profile.companyName,
          sic_code:     sic,
          type:         'Public',
          ticker,
          country_code: profile.country || 'US',
          state:        profile.state || null,
          city:         profile.city  || null,
          description:  profile.description ? profile.description.substring(0, 500) : null,
          employee_count: this.parseNum(profile.fullTimeEmployees),
          source_id:    ticker,
        });

        const fin = await this._fetchFinancials(ticker);
        if (fin) { await this.upsertFinancials(orgId, fin); totalFin++; }

        totalOrgs++;
        if (totalOrgs % 20 === 0) {
          this.progress(`Processed ${totalOrgs} tickers…`, { orgs: totalOrgs });
        }
      } catch (err) {
        errors++;
        this._log(`Error processing ${ticker}: ${err.message}`);
      }
    }

    this.progress(`Complete — ${totalOrgs} orgs, ${totalFin} financials, ${errors} errors`);
    return { orgs: totalOrgs, financials: totalFin, errors };
  }

  async _screenTickers(exchange, limit) {
    const url = `${FMP_BASE}/stock-screener?exchange=${exchange}&limit=${limit}&apikey=${this.apiKey}`;
    const data = await this.fetchWithRetry(url);
    return Array.isArray(data) ? data.map(d => d.symbol).filter(Boolean) : [];
  }

  async _fetchProfile(ticker) {
    const url  = `${FMP_BASE}/profile/${ticker}?apikey=${this.apiKey}`;
    const data = await this.fetchWithRetry(url);
    return Array.isArray(data) && data.length ? data[0] : null;
  }

  async _fetchFinancials(ticker) {
    const url  = `${FMP_BASE}/income-statement/${ticker}?limit=3&apikey=${this.apiKey}`;
    const data = await this.fetchWithRetry(url);
    if (!Array.isArray(data) || !data.length) return null;

    const d    = data[0]; // most recent
    const year = d.date ? parseInt(d.date.substring(0, 4)) : new Date().getFullYear() - 1;
    const rev  = this.parseNum(d.revenue);
    const ni   = this.parseNum(d.netIncome);
    const gp   = this.parseNum(d.grossProfit);
    const oi   = this.parseNum(d.operatingIncome);
    const ebi  = this.parseNum(d.ebitda);

    // Balance sheet
    const bsUrl  = `${FMP_BASE}/balance-sheet-statement/${ticker}?limit=1&apikey=${this.apiKey}`;
    const bsData = await this.fetchWithRetry(bsUrl);
    const bs     = Array.isArray(bsData) && bsData.length ? bsData[0] : {};

    const ta   = this.parseNum(bs.totalAssets);
    const tl   = this.parseNum(bs.totalLiabilities);
    const eq   = this.parseNum(bs.totalStockholdersEquity);
    const cash = this.parseNum(bs.cashAndCashEquivalents);
    const debt = this.parseNum(bs.totalDebt);

    return {
      fiscal_year:          year,
      period_type:          'annual',
      revenue:              rev,
      net_income:           ni,
      gross_profit:         gp,
      operating_income:     oi,
      ebitda:               ebi,
      total_assets:         ta,
      total_liabilities:    tl,
      shareholders_equity:  eq,
      cash_and_equivalents: cash,
      total_debt:           debt,
      net_margin:           rev && ni ? (ni / rev) * 100   : null,
      gross_margin:         rev && gp ? (gp / rev) * 100   : null,
      operating_margin:     rev && oi ? (oi / rev) * 100   : null,
      roe:                  eq  && ni ? (ni / eq) * 100    : null,
      roa:                  ta  && ni ? (ni / ta) * 100    : null,
      debt_to_equity:       eq  && tl ? tl / eq            : null,
    };
  }

  // Map FMP sector/industry strings to SIC codes
  _mapSic(sector, industry) {
    const s = (sector   || '').toLowerCase();
    const i = (industry || '').toLowerCase();

    if (s.includes('bank')    || i.includes('bank'))       return '6022';
    if (s.includes('software')|| i.includes('software'))   return '7372';
    if (s.includes('grocery') || i.includes('food retail'))return '5411';
    if (s.includes('electric')|| i.includes('utilities'))  return '4911';
    if (s.includes('hospital')|| i.includes('hospital'))   return '8062';
    if (s.includes('insurance'))                           return '6311';
    if (s.includes('real estate'))                         return '6512';
    if (s.includes('technology'))                          return '7372';
    if (s.includes('healthcare'))                          return '8099';
    if (s.includes('consumer'))                            return '5900';
    if (s.includes('industrial'))                          return '3559';
    if (s.includes('energy'))                              return '4911';
    if (s.includes('materials'))                           return '2819';
    if (s.includes('communication'))                       return '4813';
    return '9999'; // Unknown
  }
}

module.exports = FmpAdapter;
