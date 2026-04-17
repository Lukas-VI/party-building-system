const mysql = require('mysql2/promise');
const { env } = require('./env');

let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: env.DB_HOST,
      port: Number(env.DB_PORT),
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: true,
      charset: 'utf8mb4',
      dateStrings: true,
    });
  }
  return pool;
}

async function query(sql, params = {}) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

async function first(sql, params = {}) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

module.exports = {
  getPool,
  query,
  first,
};
