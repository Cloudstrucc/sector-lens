'use strict';

/**
 * ProPublicaAdapter — ProPublica Nonprofit Explorer API
 * Covers: All US nonprofits — IRS Form 990 financial data
 * API:    https://projects.propublica.org/nonprofits/api/v2
 * Auth:   None required
 * Limit:  No published limit — 500ms delay
 */

const BaseAdapter = require('../BaseAdapter');

const PP_BASE = 'https://projects.propublica.org/nonprofits/api/v2';

// Map NTEE (National Taxonomy of Exempt Entities) major groups to SIC codes
const NTEE_TO_SIC = {
  A: '7929', // Arts, Culture — Performing Arts
  B: '8200', // Education
  C: '8711', // Environment
  D: '0742', // Animal-related
  E: '8062', // Health — Hospitals
  F: '8093', // Mental Health
  G: '8099', // Disease & Disorders
  H: '8731', // Medical Research
  I: '7389', // Crime & Legal
  J: '7361', // Employment
  K: '5411', // Food, Agriculture
  L: '6552', // Housing
  M: '9223', // Public Safety
  N: '7941', // Recreation & Sports
  O: '8322', // Youth Development
  P: '8399', // Human Services
  Q: '8699', // International
  R: '8641', // Civil Rights
  S: '8699', // Community Improvement
  T: '6726', // Philanthropy
  U: '8731', // Science & Technology
  V: '8399', // Social Science
  W: '9199', // Public & Societal Benefit
  X: '8661', // Religion
  Y: '6321', // Mutual & Member Benefit
  Z: '8399', // Unknown
};

class ProPublicaAdapter extends BaseAdapter {
  constructor() {
    super({ name: 'PROPUBLICA_990', countryCode: 'US', rateLimitMs: 500 });
  }

  async run(options = {}) {
    const query    = options.query   || '';
    const state    = options.state   || '';
    const ntee     = options.ntee    || '';
    const maxOrgs  = options.maxOrgs || 200;

    this.progress('Starting ProPublica 990 ingestion…');
    let totalOrgs = 0, totalFin = 0, errors = 0, page = 0;

    while (totalOrgs < maxOrgs) {
      const params = new URLSearchParams({ q: query, page: String(page) });
      if (state) params.set('state[id]', state);
      if (ntee)  params.set('ntee[id]',  ntee);

      const data = await this.fetchWithRetry(`${PP_BASE}/search.json?${params}`);
      if (!data?.organizations?.length) break;

      for (const org of data.organizations) {
        if (totalOrgs >= maxOrgs) break;
        try {
          const sic = this._nteeToSic(org.ntee_code);

          const orgId = await this.upsertOrg({
            name:      org.name,
            sic_code:  sic,
            type:      'NGO',
            state:     org.state,
            city:      org.city,
            source_id: org.ein,
          });

          // Fetch detailed filing for financials
          if (org.ein) {
            const fin = await this._fetchOrgFinancials(org.ein);
            if (fin) { await this.upsertFinancials(orgId, fin); totalFin++; }
          }

          totalOrgs++;
        } catch (err) {
          errors++;
          this._log(`Error processing EIN ${org.ein}: ${err.message}`);
        }
      }

      this.progress(`Fetched ${totalOrgs} nonprofits…`, { orgs: totalOrgs });
      page++;
      if (!data.num_pages || page >= data.num_pages) break;
    }

    this.progress(`Complete — ${totalOrgs} orgs, ${totalFin} financials, ${errors} errors`);
    return { orgs: totalOrgs, financials: totalFin, errors };
  }

  async _fetchOrgFinancials(ein) {
    const data = await this.fetchWithRetry(`${PP_BASE}/organizations/${ein}.json`);
    if (!data?.organization) return null;

    const org     = data.organization;
    const filings = data.filings_with_data || [];
    if (!filings.length) return null;

    // Most recent filing
    const f = filings[0];
    const year = f.tax_prd_yr ? parseInt(f.tax_prd_yr) : new Date().getFullYear() - 1;

    const revenue  = this.parseNum(f.totrevenue);
    const expenses = this.parseNum(f.totfuncexpns);
    const assets   = this.parseNum(f.totassetsend);
    const netAssets= this.parseNum(f.totnetassets);

    const net_income = (revenue != null && expenses != null) ? revenue - expenses : null;

    return {
      fiscal_year:         year,
      period_type:         'annual',
      revenue,
      net_income,
      total_assets:        assets,
      shareholders_equity: netAssets,
      net_margin:          (revenue && net_income) ? (net_income / revenue) * 100 : null,
    };
  }

  _nteeToSic(nteeCode) {
    if (!nteeCode) return '8399'; // default to Social Services
    const major = nteeCode.charAt(0).toUpperCase();
    return NTEE_TO_SIC[major] || '8399';
  }
}

module.exports = ProPublicaAdapter;
