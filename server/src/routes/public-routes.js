/**
 * Public bootstrap route group.
 *
 * These endpoints intentionally return only low-risk acceptance and onboarding
 * data such as login hints. They must never leak tokens, passwords or
 * scope-sensitive business records.
 */
function registerPublicRoutes(app, ctx) {
  const {
    ok,
    fail,
    buildPublicBootstrap,
  } = ctx;

  app.get('/api/public/bootstrap', async (_req, res) => {
    try {
      ok(res, await buildPublicBootstrap());
    } catch (error) {
      fail(res, 500, error.message);
    }
  });
}

module.exports = { registerPublicRoutes };
