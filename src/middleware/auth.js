'use strict';

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.session.returnTo = req.originalUrl;
  res.redirect('/?auth=login');
}

const TIER_ORDER = ['free_trial', 'essential', 'professional', 'enterprise'];

function requireTier(minTier) {
  return (req, res, next) => {
    if (!req.session.user) return requireAuth(req, res, next);
    const userTier = req.session.user.subscription_tier || 'free_trial';
    const userIdx = TIER_ORDER.indexOf(userTier);
    const minIdx  = TIER_ORDER.indexOf(minTier);
    if (userIdx >= minIdx) return next();
    res.status(403).render('error', {
      title: 'Upgrade Required',
      message: `This feature requires the ${minTier.replace('_', ' ')} plan or higher.`,
      code: 403,
    });
  };
}

function addUserLocals(req, res, next) {
  res.locals.user   = req.session.user || null;
  res.locals.locale = req.session.locale || req.language || 'en';
  res.locals.isAuth = !!req.session.user;
  res.locals.flash  = req.session.flash || null;
  delete req.session.flash;
  next();
}

module.exports = { requireAuth, requireTier, addUserLocals };
