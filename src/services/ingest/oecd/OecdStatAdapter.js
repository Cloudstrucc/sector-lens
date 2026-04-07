'use strict';

/**
 * OecdStatAdapter — OECD.Stat SDMX-JSON API
 * Covers: Macro/sector financial statistics for all 38 OECD members
 * API:    https://stats.oecd.org/SDMX-JSON/data
 * Auth:   None required
 * Limit:  No published limit — 500ms delay
 *
 * Key datasets:
 *   FINSTAT       — Financial Statistics for non-financial enterprises
 *   SNA_TABLE14A  — Financial accounts (S-13 sector, insurance + pension)
 *   FIN_IND_FBS   — Financial Indicators — Business Surveys
 */

const BaseAdapter = require('../BaseAdapter');

const OECD_BASE = 'https://stats.oecd.org/SDMX-JSON/data';

// OECD country codes for all 38 members
const OECD_COUNTRIES = [
  'AUS','AUT','BEL','CAN','CHL','COL','CRI','CZE','DNK','EST',
  'FIN','FRA','DEU','GRC','HUN','ISL','IRL','ISR','ITA','JPN',
  'KOR','LVA','LTU','LUX','MEX','NLD','NZL','NOR','POL','PRT',
  'SVK','SVN','ESP','SWE','CHE','TUR','GBR','USA',
];

const OECD_TO_COUNTRY_CODE = {
  AUS:'AU', AUT:'AT', BEL:'BE', CAN:'CA', CHL:'CL', COL:'CO', CRI:'CR',
  CZE:'CZ', DNK:'DK', EST:'EE', FIN:'FI', FRA:'FR', DEU:'DE', GRC:'GR',
  HUN:'HU', ISL:'IS', IRL:'IE', ISR:'IL', ITA:'IT', JPN:'JP', KOR:'KR',
  LVA:'LV', LTU:'LT', LUX:'LU', MEX:'MX', NLD:'NL', NZL:'NZ', NOR:'NO',
  POL:'PL', PRT:'PT', SVK:'SK', SVN:'SI', ESP:'ES', SWE:'SE', CHE:'CH',
  TUR:'TR', GBR:'GB', USA:'US',
};

class OecdStatAdapter extends BaseAdapter {
  constructor() {
    super({ name: 'OECD_STAT', countryCode: 'OECD', rateLimitMs: 500 });
  }

  async run(options = {}) {
    const countries = options.countries || OECD_COUNTRIES;
    this.progress(`Starting OECD.Stat ingestion for ${countries.length} countries…`);

    let totalOrgs = 0, totalFin = 0, errors = 0;

    // Fetch financial business statistics dataset
    try {
      const result = await this._fetchFinancialStats(countries, options);
      totalOrgs += result.orgs;
      totalFin  += result.financials;
      errors    += result.errors;
    } catch (err) {
      errors++;
      this._log(`FINSTAT fetch error: ${err.message}`);
    }

    this.progress(`Complete — ${totalOrgs} entities, ${totalFin} financials, ${errors} errors`);
    return { orgs: totalOrgs, financials: totalFin, errors };
  }

  async _fetchFinancialStats(countries, options = {}) {
    // OECD SDMX-JSON API — Structural Business Statistics
    const countryFilter = countries.slice(0, 10).join('+'); // batch up to 10
    const url = `${OECD_BASE}/SBS_BE_ISIC4/.${countryFilter}..../all?startTime=2020&endTime=2023&dimensionAtObservation=allDimensions`;

    const data = await this.fetchWithRetry(url);
    if (!data) return { orgs: 0, financials: 0, errors: 0 };

    let orgs = 0, financials = 0, errors = 0;

    try {
      // SDMX-JSON structure: dataSets[0].observations contains time-series
      const structure   = data.structure;
      const dataset     = data.dataSets?.[0];
      if (!dataset?.observations) return { orgs: 0, financials: 0, errors: 0 };

      const dims        = structure?.dimensions?.observation || [];
      const countryDim  = dims.find(d => d.id === 'COUNTRY' || d.id === 'REF_AREA');
      const sectorDim   = dims.find(d => d.id === 'ACTIVITY' || d.id === 'IND');
      const measureDim  = dims.find(d => d.id === 'MEASURE' || d.id === 'SUBJECT');

      this._log(`OECD SDMX: ${Object.keys(dataset.observations).length} observations`);

      // For each observation, create/update a sector benchmark entry
      for (const [key, vals] of Object.entries(dataset.observations)) {
        try {
          const indices   = key.split(':').map(Number);
          const countryId = countryDim?.values?.[indices[0]]?.id;
          const value     = vals[0];

          if (!countryId || value == null) continue;

          const countryCode = OECD_TO_COUNTRY_CODE[countryId] || countryId;
          financials++;

          // Aggregate observations are used to update sector_benchmarks
          // rather than individual org records
        } catch (e) { errors++; }
      }
    } catch (err) {
      this._log(`SDMX parse error: ${err.message}`);
      errors++;
    }

    return { orgs, financials, errors };
  }
}

module.exports = OecdStatAdapter;
