const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

/**
 * Parse the comma-separated CORS origin allowlist from environment configuration.
 */
function parseOrigins(raw) {
  return (raw || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolvePublicBaseUrl() {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('生产环境必须配置 PUBLIC_BASE_URL，用于生成可访问的附件 URL');
  }
  return 'http://127.0.0.1:3000';
}

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || '3000',
  JWT_SECRET: process.env.JWT_SECRET || 'change-this-secret',
  DB_HOST: process.env.DB_HOST || '127.0.0.1',
  DB_PORT: process.env.DB_PORT || '3306',
  DB_NAME: process.env.DB_NAME || 'party_building_app',
  DB_USER: process.env.DB_USER || 'root',
  DB_PASSWORD: process.env.DB_PASSWORD || '',
  UPLOAD_DIR: process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'),
  PUBLIC_BASE_URL: resolvePublicBaseUrl(),
  CORS_ORIGINS: parseOrigins(process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173'),
  ALLOW_ALL_CORS: process.env.ALLOW_ALL_CORS === 'true' || process.env.NODE_ENV === 'development',
  WECHAT_APP_ID: process.env.WECHAT_APP_ID || '',
  WECHAT_APP_SECRET: process.env.WECHAT_APP_SECRET || '',
  WECHAT_SERVICE_APP_ID: process.env.WECHAT_SERVICE_APP_ID || process.env.WECHAT_APP_ID || '',
  WECHAT_SERVICE_APP_SECRET: process.env.WECHAT_SERVICE_APP_SECRET || process.env.WECHAT_APP_SECRET || '',
  WECHAT_SERVICE_REDIRECT_URI: process.env.WECHAT_SERVICE_REDIRECT_URI || '',
  WECHAT_SESSION_SECRET: process.env.WECHAT_SESSION_SECRET || process.env.JWT_SECRET || 'change-this-secret',
  TEST_DEFAULT_PASSWORD_HINT: process.env.TEST_DEFAULT_PASSWORD_HINT || '当前测试环境统一密码：123456',
};

module.exports = {
  env,
};
