'use strict';

const express      = require('express');
const { SicService }    = require('../services/SicService');
const { SectorService } = require('../services/SectorService');

const router = express.Router();

/* GET / — Landing page */
router.get('/', (req, res) => {
  const authModal = req.query.auth || null; // ?auth=login to auto-open login modal
  res.render('home', {
    title: 'SectorLens — Commercial Banking Intelligence',
    authModal,
    layout: 'main',
  });
});

/* GET /search — redirect to sector or show results */
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.redirect('/');

  // If exact SIC code match, go straight to sector dashboard
  const sector = await SectorService.findBySIC(q);
  if (sector) return res.redirect(`/sector/${q}`);

  // Otherwise show search results page
  const results = await SicService.searchAll(q);
  res.render('search-results', {
    title: `Search: ${q} — SectorLens`,
    query: q,
    sics: results.sics,
    orgs: results.orgs,
    layout: 'main',
  });
});

/* POST /locale — toggle language */
router.post('/locale', (req, res) => {
  const locale = req.body.locale === 'fr' ? 'fr' : 'en';
  req.session.locale = locale;
  const back = req.headers.referer || '/';
  const url = new URL(back, `http://${req.headers.host}`);
  url.searchParams.set('lang', locale);
  res.redirect(url.pathname + url.search);
});

module.exports = router;
