const mysql = require('mysql2/promise');
const { env } = require('./env');

let pool;

/**
 * Create or return the shared MySQL connection pool.
 */
function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: env.DB_HOST,
      port: Number(env.DB_PORT),
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      multipleStatements: true,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: true,
      charset: 'utf8mb4',
      dateStrings: true,
    });
  }
  return pool;
}

/**
 * Execute a named-parameter SQL statement and return its rows.
 */
async function query(sql, params = {}) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

/**
 * Execute a SQL statement and return its first row or null.
 */
async function first(sql, params = {}) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

/**
 * Execute raw SQL used by schema bootstrap scripts.
 */
async function raw(sql) {
  const [rows] = await getPool().query(sql);
  return rows;
}

module.exports = {
  getPool,
  query,
  first,
  raw,
};
