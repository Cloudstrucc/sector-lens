'use strict';

/**
 * SecEdgarAdapter — SEC EDGAR XBRL Company Facts API
 * Uses hardcoded CIK list per SIC code as fallback when index is unavailable.
 * Auth: INGEST_USER_AGENT required
 */

const BaseAdapter = require('../BaseAdapter');

const EDGAR_BASE = 'https://data.sec.gov';

// Known CIKs organized by SIC code — used when company_tickers_exchange.json is unavailable
const KNOWN_CIKS = {
  '6022': ['0000019617','0000070858','0000072971','0000831001','0000036104',
           '0000092122','0000049196','0001562762','0000354963','0001281761',
           '0001540947','0000035527','0000049196','0000036270','0000109380',
           '0000028412','0001652044','0000018349'],
  '6021': ['0001390777','0001039828','0000049196','0000070858'],
  '6035': ['0001301171','0000813672','0000315959','0000886136'],
  '6211': ['0000886982','0000895421','0001166928','0001370946',
           '0001364885','0001418819','0000823768','0001418819'],
  '6311': ['0001099219','0001137774','0000040533','0000100517','0000004977'],
  '6331': ['0001067983','0000005765','0000086312','0000899051','0000021175'],
  '6726': ['0001393818','0001551152','0001278752','0001655050','0001534992'],
  '7372': ['0000789019','0000320193','0001652044','0001326801','0001108524',
           '0001341439','0001018724','0001571123','0001467373','0001373715',
           '0001682852','0001101239','0001639920','0001467373'],
  '3674': ['0001045810','0000002488','0000050863','0000813272','0000097476',
           '0000796343','0000006951','0000707179','0000723254'],
  '4911': ['0000753308','0000018888','0000092122','0000018888','0000004904',
           '0000049648','0000086312'],
  '4813': ['0000732717','0000101830','0001283699'],
  '1311': ['0000034088','0000093410','0001163165','0000821189','0001038357',
           '0000090303','0000797468'],
  '8062': ['0000860730','0000352915','0001360853'],
  '5411': ['0000056873','0000107687','0000891482'],
  '3711': ['0001318605','0000037996','0000040987'],
  '6512': ['0001045609','0000049600','0001045609'],
  '4011': ['0000100885','0000702162','0000702198'],
  '4200': ['0000049196','0000078814','0000049196'],
  '4500': ['0000319687','0000100517','0000004515'],
  '8731': ['0000085254','0000313616','0001792789'],
  '8711': ['0000032604','0000773840','0000217346','0000202058'],
  '8742': ['0000051143','0001336920','0001336894','0001336920'],
  '2800': ['0000079879','0000023632','0000081955','0000087565'],
  '2000': ['0000073309','0000016160','0000040987','0000073309'],
  '5800': ['0000067887','0000829224','0001018724','0000916789'],
  '7311': ['0000029989','0000096289','0000096289'],
  '7011': ['0001048268','0000316206','0000316206'],
  '4922': ['0000086312','0000049648','0000049648'],
  '8221': ['0000912093','0000912093','0000912093'],
  '8111': ['0001662991','0001662991'],
  '0100': ['0001144519','0000316888','0000844726'],
  '0200': ['0000100493','0000016160','0001609065'],
  '0700': ['0000040987','0001048268','0000023217'],
  '0800': ['0000106535','0000060519','0001393818'],
  '0900': ['0001070412','0000936468'],
  '1000': ['0000831259','0001164180','0001102426'],
  '1200': ['0001037676','0001070412','0001745637'],
  '1400': ['0001396033','0000916789','0001396033'],
  '1500': ['0000045012','0000060667','0000794170'],
  '1600': ['0000868780','0000052827','0001466011'],
  '1731': ['0001012139','0001037676','0001396033'],
  '1740': ['0001609065','0001012139'],
  '2100': ['0000764180','0001413159','0000078814'],
  '2200': ['0001359841','0000078239','0000049598'],
  '2300': ['0000103379','0000094845','0000320187'],
  '2400': ['0000106535','0000060519','0000798354'],
  '2500': ['0000064803','0000728819','0001616862'],
  '2600': ['0000049826','0001408075','0000075829'],
  '2700': ['0000029332','0001437107','0000813828'],
  '2900': ['0001035002','0001510295','0001534992'],
  '3000': ['0000042582','0000851968','0000048898'],
  '3100': ['0000110471','0000919012','0001636765'],
  '3200': ['0000075473','0001370946','0000823768'],
  '3300': ['0001022671','0000073309','0000101830'],
  '3400': ['0000076334','0000049196','0000046619'],
  '3500': ['0000018230','0000315189','0000026172'],
  '3559': ['0000006951','0000707179','0000723254'],
  '3700': ['0000012927','0000040533','0000101830'],
  '3800': ['0000773840','0000085254','0000006955'],
  '3900': ['0000066740','0000058492','0000051143'],
  '4100': ['0000101179','0000060714'],
  '4400': ['0000055242','0000040211'],
  '4600': ['0000049648','0000086312'],
  '4800': ['0001166691','0001091907','0001037038'],
  '4833': ['0001754301','0001579982','0001328792'],
  '4899': ['0001737287','0000067215'],
  '4941': ['0001410636','0001039828'],
  '4953': ['0000823768','0001060349','0001382215'],
  '5000': ['0000277135','0000040987','0000064803'],
  '5100': ['0000927653','0001519061','0000086312'],
  '5200': ['0000354950','0000060667'],
  '5500': ['0000350698','0000887359','0001023128'],
  '5600': ['0000039911','0001555280','0000059478'],
  '5700': ['0000945114','0001397187','0000064803'],
  '5900': ['0001439124','0001555280','0000064803'],
  '6020': ['0000049196','0000040987'],
  '6099': ['0001141391','0001403161','0001633917'],
  '6141': ['0001393612','0001601712','0001393785'],
  '6153': ['0001601712','0000883948'],
  '6200': ['0001358190','0000886982'],
  '6282': ['0001364742','0001113169','0001393818'],
  '6411': ['0000062234','0000315293','0000025475'],
  '6500': ['0001045609','0000315293'],
  '6552': ['0000794170','0000795266','0001418819'],
  '7200': ['0000085408','0000089089','0001594686'],
  '7374': ['0000798354','0000798941','0000277135'],
  '7389': ['0000723254','0000029332','0001018724'],
  '7500': ['0000898173','0000866787','0001144519'],
  '7600': ['0000040554','0000773840'],
  '7812': ['0001065280','0001437107','0000813828'],
  '7929': ['0001335258','0001234524','0000319201'],
  '8000': ['0000927066','0001628290','0001631574'],
  '8011': ['0001628290','0001720923','0000911144'],
  '8049': ['0001091907'],
  '8093': ['0001628290','0000911144'],
  '8211': ['0001632828','0000912093'],
  '8300': ['0001628290','0000912093'],
  '8322': ['0001628290'],
  '8600': ['0000912093','0000315293'],
  '8700': ['0001336920','0001336894','0001466011'],
  '8721': ['0000012927','0001666268','0001393818'],
};

// XBRL concept → DB column (priority order — first match wins)
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

    // Try loading full company index
    const indexCompanies = await this._loadCompanyIndex();
    const useIndex = indexCompanies && indexCompanies.length > 100;
    this._log(useIndex
      ? `Loaded ${indexCompanies.length} companies from EDGAR index`
      : 'EDGAR index unavailable — using known CIK list');

    let totalOrgs = 0, totalFin = 0, errors = 0;

    // ── Determine which SICs to process — ALWAYS respect targetSic ──────────
    let sicsToProcess;
    if (targetSic) {
      sicsToProcess = [targetSic];
    } else if (sicList && sicList.length) {
      sicsToProcess = sicList;
    } else {
      sicsToProcess = Object.keys(KNOWN_CIKS);
    }

    for (const sic of sicsToProcess) {
      if (totalOrgs >= maxOrgs) break;

      let companies = [];

      if (useIndex) {
        // Filter index companies by SIC — check submissions for each
        const sample = indexCompanies.slice(0, 500);
        for (const co of sample) {
          if (companies.length >= maxOrgsPerSic) break;
          try {
            const sub = await this.fetchWithRetry(
              `${EDGAR_BASE}/submissions/CIK${co.cik}.json`
            );
            if (sub && String(sub.sic || '').padStart(4, '0') === sic) {
              companies.push({ ...co, sic, name: sub.name, ticker: sub.tickers?.[0] || null });
            }
          } catch (e) { /* skip */ }
        }
      } else {
        // Hardcoded CIK fallback — only process known CIKs for this specific SIC
        const knownCiks = KNOWN_CIKS[sic] || [];
        if (!knownCiks.length) {
          this._log(`SIC ${sic}: no known CIKs — skipping`);
          continue;
        }
        companies = knownCiks.slice(0, maxOrgsPerSic).map(cik => ({
          cik: cik.replace(/^0+/, '').padStart(10, '0'),
          name: null, ticker: null, sic,
        }));
      }

      if (!companies.length) {
        this._log(`SIC ${sic}: no companies found`);
        continue;
      }

      for (const co of companies) {
        if (totalOrgs >= maxOrgs) break;
        try {
          let { name, ticker } = co;

          // Resolve name/ticker from submissions if not known
          if (!name) {
            const sub = await this.fetchWithRetry(
              `${EDGAR_BASE}/submissions/CIK${co.cik}.json`
            );
            if (!sub || !sub.name) continue;
            name   = sub.name;
            ticker = sub.tickers?.[0] || null;
          }

          const orgId = await this.upsertOrg({
            name, sic_code: sic, type: 'Public',
            ticker, source_id: co.cik, source_name: 'SEC_EDGAR',
          });

          // Fetch XBRL financial facts from companyfacts API
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

      this._log(`SIC ${sic}: ${companies.length} companies processed`);
    }

    this.progress(`Complete — ${totalOrgs} orgs, ${totalFin} financials, ${errors} errors`);
    return { orgs: totalOrgs, financials: totalFin, errors };
  }

  async _loadCompanyIndex() {
    try {
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
    // CIK must be zero-padded to 10 digits for the companyfacts API
    const paddedCik = String(cik).replace(/^0+/, '').padStart(10, '0');
    const data = await this.fetchWithRetry(
      `${EDGAR_BASE}/api/xbrl/companyfacts/CIK${paddedCik}.json`
    );
    if (!data || !data.facts) return null;

    const usgaap = data.facts['us-gaap'] || {};
    const result = { fiscal_year: new Date().getFullYear() - 1, period_type: 'annual' };

    for (const [concept, col] of CONCEPT_MAP) {
      if (result[col]) continue; // already filled by higher-priority concept
      const units = usgaap[concept]?.units?.USD;
      if (!units || !units.length) continue;

      // Find most recent annual 10-K filing
      const annual = units
        .filter(e => e.form === '10-K' && e.fp === 'FY' && e.val != null)
        .sort((a, b) => b.end.localeCompare(a.end));

      if (annual.length > 0) {
        result[col]        = annual[0].val;
        result.fiscal_year = parseInt(annual[0].end.substring(0, 4));
      }
    }

    // Derive margin ratios
    const { revenue: rev, net_income: ni, gross_profit: gp,
            operating_income: oi, total_assets: ta,
            total_liabilities: tl, shareholders_equity: se } = result;

    if (rev && ni)  result.net_margin       = (ni / rev) * 100;
    if (rev && gp)  result.gross_margin     = (gp / rev) * 100;
    if (rev && oi)  result.operating_margin = (oi / rev) * 100;
    if (ni  && se && se > 0) result.roe     = (ni / se)  * 100;
    if (ta  && tl)  {
      const equity = ta - tl;
      if (equity > 0) result.debt_to_equity = tl / equity;
    }

    return result;
  }
}

module.exports = SecEdgarAdapter;