'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  res.render('account', { title: 'My Account — SectorLens', layout: 'main' });
});

module.exports = router;
