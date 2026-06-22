const crypto = require('node:crypto');
const { env } = require('../env');
const { query, first } = require('../db');
const { now } = require('../lib/utils');

// --- Existing ---
async function getWechatBindingByUserId(userId) {
  return first(
    `SELECT
        id,
        user_id AS userId,
        openid,
        unionid,
        nickname,
        avatar_url AS avatarUrl,
        status,
        bound_at AS boundAt,
        last_login_at AS lastLoginAt
     FROM wechat_bindings
     WHERE user_id = :userId AND status = 'active'`,
   { userId },
 );
}

 // 查任意状态的 binding（含 inactive）
 async function getWechatBindingByUserIdAny(userId) {
   return first(
     `SELECT id, user_id AS userId, openid, unionid, status FROM wechat_bindings WHERE user_id = :userId`,
     { userId },
   );
 }
// --- New: Look up binding by openid ---
async function getWechatBindingByOpenid(openid) {
  return first(
    `SELECT
        id,
        user_id AS userId,
        openid,
        unionid,
        nickname,
        avatar_url AS avatarUrl,
        status,
        bound_at AS boundAt,
        last_login_at AS lastLoginAt
     FROM wechat_bindings
     WHERE openid = :openid AND status = 'active'`,
    { openid },
  );
}

// --- New: AES-256-GCM encryption helper ---
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function encryptSensitive(plaintext) {
  if (!plaintext) return null;
  const key = crypto.scryptSync(env.WECHAT_SESSION_SECRET, 'wechat-binding-salt', 32);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

// --- New: Create a WeChat binding ---
async function createWechatBinding(userId, openid, unionid, sessionKey, nickname, avatar) {
  const encrypted = encryptSensitive(sessionKey || null);
  await query(
    `INSERT INTO wechat_bindings
      (user_id, openid, unionid, session_key_encrypted, nickname, avatar_url, status, bound_at, last_login_at)
     VALUES (:userId, :openid, :unionid, :sessionKeyEncrypted, :nickname, :avatarUrl, 'active', :boundAt, :boundAt)`,
    {
      userId,
      openid,
      unionid: unionid || null,
      sessionKeyEncrypted: encrypted,
      nickname: nickname || null,
      avatarUrl: avatar || null,
      boundAt: now(),
    },
  );
}

// --- New: Update last login timestamp ---
async function updateWechatLoginTime(bindingId) {
  await query(
    `UPDATE wechat_bindings
     SET last_login_at = :lastLoginAt
     WHERE id = :id`,
    { id: bindingId, lastLoginAt: now() },
  );
}

module.exports = {
  getWechatBindingByUserId,
   getWechatBindingByUserIdAny,
  getWechatBindingByOpenid,
  createWechatBinding,
  updateWechatLoginTime,
};
