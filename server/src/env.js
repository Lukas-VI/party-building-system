const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

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
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || 'https://api.example.com',
  CORS_ORIGINS: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
};

module.exports = {
  env,
};
