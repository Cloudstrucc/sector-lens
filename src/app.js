'use strict';

require('dotenv').config();

const path        = require('path');
const express     = require('express');
const { engine }  = require('express-handlebars');
const session     = require('express-session');
const helmet      = require('helmet');
const compression = require('compression');
const rateLimit   = require('express-rate-limit');
const middleware  = require('i18next-http-middleware');

const { setupI18n, i18next } = require('./config/i18n');
const { rawDb }              = require('./config/database');
const { addUserLocals }      = require('./middleware/auth');

const indexRouter   = require('./routes/index');
const authRouter    = require('./routes/auth');
const sectorRouter  = require('./routes/sector');
const orgRouter     = require('./routes/org');
const apiRouter     = require('./routes/api');
const accountRouter = require('./routes/account');

/* ── Inline SQLite session store using existing better-sqlite3 db ── */
class BetterSqliteStore extends session.Store {
  constructor(options = {}) {
    super();
    this.ttl = (options.ttl || 60 * 60 * 24 * 7) * 1000;
    rawDb.exec(`CREATE TABLE IF NOT EXISTS sessions (
      sid     TEXT NOT NULL PRIMARY KEY,
      sess    TEXT NOT NULL,
      expired INTEGER NOT NULL
    )`);
    const purge = rawDb.prepare('DELETE FROM sessions WHERE expired < ?');
    setInterval(() => purge.run(Date.now()), 10 * 60 * 1000).unref();
  }

  get(sid, cb) {
    try {
      const row = rawDb.prepare('SELECT sess FROM sessions WHERE sid = ? AND expired >= ?').get(sid, Date.now());
      cb(null, row ? JSON.parse(row.sess) : null);
    } catch (e) { cb(e); }
  }

  set(sid, sess, cb) {
    try {
      const expires = sess.cookie && sess.cookie.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + this.ttl;
      rawDb.prepare('INSERT OR REPLACE INTO sessions (sid, sess, expired) VALUES (?, ?, ?)').run(sid, JSON.stringify(sess), expires);
      cb(null);
    } catch (e) { cb(e); }
  }

  destroy(sid, cb) {
    try {
      rawDb.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      cb(null);
    } catch (e) { cb(e); }
  }

  touch(sid, sess, cb) {
    try {
      const expires = sess.cookie && sess.cookie.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + this.ttl;
      rawDb.prepare('UPDATE sessions SET expired = ? WHERE sid = ?').run(expires, sid);
      cb(null);
    } catch (e) { cb(e); }
  }
}

/* ── App factory ─────────────────────────────────────────────────── */
async function createApp() {
  await setupI18n();

  const app = express();

  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(compression());

  // Trust Azure App Service reverse proxy (required for rate-limit + secure cookies)
  app.set("trust proxy", 1);
  app.use('/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true }));
  app.use('/api',  rateLimit({ windowMs:  1 * 60 * 1000, max: 60, standardHeaders: true }));

  app.engine('hbs', engine({
    extname: '.hbs',
    defaultLayout: 'main',
    layoutsDir:  path.join(__dirname, 'views/layouts'),
    partialsDir: path.join(__dirname, 'views/partials'),
    helpers: {
      json: (obj) => JSON.stringify(obj),
      t(key, options) {
        const lng = (options && options.hash && options.hash.lng) || this.locale || 'en';
        return i18next.t(key, { lng, ...(options?.hash || {}) });
      },
      eq:  (a, b) => a === b,
      neq: (a, b) => a !== b,
      or:  (a, b) => a || b,
      and: (a, b) => a && b,
      not: (a)    => !a,
      gt:  (a, b) => Number(a) > Number(b),
      gte: (a, b) => Number(a) >= Number(b),
      lte: (a, b) => Number(a) <= Number(b),
      includes: (str, substr) => str && String(str).includes(substr),
      inc: (n)    => Number(n) + 1,
      concat(...args) { return args.slice(0, -1).join(''); },
      ucfirst(str)    { return str ? str.charAt(0).toUpperCase() + str.slice(1) : ''; },
      deltaClass(trend) {
        if (trend === 'pos') return 'pos';
        if (trend === 'neg') return 'neg';
        return 'neu';
      },
      fmtNum(n) {
        if (n == null) return '—';
        if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
        if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(0) + 'M';
        return '$' + Number(n).toLocaleString();
      },
      fmtPct(n, decimals) {
        if (n == null) return '—';
        return Number(n).toFixed(typeof decimals === 'number' ? decimals : 1) + '%';
      },
      fmtRatio(n) {
        if (n == null) return '—';
        return Number(n).toFixed(2) + '×';
      },
      // Smart formatter — picks currency/percent/ratio based on metric name
      fmtMetric(val, metric) {
        if (val == null) return '—';
        const pct = ['gross_margin','net_margin','operating_margin','roe','roa',
                     'tier1_capital_ratio','efficiency_ratio'];
        const ratio = ['debt_to_equity'];
        const v = Number(val);
        if (pct.includes(metric))   return v.toFixed(1) + '%';
        if (ratio.includes(metric)) return v.toFixed(2) + '×';
        // currency
        if (Math.abs(v) >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T';
        if (Math.abs(v) >= 1e9)  return '$' + (v / 1e9).toFixed(1)  + 'B';
        if (Math.abs(v) >= 1e6)  return '$' + (v / 1e6).toFixed(0)  + 'M';
        if (Math.abs(v) >= 1e3)  return '$' + (v / 1e3).toFixed(0)  + 'K';
        return '$' + v.toFixed(0);
      },
      neMetric(metric, col) { return metric !== col; }, // show column only if not the active metric
      range(start, end) {
        const arr = [];
        for (let i = Number(start); i <= Number(end); i++) arr.push(i);
        return arr;
      },
      typeBadgeClass(type) {
        if (type === 'Public')  return 'badge-pub';
        if (type === 'Manual')  return 'badge-manual';
        return 'badge-priv';
      },
    },
  }));

  app.set('view engine', 'hbs');
  app.set('views', path.join(__dirname, 'views'));

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, 'public')));

  app.use(session({
    store: new BetterSqliteStore(),
    secret: process.env.SESSION_SECRET || 'dev-secret-CHANGE-IN-PRODUCTION',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure:   process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge:   7 * 24 * 60 * 60 * 1000,
    },
  }));

  app.use(middleware.handle(i18next));
  app.use(addUserLocals);

  app.use('/',        indexRouter);
  app.use('/auth',    authRouter);
  app.use('/sector',  sectorRouter);
  app.use('/org',     orgRouter);
  app.use('/api',     apiRouter);
  app.use('/account', accountRouter);

  app.use((req, res) => {
    res.status(404).render('error', { title: 'Page Not Found', message: 'The page you requested does not exist.', code: 404 });
  });

  app.use((err, req, res, _next) => {
    console.error(err.stack);
    res.status(500).render('error', {
      title: 'Server Error',
      message: process.env.NODE_ENV === 'production' ? 'An internal error occurred.' : err.message,
      code: 500,
    });
  });

  return app;
}

module.exports = { createApp };
