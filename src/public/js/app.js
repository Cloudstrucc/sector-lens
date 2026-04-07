'use strict';

/**
 * SectorLens — global Alpine.js component
 * Lives on <body x-data="sectorApp()"> — every page shares this scope.
 */
function sectorApp() {
  return {
    theme: localStorage.getItem('sl-theme') || 'light',
    profileOpen: false,
    modal: null,
    sources: [],   // populated by org-profile page via window.__slSources

    // ── Compare tool state ───────────────────────────────────────────────────
    compare: {
      sic:        '',
      clientName: '',
      metrics:    [],   // sector-specific KPI metrics
      chartFields:[],   // common chart/profile fields (revenue, margins, etc.)
      custom:     [],   // user-added rows
      results:    [],
      loading:    false,
      error:      '',
    },

    // ── Init ─────────────────────────────────────────────────────────────────
    init() {
      document.documentElement.setAttribute('data-theme', this.theme);
      this.initCompare();
      // Load org sources injected by org-profile page
      if (window.__slSources) this.sources = window.__slSources;
      if (window.__sl_modal) {
        this.$nextTick(() => { this.modal = window.__sl_modal; });
      }
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { this.modal = null; this.profileOpen = false; }
      });
    },

    openSicBrowser() {
      this.modal = 'sic-browser';
      this.$nextTick(() => window.dispatchEvent(new CustomEvent('open-sic-browser')));
    },

    initCompare() {
      const el = document.getElementById('sl-compare-metrics');
      if (!el) return;
      try {
        const parsed = JSON.parse(el.textContent);

        // Keys already covered by the sector metrics block
        const sectorKeys = new Set(parsed.map(m => m.key));

        this.compare.metrics    = parsed.map(m => ({ ...m, clientVal: '' }));
        this.compare.custom     = [];
        this.compare.results    = [];
        this.compare.error      = '';
        this.compare.clientName = '';

        // Build the chart fields list — only add fields not already in sector metrics
        const allChartFields = [
          { key: 'revenue',          label: 'Revenue',            example: '$4.2B',  hint: 'Total revenue / net interest income' },
          { key: 'net_income',       label: 'Net Income',          example: '$340M',  hint: 'After-tax profit' },
          { key: 'gross_margin',     label: 'Gross Margin',        example: '61.2%',  hint: 'Gross profit ÷ revenue' },
          { key: 'net_margin',       label: 'Net Margin',          example: '12.6%',  hint: 'Net income ÷ revenue' },
          { key: 'operating_margin', label: 'Operating Margin',    example: '18.4%',  hint: 'Operating income ÷ revenue' },
          { key: 'roe',              label: 'Return on Equity',    example: '13.4%',  hint: 'Net income ÷ shareholder equity' },
          { key: 'total_assets',     label: 'Total Assets',        example: '$44B',   hint: 'Balance sheet total assets' },
          { key: 'debt_to_equity',   label: 'Debt / Equity',       example: '9.1×',   hint: 'Total debt ÷ equity' },
          { key: 'efficiency_ratio', label: 'Efficiency Ratio',    example: '54.8%',  hint: 'Non-interest expense ÷ revenue (banks)' },
          { key: 'tier1_capital_ratio', label: 'Tier 1 Capital',   example: '14.2%',  hint: 'Regulatory capital ratio (banks)' },
        ];
        this.compare.chartFields = allChartFields
          .filter(f => !sectorKeys.has(f.key))
          .map(f => ({ ...f, clientVal: '' }));

        const sicEl = document.querySelector('.sic-badge');
        if (sicEl) this.compare.sic = sicEl.textContent.trim();
      } catch (e) {
        console.warn('SectorLens: could not parse compare metrics', e);
      }
    },

    // ── Submit: save org + all entered financials, navigate to profile ────────
    async runCompare() {
      const name = this.compare.clientName.trim();
      if (!name) { this.compare.error = 'Please enter a client or company name.'; return; }

      // Collect all filled rows: sector metrics + chart fields + custom
      const allMetrics = [
        ...this.compare.metrics.filter(m => m.clientVal && m.clientVal.trim()),
        ...this.compare.chartFields.filter(f => f.clientVal && f.clientVal.trim()),
        ...this.compare.custom.filter(m => m.label && m.clientVal && m.clientVal.trim()),
      ];

      if (!allMetrics.length) {
        this.compare.error = 'Please enter at least one financial value.';
        return;
      }

      this.compare.error   = '';
      this.compare.loading = true;

      try {
        const resp = await fetch('/api/compare/submit', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            clientName: name,
            sic:        this.compare.sic,
            metrics:    allMetrics.map(m => ({
              key:       m.key   || null,
              label:     m.label || '',
              clientVal: m.clientVal,
              sectorVal: m.sectorVal || '',
            })),
          }),
        });
        const data = await resp.json();
        if (!resp.ok) { this.compare.error = data.error || 'Something went wrong.'; this.compare.loading = false; return; }
        this.modal = null;
        window.location.href = data.redirect;
      } catch (e) {
        this.compare.error   = 'Network error — please try again.';
        this.compare.loading = false;
      }
    },

    // ── Theme ────────────────────────────────────────────────────────────────
    toggleTheme() {
      this.theme = this.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', this.theme);
      localStorage.setItem('sl-theme', this.theme);

      if (window.__slCharts) {
        const dark   = this.theme === 'dark';
        const grid   = dark ? '#252525' : '#f0f0f0';
        const tick   = dark ? '#666'    : '#8a8a8a';
        const legend = dark ? '#999'    : '#4a4a4a';
        window.__slCharts.forEach(chart => {
          if (chart.options.scales) {
            Object.values(chart.options.scales).forEach(scale => {
              if (scale.ticks) scale.ticks.color = tick;
              if (scale.grid && scale.grid.color !== false) scale.grid.color = grid;
            });
          }
          if (chart.options.plugins?.legend?.labels) {
            chart.options.plugins.legend.labels.color = legend;
          }
          chart.update('none');
        });
      }
    },
  };
}

window.__slCharts = window.__slCharts || [];
