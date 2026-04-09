'use strict';

/**
 * SecEdgarAdapter — SEC EDGAR XBRL Company Facts API
 * Uses bundled edgar-companies.json (generated locally) to avoid
 * data.sec.gov/files/ which is blocked on Azure B1.
 */

const BaseAdapter = require('../BaseAdapter');

const EDGAR_BASE = 'https://data.sec.gov';

// Map EDGAR SIC codes → nearest SIC code in our sic_codes table
// EDGAR has 400+ SIC codes; we have 124. This maps the extras to parents.
const SIC_MAP = {
  // Banking
  '6012': '6022', '6019': '6022', '6020': '6022', '6025': '6022',
  '6026': '6022', '6027': '6022', '6028': '6022', '6029': '6022',
  '6036': '6035', '6037': '6035',
  // Finance
  '6099': '6022', '6100': '6141', '6110': '6141', '6120': '6141',
  '6130': '6159', '6140': '6141', '6150': '6153', '6153': '6153',
  '6159': '6159', '6160': '6159', '6162': '6159', '6163': '6159',
  '6170': '6159', '6180': '6159', '6190': '6159',
  '6200': '6211', '6210': '6211', '6220': '6211', '6230': '6211',
  '6240': '6211', '6250': '6211', '6260': '6211', '6270': '6211',
  '6280': '6282', '6289': '6282', '6290': '6211', '6300': '6311',
  '6310': '6311', '6320': '6321', '6330': '6331', '6340': '6331',
  '6350': '6331', '6360': '6331', '6370': '6331', '6390': '6331',
  '6400': '6411', '6410': '6411', '6500': '6512', '6510': '6512',
  '6512': '6512', '6513': '6512', '6514': '6512', '6515': '6512',
  '6519': '6512', '6530': '6512', '6540': '6512', '6550': '6552',
  '6552': '6552', '6553': '6552', '6700': '6726', '6710': '6726',
  '6719': '6726', '6720': '6726', '6722': '6726', '6726': '6726',
  '6730': '6726', '6732': '6726', '6733': '6726', '6770': '6726',
  '6790': '6726', '6792': '6726', '6794': '6726', '6795': '6726',
  '6798': '6726', '6799': '6726',
  // Tech/Software
  '7370': '7372', '7371': '7372', '7373': '7374', '7375': '7374',
  '7376': '7374', '7377': '7374', '7378': '7374', '7379': '7374',
  // Services
  '7310': '7311', '7312': '7311', '7313': '7311', '7319': '7311',
  '7320': '7389', '7322': '7389', '7323': '7389', '7330': '7389',
  '7331': '7389', '7334': '7389', '7335': '7389', '7336': '7389',
  '7338': '7389', '7340': '7389', '7342': '7389', '7349': '7389',
  '7350': '7389', '7359': '7389', '7360': '7361', '7363': '7361',
  '7380': '7389', '7381': '7389', '7382': '7389', '7383': '7389',
  '7384': '7389', '7389': '7389', '7500': '7500', '7510': '7500',
  '7514': '7500', '7515': '7500', '7519': '7500', '7520': '7500',
  '7521': '7500', '7530': '7500', '7532': '7500', '7533': '7500',
  '7534': '7500', '7536': '7500', '7537': '7500', '7538': '7500',
  '7539': '7500', '7540': '7500', '7542': '7500', '7549': '7500',
  // Entertainment
  '7812': '7812', '7819': '7812', '7820': '7812', '7822': '7812',
  '7829': '7812', '7830': '7929', '7832': '7929', '7833': '7929',
  '7841': '7929', '7900': '7929', '7911': '7929', '7922': '7929',
  '7929': '7929', '7941': '7941', '7948': '7941', '7990': '7929',
  '7991': '7929', '7992': '7929', '7993': '7929', '7996': '7929',
  '7997': '7929', '7999': '7929',
  // Health
  '8000': '8000', '8011': '8011', '8021': '8011', '8041': '8049',
  '8042': '8049', '8049': '8049', '8050': '8062', '8051': '8062',
  '8060': '8062', '8062': '8062', '8069': '8062', '8071': '8731',
  '8072': '8731', '8082': '8062', '8090': '8099', '8093': '8093',
  '8099': '8099',
  // Education
  '8200': '8200', '8211': '8211', '8220': '8221', '8221': '8221',
  '8222': '8221', '8299': '8200', '8300': '8300', '8322': '8322',
  '8331': '8322', '8351': '8322', '8361': '8322', '8399': '8399',
  // Engineering/Mgmt
  '8700': '8711', '8711': '8711', '8712': '8711', '8713': '8711',
  '8720': '8721', '8721': '8721', '8730': '8731', '8731': '8731',
  '8732': '8731', '8733': '8731', '8734': '8731', '8740': '8742',
  '8741': '8742', '8742': '8742', '8743': '8742', '8744': '8742',
  '8748': '8742', '8880': '8742', '8900': '8742',
  // Manufacturing extras
  '2000': '2000', '2010': '2000', '2011': '2000', '2013': '2000',
  '2020': '2000', '2024': '2000', '2030': '2000', '2038': '2000',
  '2040': '2000', '2050': '2000', '2060': '2000', '2070': '2000',
  '2080': '2000', '2082': '2000', '2090': '2000', '2100': '2100',
  '2110': '2100', '2111': '2100', '2200': '2200', '2210': '2200',
  '2211': '2200', '2220': '2200', '2230': '2200', '2250': '2200',
  '2260': '2200', '2270': '2200', '2280': '2200', '2290': '2200',
  '2300': '2300', '2310': '2300', '2320': '2300', '2330': '2300',
  '2340': '2300', '2390': '2300', '2400': '2400', '2410': '2400',
  '2411': '2400', '2420': '2400', '2430': '2400', '2450': '2400',
  '2490': '2400', '2500': '2500', '2510': '2500', '2511': '2500',
  '2520': '2500', '2521': '2500', '2522': '2500', '2590': '2500',
  '2600': '2600', '2610': '2600', '2621': '2600', '2650': '2600',
  '2670': '2600', '2690': '2600', '2700': '2700', '2710': '2700',
  '2711': '2700', '2720': '2700', '2730': '2700', '2740': '2700',
  '2750': '2700', '2760': '2700', '2770': '2700', '2780': '2700',
  '2790': '2700', '2800': '2800', '2810': '2800', '2820': '2800',
  '2830': '2800', '2833': '2800', '2835': '2800', '2836': '2800',
  '2840': '2800', '2850': '2800', '2860': '2800', '2870': '2800',
  '2890': '2800', '2900': '2900', '2910': '2900', '2911': '2900',
  '2950': '2900', '2990': '2900', '3000': '3000', '3010': '3000',
  '3050': '3000', '3060': '3000', '3080': '3000', '3086': '3000',
  '3089': '3000', '3100': '3100', '3140': '3100', '3150': '3100',
  '3160': '3100', '3170': '3100', '3190': '3100', '3200': '3200',
  '3210': '3200', '3211': '3200', '3220': '3200', '3230': '3200',
  '3240': '3200', '3250': '3200', '3260': '3200', '3270': '3200',
  '3280': '3200', '3290': '3200', '3300': '3300', '3310': '3300',
  '3312': '3300', '3316': '3300', '3317': '3300', '3320': '3300',
  '3330': '3300', '3340': '3300', '3350': '3300', '3360': '3300',
  '3390': '3300', '3400': '3400', '3410': '3400', '3411': '3400',
  '3420': '3400', '3430': '3400', '3440': '3400', '3460': '3400',
  '3470': '3400', '3490': '3400', '3500': '3500', '3510': '3500',
  '3523': '3500', '3524': '3500', '3530': '3500', '3531': '3500',
  '3532': '3500', '3533': '3500', '3537': '3500', '3540': '3500',
  '3550': '3559', '3559': '3559', '3560': '3500', '3561': '3500',
  '3562': '3500', '3564': '3500', '3567': '3500', '3569': '3500',
  '3570': '3674', '3571': '3674', '3572': '3674', '3576': '3674',
  '3577': '3674', '3578': '3674', '3579': '3674', '3580': '3500',
  '3590': '3500', '3600': '3600', '3610': '3600', '3612': '3600',
  '3613': '3600', '3620': '3600', '3621': '3600', '3630': '3600',
  '3634': '3600', '3640': '3600', '3641': '3600', '3651': '3600',
  '3652': '3600', '3661': '4813', '3663': '4813', '3669': '3600',
  '3670': '3674', '3672': '3674', '3674': '3674', '3675': '3674',
  '3676': '3674', '3677': '3674', '3678': '3674', '3679': '3674',
  '3690': '3600', '3695': '3600', '3699': '3600', '3700': '3700',
  '3711': '3711', '3713': '3711', '3714': '3711', '3716': '3711',
  '3720': '3700', '3721': '3700', '3724': '3700', '3728': '3700',
  '3730': '3700', '3740': '3700', '3743': '3700', '3750': '3700',
  '3760': '3700', '3790': '3700', '3800': '3800', '3810': '3800',
  '3812': '3800', '3820': '3800', '3821': '3800', '3822': '3800',
  '3823': '3800', '3824': '3800', '3825': '3800', '3826': '3800',
  '3827': '3800', '3829': '3800', '3840': '3800', '3841': '3800',
  '3842': '3800', '3845': '3800', '3851': '3800', '3860': '3800',
  '3861': '3800', '3870': '3800', '3873': '3800', '3900': '3900',
  '3910': '3900', '3911': '3900', '3914': '3900', '3944': '3900',
  '3949': '3900', '3950': '3900', '3960': '3900', '3990': '3900',
  // Transportation
  '4010': '4011', '4011': '4011', '4013': '4011',
  '4100': '4100', '4111': '4100', '4119': '4100', '4120': '4100',
  '4130': '4100', '4131': '4100', '4141': '4100', '4142': '4100',
  '4150': '4100', '4151': '4100', '4173': '4100',
  '4210': '4200', '4212': '4200', '4213': '4200', '4214': '4200',
  '4215': '4200', '4220': '4200', '4221': '4200', '4222': '4200',
  '4230': '4200', '4231': '4200',
  '4400': '4400', '4410': '4400', '4412': '4400', '4424': '4400',
  '4481': '4400', '4489': '4400', '4491': '4400', '4492': '4400',
  '4493': '4400', '4499': '4400',
  '4510': '4500', '4512': '4500', '4513': '4500', '4520': '4500',
  '4522': '4500', '4581': '4500',
  '4610': '4600', '4612': '4600', '4613': '4600', '4619': '4600',
  '4620': '4600', '4700': '4500', '4720': '4500', '4724': '4500',
  '4725': '4500', '4729': '4500', '4730': '4500', '4731': '4500',
  '4780': '4500', '4783': '4500', '4785': '4500', '4789': '4500',
  '4800': '4800', '4810': '4813', '4812': '4813', '4813': '4813',
  '4820': '4813', '4821': '4813', '4830': '4833', '4832': '4833',
  '4833': '4833', '4840': '4813', '4841': '4813', '4890': '4899',
  '4891': '4899', '4892': '4899', '4899': '4899',
  '4910': '4911', '4911': '4911', '4920': '4922', '4922': '4922',
  '4923': '4922', '4924': '4922', '4925': '4922', '4930': '4911',
  '4931': '4911', '4932': '4911', '4939': '4911', '4940': '4941',
  '4941': '4941', '4950': '4953', '4952': '4953', '4953': '4953',
  '4959': '4953', '4990': '4911', '4991': '4911',
  // Retail
  '5000': '5000', '5010': '5000', '5013': '5000', '5020': '5000',
  '5030': '5000', '5040': '5000', '5050': '5000', '5060': '5000',
  '5065': '5000', '5070': '5000', '5080': '5000', '5090': '5000',
  '5100': '5100', '5110': '5100', '5120': '5100', '5130': '5100',
  '5140': '5100', '5150': '5100', '5160': '5100', '5170': '5100',
  '5180': '5100', '5190': '5100',
  '5200': '5200', '5211': '5200', '5251': '5200',
  '5311': '5311', '5331': '5311', '5399': '5311',
  '5410': '5411', '5411': '5411', '5412': '5411', '5420': '5411',
  '5430': '5411', '5440': '5411', '5450': '5411', '5460': '5411',
  '5490': '5411',
  '5500': '5500', '5510': '5500', '5511': '5500', '5521': '5500',
  '5531': '5500', '5561': '5500', '5571': '5500', '5599': '5500',
  '5600': '5600', '5610': '5600', '5620': '5600', '5630': '5600',
  '5640': '5600', '5650': '5600', '5660': '5600', '5690': '5600',
  '5700': '5700', '5710': '5700', '5712': '5700', '5713': '5700',
  '5714': '5700', '5719': '5700', '5720': '5700', '5722': '5700',
  '5731': '5700', '5734': '5700', '5735': '5700', '5736': '5700',
  '5800': '5800', '5810': '5800', '5812': '5800', '5813': '5800',
  '5900': '5900', '5910': '5900', '5912': '5900', '5940': '5900',
  '5945': '5900', '5960': '5900', '5990': '5900',
  // Energy
  '1300': '1311', '1310': '1311', '1311': '1311', '1320': '1311',
  '1321': '1311', '1381': '1311', '1382': '1311', '1389': '1311',
};

// XBRL concept → DB column
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
    super({ name: 'SEC EDGAR XBRL', countryCode: 'US', rateLimitMs: 600 }); // 600ms to avoid 429s
  }

  async run(options = {}) {
    const targetSic     = options.sic || null;
    const maxOrgs       = options.maxOrgs       || 5000;
    const maxOrgsPerSic = options.maxOrgsPerSic || 200;

    this.progress('Starting SEC EDGAR ingestion…');

    const ua = process.env.INGEST_USER_AGENT || 'SectorLens/1.0 (contact@sectorlens.com)';

    // Step 1: Load company list
    const allCompanies = await this._loadCompanyList(ua);
    if (!allCompanies || !allCompanies.length) {
      this._log('Failed to load company list — aborting');
      return { orgs: 0, financials: 0, errors: 0 };
    }
    this._log(`Loaded ${allCompanies.length} companies from EDGAR`);

    // Step 2: Determine target SICs
    let targetSics;
    if (targetSic) {
      targetSics = [targetSic];
    } else {
      try {
        const { db } = require('../../config/database');
        targetSics = await db('sic_codes').pluck('sic_code');
      } catch (e) {
        targetSics = null; // process all companies without SIC filter
      }
    }

    const sicSet = targetSics ? new Set(targetSics) : null;
    this._sicCounts = {}; // reset per run

    // Step 3: Scan companies, check SIC, upsert immediately when matched
    let totalOrgs = 0, totalFin = 0, errors = 0;
    let checked = 0;

    this.progress('Scanning company SIC codes and upserting matches…');

    for (const co of allCompanies) {
      if (totalOrgs >= maxOrgs) break;

      if (checked > 0 && checked % 500 === 0) {
        this.progress(`Scanned ${checked} companies, ${totalOrgs} upserted so far…`);
      }

      try {
        const res = await fetch(`${EDGAR_BASE}/submissions/CIK${co.cik}.json`, {
          headers: { 'User-Agent': ua },
          signal: AbortSignal.timeout(8000),
        });

        if (res.ok) {
          const sub = await res.json();
          const rawSic = String(sub.sic || '').padStart(4, '0');
          if (!rawSic || rawSic === '0000') { checked++; continue; }

          // Map EDGAR SIC → our SIC code (EDGAR has 400+ codes, we have 124)
          const sic = SIC_MAP[rawSic] || rawSic;

          if (sicSet && !sicSet.has(sic)) { checked++; continue; }

          // Check if we already have enough for this SIC
          if (!this._sicCounts) this._sicCounts = {};
          if ((this._sicCounts[sic] || 0) >= maxOrgsPerSic) { checked++; continue; }

          // Upsert immediately — don't wait for full scan
          try {
            const orgId = await this.upsertOrg({
              name:        sub.name || co.name,
              sic_code:    sic,
              type:        'Public',
              ticker:      sub.tickers?.[0] || co.ticker || null,
              source_id:   co.cik,
              source_name: 'SEC_EDGAR',
            });

            const fin = await this._fetchFacts(co.cik);
            if (fin && Object.keys(fin).length > 2) {
              await this.upsertFinancials(orgId, fin);
              totalFin++;
            }

            this._sicCounts[sic] = (this._sicCounts[sic] || 0) + 1;
            totalOrgs++;

            if (totalOrgs % 100 === 0) {
              this.progress(`Upserted ${totalOrgs} companies (scanned ${checked})…`);
            }
          } catch (e) {
            errors++;
            if (!e.message?.includes('FOREIGN KEY')) {
              this._log(`Error ${co.cik}: ${e.message}`);
            }
          }
        }
      } catch (e) {
        // timeout — skip
      }

      checked++;
      await new Promise(r => setTimeout(r, this.rateLimitMs));
    }

    this.progress(`Complete — ${totalOrgs} orgs, ${totalFin} financials, ${errors} errors`);
    return { orgs: totalOrgs, financials: totalFin, errors };
  }

  async _loadCompanyList(ua) {
    // First try: load from bundled static file (generated locally, committed to repo)
    // This avoids the data.sec.gov/files/ path which is blocked on Azure datacenter IPs
    const staticPath = require('path').join(__dirname, '../../../data/edgar-companies.json');
    try {
      const fs = require('fs');
      if (fs.existsSync(staticPath)) {
        const companies = JSON.parse(fs.readFileSync(staticPath, 'utf8'));
        if (companies && companies.length > 100) {
          this._log(`Loaded ${companies.length} companies from bundled edgar-companies.json`);
          return companies;
        }
      }
    } catch (e) {
      this._log(`Could not load bundled company list: ${e.message}`);
    }

    // Fallback: try live EDGAR endpoints (works locally, blocked on Azure B1)
    const endpoints = [
      {
        url: `${EDGAR_BASE}/files/company_tickers.json`,
        parse: (data) => Object.values(data).map(r => ({
          cik:    String(r.cik_str).padStart(10, '0'),
          name:   r.title,
          ticker: r.ticker || null,
        })),
      },
      {
        url: `${EDGAR_BASE}/files/company_tickers_exchange.json`,
        parse: (data) => Object.values(data.data || {}).map(r => ({
          cik:    String(r[0]).padStart(10, '0'),
          name:   r[1],
          ticker: r[2] || null,
        })),
      },
    ];

    for (const ep of endpoints) {
      try {
        const res = await fetch(ep.url, {
          headers: { 'User-Agent': ua, 'Accept': 'application/json' },
          signal: AbortSignal.timeout(30000),
        });
        if (!res.ok) {
          this._log(`${ep.url.split('/').pop()} returned ${res.status}`);
          continue;
        }
        const data = await res.json();
        const companies = ep.parse(data);
        if (companies && companies.length > 100) {
          // Save for next run
          try {
            const fs = require('fs');
            fs.mkdirSync(require('path').dirname(staticPath), { recursive: true });
            fs.writeFileSync(staticPath, JSON.stringify(companies));
            this._log(`Saved ${companies.length} companies to edgar-companies.json`);
          } catch (e) { /* non-critical */ }
          return companies;
        }
      } catch (e) {
        this._log(`${ep.url.split('/').pop()} failed: ${e.message}`);
      }
    }

    this._log('All company list sources failed — EDGAR ingestion cannot run');
    return null;
  }

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

    if (rev && ni)           result.net_margin       = (ni / rev) * 100;
    if (rev && gp)           result.gross_margin     = (gp / rev) * 100;
    if (rev && oi)           result.operating_margin = (oi / rev) * 100;
    if (ni  && se && se > 0) result.roe              = (ni / se)  * 100;
    if (ni  && ta && ta > 0) result.roa              = (ni / ta)  * 100;
    if (ta  && tl) {
      const eq = ta - tl;
      if (eq > 0) result.debt_to_equity = tl / eq;
    }

    return result;
  }
}

module.exports = SecEdgarAdapter;