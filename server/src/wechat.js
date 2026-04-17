const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { env } = require('./env');

function ensureWechatConfigured() {
  if (!env.WECHAT_APP_ID || !env.WECHAT_APP_SECRET) {
    const error = new Error('微信小程序配置未完成');
    error.status = 501;
    throw error;
  }
}

function secretKey() {
  return crypto.createHash('sha256').update(env.WECHAT_SESSION_SECRET).digest();
}

function encryptSessionKey(sessionKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(sessionKey, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

function signBindToken(payload) {
  return jwt.sign(
    {
      type: 'wechat-bind',
      openid: payload.openid,
      unionid: payload.unionid || '',
      sessionKeyEncrypted: payload.sessionKeyEncrypted,
    },
    env.JWT_SECRET,
    { expiresIn: '10m' },
  );
}

function verifyBindToken(token) {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (decoded.type !== 'wechat-bind') {
    throw new Error('无效的绑定令牌');
  }
  return decoded;
}

async function exchangeCode(code) {
  ensureWechatConfigured();
  const url =
    `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(env.WECHAT_APP_ID)}` +
    `&secret=${encodeURIComponent(env.WECHAT_APP_SECRET)}` +
    `&js_code=${encodeURIComponent(code)}` +
    '&grant_type=authorization_code';

  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok || data.errcode) {
    const error = new Error(data.errmsg || '微信登录 code 交换失败');
    error.status = 400;
    throw error;
  }
  return {
    openid: data.openid,
    unionid: data.unionid || '',
    sessionKey: data.session_key,
  };
}

module.exports = {
  ensureWechatConfigured,
  encryptSessionKey,
  signBindToken,
  verifyBindToken,
  exchangeCode,
};
