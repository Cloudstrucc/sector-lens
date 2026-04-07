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
    // 1 = National Member Bank → 6021
    // 2 = State Member Bank    → 6022
    // 3 = State Non-Member     → 6022
    // 4 = Savings Institution  → 6035
    // 5 = OCC Savings          → 6035
    // 6 = Savings Bank         → 6020
    const map = { 1: '6021', 2: '6022', 3: '6022', 4: '6035', 5: '6035', 6: '6020' };
    return map[instcat] || '6022';
  }
}

module.exports = FdicAdapter;