const crypto = require('node:crypto');
const { query, first, getPool } = require('../src/db');

const username = process.argv[2] || 'admin';
const password = process.argv[3] || '123456';

function hashPassword(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function main() {
  const adminUser = await first('SELECT id, username FROM users WHERE username = :username', { username });
  if (!adminUser) {
    throw new Error(`未找到账号 ${username}`);
  }
  await query(
    `UPDATE users
     SET password_hash = :passwordHash,
         status = 'active'
     WHERE id = :id`,
    {
      id: adminUser.id,
      passwordHash: hashPassword(password),
    },
  );
  console.log(`管理员账号已重置: ${username} / ${password}`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await getPool().end();
    } catch (error) {
      // ignore
    }
  });
