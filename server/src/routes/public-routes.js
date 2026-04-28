const { ok, fail } = require('../lib/http');
const { buildPublicBootstrap } = require('../services/auth-service');

function registerPublicRoutes(app) {

  app.get('/api/public/bootstrap', async (_req, res) => {
    try {
      ok(res, await buildPublicBootstrap());
    } catch (error) {
      fail(res, 500, error.message);
    }
  });
}

module.exports = { registerPublicRoutes };
