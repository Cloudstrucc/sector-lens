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
    const data   = await SectorService.getSectorDashboard(req.params.sic, locale);
    if (!data) return res.status(404).render('error', { title: 'Not Found', message: `SIC code ${req.params.sic} not found.`, code: 404 });

    res.render('sector-dashboard', {
      title: `${data.sector.name} (${req.params.sic}) — SectorLens`,
      sic: req.params.sic,
      sector: data.sector,
      kpis: data.kpis,
      companies: data.companies,
      chartRevenue: JSON.stringify(data.chartRevenue),
      chartMargins: JSON.stringify(data.chartMargins),
      entityCount: data.entityCount,
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

    const bench = await db('sector_benchmarks').where({ sic_code: sic, fiscal_year: 2023, metric_name: metric }).first();

    const entities = await db('organizations as o')
      .join('financials as f', 'o.id', 'f.org_id')
      .where('o.sic_code', sic)
      .where('f.fiscal_year', 2023)
      .where('f.period_type', 'annual')
      .whereNotNull(`f.${metric}`)
      .select('o.id', 'o.name', 'o.type', 'o.ticker', `f.${metric} as metric_val`, 'f.revenue', 'f.net_income')
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
    const chartEntities = entities.slice(0, 12).reverse(); // horizontal bar = ascending

    const rankChart = {
      labels:  chartEntities.map(e => e.name.length > 30 ? e.name.substring(0, 28) + '…' : e.name),
      values:  chartEntities.map(e => +Number(e.metric_val).toFixed(isCurrency ? 0 : 2)),
      colors:  chartEntities.map(e => Number(e.metric_val) >= median ? '#2563eb' : '#2563eb55'),
    };

    res.render('kpi-detail', {
      title: `${METRIC_LABELS[metric] || metric} — ${sector.name} — SectorLens`,
      sic, sector, metric,
      metricLabel: METRIC_LABELS[metric] || metric,
      bench, entities,
      isPercent, isRatio, isCurrency,
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
