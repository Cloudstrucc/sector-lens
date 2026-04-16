'use strict';

const { db } = require('../config/database');

const SECTOR_KPI_CONFIG = {
  '6022': [
    { key: 'net_income',          label: 'Net Income',           labelFr: 'Revenu net',              format: 'currency', trend: 'higher' },
    { key: 'revenue',             label: 'Total Revenue',        labelFr: 'Revenus totaux',           format: 'currency', trend: 'higher' },
    { key: 'gross_margin',        label: 'Gross Margin',         labelFr: 'Marge brute',              format: 'percent',  trend: 'higher' },
    { key: 'net_margin',          label: 'Net Margin',           labelFr: 'Marge nette',              format: 'percent',  trend: 'higher' },
    { key: 'roe',                 label: 'Return on Equity',     labelFr: 'Rendement des capitaux',   format: 'percent',  trend: 'higher' },
    { key: 'total_assets',        label: 'Total Assets',         labelFr: 'Actif total',              format: 'currency', trend: 'higher' },
    { key: 'debt_to_equity',      label: 'Debt / Equity',        labelFr: 'Dette / Capitaux',         format: 'ratio',    trend: 'lower'  },
    { key: 'tier1_capital_ratio', label: 'Tier 1 Capital Ratio', labelFr: 'Ratio Tier 1',             format: 'percent',  trend: 'higher' },
    { key: 'efficiency_ratio',    label: 'Efficiency Ratio',     labelFr: "Ratio d'efficience",       format: 'percent',  trend: 'lower'  },
  ],
  '7372': [
    { key: 'revenue',         label: 'Revenue',          labelFr: 'Revenus',          format: 'currency', trend: 'higher' },
    { key: 'net_income',      label: 'Net Income',        labelFr: 'Revenu net',       format: 'currency', trend: 'higher' },
    { key: 'gross_margin',    label: 'Gross Margin',      labelFr: 'Marge brute',      format: 'percent',  trend: 'higher' },
    { key: 'net_margin',      label: 'Net Margin',        labelFr: 'Marge nette',      format: 'percent',  trend: 'higher' },
    { key: 'roe',             label: 'Return on Equity',  labelFr: 'Rendement',        format: 'percent',  trend: 'higher' },
    { key: 'operating_margin',label: 'Operating Margin',  labelFr: 'Marge opérat.',    format: 'percent',  trend: 'higher' },
    { key: 'debt_to_equity',  label: 'Debt / Equity',     labelFr: 'Dette / Capitaux', format: 'ratio',    trend: 'lower'  },
    { key: 'total_assets',    label: 'Total Assets',      labelFr: 'Actif total',      format: 'currency', trend: 'higher' },
  ],
  'default': [
    { key: 'revenue',         label: 'Revenue',          labelFr: 'Revenus',          format: 'currency', trend: 'higher' },
    { key: 'net_income',      label: 'Net Income',        labelFr: 'Revenu net',       format: 'currency', trend: 'higher' },
    { key: 'gross_margin',    label: 'Gross Margin',      labelFr: 'Marge brute',      format: 'percent',  trend: 'higher' },
    { key: 'net_margin',      label: 'Net Margin',        labelFr: 'Marge nette',      format: 'percent',  trend: 'higher' },
    { key: 'operating_margin',label: 'Operating Margin',  labelFr: 'Marge opérat.',    format: 'percent',  trend: 'higher' },
    { key: 'roe',             label: 'Return on Equity',  labelFr: 'Rendement',        format: 'percent',  trend: 'higher' },
    { key: 'total_assets',    label: 'Total Assets',      labelFr: 'Actif total',      format: 'currency', trend: 'higher' },
    { key: 'debt_to_equity',  label: 'Debt / Equity',     labelFr: 'Dette / Cap.',     format: 'ratio',    trend: 'lower'  },
  ],
};

function fmt(val, format) {
  if (val == null) return '—';
  if (format === 'currency') {
    if (Math.abs(val) >= 1e12) return '$' + (val / 1e12).toFixed(2) + 'T';
    if (Math.abs(val) >= 1e9)  return '$' + (val / 1e9).toFixed(2)  + 'B';
    if (Math.abs(val) >= 1e6)  return '$' + (val / 1e6).toFixed(2)  + 'M';
    if (Math.abs(val) >= 1e3)  return '$' + (val / 1e3).toFixed(2)  + 'K';
    return '$' + val.toFixed(0);
  }
  if (format === 'percent') return Number(val).toFixed(2) + '%';
  if (format === 'ratio')   return Number(val).toFixed(2) + '×';
  if (format === 'decimal') return Number(val).toFixed(2);
  return val;
}

/* ── Year helpers ─────────────────────────────────────────────────────────────
 * Returns the most recent fiscal year with benchmark data for a given SIC.
 * Falls back to the most recent year in financials, then to (currentYear - 1).
 */
async function getLatestBenchmarkYear(sic) {
  const row = await db('sector_benchmarks')
    .where('sic_code', sic)
    .max('fiscal_year as yr')
    .first();
  if (row && row.yr) return row.yr;

  // Fallback: most recent year in financials for orgs in this SIC
  const orgIds = await db('organizations').where('sic_code', sic).pluck('id');
  if (orgIds.length) {
    const fin = await db('financials')
      .whereIn('org_id', orgIds)
      .max('fiscal_year as yr')
      .first();
    if (fin && fin.yr) return fin.yr;
  }

  return new Date().getFullYear() - 1;
}

async function getLatestFinancialYear(orgIds) {
  if (!orgIds.length) return new Date().getFullYear() - 1;
  const row = await db('financials')
    .whereIn('org_id', orgIds)
    .whereIn('period_type', ['annual', 'manual'])
    .max('fiscal_year as yr')
    .first();
  return (row && row.yr) ? row.yr : new Date().getFullYear() - 1;
}

const SectorService = {

  async findBySIC(sic) {
    return db('sic_codes').where('sic_code', sic).first();
  },

  async search(q) {
    const ql = `%${q.toLowerCase()}%`;
    return db('sic_codes')
      .whereRaw('lower(sic_code) like ?', [ql])
      .orWhereRaw('lower(name) like ?', [ql])
      .orWhereRaw('lower(name_fr) like ?', [ql])
      .limit(10);
  },

  async getSectorDashboard(sic, locale = 'en', fyOverride = null) {
    const sector = await db('sic_codes').where('sic_code', sic).first();
    if (!sector) return null;

    // ── Available fiscal years for this SIC ───────────────────────────────
    const fyRows = await db('sector_benchmarks')
      .where('sic_code', sic)
      .distinct('fiscal_year')
      .orderBy('fiscal_year', 'desc')
      .pluck('fiscal_year');

    const availableYears = fyRows.length ? fyRows : [new Date().getFullYear() - 1];

    // ── Use requested year or most recent ─────────────────────────────────
    const fy = fyOverride && availableYears.includes(Number(fyOverride))
      ? Number(fyOverride)
      : availableYears[0];

    const kpiConfig  = SECTOR_KPI_CONFIG[sic] || SECTOR_KPI_CONFIG['default'];
    const benchmarks = await db('sector_benchmarks').where({ sic_code: sic, fiscal_year: fy });
    const benchMap   = {};
    benchmarks.forEach(b => { benchMap[b.metric_name] = b; });

    const kpis = kpiConfig.map(cfg => {
      const b = benchMap[cfg.key];
      return {
        label:  locale === 'fr' ? cfg.labelFr : cfg.label,
        value:  b ? fmt(b.median, cfg.format) : '—',
        sub:    'Sector Median',
        trend:  cfg.trend === 'higher' ? 'pos' : 'neu',
        delta:  null,
        format: cfg.format,
        metric: cfg.key,
      };
    });

    // ── Companies peer table ───────────────────────────────────────────────
    const companies = await db('organizations as o')
      .join('financials as f', function () {
        this.on('o.id', '=', 'f.org_id')
            .andOn('f.id', '=',
              db.raw(`(SELECT id FROM financials
                        WHERE org_id = o.id
                          AND period_type IN ('annual','manual')
                        ORDER BY fiscal_year DESC
                        LIMIT 1)`));
      })
      .where('o.sic_code', sic)
      .select(
        'o.id', 'o.name', 'o.type', 'o.ticker',
        'f.revenue', 'f.net_income', 'f.gross_margin', 'f.net_margin',
        'f.total_assets', 'f.debt_to_equity', 'f.fiscal_year',
      )
      .orderBy('f.revenue', 'desc')
      .limit(8);

    const companiesFormatted = companies.map(c => ({
      ...c,
      revenueFmt:     fmt(c.revenue, 'currency'),
      netIncomeFmt:   fmt(c.net_income, 'currency'),
      grossMarginFmt: c.gross_margin ? c.gross_margin.toFixed(1) + '%' : '—',
      netMarginFmt:   c.net_margin   ? c.net_margin.toFixed(1)   + '%' : '—',
    }));

    // ── Chart data ─────────────────────────────────────────────────────────
    const top6 = companiesFormatted.slice(0, 6);
    const chartRevenue = {
      labels:   top6.map(c => c.ticker || c.name.split(' ')[0]),
      revenues: top6.map(c => c.revenue    ? +(c.revenue    / 1e9).toFixed(2)  : 0),
      netIncs:  top6.map(c => c.net_income ? +(c.net_income / 1e9).toFixed(3)  : 0),
    };

    const chartMargins = {
      gross:     +(benchMap['gross_margin']?.median    || 0).toFixed(1),
      operating: +(benchMap['operating_margin']?.median|| 0).toFixed(1),
      net:       +(benchMap['net_margin']?.median      || 0).toFixed(1),
    };

    // ── Entity count — use real total count, not the display-capped companies list ──
    const realCount = await db('organizations').where('sic_code', sic).count('id as n').first();
    const entityCount = (realCount && realCount.n) ? realCount.n : sector.entity_count || 0;

    // Update sic_codes with the real count so SIC browser stays current
    if (entityCount > 0) {
      await db('sic_codes').where('sic_code', sic).update({ entity_count: entityCount });
    }

    // Also get count of orgs WITH financials for the reporting entities label
    const withFinancials = await db('organizations as o')
      .join('financials as f', 'o.id', 'f.org_id')
      .where('o.sic_code', sic)
      .countDistinct('o.id as n')
      .first();
    const reportingCount = (withFinancials && withFinancials.n) ? withFinancials.n : companies.length;

    return {
      sector,
      kpis,
      companies: companiesFormatted,
      chartRevenue,
      chartMargins,
      entityCount,
      reportingCount,
      availableYears,
      fy,
    };
  },

  async recalculateBenchmarks(dbConn) {
    const conn    = dbConn || db;
    const metrics = [
      'revenue', 'net_income', 'gross_profit', 'gross_margin', 'net_margin',
      'operating_margin', 'operating_income', 'roe', 'roa', 'debt_to_equity',
      'total_assets', 'total_liabilities', 'shareholders_equity',
      'tier1_capital_ratio', 'efficiency_ratio', 'ebitda',
    ];

    const sics = await conn('sic_codes').select('sic_code');

    for (const { sic_code } of sics) {
      const orgIds = (await conn('organizations').where('sic_code', sic_code).select('id')).map(o => o.id);
      if (!orgIds.length) continue;

      // Find the most recent year with financial data for this SIC
      const latestFin = await conn('financials')
        .whereIn('org_id', orgIds)
        .whereIn('period_type', ['annual', 'manual'])
        .max('fiscal_year as yr')
        .first();
      const fy = latestFin?.yr;
      if (!fy) continue;

      for (const metric of metrics) {
        const rows = await conn('financials')
          .whereIn('org_id', orgIds)
          .where('fiscal_year', fy)
          .whereIn('period_type', ['annual', 'manual'])
          .whereNotNull(metric)
          .pluck(metric);

        if (!rows.length) continue;
        const vals     = rows.map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
        if (!vals.length) continue;
        const n        = vals.length;
        const median   = n % 2 === 0 ? (vals[n/2-1] + vals[n/2]) / 2 : vals[Math.floor(n/2)];
        const mean_val = vals.reduce((a, b) => a + b, 0) / n;

        // delete + insert avoids onConflict issues with better-sqlite3
        await conn('sector_benchmarks')
          .where({ sic_code, fiscal_year: fy, metric_name: metric })
          .delete();
        await conn('sector_benchmarks').insert({
          sic_code, fiscal_year: fy, metric_name: metric,
          p25:      vals[Math.floor(n * 0.25)] || vals[0],
          median, p75: vals[Math.floor(n * 0.75)] || vals[n-1],
          mean_val, min_val: vals[0], max_val: vals[n-1], entity_count: n,
        });
      }
    }
  },

  async getCompareMetrics(sic, locale = 'en') {
    const config = SECTOR_KPI_CONFIG[sic] || SECTOR_KPI_CONFIG['default'];
    const fy     = await getLatestBenchmarkYear(sic);
    const benchmarks = await db('sector_benchmarks').where({ sic_code: sic, fiscal_year: fy });
    const benchMap   = {};
    benchmarks.forEach(b => { benchMap[b.metric_name] = b; });

    return config.map(cfg => {
      const b = benchMap[cfg.key];
      return {
        key:       cfg.key,
        label:     locale === 'fr' ? cfg.labelFr : cfg.label,
        sectorVal: b ? fmt(b.median, cfg.format) : '—',
        format:    cfg.format,
      };
    });
  },
};

module.exports = { SectorService, SECTOR_KPI_CONFIG, fmt };
