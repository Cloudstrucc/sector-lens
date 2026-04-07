'use strict';

/**
 * CompaniesHouseAdapter — UK Companies House API
 * Covers: All UK registered companies — annual accounts, financials
 * API:    https://api.company-information.service.gov.uk
 * Auth:   Free API key from developer.company-information.service.gov.uk
 * Limit:  600 req/5min (~2 req/sec) — 500ms delay
 */

const BaseAdapter = require('../BaseAdapter');

const CH_BASE = 'https://api.company-information.service.gov.uk';

// UK SIC codes → our SIC mapping (UK uses SIC 2007, slightly different)
// We map to nearest US SIC equivalent for cross-sector benchmarking
const UK_SIC_MAP = {
  '64110': '6022', // Central banking
  '64191': '6022', // Banks (retail)
  '64192': '6022', // Building societies
  '64910': '6153', // Financial leasing
  '64999': '6159', // Other financial services
  '65110': '6311', // Life insurance
  '65120': '6321', // Non-life insurance
  '66110': '6211', // Stock exchange
  '47110': '5411', // Supermarkets
  '35110': '4911', // Electric power generation
  '86100': '8062', // Hospital activities
  '72190': '8731', // R&D
  '62010': '7372', // Computer programming
};

class CompaniesHouseAdapter extends BaseAdapter {
  constructor() {
    super({ name: 'COMPANIES_HOUSE_UK', countryCode: 'GB', rateLimitMs: 500 });
    this.apiKey = process.env.COMPANIES_HOUSE_API_KEY || '';
  }

  async run(options = {}) {
    if (!this.apiKey) {
      this._log('No COMPANIES_HOUSE_API_KEY set — skipping UK Companies House ingestion');
      return { orgs: 0, financials: 0, errors: 0 };
    }

    const targetSic = options.sic  || null;
    const maxOrgs   = options.maxOrgs || 100;
    this.progress(`Starting Companies House UK ingestion${targetSic ? ` for SIC ${targetSic}` : ''}…`);

    // Search by SIC code using Companies House advanced search
    const ukSicCodes = targetSic
      ? this._getUkSicsForUs(targetSic)
      : Object.keys(UK_SIC_MAP);

    let totalOrgs = 0, totalFin = 0, errors = 0;

    for (const ukSic of ukSicCodes.slice(0, 5)) { // Rate-limit scope
      const companies = await this._searchBySic(ukSic, Math.min(25, maxOrgs));

      for (const co of companies) {
        if (totalOrgs >= maxOrgs) break;
        try {
          const usSic = UK_SIC_MAP[ukSic] || ukSic;
          const orgId = await this.upsertOrg({
            name:         co.title,
            sic_code:     usSic,
            type:         this._coType(co.company_type),
            country_code: 'GB',
            city:         co.registered_office_address?.locality || null,
            source_id:    co.company_number,
          });

          // Fetch filing history for financials
          const fin = await this._fetchFilingFinancials(co.company_number);
          if (fin) { await this.upsertFinancials(orgId, fin); totalFin++; }

          totalOrgs++;
        } catch (err) {
          errors++;
          this._log(`Error processing ${co.company_number}: ${err.message}`);
        }
      }
    }

    this.progress(`Complete — ${totalOrgs} orgs, ${totalFin} financials, ${errors} errors`);
    return { orgs: totalOrgs, financials: totalFin, errors };
  }

  async _searchBySic(ukSic, limit = 25) {
    const params = new URLSearchParams({
      sic_codes: ukSic,
      company_status: 'active',
      size: String(limit),
    });

    const data = await this.fetchWithRetry(
      `${CH_BASE}/advanced-search/companies?${params}`,
      { headers: { Authorization: `Basic ${Buffer.from(this.apiKey + ':').toString('base64')}` } }
    );

    return data?.items || [];
  }

  async _fetchFilingFinancials(companyNumber) {
    // Companies House provides filing history but not structured financials
    // For financial data, iXBRL-tagged accounts are available in the filing docs
    // This is a simplified version — full implementation would parse iXBRL
    const data = await this.fetchWithRetry(
      `${CH_BASE}/company/${companyNumber}/filing-history?category=accounts&items_per_page=1`,
      { headers: { Authorization: `Basic ${Buffer.from(this.apiKey + ':').toString('base64')}` } }
    );

    if (!data?.items?.length) return null;

    // Filing exists but parsing iXBRL is complex — return placeholder
    // Full implementation: download the document, parse XBRL tags
    return null;
  }

  _coType(chType) {
    const map = {
      'ltd': 'Private', 'plc': 'Public', 'llp': 'Private',
      'registered-society': 'NGO', 'charitable-incorporated-organisation': 'NGO',
    };
    return map[chType] || 'Private';
  }

  _getUkSicsForUs(usSic) {
    return Object.entries(UK_SIC_MAP)
      .filter(([, v]) => v === usSic)
      .map(([k]) => k);
  }
}

module.exports = CompaniesHouseAdapter;
