/**
 * WeChat service-account route group.
 *
 * This module wires endpoint shape only. Shared validation, permissions and
 * workflow transitions stay in app-context for consistent PC and H5 behavior.
 */
function registerWechatRoutes(app, ctx) {
  const {
    env,
    query,
    ok,
    fail,
    now,
    logAudit,
    requireAuth,
    getWechatBindingByUserId,
  } = ctx;

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
      const statePayload = Buffer.from(
        JSON.stringify({
          redirectPath: req.query.redirectPath || '/wx-app/',
          t: Date.now(),
        }),
        'utf8',
      ).toString('base64url');
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
      let redirectPath = '/wx-app/';
      try {
        redirectPath = JSON.parse(Buffer.from(String(state), 'base64url').toString('utf8')).redirectPath || redirectPath;
      } catch (error) {
        redirectPath = '/wx-app/';
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
}

module.exports = { registerWechatRoutes };
