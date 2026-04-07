'use strict';

const { db } = require('../config/database');
const { fmt } = require('./SectorService');

const OrgService = {

  async listBySIC(sic, { search = '', type = '', page = 1, perPage = 25 } = {}) {
    let q = db('organizations as o')
      .leftJoin('financials as f', function () {
        this.on('f.id', '=',
          db.raw(`(SELECT id FROM financials
                    WHERE org_id = o.id
                      AND period_type IN ('annual','manual')
                    ORDER BY fiscal_year DESC,
                      CASE period_type WHEN 'annual' THEN 0 ELSE 1 END
                    LIMIT 1)`));
      })
      .where('o.sic_code', sic);

    if (search) q = q.whereRaw('lower(o.name) like ?', [`%${search.toLowerCase()}%`]);
    if (type)   q = q.where('o.type', type);

    const total = await q.clone().count('o.id as cnt').first();
    const rows  = await q.clone()
      .select('o.id', 'o.name', 'o.type', 'o.ticker', 'o.state', 'o.city',
        'f.revenue', 'f.net_income', 'f.net_margin', 'f.total_assets', 'f.debt_to_equity',
        'f.fiscal_year')
      .orderByRaw('f.revenue DESC NULLS LAST, o.name ASC')
      .limit(perPage).offset((page - 1) * perPage);

    return {
      orgs: rows.map(r => ({
        ...r,
        revenueFmt:     fmt(r.revenue, 'currency'),
        netIncomeFmt:   fmt(r.net_income, 'currency'),
        netMarginFmt:   r.net_margin     ? Number(r.net_margin).toFixed(2)     + '%' : '—',
        totalAssetsFmt: fmt(r.total_assets, 'currency'),
        deFmt:          r.debt_to_equity ? Number(r.debt_to_equity).toFixed(2) + '×' : '—',
        hasFinancials:  r.revenue != null || r.net_income != null,
      })),
      total: total.cnt,
      page,
      perPage,
      pages: Math.ceil(total.cnt / perPage),
    };
  },

  async getProfile(id) {
    const org = await db('organizations').where('id', id).first();
    if (!org) return null;

    const sector = await db('sic_codes').where('sic_code', org.sic_code).first();

    // ── Most recent financials — annual preferred, manual fallback ────────────
    const fin = await db('financials')
      .where({ org_id: id })
      .whereIn('period_type', ['annual', 'manual'])
      .orderByRaw("fiscal_year DESC, CASE period_type WHEN 'annual' THEN 0 ELSE 1 END")
      .first();

    const finYear = fin ? fin.fiscal_year : 2023;

    // ── Trend data — annual rows; for manual orgs, repeat single year ─────────
    let trend = await db('financials')
      .where({ org_id: id, period_type: 'annual' })
      .orderBy('fiscal_year')
      .select('fiscal_year', 'revenue', 'net_income', 'net_margin',
              'roe', 'efficiency_ratio', 'tier1_capital_ratio');

    // Manual orgs: no history — synthesise a single data point for charts
    if (trend.length === 0 && fin) {
      trend = [fin];
    }

    // ── Sector benchmarks — use matching year or fall back to latest ──────────
    let benchmarks = await db('sector_benchmarks')
      .where({ sic_code: org.sic_code, fiscal_year: finYear });
    if (!benchmarks.length) {
      // Fall back to latest available benchmark year
      const latest = await db('sector_benchmarks')
        .where('sic_code', org.sic_code)
        .max('fiscal_year as yr').first();
      if (latest && latest.yr) {
        benchmarks = await db('sector_benchmarks')
          .where({ sic_code: org.sic_code, fiscal_year: latest.yr });
      }
    }
    const benchMap = {};
    benchmarks.forEach(b => { benchMap[b.metric_name] = b; });

    // ── Peer orgs — use same year as subject org ──────────────────────────────
    const peers = await db('organizations as o')
      .join('financials as f', function () {
        this.on('o.id', '=', 'f.org_id')
            .andOn('f.id', '=',
              db.raw(`(SELECT id FROM financials
                        WHERE org_id = o.id
                        ORDER BY fiscal_year DESC,
                          CASE period_type WHEN 'annual' THEN 0 ELSE 1 END
                        LIMIT 1)`));
      })
      .where('o.sic_code', org.sic_code)
      .where('o.id', '!=', id)
      .whereNot('o.type', 'Manual')   // exclude other manual entries from peer list
      .select('o.id', 'o.name', 'o.type', 'o.ticker',
              'f.revenue', 'f.net_income', 'f.net_margin',
              'f.roe', 'f.efficiency_ratio', 'f.tier1_capital_ratio')
      .orderBy('f.revenue', 'desc')
      .limit(5);

    const kpis = fin ? buildKPIs(fin, benchMap, org.sic_code) : [];

    // ── Chart data ────────────────────────────────────────────────────────────
    const chartTrend = {
      years:           trend.map(t => t.fiscal_year),
      revenues:        trend.map(t => t.revenue     ? +(t.revenue / 1e9).toFixed(2)  : null),
      netIncomes:      trend.map(t => t.net_income  ? +(t.net_income / 1e9).toFixed(3): null),
      netMargins:      trend.map(t => t.net_margin  ? +t.net_margin.toFixed(1)         : null),
      roes:            trend.map(t => t.roe          ? +t.roe.toFixed(1)                : null),
      efficiencyRatios:trend.map(t => t.efficiency_ratio ? +t.efficiency_ratio.toFixed(1): null),
    };

    const orgLabel = org.ticker || org.name.split(' ').slice(0, 2).join(' ');
    const peerChart = {
      labels:    [orgLabel, ...peers.map(p => p.ticker || p.name.split(' ')[0])],
      revenues:  [fin ? +(fin.revenue   / 1e9).toFixed(2)  : 0, ...peers.map(p => p.revenue   ? +(p.revenue   / 1e9).toFixed(2)  : 0)],
      netIncomes:[fin ? +(fin.net_income/ 1e9).toFixed(3)  : 0, ...peers.map(p => p.net_income ? +(p.net_income/ 1e9).toFixed(3) : 0)],
    };

    return {
      org,
      sector,
      fin,
      finYear,
      isManual: org.type === 'Manual',
      kpis,
      trend,
      chartTrend,
      peers: peers.map(p => ({
        ...p,
        revenueFmt:   fmt(p.revenue, 'currency'),
        netIncomeFmt: fmt(p.net_income, 'currency'),
        netMarginFmt: p.net_margin ? p.net_margin.toFixed(1) + '%' : '—',
      })),
      peerChart,
      benchMap,
      fin_fmt: fin ? {
        revenue:       fmt(fin.revenue, 'currency'),
        net_income:    fmt(fin.net_income, 'currency'),
        total_assets:  fmt(fin.total_assets, 'currency'),
        net_margin:    fmt(fin.net_margin, 'percent'),
        gross_margin:  fmt(fin.gross_margin, 'percent'),
        roe:           fmt(fin.roe, 'percent'),
        debt_to_equity:fmt(fin.debt_to_equity, 'ratio'),
        tier1:         fmt(fin.tier1_capital_ratio, 'percent'),
        efficiency:    fmt(fin.efficiency_ratio, 'percent'),
      } : {},
    };
  },
};

function buildKPIs(fin, benchMap, sic) {
  const defs = [
    { key: 'revenue',              label: 'Revenue',           format: 'currency', trend: 'higher' },
    { key: 'net_income',           label: 'Net Income',         format: 'currency', trend: 'higher' },
    { key: 'net_margin',           label: 'Net Margin',         format: 'percent',  trend: 'higher' },
    { key: 'roe',                  label: 'Return on Equity',   format: 'percent',  trend: 'higher' },
    { key: 'total_assets',         label: 'Total Assets',       format: 'currency', trend: 'higher' },
    { key: 'debt_to_equity',       label: 'Debt / Equity',      format: 'ratio',    trend: 'lower'  },
    { key: 'tier1_capital_ratio',  label: 'Tier 1 Capital',     format: 'percent',  trend: 'higher' },
    { key: 'efficiency_ratio',     label: 'Efficiency Ratio',   format: 'percent',  trend: 'lower'  },
    { key: 'gross_margin',         label: 'Gross Margin',       format: 'percent',  trend: 'higher' },
    { key: 'operating_margin',     label: 'Operating Margin',   format: 'percent',  trend: 'higher' },
  ];

  // Only show KPIs that have either a value OR a benchmark
  return defs
    .filter(d => fin[d.key] != null || benchMap[d.key])
    .map(d => {
      const val   = fin[d.key];
      const bench = benchMap[d.key];
      const above = bench && val != null
        ? (d.trend === 'higher' ? val >= bench.median : val <= bench.median)
        : null;
      return {
        label:        d.label,
        value:        fmt(val, d.format),
        sectorMedian: bench ? fmt(bench.median, d.format) : '—',
        trend:        above == null ? 'neu' : above ? 'pos' : 'neg',
        accentClass:  above == null ? 'accent-neu' : above ? 'accent-pos' : 'accent-warn',
      };
    });
}

module.exports = { OrgService };