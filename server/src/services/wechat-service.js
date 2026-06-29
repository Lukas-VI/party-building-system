const crypto = require('node:crypto');
const { env } = require('../env');
const { query, first } = require('../db');
const { now } = require('../lib/utils');

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

async function getWechatBindingByUserIdAny(userId) {
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
     WHERE user_id = :userId`,
    { userId },
  );
}

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

async function getWechatBindingByOpenidAny(openid) {
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
     WHERE openid = :openid`,
    { openid },
  );
}

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

function conflict(message) {
  const error = new Error(message);
  error.status = 409;
  return error;
}

async function bindWechatUser(userId, openid, unionid, sessionKey = null, nickname = null, avatar = null) {
  const [openidBinding, userBinding] = await Promise.all([
    getWechatBindingByOpenid(openid),
    getWechatBindingByUserId(userId),
  ]);

  if (openidBinding && openidBinding.userId !== userId) {
    throw conflict('该微信已绑定其他账号');
  }

  if (userBinding && userBinding.status === 'active' && userBinding.openid !== openid) {
    throw conflict('该账号已绑定微信');
  }

  await query(
    `DELETE FROM wechat_bindings
     WHERE status <> 'active' AND (user_id = :userId OR openid = :openid)`,
    { userId, openid },
  );

  const bindingToUpdate = userBinding || (openidBinding?.userId === userId ? openidBinding : null);
  if (bindingToUpdate) {
    const encrypted = encryptSensitive(sessionKey || null);
    await query(
      `UPDATE wechat_bindings
       SET openid = :openid,
           unionid = :unionid,
           session_key_encrypted = :sessionKeyEncrypted,
           nickname = :nickname,
           avatar_url = :avatarUrl,
           status = 'active',
           bound_at = :boundAt,
           last_login_at = :boundAt
       WHERE id = :id`,
      {
        id: bindingToUpdate.id,
        openid,
        unionid: unionid || null,
        sessionKeyEncrypted: encrypted,
        nickname: nickname || null,
        avatarUrl: avatar || null,
        boundAt: now(),
      },
    );
    return getWechatBindingByUserId(userId);
  }

  await createWechatBinding(userId, openid, unionid, sessionKey, nickname, avatar);
  return getWechatBindingByUserId(userId);
}

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
  getWechatBindingByOpenidAny,
  createWechatBinding,
  bindWechatUser,
  updateWechatLoginTime,
};
