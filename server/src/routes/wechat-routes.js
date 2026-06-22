const { env } = require('../env');
const { query, first } = require('../db');
const { ok, fail } = require('../lib/http');
const { logAudit } = require('../services/audit-service');
const { requireAuth, requirePermission } = require('../services/permission-service');
const { signToken, getUserWithAuth } = require('../services/auth-service');
const { sendWechatBindSuccessTemplate } = require('../services/wechat-template-service');
const {
  getWechatBindingByUserId,
  getWechatBindingByOpenid,
  bindWechatUser,
  updateWechatLoginTime,
} = require('../services/wechat-service');

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
      ok(res, true, '微信账号已解绑');
    } catch (error) {
      fail(res, 500, error.message);
    }
  });

  app.get('/api/wechat/oauth/start', async (req, res) => {
     try {
       if (!env.WECHAT_SERVICE_APP_ID || !env.WECHAT_SERVICE_REDIRECT_URI) {
         return fail(res, 501, '微信服务号网页授权配置未完成');
       }
       const scope = req.query.scope || 'snsapi_userinfo';
       const statePayload = Buffer.from(
        JSON.stringify({
          redirectPath: req.query.redirectPath || env.WECHAT_DEFAULT_REDIRECT_PATH,
          t: Date.now(),
        }),
        'utf8',
      ).toString('base64url');
      const authorizeUrl =
         `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${encodeURIComponent(env.WECHAT_SERVICE_APP_ID)}` +
         `&redirect_uri=${encodeURIComponent(env.WECHAT_SERVICE_REDIRECT_URI)}` +
         `&response_type=code&scope=${encodeURIComponent(scope)}` +
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
      if (!code) return fail(res, 400, '缺少微信授权 code');
      const tokenUrl =
        `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${encodeURIComponent(env.WECHAT_SERVICE_APP_ID)}` +
        `&secret=${encodeURIComponent(env.WECHAT_SERVICE_APP_SECRET)}` +
        `&code=${encodeURIComponent(code)}&grant_type=authorization_code`;
      const response = await fetch(tokenUrl);
      const data = await response.json();
      if (!response.ok || data.errcode) {
        return fail(res, 400, data.errmsg || '微信网页授权失败');
      }
      let redirectPath = env.WECHAT_DEFAULT_REDIRECT_PATH;
      try {
        redirectPath = JSON.parse(Buffer.from(String(state), 'base64url').toString('utf8')).redirectPath || redirectPath;
      } catch (error) {
        redirectPath = env.WECHAT_DEFAULT_REDIRECT_PATH;
      }
      ok(res, {
        openid: data.openid,
        unionid: data.unionid || '',
        redirectPath,
      });
    } catch (error) {
      fail(res, error.status || 500, error.message);
    }
  });

  // ── 微信 OAuth 登录（SPA 回调页调此接口完成登录）──
  app.post('/api/wechat/oauth/login', async (req, res) => {
    try {
      if (!env.WECHAT_SERVICE_APP_ID || !env.WECHAT_SERVICE_APP_SECRET) {
        return fail(res, 501, '微信服务号网页授权配置未完成');
      }
      const { code, state = '' } = req.body || {};
      if (!code) return fail(res, 400, '缺少微信授权 code');

      const tokenUrl =
        `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${encodeURIComponent(env.WECHAT_SERVICE_APP_ID)}` +
        `&secret=${encodeURIComponent(env.WECHAT_SERVICE_APP_SECRET)}` +
        `&code=${encodeURIComponent(code)}&grant_type=authorization_code`;
      const response = await fetch(tokenUrl);
      const data = await response.json();
      if (!response.ok || data.errcode) {
        return fail(res, 400, data.errmsg || '微信网页授权失败');
      }

      const { openid, unionid } = data;

      const binding = await getWechatBindingByOpenid(openid);
      if (binding) {
        const user = await getUserWithAuth(binding.userId);
        if (!user) return fail(res, 401, '绑定的用户不存在');
        await updateWechatLoginTime(binding.id);
        await logAudit('wechat_bindings', openid, 'wechat_login', binding.userId, {});
        const token = signToken(user);
        const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
        return ok(res, { token, expiresAt, user });
      }

      ok(res, { openid, unionid: unionid || '', needBind: true });
    } catch (error) {
      fail(res, error.status || 500, error.message);
    }
  });

  // ── 微信绑定已有账号 ──
  app.post('/api/wechat/oauth/bind', async (req, res) => {
    try {
      const { openid, unionid, username, password } = req.body || {};
      if (!openid) return fail(res, 400, '缺少微信 openid');
      if (!username || !password) return fail(res, 400, '请输入账号和密码');

      const { verifyPassword, hashPassword, needsPasswordRehash } = require('../password');
      const userRow = await first(
        'SELECT id, username, password_hash AS passwordHash, status FROM users WHERE username = :username',
        { username },
      );
      if (!userRow || !verifyPassword(password, userRow.passwordHash)) {
        return fail(res, 401, '账号或密码错误');
      }
      if (userRow.status !== 'active') {
        return fail(res, 403, '账号未激活');
      }

      if (needsPasswordRehash(userRow.passwordHash)) {
        await query(
          'UPDATE users SET password_hash = :passwordHash WHERE id = :userId',
          { userId: userRow.id, passwordHash: hashPassword(password) },
        );
      }

      await bindWechatUser(userRow.id, openid, unionid || null);
      await logAudit('wechat_bindings', openid, 'bind_wechat', userRow.id, { username });
      let templateMessage = null;
      try {
        templateMessage = await sendWechatBindSuccessTemplate(userRow.id);
      } catch (error) {
        console.warn('[wechat] bind success template failed:', error.message);
      }

      const user = await getUserWithAuth(userRow.id);
      const token = signToken(user);
      const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
      ok(res, { token, expiresAt, user, templateMessage }, '微信绑定成功');
    } catch (error) {
      fail(res, error.status || 500, error.message);
    }
  });


  // 已登录用户自动绑定微信（不需账密，使用当前 JWT）
  app.post('/api/wechat/oauth/bind-authed', requireAuth(), async (req, res) => {
    try {
      const { openid, unionid } = req.body || {};
      if (!openid) return fail(res, 400, '缺少微信 openid');

      await bindWechatUser(req.user.id, openid, unionid || null);
      await logAudit('wechat_bindings', openid, 'bind_wechat_authed', req.user.id, {});
      let templateMessage = null;
      try {
        templateMessage = await sendWechatBindSuccessTemplate(req.user.id);
      } catch (error) {
        console.warn('[wechat] bind success template failed:', error.message);
      }
      ok(res, { templateMessage }, '微信绑定成功');
    } catch (error) {
      fail(res, error.status || 500, error.message);
    }
  });

  app.post('/api/wechat/template-test/bind-success', requireAuth(), requirePermission('manage_orgs'), async (req, res) => {
    try {
      const targetUserId = req.body?.userId || req.user.id;
      const result = await sendWechatBindSuccessTemplate(targetUserId);
      await logAudit('wechat_bindings', targetUserId, 'send_bind_success_template', req.user.id, result);
      ok(res, result, '微信模板消息已发送');
    } catch (error) {
      fail(res, error.status || 500, error.message);
    }
  });
}

module.exports = { registerWechatRoutes };
