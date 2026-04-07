'use strict';

/**
 * FmpAdapter — Financial Modeling Prep (new stable API)
 * Endpoint base: https://financialmodelingprep.com/stable/
 * Auth: FMP_API_KEY required
 * Note: v3/v4 endpoints deprecated Aug 2025 — this uses the new /stable/ API
 */

const BaseAdapter = require('./BaseAdapter');

const FMP_BASE = 'https://financialmodelingprep.com/stable';

// Major tickers across all sectors — profile + income statement fetched per ticker
// Organized by SIC to ensure broad sector coverage
const TICKERS_BY_SIC = {
  // US Commercial Banks (6022)
  '6022': ['JPM','BAC','WFC','C','USB','TFC','PNC','COF','KEY','RF','CFG','FITB','HBAN','MTB','ZION','CMA','WAL','EWBC','BOKF','GBCI'],
  // National Banks (6021)
  '6021': ['BK','STT','NTRS','SIVB'],
  // Savings Institutions (6035)
  '6035': ['NYCB','TBK','WSFS','CFFN'],
  // Life Insurance (6311)
  '6311': ['MET','PRU','LNC','UNM','AFL','GL','PFG','AMP','BHF','EQH'],
  // Property & Casualty (6331)
  '6331': ['BRK-B','AIG','TRV','ALL','CB','HIG','CNA','WRB','MKL','RLI'],
  // Security Brokers (6211)
  '6211': ['GS','MS','SCHW','RJF','SF','IBKR','LPLA','EVR','PJT','MC'],
  // Investment Offices (6726)
  '6726': ['BX','KKR','APO','CG','ARES','OWL','BAM','BN','TPG','EQT'],
  // Software (7372)
  '7372': ['MSFT','AAPL','GOOGL','META','CRM','ORCL','SAP','ADBE','NOW','SNOW','PLTR','DDOG','ZS','PANW','TEAM'],
  // Semiconductors (3674)
  '3674': ['NVDA','TSM','AVGO','QCOM','TXN','AMAT','LRCX','KLAC','MRVL','ON','NXPI','STM','ADI','MCHP','SWKS'],
  // Electric Services (4911)
  '4911': ['NEE','DUK','SO','D','AEP','EXC','SRE','PCG','ED','ETR','FE','PPL','XEL','ES','CMS'],
  // Telephone (4813)
  '4813': ['T','VZ','TMUS','LUMN','USM','SHEN','TDS','CNSL','OOMA','ATUS'],
  // Oil & Gas (1311)
  '1311': ['XOM','CVX','COP','EOG','PXD','DVN','OXY','FANG','MRO','APA','HAL','SLB','BKR','HP','NOV'],
  // Hospitals (8062)
  '8062': ['HCA','UHS','THC','CYH','SGRY','SEM','ENSG','ADUS','AMED','AMEDISYS'],
  // Healthcare Services (8099)
  '8099': ['UNH','CVS','CI','HUM','ELV','MOH','CNC','OSCR','BHVN'],
  // Prepackaged Software (7372) - additional
  '7374': ['IBM','ACN','CTSH','EPAM','GLOB','INFY','WIT','HCL'],
  // Grocery (5411)
  '5411': ['KR','SFM','GO','WFRD','PFGC','SPTN','UNFI'],
  // Restaurants (5800)
  '5800': ['MCD','SBUX','CMG','YUM','QSR','DPZ','WING','TXRH','DINE','CAKE'],
  // Department Stores (5311)
  '5311': ['WMT','TGT','COST','BJ','DG','DLTR','FIVE','OLLI'],
  // Motor Vehicles (3711)
  '3711': ['TSLA','F','GM','RIVN','LCID','FSR','STLA','TM','HMC'],
  // Airlines (4500)
  '4500': ['DAL','UAL','AAL','LUV','ALK','SAVE','HA','JBLU','ULCC','SKYW'],
  // Railroads (4011)
  '4011': ['UNP','CSX','NSC','KCS','CNI','CP','WAB','TRN','GWR'],
  // Trucking (4200)
  '4200': ['UPS','FDX','ODFL','SAIA','XPO','JBHT','WERN','CHRW','ECHO','LSTR'],
  // Real Estate (6512)
  '6512': ['PLD','AMT','EQIX','SPG','O','VICI','PSA','EXR','AVB','EQR'],
  // Chemicals (2800)
  '2800': ['LIN','APD','SHW','PPG','RPM','EMN','AXTA','HUN','OLN','CC'],
  // Engineering (8711)
  '8711': ['EMR','HON','ITW','GE','MMM','CAT','DE','PH','ROK','XYL'],
  // Management Consulting (8742)
  '8742': ['MCK','FIS','FLT','BR','G','BAH','CACI','SAIC','LDOS','DXC'],
  // Food Manufacturing (2000)
  '2000': ['MDLZ','CPB','GIS','K','CAG','MKC','SJM','HRL','LNDC','JJSF'],
  // Hotels (7011)
  '7011': ['MAR','HLT','H','IHG','WH','HGV','TNL','VAC','PLYA','RHP'],
  // Research (8731)
  '8731': ['TMO','DHR','A','BIO','TECH','MEDP','CRL','ICLR','MEDP','LABP'],
  // Legal Services (8111)
  '8111': ['LZ','NVEE','LAWS'],
  // Advertising (7311)
  '7311': ['OMC','IPG','PUBM','MGNI','TTD','DV','IAS','CRIT'],
  // Natural Gas (4922)
  '4922': ['SRE','NI','ATO','CNP','UGI','SR','NW','NGAS'],
};

class FmpAdapter extends BaseAdapter {
  constructor() {
    super({ name: 'Financial Modeling Prep', countryCode: null, rateLimitMs: 300 });
  }

  async run(options = {}) {
    const apiKey    = process.env.FMP_API_KEY;
    const targetSic = options.sic || null;
    const maxOrgs   = options.maxOrgs || 500;

    if (!apiKey) {
      this._log('No FMP_API_KEY — skipping');
      return { orgs: 0, financials: 0, errors: 0 };
    }

    this.progress('Starting FMP ingestion (new stable API)…');
    let totalOrgs = 0, totalFin = 0, errors = 0;

    // Determine which SICs / tickers to process
    const sicsToProcess = targetSic
      ? (TICKERS_BY_SIC[targetSic] ? { [targetSic]: TICKERS_BY_SIC[targetSic] } : {})
      : TICKERS_BY_SIC;

    for (const [sic, tickers] of Object.entries(sicsToProcess)) {
      if (totalOrgs >= maxOrgs) break;

      for (const ticker of tickers) {
        if (totalOrgs >= maxOrgs) break;
        try {
          // Get company profile (name, SIC, exchange, employees)
          const profiles = await this.fetchWithRetry(
            `${FMP_BASE}/profile?symbol=${ticker}&apikey=${apiKey}`
          );
          if (!Array.isArray(profiles) || !profiles.length) continue;
          const p = profiles[0];

          // Get income statement
          const stmts = await this.fetchWithRetry(
            `${FMP_BASE}/income-statement?symbol=${ticker}&limit=2&apikey=${apiKey}`
          );
          const stmt = Array.isArray(stmts) && stmts.length ? stmts[0] : null;

          const orgId = await this.upsertOrg({
            name:           p.companyName || ticker,
            sic_code:       sic,
            type:           'Public',
            ticker:         ticker,
            country_code:   p.country || 'US',
            state:          p.state   || null,
            city:           p.city    || null,
            employee_count: p.fullTimeEmployees || null,
            description:    p.description ? p.description.substring(0, 500) : null,
            source_id:      p.cik || ticker,
            source_name:    'FMP',
          });

          if (stmt) {
            const rev = this.parseNum(stmt.revenue);
            const ni  = this.parseNum(stmt.netIncome);
            const gp  = this.parseNum(stmt.grossProfit);
            const oi  = this.parseNum(stmt.operatingIncome);
            const ta  = this.parseNum(stmt.totalAssets);
            const se  = this.parseNum(stmt.totalStockholdersEquity);
            const fy  = stmt.fiscalYear ? parseInt(stmt.fiscalYear) : new Date().getFullYear() - 1;

            await this.upsertFinancials(orgId, {
              fiscal_year:         fy,
              period_type:         'annual',
              revenue:             rev,
              net_income:          ni,
              gross_profit:        gp,
              operating_income:    oi,
              total_assets:        ta,
              shareholders_equity: se,
              gross_margin:        rev && gp  ? (gp  / rev) * 100 : null,
              operating_margin:    rev && oi  ? (oi  / rev) * 100 : null,
              net_margin:          rev && ni  ? (ni  / rev) * 100 : null,
              roe:                 se  && ni  ? (ni  / se)  * 100 : null,
            });
            totalFin++;
          }

          totalOrgs++;
          if (totalOrgs % 10 === 0) {
            this.progress(`Processed ${totalOrgs} companies (latest: ${ticker})…`);
          }
        } catch (e) {
          errors++;
          this._log(`Error on ${ticker}: ${e.message}`);
        }
      }
    }

    this.progress(`Complete — ${totalOrgs} orgs, ${totalFin} financials, ${errors} errors`);
    return { orgs: totalOrgs, financials: totalFin, errors };
  }
}

module.exports = FmpAdapter;
