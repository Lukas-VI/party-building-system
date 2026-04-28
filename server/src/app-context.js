const { env } = require('./env');
const { query, first, getPool } = require('./db');
const password = require('./password');
const http = require('./lib/http');
const utils = require('./lib/utils');
const constants = require('./lib/constants');
const audit = require('./services/audit-service');
const auth = require('./services/auth-service');
const permission = require('./services/permission-service');
const profile = require('./services/profile-service');
const applicant = require('./services/applicant-service');
const workflow = require('./services/workflow-service');
const mobileWorkbench = require('./services/mobile-workbench-service');
const notification = require('./services/notification-service');
const settings = require('./services/settings-service');
const files = require('./services/file-service');
const exportsService = require('./services/export-service');
const registration = require('./services/registration-service');
const wechat = require('./services/wechat-service');

// Compatibility aggregate for scripts or ad-hoc imports. Route modules import
// focused services directly and should not grow this file again.
module.exports = {
  env,
  query,
  first,
  getPool,
  ...password,
  ...http,
  ...utils,
  ...constants,
  ...audit,
  ...auth,
  ...permission,
  ...profile,
  ...applicant,
  ...workflow,
  ...mobileWorkbench,
  ...notification,
  ...settings,
  ...files,
  ...exportsService,
  ...registration,
  ...wechat,
};
