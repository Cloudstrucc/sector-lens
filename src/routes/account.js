'use strict';

const express    = require('express');
const path       = require('path');
const rawBody    = require('raw-body');
const { requireAuth } = require('../middleware/auth');
const { db }     = require('../config/database');
const router     = express.Router();

/* ── Pre-built lending strategies ──────────────────────────────────────── */
const PRESET_STRATEGIES = {
  conservative: {
    key: 'conservative', label: 'Conservative',
    description: 'For risk-averse institutions and regulated environments.',
    details: 'Minimum DSCR 2.0×, maintenance covenants, max 3× leverage. Aligned with OSFI B-20 stress-test standards.',
    params: { dscr_min: 2.0, leverage_max: 3.0, rate_floor: 'Prime + 0.50%', covenant: 'Maintenance', amort_max: 20 },
  },
  balanced: {
    key: 'balanced', label: 'Balanced',
    description: 'Standard commercial parameters for mid-market borrowers.',
    details: 'DSCR 1.5×, mixed maintenance/incurrence covenants, leverage up to 4.5× EBITDA.',
    params: { dscr_min: 1.5, leverage_max: 4.5, rate_floor: 'Prime + 0.75%', covenant: 'Mixed', amort_max: 25 },
  },
  growth: {
    key: 'growth', label: 'Growth Lending',
    description: 'Revenue-weighted analysis for high-growth companies.',
    details: 'Weights revenue growth alongside coverage. Incurrence covenants, up to 6× leverage.',
    params: { dscr_min: 1.25, leverage_max: 6.0, rate_floor: 'Prime + 1.00%', covenant: 'Incurrence', amort_max: 10 },
  },
  real_estate: {
    key: 'real_estate', label: 'Real Estate Focus',
    description: 'LTV-driven analysis for real estate and property companies.',
    details: 'NOI and LTV are primary underwriting factors. 20–25 year amortization. Per OCC Real Estate Lending Standards.',
    params: { dscr_min: 1.25, leverage_max: 5.0, rate_floor: 'Prime + 0.75%', covenant: 'Maintenance', amort_max: 25 },
  },
  abl: {
    key: 'abl', label: 'Asset-Based (ABL)',
    description: 'Borrowing base formula against AR, inventory, and equipment.',
    details: 'Up to 85% of eligible AR and 50–65% of inventory. Revolving structure with annual clean-up. Per OCC ABL guidance.',
    params: { dscr_min: 1.0, leverage_max: 4.0, rate_floor: 'Prime + 1.00%', covenant: 'Maintenance + Borrowing Base Certificate', amort_max: 5 },
  },
  osfi_b20: {
    key: 'osfi_b20', label: 'OSFI B-20 Compliant',
    description: 'Canadian stress-tested underwriting per OSFI Guideline B-20.',
    details: 'GDS/TDS ratio limits, stress test at higher of 5.25% or contract rate +2%. Mandatory for federally regulated institutions.',
    params: { dscr_min: 1.75, leverage_max: 3.5, rate_floor: 'Prime + 0.50%', covenant: 'Maintenance', amort_max: 25 },
  },
};

/* ── GET /account ──────────────────────────────────────────────────────── */
router.get('/', requireAuth, async (req, res) => {
  res.render('account', { title: 'My Account — SectorLens', layout: 'main' });
});

/* ── GET /account/strategy ─────────────────────────────────────────────── */
router.get('/strategy', requireAuth, async (req, res) => {
  const userId   = req.session.user.id;
  const strategy = await db('user_strategies').where('user_id', userId).first();
  res.render('account-strategy', {
    title:    'Lending Strategy — SectorLens',
    layout:   'main',
    presets:  Object.values(PRESET_STRATEGIES),
    strategy: strategy || null,
    saved:    req.query.saved === '1',
  });
});

/* ── POST /account/strategy (preset or form save) ──────────────────────── */
router.post('/strategy', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const { strategy_type, preset_key, plain_text } = req.body;
  let overrideParams = null;
  if (strategy_type === 'preset' && PRESET_STRATEGIES[preset_key]) {
    overrideParams = JSON.stringify(PRESET_STRATEGIES[preset_key].params);
  }
  const existing = await db('user_strategies').where('user_id', userId).first();
  const row = {
    user_id:         userId,
    strategy_type:   strategy_type || 'preset',
    preset_key:      strategy_type === 'preset' ? (preset_key || null) : null,
    plain_text:      strategy_type === 'text'   ? (plain_text || null) : null,
    override_params: overrideParams,
    updated_at:      new Date().toISOString(),
  };
  if (existing) {
    await db('user_strategies').where('id', existing.id).update(row);
  } else {
    await db('user_strategies').insert({ ...row, created_at: new Date().toISOString() });
  }
  res.redirect('/account/strategy?saved=1');
});

/* ── POST /account/strategy/upload ─────────────────────────────────────── */
// Uses raw multipart parsing without busboy — no extra deps needed
router.post('/strategy/upload', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;

    // Read raw body
    const contentType = req.headers['content-type'] || '';
    const boundary = contentType.match(/boundary=([^\s;]+)/)?.[1];
    if (!boundary) return res.status(400).json({ error: 'Invalid multipart request.' });

    const buf = await rawBody(req, { limit: '5mb' });
    const raw = buf.toString('binary');

    // Parse multipart manually
    const parts = raw.split('--' + boundary);
    let fileName = null;
    let fileContent = '';

    for (const part of parts) {
      if (!part.includes('filename=')) continue;
      const nameMatch = part.match(/filename="([^"]+)"/);
      if (!nameMatch) continue;
      fileName = nameMatch[1];
      // Find double CRLF which separates headers from body
      const bodyStart = part.indexOf('\r\n\r\n');
      if (bodyStart === -1) continue;
      fileContent = part.slice(bodyStart + 4);
      // Remove trailing boundary marker
      fileContent = fileContent.replace(/\r\n$/, '').replace(/--$/, '');
      break;
    }

    if (!fileName || !fileContent) {
      return res.status(400).json({ error: 'No file received.' });
    }

    const ext = path.extname(fileName).toLowerCase();
    let textContent = '';

    if (ext === '.txt' || ext === '.md') {
      // Plain text — convert binary string to utf8
      textContent = Buffer.from(fileContent, 'binary').toString('utf8').slice(0, 8000);
    } else if (ext === '.docx') {
      // docx is a zip — extract readable text from XML using regex
      // Look for w:t XML elements which contain the actual text
      const wt = fileContent.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
      textContent = wt
        .map(m => m.replace(/<[^>]+>/g, ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 8000);
      if (!textContent) {
        // Fallback: try to find any readable ASCII text
        textContent = Buffer.from(fileContent, 'binary')
          .toString('utf8', 0, 20000)
          .replace(/[^\x20-\x7E\n]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 8000);
      }
    } else if (ext === '.pdf') {
      // Extract PDF text streams
      const matches = raw.match(/BT\s*([\s\S]*?)\s*ET/g) || [];
      textContent = matches
        .join(' ')
        .replace(/\(([^)]*)\)\s*Tj/g, '$1 ')
        .replace(/\(([^)]*)\)\s*TJ/g, '$1 ')
        .replace(/[^\x20-\x7E\n]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 8000);
      if (!textContent || textContent.length < 50) {
        textContent = '[PDF text extraction limited. Please describe your strategy in the plain language tab instead.]';
      }
    } else if (ext === '.xlsx') {
      // xlsx is also a zip — try to extract shared strings XML
      const ssMatch = fileContent.match(/<si><t>([^<]*)<\/t><\/si>/g) || [];
      textContent = ssMatch.map(m => m.replace(/<[^>]+>/g, '')).join(' ').slice(0, 8000);
      if (!textContent) textContent = '[Spreadsheet uploaded — describe numerical parameters in the plain language tab for best results]';
    } else {
      textContent = Buffer.from(fileContent, 'binary').toString('utf8').slice(0, 8000);
    }

    if (!textContent || textContent.length < 5) {
      return res.status(400).json({ error: `Could not extract text from ${ext} file. Try uploading a .txt or .md file instead.` });
    }

    const extracted = await extractStrategyWithClaude(textContent, fileName);

    const existing = await db('user_strategies').where('user_id', userId).first();
    const row = {
      user_id:            userId,
      strategy_type:      'document',
      preset_key:         null,
      plain_text:         null,
      document_name:      fileName,
      document_extracted: JSON.stringify(extracted.summary),
      override_params:    JSON.stringify(extracted.params),
      updated_at:         new Date().toISOString(),
    };
    if (existing) {
      await db('user_strategies').where('id', existing.id).update(row);
    } else {
      await db('user_strategies').insert({ ...row, created_at: new Date().toISOString() });
    }

    res.json({ ok: true, extracted });
  } catch (err) {
    console.error('Strategy upload error:', err);
    res.status(500).json({ error: err.message || 'Upload failed.' });
  }
});

/* ── POST /account/strategy/analyze-text ───────────────────────────────── */
router.post('/strategy/analyze-text', requireAuth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || text.trim().length < 10) {
      return res.status(400).json({ error: 'Please provide a strategy description.' });
    }
    const extracted = await extractStrategyWithClaude(text.slice(0, 8000), 'plain text');

    const userId = req.session.user.id;
    const existing = await db('user_strategies').where('user_id', userId).first();
    const row = {
      user_id:         userId,
      strategy_type:   'text',
      preset_key:      null,
      plain_text:      text,
      override_params: JSON.stringify(extracted.params),
      updated_at:      new Date().toISOString(),
    };
    if (existing) {
      await db('user_strategies').where('id', existing.id).update(row);
    } else {
      await db('user_strategies').insert({ ...row, created_at: new Date().toISOString() });
    }

    res.json({ ok: true, extracted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── POST /account/strategy/reset ──────────────────────────────────────── */
router.post('/strategy/reset', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  await db('user_strategies').where('user_id', userId).delete();
  res.redirect('/account/strategy?saved=1');
});

/* ── Claude API: extract lending params ─────────────────────────────────── */
async function extractStrategyWithClaude(text, sourceName) {
  const prompt = `You are a commercial lending analyst. Extract lending strategy parameters from this document.

Source: ${sourceName}
Content:
${text}

Respond ONLY with valid JSON (no markdown, no extra text):
{
  "summary": "2-3 sentence summary of the lending strategy",
  "params": {
    "dscr_min": <number or null>,
    "leverage_max": <number or null>,
    "rate_floor": "<string like 'Prime + 0.75%' or null>",
    "covenant": "<'Maintenance' or 'Incurrence' or 'Lite' or null>",
    "amort_max": <years as integer or null>,
    "notes": "<sector focus, conditions, or key exceptions>"
  }
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 600,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });
    if (!response.ok) throw new Error(`Claude API ${response.status}`);
    const data  = await response.json();
    const raw   = data.content?.[0]?.text || '{}';
    const clean = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (e) {
    console.error('Claude extraction failed:', e.message);
    return {
      summary: 'Could not extract parameters automatically. Please review and enter manually.',
      params:  { dscr_min: null, leverage_max: null, rate_floor: null, covenant: null, amort_max: null, notes: e.message },
    };
  }
}

/* ── Exported helpers ───────────────────────────────────────────────────── */
async function getUserStrategy(userId) {
  if (!userId) return null;
  try {
    const s = await db('user_strategies').where('user_id', userId).first();
    if (!s || !s.override_params) return null;
    return JSON.parse(s.override_params);
  } catch { return null; }
}

module.exports = router;
module.exports.getUserStrategy   = getUserStrategy;
module.exports.PRESET_STRATEGIES = PRESET_STRATEGIES;