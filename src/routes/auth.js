'use strict';

const express = require('express');
const bcrypt  = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { db }  = require('../config/database');

const router = express.Router();
const SALT_ROUNDS = 12;

/* POST /auth/login */
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.session.flash = { type: 'error', text: 'Invalid email or password.' };
    return res.redirect(req.headers.referer || '/');
  }

  try {
    const user = await db('users').where('email', req.body.email).first();
    if (!user || !(await bcrypt.compare(req.body.password, user.password_hash))) {
      req.session.flash = { type: 'error', text: 'Invalid email or password.' };
      return res.redirect(req.headers.referer || '/');
    }

    await db('users').where('id', user.id).update({ last_login_at: new Date().toISOString() });

    req.session.user = {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      subscription_tier: user.subscription_tier,
      preferred_locale: user.preferred_locale,
    };
    req.session.locale = user.preferred_locale || 'en';

    const returnTo = req.session.returnTo || '/';
    delete req.session.returnTo;
    res.redirect(returnTo);
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', text: 'Login failed. Please try again.' };
    res.redirect(req.headers.referer || '/');
  }
});

/* POST /auth/register */
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('first_name').notEmpty().trim(),
  body('last_name').notEmpty().trim(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.session.flash = { type: 'error', text: 'Please fill in all fields correctly.' };
    return res.redirect(req.headers.referer || '/');
  }

  try {
    const existing = await db('users').where('email', req.body.email).first();
    if (existing) {
      req.session.flash = { type: 'error', text: 'An account with that email already exists.' };
      return res.redirect(req.headers.referer || '/');
    }

    const hash = await bcrypt.hash(req.body.password, SALT_ROUNDS);
    const trialExpires = new Date();
    trialExpires.setDate(trialExpires.getDate() + 14);

    const [id] = await db('users').insert({
      email: req.body.email,
      password_hash: hash,
      first_name: req.body.first_name,
      last_name: req.body.last_name,
      institution: req.body.institution || null,
      job_title: req.body.job_title || null,
      subscription_tier: 'free_trial',
      subscription_status: 'active',
      preferred_locale: req.body.locale || req.session.locale || 'en',
      trial_expires_at: trialExpires.toISOString(),
    });

    req.session.user = {
      id,
      email: req.body.email,
      first_name: req.body.first_name,
      last_name: req.body.last_name,
      subscription_tier: 'free_trial',
    };

    req.session.flash = { type: 'success', text: 'Welcome to SectorLens! Your 14-day trial is active.' };
    res.redirect('/');
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', text: 'Registration failed. Please try again.' };
    res.redirect(req.headers.referer || '/');
  }
});

/* GET /auth/logout */
router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

/* POST /auth/invite/redeem */
router.post('/invite/redeem', [
  body('code').notEmpty().trim(),
], async (req, res) => {
  const { code } = req.body;
  try {
    const invite = await db('invitation_codes')
      .where('code', code.toUpperCase())
      .where('redeemed', false)
      .where(b => b.whereNull('expires_at').orWhere('expires_at', '>', new Date().toISOString()))
      .first();

    if (!invite) {
      req.session.flash = { type: 'error', text: 'Invalid or expired invitation code.' };
      return res.redirect(req.headers.referer || '/');
    }

    req.session.flash = { type: 'success', text: 'Invitation code accepted! Please complete registration.' };
    req.session.inviteCode = code.toUpperCase();
    res.redirect('/');
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', text: 'Could not validate invitation code.' };
    res.redirect(req.headers.referer || '/');
  }
});

/* POST /auth/invite/request */
router.post('/invite/request', [
  body('email').isEmail().normalizeEmail(),
], async (req, res) => {
  // In production: send email notification to admin + confirmation to user
  req.session.flash = { type: 'success', text: 'Invitation request received. We will be in touch shortly.' };
  res.redirect(req.headers.referer || '/');
});

module.exports = router;
