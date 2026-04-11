'use strict';

const express = require('express');
const { OrgService, computeLoanParameters } = require('../services/OrgService');
const { getUserStrategy } = require('./account');
const router = express.Router();

/* ── Source metadata builder ─────────────────────────────────────────────── */
function buildOrgSources(org) {
  const sources = [];
  const sn  = org.source_name || '';
  const sid = org.source_id   || '';

  if (sn === 'FDIC' || (org.sic_code?.startsWith('60') && org.country_code === 'US' && !sn)) {
    sources.push({
      badge: 'Primary', name: 'FDIC BankFind Suite',
      description: 'Call Report financial data for all FDIC-insured US institutions.',
      url: sid ? `https://banks.fdic.gov/bank/individual/${sid}` : 'https://banks.fdic.gov/api/institutions',
    });
  }
  if (sn === 'SEC_EDGAR' || (org.ticker && org.country_code === 'US' && !sn)) {
    sources.push({
      badge: 'Primary', name: 'SEC EDGAR — XBRL Filing Database',
      description: 'Annual 10-K filings and structured XBRL financial facts from the SEC.',
      url: sid ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${sid.replace(/^0+/, '')}&type=10-K`
               : `https://efts.sec.gov/LATEST/search-index?q="${encodeURIComponent(org.name)}"&forms=10-K`,
    });
  }
  if (sn === 'PROPUBLICA_990') {
    sources.push({
      badge: 'Primary', name: 'ProPublica Nonprofit Explorer',
      description: 'IRS Form 990 annual filings for US tax-exempt organizations.',
      url: sid ? `https://projects.propublica.org/nonprofits/organizations/${sid}`
               : `https://projects.propublica.org/nonprofits/api/v2/search.json?q=${encodeURIComponent(org.name)}`,
    });
  }
  if (sn === 'COMPANIES_HOUSE_UK') {
    sources.push({
      badge: 'Primary', name: 'UK Companies House',
      description: 'Annual accounts and company information for UK registered companies.',
      url: sid ? `https://find-and-update.company-information.service.gov.uk/company/${sid}`
               : `https://find-and-update.company-information.service.gov.uk/search?q=${encodeURIComponent(org.name)}`,
    });
  }
  if (sn === 'OSFI') {
    sources.push({
      badge: 'Primary', name: 'OSFI — Office of the Superintendent of Financial Institutions',
      description: 'Regulatory financial data for all federally regulated Canadian banks and trust companies.',
      url: 'https://www.osfi-bsif.gc.ca/en/data-forms/data/data-collection',
    });
  }
  if (sn === 'EBA') {
    sources.push({
      badge: 'Primary', name: 'EBA EU-Wide Transparency Exercise',
      description: 'Capital, leverage, liquidity, and asset quality data for major EU banks.',
      url: 'https://www.eba.europa.eu/risk-analysis-and-data/eu-wide-transparency-exercise',
    });
  }
  if (sn === 'FMP') {
    sources.push({
      badge: 'Enriched', name: 'Financial Modeling Prep',
      description: 'Normalized income statements and balance sheet data aggregated from public filings.',
      url: org.ticker ? `https://financialmodelingprep.com/financial-statements/${org.ticker}`
                      : 'https://financialmodelingprep.com',
    });
  }
  if (sn === 'STATCAN') {
    sources.push({
      badge: 'Primary', name: 'Statistics Canada',
      description: 'Sector-level financial statistics and business performance data.',
      url: 'https://www150.statcan.gc.ca/t1/tbl1/en/dtbl!downloadTbl=true&type=JSON&id=3310022501',
    });
  }
  if (sn === 'OECD_STAT') {
    sources.push({
      badge: 'Primary', name: 'OECD.Stat — Structural Business Statistics',
      description: 'Financial statistics for enterprises across all 38 OECD member countries.',
      url: 'https://stats.oecd.org/SDMX-JSON/data',
    });
  }
  if (org.type === 'Manual') {
    sources.push({
      badge: 'Manual', name: 'Manually Entered via Compare Tool',
      description: `Financial data entered manually for comparison on ${new Date(org.updated_at || org.created_at).toLocaleDateString('en-CA')}.`,
      url: null,
    });
  }

  // Sector benchmark always last
  sources.push({
    badge: 'Derived', name: 'SectorLens Sector Benchmarks',
    description: `Sector median calculations aggregated across all reporting entities in SIC ${org.sic_code}.`,
    url: null,
  });

  // Fallback: generic public filing search if source unknown
  if (sources.length === 1 && org.ticker) {
    sources.unshift({
      badge: 'Reference', name: 'SEC EDGAR Company Search',
      description: 'Search for public filings by company name.',
      url: `https://efts.sec.gov/LATEST/search-index?q="${encodeURIComponent(org.name)}"&forms=10-K`,
    });
  }

  return sources;
}

/* GET /org/:id — Organization profile */
router.get('/:id', async (req, res) => {
  try {
    const data = await OrgService.getProfile(req.params.id);
    if (!data) return res.status(404).render('error', { title: 'Not Found', code: 404, message: 'Organization not found.' });

    const sources = buildOrgSources(data.org);
    const userId = req.session?.user?.id || null;
    const userStrategy = await getUserStrategy(userId).catch(() => null);
    const loanParams = computeLoanParameters(data.fin, data.org.sic_code, userStrategy);

    res.render('org-profile', {
      title: `${data.org.name} — SectorLens`,
      ...data,
      chartTrend:     JSON.stringify(data.chartTrend),
      peerChart:      JSON.stringify(data.peerChart),
      orgSourcesJson: JSON.stringify(sources),
      loanParams,
      loanParamsJson: JSON.stringify(loanParams),
      layout: 'main',
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { title: 'Error', message: err.message, code: 500 });
  }
});

module.exports = router;
