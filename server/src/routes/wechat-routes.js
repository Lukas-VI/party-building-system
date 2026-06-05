const crypto = require('crypto');
const { env } = require('../env');
const { query } = require('../db');
const { ok, fail } = require('../lib/http');
const { logAudit } = require('../services/audit-service');
const { requireAuth } = require('../services/permission-service');
const { signToken, verifyToken, getUserWithAuth } = require('../services/auth-service');
const { getWechatBindingByUserId, getWechatBindingByOpenid } = require('../services/wechat-service');

const DEFAULT_REDIRECT_PATH = '/wx-app/';
const STATE_TTL_MS = 10 * 60 * 1000;

function normalizeRedirectPath(value) {
  const path = String(value || DEFAULT_REDIRECT_PATH).trim();
  if (!path.startsWith('/wx-app/')) return DEFAULT_REDIRECT_PATH;
  return path;
}

function hmac(value) {
  return crypto.createHmac('sha256', env.WECHAT_SESSION_SECRET).update(value).digest('base64url');
}

function encodeState(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${hmac(body)}`;
}

function decodeState(rawState) {
  const [body, signature] = String(rawState || '').split('.');
  if (!body || !signature || hmac(body) !== signature) return { redirectPath: DEFAULT_REDIRECT_PATH };
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (!payload.t || Date.now() - Number(payload.t) > STATE_TTL_MS) return { redirectPath: DEFAULT_REDIRECT_PATH };
  return {
    ...payload,
    redirectPath: normalizeRedirectPath(payload.redirectPath),
  };
}

function getBearerUserId(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return '';
  try {
    return verifyToken(token).uid || '';
  } catch (error) {
    return '';
  }
}

function getHashRoute(redirectPath) {
  const hash = String(redirectPath || '').split('#')[1] || '';
  if (!hash.startsWith('/')) return '';
  return hash.split('?')[0] || '';
}

function appendHashQuery(redirectPath, route, params) {
  const queryString = new URLSearchParams(params).toString();
  const base = normalizeRedirectPath(redirectPath).split('#')[0];
  return `${base}#${route}${queryString ? `?${queryString}` : ''}`;
}

async function exchangeWechatCode(code) {
  const tokenUrl =
    `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${encodeURIComponent(env.WECHAT_SERVICE_APP_ID)}` +
    `&secret=${encodeURIComponent(env.WECHAT_SERVICE_APP_SECRET)}` +
    `&code=${encodeURIComponent(code)}&grant_type=authorization_code`;
  const response = await fetch(tokenUrl);
  const data = await response.json();
  if (!response.ok || data.errcode) {
    const error = new Error(data.errmsg || '\u5fae\u4fe1\u7f51\u9875\u6388\u6743\u5931\u8d25');
    error.status = 400;
    throw error;
  }
  return data;
}

function buildLoginPayload(user) {
  return {
    token: signToken(user),
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
  };
}

function registerWechatRoutes(app) {

  app.get('/api/wechat/bind/status', requireAuth(), async (req, res) => {
    try {
      const binding = await getWechatBindingByUserId(req.user.id);
      ok(res, {
        bound: !!binding,
        binding,
      });
    } catch (error) {
      fail(res, 500, error.message);
    }
  });

  app.post('/api/wechat/unbind', requireAuth(), async (req, res) => {
    try {
      await query(
        `UPDATE wechat_bindings
         SET status = 'inactive'
         WHERE user_id = :userId AND status = 'active'`,
        { userId: req.user.id },
      );
      await logAudit('wechat_bindings', req.user.id, 'unbind_wechat', req.user.id, {});
      ok(res, true, '\u5fae\u4fe1\u8d26\u53f7\u5df2\u89e3\u7ed1');
    } catch (error) {
      fail(res, 500, error.message);
    }
  });

  app.get('/api/wechat/oauth/start', async (req, res) => {
    try {
      if (!env.WECHAT_SERVICE_APP_ID || !env.WECHAT_SERVICE_REDIRECT_URI) {
        return fail(res, 501, '微信服务号网页授权配置未完成');
      }
      const statePayload = encodeState({
        redirectPath: normalizeRedirectPath(req.query.redirectPath),
        bindUserId: getBearerUserId(req),
        t: Date.now(),
      });
      const authorizeUrl =
        `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${encodeURIComponent(env.WECHAT_SERVICE_APP_ID)}` +
        `&redirect_uri=${encodeURIComponent(env.WECHAT_SERVICE_REDIRECT_URI)}` +
        '&response_type=code&scope=snsapi_base' +
        `&state=${encodeURIComponent(statePayload)}#wechat_redirect`;
      ok(res, { authorizeUrl });
    } catch (error) {
      fail(res, error.status || 500, error.message);
    }
  });

  app.get('/api/wechat/oauth/callback', async (req, res) => {
    try {
      if (!env.WECHAT_SERVICE_APP_ID || !env.WECHAT_SERVICE_APP_SECRET) {
        return fail(res, 501, '微信服务号网页授权配置未完成');
      }
      const { code, state = '' } = req.query || {};
      if (!code) return res.redirect(appendHashQuery(DEFAULT_REDIRECT_PATH, '/login', { wechat: 'missing-code' }));

      const statePayload = decodeState(state);
      const wechatToken = await exchangeWechatCode(code);
      const openid = wechatToken.openid;
      if (!openid) return res.redirect(appendHashQuery(statePayload.redirectPath, '/login', { wechat: 'missing-openid' }));

      let userId = statePayload.bindUserId || '';
      if (userId) {
        await query(
          `INSERT INTO wechat_bindings
             (user_id, openid, unionid, session_key_encrypted, status, bound_at, last_login_at)
           VALUES
             (:userId, :openid, :unionid, '', 'active', NOW(), NOW())
           ON DUPLICATE KEY UPDATE
             user_id = VALUES(user_id),
             openid = VALUES(openid),
             unionid = VALUES(unionid),
             status = 'active',
             last_login_at = NOW()`,
          { userId, openid, unionid: wechatToken.unionid || null },
        );
        await logAudit('wechat_bindings', userId, 'bind_wechat', userId, { openid });
      } else {
        const binding = await getWechatBindingByOpenid(openid);
        userId = binding?.userId || '';
      }

      if (!userId) {
        return res.redirect(appendHashQuery(statePayload.redirectPath, '/login', { wechat: 'unbound' }));
      }

      const user = await getUserWithAuth(userId);
      if (!user || user.status !== 'active') {
        return res.redirect(appendHashQuery(statePayload.redirectPath, '/login', { wechat: 'inactive' }));
      }

      await query(
        `UPDATE wechat_bindings SET last_login_at = NOW() WHERE user_id = :userId AND openid = :openid`,
        { userId, openid },
      );
      const loginPayload = buildLoginPayload(user);
      const next = getHashRoute(statePayload.redirectPath);
      if (next && next !== '/wechat/callback') loginPayload.next = next;
      return res.redirect(appendHashQuery(statePayload.redirectPath, '/wechat/callback', loginPayload));
    } catch (error) {
      const statePayload = decodeState(req.query?.state || '');
      return res.redirect(appendHashQuery(statePayload.redirectPath, '/login', { wechat: 'failed' }));
    }
  });
}

module.exports = { registerWechatRoutes };
