/**
 * Health route group.
 *
 * This module wires endpoint shape only. Shared validation, permissions and
 * workflow transitions stay in app-context for consistent PC and H5 behavior.
 */
function registerHealthRoutes(app, ctx) {
  const {
    query,
    getPool,
    ok,
    fail,
    now,
  } = ctx;

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
