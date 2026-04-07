'use strict';

/**
 * FdicAdapter — FDIC BankFind Suite API
 * Covers: All FDIC-insured US banks and savings institutions (SIC 6020, 6021, 6022)
 * API:    https://banks.fdic.gov/api
 * Auth:   None required
 * Note:   FDIC API returns UPPERCASE field names
 */

const BaseAdapter = require('../BaseAdapter');

const FDIC_BASE = 'https://banks.fdic.gov/api';

class FdicAdapter extends BaseAdapter {
  constructor() {
    super({ name: 'FDIC BankFind', countryCode: 'US', rateLimitMs: 250 });
  }

  async run(options = {}) {
    const limit   = options.limit   || 100;
    const maxOrgs = options.maxOrgs || 500;

    this.progress('Starting FDIC BankFind ingestion…');

    // Quick connectivity test before committing to full ingestion
    const testResp = await this.fetchWithRetry(
      `${FDIC_BASE}/institutions?fields=NAME,CERT&limit=1&filters=ACTIVE%3A1&output=json`
    );

    if (!testResp) {
      this._log('FDIC API unreachable (network restriction) — falling back to FMP for banking data');
      return this._fmpFallback(options);
    }

    let totalOrgs = 0, totalFin = 0, errors = 0, offset = 0, hasMore = true;

    while (hasMore && totalOrgs < maxOrgs) {
      const params = new URLSearchParams({
        fields:     'NAME,CERT,STALP,CITY,ASSET,REPDTE,ACTIVE,INSTCAT',
        filters:    'ACTIVE:1',
        limit:      String(Math.min(limit, maxOrgs - totalOrgs)),
        offset:     String(offset),
        sort_by:    'ASSET',
        sort_order: 'DESC',
        output:     'json',
      });

      const resp = await this.fetchWithRetry(`${FDIC_BASE}/institutions?${params}`);
      if (!resp?.data?.length) { hasMore = false; break; }

      for (const item of resp.data) {
        // FDIC returns { data: { NAME, CERT, ... }, links: {...} }
        const inst = item.data || item;
        const cert = inst.CERT || inst.cert;
        const name = inst.NAME || inst.name;
        if (!cert || !name) continue;

        // Map FDIC institution category to SIC
        // INSTCAT: 1=NMB, 2=SMBL, 3=SMBF, 4=CU, 5=OI, 6=SB
        const sic = this._instcatToSic(inst.INSTCAT || inst.instcat);

        try {
          const orgId = await this.upsertOrg({
            name,
            sic_code:     sic,
            type:         'Public',
            country_code: 'US',
            state:        inst.STALP || inst.stalp || null,
            city:         inst.CITY  || inst.city  || null,
            source_id:    String(cert),
          });

          const fin = await this._fetchFinancials(cert);
          if (fin) { await this.upsertFinancials(orgId, fin); totalFin++; }

          totalOrgs++;
          if (totalOrgs % 50 === 0) {
            this.progress(`Processed ${totalOrgs} FDIC institutions…`, { orgs: totalOrgs });
          }
        } catch (err) {
          errors++;
          this._log(`Error on cert ${cert}: ${err.message}`);
        }
      }

      offset  += limit;
      hasMore  = resp.data.length === limit;
    }

    this.progress(`Complete — ${totalOrgs} orgs, ${totalFin} financials, ${errors} errors`);
    return { orgs: totalOrgs, financials: totalFin, errors };
  }

  async _fetchFinancials(cert) {
    const params = new URLSearchParams({
      filters:    `CERT:${cert}`,
      fields:     'REPDTE,ASSET,NETINC,INTINC,EQ,ROA,ROE,RBCRWAJ,EFFRATIO',
      limit:      '1',
      sort_by:    'REPDTE',
      sort_order: 'DESC',
      output:     'json',
    });

    const resp = await this.fetchWithRetry(`${FDIC_BASE}/financials?${params}`);
    if (!resp?.data?.length) return null;

    const raw  = resp.data[0]?.data || resp.data[0];
    if (!raw) return null;

    const year = raw.REPDTE ? parseInt(String(raw.REPDTE).substring(0, 4))
                            : new Date().getFullYear() - 1;

    const toNum = (v) => this.parseNum(v);

    return {
      fiscal_year:         year,
      period_type:         'annual',
      total_assets:        toNum(raw.ASSET   || raw.asset),
      net_income:          toNum(raw.NETINC  || raw.netinc),
      revenue:             toNum(raw.INTINC  || raw.intinc),
      shareholders_equity: toNum(raw.EQ      || raw.eq),
      roa:                 toNum(raw.ROA     || raw.roa),
      roe:                 toNum(raw.ROE     || raw.roe),
      tier1_capital_ratio: toNum(raw.RBCRWAJ || raw.rbcrwaj),
      efficiency_ratio:    toNum(raw.EFFRATIO|| raw.effratio),
    };
  }

  _instcatToSic(instcat) {
    const map = { 1: '6021', 2: '6022', 3: '6022', 4: '6035', 5: '6035', 6: '6020' };
    return map[instcat] || '6022';
  }

  // Fallback: use FMP to fetch major US banks when FDIC is unreachable
  async _fmpFallback(options = {}) {
    const fmpKey = process.env.FMP_API_KEY;
    if (!fmpKey) {
      this._log('No FMP_API_KEY set — cannot use fallback. Skipping FDIC.');
      return { orgs: 0, financials: 0, errors: 0 };
    }

    const US_BANKS = [
      { ticker: 'JPM',  name: 'JPMorgan Chase & Co.',        sic: '6022' },
      { ticker: 'BAC',  name: 'Bank of America Corp.',         sic: '6022' },
      { ticker: 'WFC',  name: 'Wells Fargo & Company',         sic: '6022' },
      { ticker: 'C',    name: 'Citigroup Inc.',                sic: '6022' },
      { ticker: 'USB',  name: 'U.S. Bancorp',                  sic: '6022' },
      { ticker: 'TFC',  name: 'Truist Financial Corp.',         sic: '6022' },
      { ticker: 'PNC',  name: 'PNC Financial Services Group',  sic: '6022' },
      { ticker: 'COF',  name: 'Capital One Financial Corp.',   sic: '6021' },
      { ticker: 'KEY',  name: 'KeyCorp',                       sic: '6022' },
      { ticker: 'RF',   name: 'Regions Financial Corp.',       sic: '6022' },
      { ticker: 'CFG',  name: 'Citizens Financial Group',      sic: '6022' },
      { ticker: 'FITB', name: 'Fifth Third Bancorp',           sic: '6022' },
      { ticker: 'HBAN', name: 'Huntington Bancshares',         sic: '6022' },
      { ticker: 'MTB',  name: 'M&T Bank Corporation',          sic: '6022' },
      { ticker: 'ZION', name: 'Zions Bancorporation',          sic: '6022' },
      { ticker: 'CMA',  name: 'Comerica Incorporated',         sic: '6022' },
      { ticker: 'SBNY', name: 'Signature Bank',                sic: '6022' },
      { ticker: 'SVB',  name: 'SVB Financial Group',           sic: '6022' },
      { ticker: 'PACW', name: 'PacWest Bancorp',               sic: '6022' },
      { ticker: 'WAL',  name: 'Western Alliance Bancorporation',sic: '6022' },
    ];

    let totalOrgs = 0, totalFin = 0, errors = 0;
    this.progress('Using FMP fallback for US banking data…');

    for (const bank of US_BANKS) {
      try {
        const orgId = await this.upsertOrg({
          name: bank.name, sic_code: bank.sic, type: 'Public',
          ticker: bank.ticker, country_code: 'US', source_id: bank.ticker,
        });

        const url  = `https://financialmodelingprep.com/api/v3/income-statement/${bank.ticker}?limit=2&apikey=${fmpKey}`;
        const data = await this.fetchWithRetry(url);
        if (Array.isArray(data) && data.length > 0) {
          const d    = data[0];
          const year = d.date ? parseInt(d.date.substring(0, 4)) : new Date().getFullYear() - 1;
          const rev  = this.parseNum(d.revenue);
          const ni   = this.parseNum(d.netIncome);
          await this.upsertFinancials(orgId, {
            fiscal_year: year, period_type: 'annual',
            revenue: rev, net_income: ni,
            net_margin: rev && ni ? (ni / rev) * 100 : null,
            gross_margin:     this.parseNum(d.grossProfitRatio) * 100 || null,
            operating_margin: this.parseNum(d.operatingIncomeRatio) * 100 || null,
          });
          totalFin++;
        }
        totalOrgs++;
        this.progress('Upserted ' + bank.name + ' (FMP fallback)');
      } catch (e) {
        errors++;
        this._log('FMP fallback error for ' + bank.ticker + ': ' + e.message);
      }
    }

    this.progress('FMP fallback complete — ' + totalOrgs + ' orgs, ' + totalFin + ' financials');
    return { orgs: totalOrgs, financials: totalFin, errors };
  }
}

module.exports = FdicAdapter;