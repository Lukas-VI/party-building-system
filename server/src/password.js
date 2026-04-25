const crypto = require('node:crypto');

const SCRYPT_PREFIX = 'scrypt';
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

function digestLegacySha256(password) {
  return crypto.createHash('sha256').update(password || '').digest('hex');
}

/**
 * Password hashing lives in one module so auth routes, seed scripts and reset
 * tools all follow the same format and can upgrade legacy hashes in place.
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const derivedKey = crypto.scryptSync(password || '', salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return [
    SCRYPT_PREFIX,
    String(SCRYPT_N),
    String(SCRYPT_R),
    String(SCRYPT_P),
    salt.toString('base64url'),
    derivedKey.toString('base64url'),
  ].join('$');
}

function verifyPassword(password, passwordHash) {
  if (!passwordHash) return false;
  if (!passwordHash.startsWith(`${SCRYPT_PREFIX}$`)) {
    return digestLegacySha256(password) === passwordHash;
  }
  const [, nRaw, rRaw, pRaw, saltRaw, keyRaw] = passwordHash.split('$');
  const salt = Buffer.from(saltRaw, 'base64url');
  const expected = Buffer.from(keyRaw, 'base64url');
  const actual = crypto.scryptSync(password || '', salt, expected.length, {
    N: Number(nRaw),
    r: Number(rRaw),
    p: Number(pRaw),
  });
  return crypto.timingSafeEqual(actual, expected);
}

function needsPasswordRehash(passwordHash) {
  return !passwordHash || !passwordHash.startsWith(`${SCRYPT_PREFIX}$`);
}

module.exports = {
  hashPassword,
  verifyPassword,
  needsPasswordRehash,
};
