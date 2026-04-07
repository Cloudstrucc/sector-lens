'use strict';

const { db } = require('../config/database');

const SicService = {

  async searchAll(q) {
    const ql = `%${q.toLowerCase()}%`;

    const sics = await db('sic_codes')
      .whereRaw('lower(sic_code) like ?', [ql])
      .orWhereRaw('lower(name) like ?', [ql])
      .orWhereRaw('lower(name_fr) like ?', [ql])
      .limit(5);

    const orgs = await db('organizations')
      .whereRaw('lower(name) like ?', [ql])
      .limit(8)
      .select('id', 'name', 'type', 'ticker', 'sic_code');

    return { sics, orgs };
  },

  async getAll() {
    return db('sic_codes').orderBy('sic_code');
  },
};

module.exports = { SicService };
