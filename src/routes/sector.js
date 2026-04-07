'use strict';

const express = require('express');
const { SectorService } = require('../services/SectorService');
const { OrgService }    = require('../services/OrgService');
const { db }            = require('../config/database');

const router = express.Router();

/* GET /sector/:sic — Sector Dashboard */
router.get('/:sic', async (req, res) => {
  try {
    const locale = res.locals.locale;
    const fyOverride = req.query.fy || null;
    const data   = await SectorService.getSectorDashboard(req.params.sic, locale, fyOverride);
    if (!data) return res.status(404).render('error', { title: 'Not Found', message: `SIC code ${req.params.sic} not found.`, code: 404 });

    res.render('sector-dashboard', {
      title: `${data.sector.name} (${req.params.sic}) — SectorLens`,
      sic: req.params.sic,
      sector: data.sector,
      kpis: data.kpis,
      companies: data.companies,
      chartRevenue: JSON.stringify(data.chartRevenue),
      chartMargins: JSON.stringify(data.chartMargins),
      entityCount:    data.entityCount,
      reportingCount: data.reportingCount,
      availableYears: data.availableYears,
      fy: data.fy,
      compareMetrics: JSON.stringify(await SectorService.getCompareMetrics(req.params.sic, locale)),
      layout: 'main',
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { title: 'Error', message: err.message, code: 500 });
  }
});

/* GET /sector/:sic/orgs — Organization list */
router.get('/:sic/orgs', async (req, res) => {
  try {
    const sic    = req.params.sic;
    const sector = await db('sic_codes').where('sic_code', sic).first();
    if (!sector) return res.status(404).render('error', { title: 'Not Found', message: `SIC ${sic} not found.`, code: 404 });

    const { search = '', type = '', page = 1 } = req.query;
    const result = await OrgService.listBySIC(sic, { search, type, page: +page });

    res.render('org-list', {
      title: `Organizations — ${sector.name} (${sic}) — SectorLens`,
      sic,
      sector,
      ...result,
      search,
      type,
      layout: 'main',
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { title: 'Error', message: err.message, code: 500 });
  }
});

/* GET /sector/:sic/metric/:metric — KPI detail drill-down */
router.get('/:sic/metric/:metric', async (req, res) => {
  try {
    const { sic, metric } = req.params;
    const sector = await db('sic_codes').where('sic_code', sic).first();
    if (!sector) return res.status(404).render('error', { title: 'Not Found', code: 404, message: '' });

    // ── Available fiscal years for dropdown ───────────────────────────────
    const fyRows = await db('sector_benchmarks')
      .where('sic_code', sic)
      .distinct('fiscal_year')
      .orderBy('fiscal_year', 'desc')
      .pluck('fiscal_year');
    const availableYears = fyRows.length ? fyRows : [new Date().getFullYear() - 1];

    // ── Use the most recent year with benchmark data for this SIC ────────────
    const fyOverride = req.query.fy ? Number(req.query.fy) : null;
    const latestBench = await db('sector_benchmarks')
      .where('sic_code', sic)
      .max('fiscal_year as yr')
      .first();
    const latestFy = (latestBench && latestBench.yr) ? latestBench.yr : new Date().getFullYear() - 1;
    const fy = (fyOverride && availableYears.includes(fyOverride)) ? fyOverride : latestFy;

    const bench = await db('sector_benchmarks')
      .where({ sic_code: sic, fiscal_year: fy, metric_name: metric })
      .first();

    // Get all orgs with this metric in the latest available year per org
    const entities = await db('organizations as o')
      .join('financials as f', function () {
        this.on('o.id', '=', 'f.org_id')
            .andOn('f.id', '=',
              db.raw(`(SELECT id FROM financials
                        WHERE org_id = o.id
                          AND ${metric} IS NOT NULL
                          AND period_type IN ('annual','manual')
                        ORDER BY fiscal_year DESC
                        LIMIT 1)`));
      })
      .where('o.sic_code', sic)
      .whereNotNull(`f.${metric}`)
      .select('o.id', 'o.name', 'o.type', 'o.ticker',
              `f.${metric} as metric_val`, 'f.revenue', 'f.net_income', 'f.fiscal_year')
      .orderBy(`f.${metric}`, 'desc');

    const METRIC_LABELS = {
      revenue: 'Revenue', net_income: 'Net Income', gross_margin: 'Gross Margin',
      net_margin: 'Net Margin', operating_margin: 'Operating Margin', roe: 'Return on Equity',
      total_assets: 'Total Assets', debt_to_equity: 'Debt / Equity',
      tier1_capital_ratio: 'Tier 1 Capital Ratio', efficiency_ratio: 'Efficiency Ratio',
    };

    const isPercent = ['gross_margin','net_margin','operating_margin','roe','roa','tier1_capital_ratio','efficiency_ratio'].includes(metric);
    const isRatio   = ['debt_to_equity'].includes(metric);
    const isCurrency = !isPercent && !isRatio;

    const median = bench?.median || 0;
    const chartEntities = entities.slice(0, 12).reverse();

    // ── Format helper ─────────────────────────────────────────────────────
    const { fmt } = require('../services/SectorService');
    const fmtVal = (v) => {
      if (v == null) return '—';
      if (isPercent)  return Number(v).toFixed(2) + '%';
      if (isRatio)    return Number(v).toFixed(2) + '×';
      return fmt(v, 'currency');
    };

    // ── Format bench stat cards ───────────────────────────────────────────
    const benchFmt = bench ? {
      median:      fmtVal(bench.median),
      p75:         fmtVal(bench.p75),
      p25:         fmtVal(bench.p25),
      mean_val:    fmtVal(bench.mean_val),
      min_val:     fmtVal(bench.min_val),
      max_val:     fmtVal(bench.max_val),
      entity_count: bench.entity_count,
    } : null;

    // ── Format entity rows ────────────────────────────────────────────────
    const entitiesFormatted = entities.map((e, i) => ({
      ...e,
      rank:           i + 1,
      metricFmt:      fmtVal(e.metric_val),
      revenueFmt:     fmt(e.revenue, 'currency'),
      netIncomeFmt:   fmt(e.net_income, 'currency'),
      fyLabel:        e.fiscal_year || fy,
      aboveMedian:    Number(e.metric_val) >= median,
      // Hide revenue/netIncome columns if they are the metric (avoid duplication)
      showRevenue:    metric !== 'revenue',
      showNetIncome:  metric !== 'net_income',
    }));

    // ── Chart — keep raw values for chart.js but add format hint ─────────
    const rankChart = {
      labels:    chartEntities.map(e => e.name.length > 28 ? e.name.substring(0, 26) + '…' : e.name),
      values:    chartEntities.map(e => +Number(e.metric_val).toFixed(isCurrency ? 0 : 2)),
      colors:    chartEntities.map(e => Number(e.metric_val) >= median ? '#2563eb' : '#2563eb55'),
      isPercent, isRatio, isCurrency,
    };

    res.render('kpi-detail', {
      title: `${METRIC_LABELS[metric] || metric} — ${sector.name} — SectorLens`,
      sic, sector, metric, fy, availableYears,
      metricLabel:  METRIC_LABELS[metric] || metric,
      bench, benchFmt,
      entities:     entitiesFormatted,
      isPercent, isRatio, isCurrency,
      showRevenue:  metric !== 'revenue',
      showNetIncome: metric !== 'net_income',
      median,
      chartEntities: JSON.stringify(rankChart),
      compareMetrics: JSON.stringify(await SectorService.getCompareMetrics(sic, res.locals.locale || 'en')),
      layout: 'main',
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { title: 'Error', message: err.message, code: 500 });
  }
});

module.exports = router;