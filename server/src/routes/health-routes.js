const { getPool } = require('../db');
const { ok, fail } = require('../lib/http');
const { now } = require('../lib/utils');

function registerHealthRoutes(app) {

  app.get('/api/health', async (req, res) => {
    try {
      await getPool().query('SELECT 1');
      ok(res, { now: now(), db: 'ok' });
    } catch (error) {
      fail(res, 500, error.message);
    }
  });
}

module.exports = { registerHealthRoutes };
