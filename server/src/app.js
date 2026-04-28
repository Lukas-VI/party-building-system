const fs = require('node:fs');
const express = require('express');
const cors = require('cors');
const { env } = require('./env');
const { registerHealthRoutes } = require('./routes/health-routes');
const { registerPublicRoutes } = require('./routes/public-routes');
const { registerAuthRoutes } = require('./routes/auth-routes');
const { registerWechatRoutes } = require('./routes/wechat-routes');
const { registerMobileRoutes } = require('./routes/mobile-routes');
const { registerProfileRoutes } = require('./routes/profile-routes');
const { registerApplicantRoutes } = require('./routes/applicant-routes');
const { registerWorkflowRoutes } = require('./routes/workflow-routes');
const { registerOrgRoutes } = require('./routes/org-routes');
const { registerReviewRoutes } = require('./routes/review-routes');
const { registerStatsRoutes } = require('./routes/stats-routes');
const { registerExportRoutes } = require('./routes/export-routes');

/**
 * Build the Express application and wire middleware plus route groups.
 *
 * The entry file starts the process; this module owns HTTP composition. New
 * features should normally add a focused route module instead of growing index.js.
 */
function createApp() {
  const app = express();
  fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (env.ALLOW_ALL_CORS || env.CORS_ORIGINS.includes('*') || env.CORS_ORIGINS.includes(origin)) {
          return callback(null, true);
        }
        return callback(null, false);
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '5mb' }));
  app.use('/uploads', express.static(env.UPLOAD_DIR));

  registerHealthRoutes(app);
  registerPublicRoutes(app);
  registerAuthRoutes(app);
  registerWechatRoutes(app);
  registerMobileRoutes(app);
  registerProfileRoutes(app);
  registerApplicantRoutes(app);
  registerWorkflowRoutes(app);
  registerOrgRoutes(app);
  registerReviewRoutes(app);
  registerStatsRoutes(app);
  registerExportRoutes(app);

  return app;
}

module.exports = { createApp };
