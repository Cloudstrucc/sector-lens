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

    // ── Enrich fin with computed ratios ───────────────────────────────────────
    if (fin) {
      const f = fin;
      const rev  = f.revenue            || 0;
      const ni   = f.net_income         || 0;
      const ebit = f.ebit               || f.operating_income || 0;
      const ebitda = f.ebitda           || (ni > 0 ? ni * 1.35 : 0);
      const td   = f.total_debt         || 0;
      const cash = f.cash_and_equivalents || 0;
      const ta   = f.total_assets       || 0;
      const tl   = f.total_liabilities  || 0;
      const eq   = f.shareholders_equity || (ta - tl) || 0;
      const ca   = f.current_assets     || 0;
      const cl   = f.current_liabilities|| 0;
      const ar   = f.accounts_receivable|| 0;
      const inv  = f.inventory          || 0;
      const intang = (f.intangibles || 0) + (f.goodwill || 0);
      const capex  = f.capex            || 0;
      const ocf    = f.operating_cash_flow || 0;
      const int_exp = f.interest_expense || (td > 0 ? td * 0.05 : 1);
      const cogs   = f.cogs             || 0;
      const ltd    = f.long_term_debt   || td;

      // Liquidity
      if (!f.current_ratio  && cl > 0) f.current_ratio  = +(ca / cl).toFixed(2);
      if (!f.quick_ratio    && cl > 0) f.quick_ratio    = +((ca - inv) / cl).toFixed(2);
      // Coverage
      if (!f.interest_coverage && int_exp > 0) f.interest_coverage = +(ebit / int_exp).toFixed(2);
      const annualDebtSvc = int_exp + (td * 0.08);
      if (!f.dscr && annualDebtSvc > 0) f.dscr = +(ni / annualDebtSvc).toFixed(2);
      if (!f.fccr && annualDebtSvc > 0) f.fccr = +((ebitda - capex) / annualDebtSvc).toFixed(2);
      // Leverage
      if (!f.net_debt)          f.net_debt          = td - cash;
      if (!f.net_debt_to_ebitda && ebitda > 0) f.net_debt_to_ebitda = +((td - cash) / ebitda).toFixed(2);
      if (!f.tangible_net_worth) f.tangible_net_worth = eq - intang;
      if (!f.debt_to_tangible_nw && (eq - intang) > 0) f.debt_to_tangible_nw = +(td / (eq - intang)).toFixed(2);
      if (!f.funded_debt_ratio  && (td + eq) > 0) f.funded_debt_ratio = +(ltd / (ltd + eq) * 100).toFixed(1);
      // Efficiency
      if (!f.asset_turnover && ta > 0) f.asset_turnover = +(rev / ta).toFixed(2);
      if (!f.dso && rev > 0) f.dso = +(ar / rev * 365).toFixed(1);
      if (!f.inventory_turnover && inv > 0) f.inventory_turnover = +(cogs / inv).toFixed(2);
      const dpo = tl > 0 ? (tl / (cogs || rev) * 365) : 0;
      if (!f.cash_conversion_cycle && rev > 0) f.cash_conversion_cycle = +((ar/rev*365) + (inv > 0 ? inv/(cogs||rev)*365 : 0) - dpo).toFixed(1);
      // Cash flow
      if (!f.free_cash_flow && ocf) f.free_cash_flow = ocf - capex;
      if (!f.fcf_to_debt && td > 0 && f.free_cash_flow) f.fcf_to_debt = +(f.free_cash_flow / td * 100).toFixed(1);
      // Altman Z-Score (public company version)
      if (!f.altman_z && ta > 0) {
        const wc  = ca - cl;
        const re  = eq - (f.total_assets > 0 ? f.total_assets * 0.3 : 0); // proxy retained earnings
        const mve = eq;                                                      // book value proxy
        f.altman_z = +(
          1.2  * (wc / ta) +
          1.4  * (re / ta) +
          3.3  * (ebit / ta) +
          0.6  * (mve / Math.max(tl, 1)) +
          1.0  * (rev / ta)
        ).toFixed(2);
      }
    }

    const kpis = fin ? buildKPIs(fin, benchMap, org.sic_code) : [];
    const categorisedKPIs = fin ? buildCategorisedKPIs(fin, benchMap, org.sic_code) : [];

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
      categorisedKPIs,
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
  // ── Categorised benchmark definitions for underwriters ────────────────────
  const CATEGORIES = [
    {
      key:   'profitability',
      label: 'Profitability',
      defs: [
        { key: 'revenue',          label: 'Revenue',          format: 'currency', trend: 'higher' },
        { key: 'net_income',       label: 'Net Income',       format: 'currency', trend: 'higher' },
        { key: 'gross_margin',     label: 'Gross Margin',     format: 'percent',  trend: 'higher' },
        { key: 'operating_margin', label: 'Operating Margin', format: 'percent',  trend: 'higher' },
        { key: 'net_margin',       label: 'Net Margin',       format: 'percent',  trend: 'higher' },
        { key: 'roe',              label: 'Return on Equity', format: 'percent',  trend: 'higher' },
        { key: 'roa',              label: 'Return on Assets', format: 'percent',  trend: 'higher' },
        { key: 'ebitda',           label: 'EBITDA',           format: 'currency', trend: 'higher' },
      ],
    },
    {
      key:   'coverage',
      label: 'Debt Service & Coverage',
      defs: [
        { key: 'dscr',             label: 'DSCR',                    format: 'ratio',   trend: 'higher', floor: 1.25, note: 'OCC 2023-1 minimum' },
        { key: 'fccr',             label: 'Fixed Charge Coverage',   format: 'ratio',   trend: 'higher', floor: 1.20, note: 'OSFI B-6' },
        { key: 'interest_coverage',label: 'Interest Coverage',       format: 'ratio',   trend: 'higher', floor: 2.50, note: 'Min 2.5×' },
        { key: 'fcf_to_debt',      label: 'FCF / Total Debt',        format: 'percent', trend: 'higher' },
        { key: 'net_debt_to_ebitda',label:'Net Debt / EBITDA',       format: 'ratio',   trend: 'lower',  ceiling: 4.0, note: 'Basel III senior limit' },
      ],
    },
    {
      key:   'leverage',
      label: 'Leverage & Capital',
      defs: [
        { key: 'debt_to_equity',   label: 'Debt / Equity',          format: 'ratio',   trend: 'lower'  },
        { key: 'debt_to_tangible_nw',label:'Debt / Tangible NW',    format: 'ratio',   trend: 'lower'  },
        { key: 'funded_debt_ratio',label: 'Funded Debt Ratio',       format: 'percent', trend: 'lower'  },
        { key: 'tangible_net_worth',label:'Tangible Net Worth',      format: 'currency',trend: 'higher' },
        { key: 'tier1_capital_ratio',label:'Tier 1 Capital',         format: 'percent', trend: 'higher' },
        { key: 'altman_z',         label: 'Altman Z-Score',          format: 'decimal', trend: 'higher', floor: 1.81, note: '<1.81 distress zone' },
      ],
    },
    {
      key:   'liquidity',
      label: 'Liquidity',
      defs: [
        { key: 'current_ratio',    label: 'Current Ratio',          format: 'ratio',   trend: 'higher', floor: 1.20, note: 'Min 1.2×' },
        { key: 'quick_ratio',      label: 'Quick Ratio',            format: 'ratio',   trend: 'higher', floor: 1.00, note: 'Min 1.0×' },
        { key: 'cash_and_equivalents',label:'Cash & Equivalents',   format: 'currency',trend: 'higher' },
        { key: 'net_debt',         label: 'Net Debt',               format: 'currency',trend: 'lower'  },
      ],
    },
    {
      key:   'efficiency',
      label: 'Efficiency & Asset Quality',
      defs: [
        { key: 'efficiency_ratio', label: 'Efficiency Ratio',       format: 'percent', trend: 'lower'  },
        { key: 'asset_turnover',   label: 'Asset Turnover',         format: 'ratio',   trend: 'higher' },
        { key: 'dso',              label: 'Days Sales Outstanding',  format: 'decimal', trend: 'lower',  note: 'Days' },
        { key: 'inventory_turnover',label:'Inventory Turnover',     format: 'ratio',   trend: 'higher' },
        { key: 'cash_conversion_cycle',label:'Cash Conversion Cycle',format:'decimal', trend: 'lower',  note: 'Days' },
      ],
    },
    {
      key:   'cashflow',
      label: 'Cash Flow',
      defs: [
        { key: 'operating_cash_flow',label:'Operating Cash Flow',   format: 'currency',trend: 'higher' },
        { key: 'capex',             label: 'Capital Expenditure',    format: 'currency',trend: 'neutral' },
        { key: 'free_cash_flow',    label: 'Free Cash Flow',         format: 'currency',trend: 'higher' },
        { key: 'payout_ratio',      label: 'Payout Ratio',           format: 'percent', trend: 'lower'  },
      ],
    },
  ];

  // Build flat KPI list (backwards-compatible with existing template)
  const kpis = [];
  for (const cat of CATEGORIES) {
    const catKpis = cat.defs
      .filter(d => fin[d.key] != null || benchMap[d.key])
      .map(d => {
        const val   = fin[d.key];
        const bench = benchMap[d.key];
        let above = null;
        if (bench && val != null) {
          above = d.trend === 'higher' ? val >= bench.median : d.trend === 'lower' ? val <= bench.median : null;
        }
        // Flag breach of regulatory floors/ceilings
        let breach = null;
        if (d.floor   != null && val != null && val < d.floor)   breach = 'below-floor';
        if (d.ceiling != null && val != null && val > d.ceiling) breach = 'above-ceiling';

        return {
          category:     cat.key,
          categoryLabel:cat.label,
          label:        d.label,
          value:        fmt(val, d.format),
          rawValue:     val,
          sectorMedian: bench ? fmt(bench.median, d.format) : '—',
          trend:        above == null ? 'neu' : above ? 'pos' : 'neg',
          accentClass:  breach ? 'accent-neg' : above == null ? 'accent-neu' : above ? 'accent-pos' : 'accent-warn',
          note:         d.note || null,
          breach,
        };
      });
    if (catKpis.length > 0) kpis.push(...catKpis);
  }
  return kpis;
}

// Categorised KPIs for grouped display in template
function buildCategorisedKPIs(fin, benchMap, sic) {
  const all = buildKPIs(fin, benchMap, sic);
  const map = {};
  for (const kpi of all) {
    if (!map[kpi.category]) map[kpi.category] = { label: kpi.categoryLabel, items: [] };
    map[kpi.category].items.push(kpi);
  }
  return Object.values(map);
}


/**
 * computeLoanParameters — Dynamic loan analysis engine
 *
 * Calculates indicative loan parameters from real org financials.
 * References:
 *  - OCC Bulletin 2023-1 (leveraged lending guidance, DSCR thresholds)
 *  - OSFI Guideline B-20 (Canadian residential/commercial underwriting)
 *  - OSFI Guideline B-6 (covenant structures, credit risk management)
 *  - Basel III Framework (leverage ratios, BIS 2023)
 *  - Altman Z-Score model (credit quality signal)
 *  - S&P Global Leveraged Lending Review 2024 (spread benchmarks)
 *  - Bank of Canada Financial System Review (sector stress benchmarks)
 */
function computeLoanParameters(fin, sic, userStrategy = null) {
  if (!fin) return null;

  // Merge user strategy overrides — user's institution params take priority
  const strategy = userStrategy || {};
  const dscrFloor    = strategy.dscr_min     || null;
  const leverageCap  = strategy.leverage_max || null;
  const covenantPref = strategy.covenant     || null;

  const revenue   = fin.revenue          || 0;
  const netIncome = fin.net_income       || 0;
  const totalAssets = fin.total_assets   || 0;
  const totalDebt   = fin.total_debt     || 0;
  const ebitda      = fin.ebitda         || (netIncome > 0 ? netIncome * 1.35 : 0); // proxy if missing
  const equity      = fin.shareholders_equity || (totalAssets > 0 ? totalAssets * 0.3 : 0);
  const interest    = totalDebt > 0 ? totalDebt * 0.05 : 1; // assume 5% rate if not reported
  const grossProfit = fin.gross_profit   || 0;

  // ── DSCR: Net Income ÷ Annual Debt Service (OCC 2023-1) ───────────────────
  const annualDebtService = Math.max(interest + (totalDebt * 0.08), 1); // interest + ~8% principal
  const dscr = netIncome > 0 ? netIncome / annualDebtService : 0;

  // ── Leverage: Total Debt ÷ EBITDA (Basel III / OCC leveraged lending) ─────
  const leverage = ebitda > 0 ? totalDebt / ebitda : 99;

  // ── Rate tier — uses user's DSCR floor if set, else defaults ─────────────
  const tier1Floor = dscrFloor ? Math.max(dscrFloor, 2.0)  : 2.0;
  const tier2Floor = dscrFloor ? Math.max(dscrFloor, 1.5)  : 1.5;
  const tier3Floor = dscrFloor ? Math.max(dscrFloor, 1.25) : 1.25;
  const strategyNote = dscrFloor ? ` (institution minimum: ${dscrFloor}×)` : '';

  let rateSpread, rateTier, rateLabel, rateReasoning;
  if (dscr >= tier1Floor) {
    rateSpread = '0.50–0.75%'; rateTier = 1;
    rateLabel = strategy.rate_floor ? strategy.rate_floor.replace('Prime +', 'Prime +') : 'Prime + 0.50–0.75%';
    rateReasoning = `DSCR of ${dscr.toFixed(2)}× meets Tier 1 threshold (≥${tier1Floor}×) per OCC Bulletin 2023-1${strategyNote}. Strong debt service capacity supports minimum spread pricing.`;
  } else if (dscr >= tier2Floor) {
    rateSpread = '0.75–1.25%'; rateTier = 2;
    rateLabel = 'Prime + 0.75–1.25%';
    rateReasoning = `DSCR of ${dscr.toFixed(2)}× falls in Tier 2 range (${tier2Floor}–${tier1Floor - 0.01}×) per OCC 2023-1${strategyNote}. Adequate coverage warrants modest spread premium.`;
  } else if (dscr >= tier3Floor) {
    rateSpread = '1.25–2.00%'; rateTier = 3;
    rateLabel = 'Prime + 1.25–2.00%';
    rateReasoning = `DSCR of ${dscr.toFixed(2)}× is in Tier 3 (${tier3Floor}–${tier2Floor - 0.01}×)${strategyNote}. Coverage is thin — higher spread compensates for elevated default risk.`;
  } else if (dscr > 0) {
    rateSpread = '2.00%+'; rateTier = 4;
    rateLabel = 'Prime + 2.00%+ (risk priced)';
    rateReasoning = `DSCR of ${dscr.toFixed(2)}× is below the 1.25× minimum per OCC 2023-1. Credit is speculative — significant spread premium required. Thorough collateral analysis essential.`;
  } else {
    rateSpread = 'N/A'; rateTier = null;
    rateLabel = 'Unable to determine';
    rateReasoning = 'Insufficient financial data to calculate DSCR. Manual underwriting review required.';
  }

  // ── Suggested term — asset life proxy by SIC (OCC Commercial Lending Handbook) ──
  let term, termReasoning;
  const sicNum = parseInt(sic, 10);
  if (sicNum >= 6500 && sicNum <= 6552) {
    term = '10–15 years'; termReasoning = 'Real estate SIC (6500–6552): long-duration asset class supports extended amortizing terms per OCC Real Estate Lending Standards.';
  } else if ((sicNum >= 1000 && sicNum <= 1499) || (sicNum >= 2900 && sicNum <= 2999) || sic === '1311') {
    term = '5–10 years'; termReasoning = 'Mining/energy SIC: capital-intensive extraction assets depreciate over 5–15 years. Mid-range term reflects commodity cycle risk.';
  } else if (sicNum >= 2000 && sicNum <= 3999) {
    term = '5–7 years'; termReasoning = 'Manufacturing SIC: equipment financing typically 5–7 years aligned to equipment useful life per OCC guidelines.';
  } else if (sicNum >= 4000 && sicNum <= 4999) {
    term = '7–10 years'; termReasoning = 'Transportation/utilities SIC: infrastructure assets have long useful lives. 7–10 year terms common for regulated utility financing.';
  } else if ((sicNum >= 7000 && sicNum <= 7999) || (sicNum >= 8000 && sicNum <= 8999)) {
    term = '3–5 years'; termReasoning = 'Services SIC: primarily working capital and equipment lending. Short to medium terms reflect asset-light business model.';
  } else if (sicNum >= 6000 && sicNum <= 6399) {
    term = '3–7 years'; termReasoning = 'Financial services SIC: term lending is secondary to operating lines. Typical bank holding company loans are 3–7 years.';
  } else {
    term = '5–7 years'; termReasoning = 'Standard commercial term based on sector profile. Review collateral type to refine.';
  }

  // ── Amortization — tied to SIC asset class ────────────────────────────────
  let amort, amortReasoning;
  if (sicNum >= 6500 && sicNum <= 6552) {
    amort = '20–25 years'; amortReasoning = 'Real estate collateral: 20–25 year amortization is standard for commercial mortgage lending per OCC Real Estate guidelines and OSFI B-20.';
  } else if (sicNum >= 4000 && sicNum <= 4999) {
    amort = '15–20 years'; amortReasoning = 'Infrastructure/utility assets: long useful life supports extended amortization. Regulated cash flows reduce refinancing risk.';
  } else if (sicNum >= 2000 && sicNum <= 3999) {
    amort = '7–12 years'; amortReasoning = 'Manufacturing equipment: amortization aligned to equipment lifecycle. Typically 7–12 years per OCC Commercial Lending Handbook.';
  } else if ((sicNum >= 7000 && sicNum <= 8999) || (sicNum >= 6000 && sicNum <= 6499)) {
    amort = '3–7 years'; amortReasoning = 'Services / financial companies: limited hard assets. Shorter amortization reflects intangible collateral and operating cash flow dependency.';
  } else {
    amort = '10–15 years'; amortReasoning = 'Standard commercial amortization based on asset profile. Adjust based on collateral appraisal.';
  }

  // ── Covenant package — per OSFI B-6 leverage and DSCR thresholds ──────────
  let covenant, covenantReasoning;
  if (leverage <= 2.0 && dscr >= 2.0) {
    covenant = 'Incurrence only (lite)';
    covenantReasoning = `Leverage of ${leverage.toFixed(1)}× EBITDA (below 2.0× threshold) and DSCR of ${dscr.toFixed(2)}× support a lite/incurrence-only covenant structure. Per OSFI B-6, investment-grade signal borrowers qualify for covenant-lite structures.`;
  } else if (leverage <= 3.5 && dscr >= 1.5) {
    covenant = 'Incurrence';
    covenantReasoning = `Leverage of ${leverage.toFixed(1)}× and DSCR of ${dscr.toFixed(2)}× support incurrence covenants. No maintenance testing required unless leverage exceeds 3.5× per OSFI B-6 thresholds.`;
  } else if (leverage <= 5.0 || dscr >= 1.25) {
    covenant = 'Maintenance';
    covenantReasoning = `Leverage of ${leverage.toFixed(1)}× or DSCR of ${dscr.toFixed(2)}× requires quarterly maintenance covenant testing. Minimum DSCR covenant of 1.1× and maximum leverage of ${(leverage * 1.1).toFixed(1)}× recommended per OCC 2023-1.`;
  } else {
    covenant = 'Maintenance + springing cash sweep';
    covenantReasoning = `High leverage (${leverage.toFixed(1)}×) or weak DSCR (${dscr.toFixed(2)}×) requires tight maintenance covenants plus cash sweep provision. Excess cash flow must repay debt above trigger threshold per OCC leveraged lending guidance.`;
  }

  // ── Indicative max loan size (3–4× EBITDA senior) ─────────────────────────
  let maxLoan = null, maxLoanFmt = '—';
  if (ebitda > 0) {
    const seniorMax = ebitda * 4;
    maxLoan = seniorMax;
    const b = seniorMax >= 1e9 ? (seniorMax / 1e9).toFixed(1) + 'B' : (seniorMax / 1e6).toFixed(0) + 'M';
    maxLoanFmt = `Up to $${b} (senior)`;
  }

  // ── Credit quality signal (Altman Z-Score proxy) ──────────────────────────
  let creditSignal = 'Insufficient data';
  if (totalAssets > 0 && revenue > 0) {
    const wc     = totalAssets * 0.15;          // rough working capital proxy
    const re     = netIncome > 0 ? netIncome * 2 : 0;
    const ebit   = netIncome * 1.2;
    const sales  = revenue;
    const z = (1.2 * (wc / totalAssets)) +
              (1.4 * (re / totalAssets)) +
              (3.3 * (ebit / totalAssets)) +
              (0.999 * (sales / totalAssets));
    if (z > 2.99)       creditSignal = 'Safe zone (Z > 2.99) — low default probability';
    else if (z > 1.81)  creditSignal = 'Grey zone (1.81–2.99) — monitor closely';
    else                creditSignal = 'Distress zone (Z < 1.81) — elevated default risk';
  }

  // Apply covenant preference override from user strategy
  if (covenantPref && covenant !== 'Maintenance + springing cash sweep') {
    covenant = covenantPref;
    covenantReasoning += ` [Override: institution strategy requires ${covenantPref} covenants.]`;
  }

  // Apply leverage cap override
  let leverageWarning = '';
  if (leverageCap && leverage > leverageCap) {
    leverageWarning = `⚠ Leverage of ${leverage.toFixed(1)}× exceeds institution maximum of ${leverageCap}×. Deal likely outside policy.`;
  }

  return {
    dscr:            dscr > 0 ? +dscr.toFixed(2) : null,
    leverage:        leverage < 99 ? +leverage.toFixed(1) : null,
    rateLabel,
    rateSpread,
    rateTier,
    rateReasoning,
    term,
    termReasoning,
    amort,
    amortReasoning,
    covenant,
    covenantReasoning,
    maxLoanFmt,
    creditSignal,
    leverageWarning,
    strategyActive:  !!userStrategy,
    hasData:         dscr > 0 || leverage < 99,
  };
}

module.exports = { OrgService, computeLoanParameters };
