'use strict';

/**
 * GleifAdapter — Global Legal Entity Identifier Foundation
 * Covers: 2M+ legal entities worldwide across all sectors
 * API:    https://api.gleif.org/api/v1/
 * Auth:   None required — completely free
 */

const BaseAdapter = require('../BaseAdapter');

const GLEIF_BASE = 'https://api.gleif.org/api/v1';

const SIC_SEARCH_TERMS = {
  '6022': 'commercial bank',
  '6311': 'life insurance',
  '6331': 'property casualty insurance',
  '7372': 'software technology',
  '4911': 'electric utility power',
  '1311': 'oil gas exploration',
  '8062': 'hospital health system',
  '6726': 'investment fund',
  '4813': 'telecommunications',
  '3674': 'semiconductor',
};

class GleifAdapter extends BaseAdapter {
  constructor() {
    super({ name: 'GLEIF Global LEI', countryCode: 'GLOBAL', rateLimitMs: 300 });
  }

  async run(options = {}) {
    const targetSic = options.sic || null;
    this.progress('Starting GLEIF global entity ingestion…');
    let totalOrgs = 0, errors = 0;
    const sicsToProcess = targetSic ? [targetSic] : Object.keys(SIC_SEARCH_TERMS);

    for (const sic of sicsToProcess) {
      const searchTerm = SIC_SEARCH_TERMS[sic];
      if (!searchTerm) continue;
      try {
        const url = `${GLEIF_BASE}/lei-records?filter[entity.legalName]=${encodeURIComponent(searchTerm)}&filter[entity.status]=ACTIVE&page[size]=20`;
        const resp = await this.fetchWithRetry(url);
        if (!resp || !resp.data) continue;
        for (const record of resp.data) {
          const entity = record.attributes && record.attributes.entity;
          const lei    = record.attributes && record.attributes.lei;
          if (!entity || !lei) continue;
          const legalName = entity.legalName && entity.legalName.name;
          const country   = entity.legalAddress && entity.legalAddress.country;
          const city      = entity.legalAddress && entity.legalAddress.city;
          if (!legalName || !country || country === 'US') continue;
          try {
            await this.upsertOrg({
              name: legalName, sic_code: sic, type: 'Public',
              country_code: country, city: city || null,
              source_id: lei, source_name: 'GLEIF',
            });
            totalOrgs++;
          } catch (e) { errors++; }
        }
        this.progress('SIC ' + sic + ': processed GLEIF results');
      } catch (e) {
        errors++;
        this._log('GLEIF error SIC ' + sic + ': ' + e.message);
      }
    }

    this.progress('Complete — ' + totalOrgs + ' orgs, 0 financials, ' + errors + ' errors');
    return { orgs: totalOrgs, financials: 0, errors };
  }
}

module.exports = GleifAdapter;
