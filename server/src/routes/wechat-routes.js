const { env } = require('../env');
const { query, first } = require('../db');
const { ok, fail } = require('../lib/http');
const { now } = require('../lib/utils');
const { logAudit } = require('../services/audit-service');
const { requireAuth, requirePermission } = require('../services/permission-service');
const { signToken, getUserWithAuth } = require('../services/auth-service');
const { createWorkflowNotification } = require('../services/notification-service');
const {
  getActiveWechatBindingForTemplate,
  sendWechatBindSuccessTemplate,
  sendWechatUnbindSuccessTemplate,
  sendWechatRegistrationApprovalReminder,
} = require('../services/wechat-template-service');
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
      const binding = await getActiveWechatBindingForTemplate(req.user.id);
      const unboundAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await query(
        `DELETE FROM wechat_bindings
         WHERE user_id = :userId AND status = 'active'`,
        { userId: req.user.id },
      );
      await logAudit('wechat_bindings', req.user.id, 'unbind_wechat', req.user.id, {});
      let templateMessage = null;
      if (binding) {
        try {
          templateMessage = await sendWechatUnbindSuccessTemplate(binding, unboundAt);
        } catch (error) {
          console.warn('[wechat] unbind success template failed:', error.message);
        }
      }
      ok(res, { templateMessage }, '微信账号已解绑');
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

  async function fetchWechatOauthToken(code) {
    const tokenUrl =
      `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${encodeURIComponent(env.WECHAT_SERVICE_APP_ID)}` +
      `&secret=${encodeURIComponent(env.WECHAT_SERVICE_APP_SECRET)}` +
      `&code=${encodeURIComponent(code)}&grant_type=authorization_code`;
    const response = await fetch(tokenUrl);
    const data = await response.json();
    if (!response.ok || data.errcode) {
      const error = new Error(data.errmsg || '微信网页授权失败');
      error.status = 400;
      throw error;
    }
    return data;
  }

  async function fetchWechatOauthProfile(tokenData) {
    if (!String(tokenData.scope || '').split(',').includes('snsapi_userinfo')) return {};
    const response = await fetch(
      `https://api.weixin.qq.com/sns/userinfo?access_token=${encodeURIComponent(tokenData.access_token)}` +
      `&openid=${encodeURIComponent(tokenData.openid)}&lang=zh_CN`,
    );
    const profile = await response.json();
    if (!response.ok || profile.errcode) {
      console.warn('[wechat] oauth userinfo failed:', profile.errmsg || response.statusText);
      return {};
    }
    return {
      nickname: profile.nickname || '',
      avatar: profile.headimgurl || '',
      unionid: profile.unionid || tokenData.unionid || '',
    };
  }

  app.get('/api/wechat/oauth/callback', async (req, res) => {
    try {
      if (!env.WECHAT_SERVICE_APP_ID || !env.WECHAT_SERVICE_APP_SECRET) {
        return fail(res, 501, '微信服务号网页授权配置未完成');
      }
      const { code, state = '' } = req.query || {};
      if (!code) return fail(res, 400, '缺少微信授权 code');
      const data = await fetchWechatOauthToken(code);
      const profile = await fetchWechatOauthProfile(data);
      let redirectPath = env.WECHAT_DEFAULT_REDIRECT_PATH;
      try {
        redirectPath = JSON.parse(Buffer.from(String(state), 'base64url').toString('utf8')).redirectPath || redirectPath;
      } catch (error) {
        redirectPath = env.WECHAT_DEFAULT_REDIRECT_PATH;
      }
      ok(res, {
        openid: data.openid,
        unionid: profile.unionid || data.unionid || '',
        nickname: profile.nickname || '',
        avatar: profile.avatar || '',
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

      const data = await fetchWechatOauthToken(code);
      const profile = await fetchWechatOauthProfile(data);

      const { openid } = data;
      const unionid = profile.unionid || data.unionid || '';

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

      ok(res, { openid, unionid, nickname: profile.nickname || '', avatar: profile.avatar || '', needBind: true });
    } catch (error) {
      fail(res, error.status || 500, error.message);
    }
  });

  // ── 微信绑定已有账号 ──
  app.post('/api/wechat/oauth/bind', async (req, res) => {
    try {
      const { openid, unionid, nickname, avatar, username, password } = req.body || {};
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

      await bindWechatUser(userRow.id, openid, unionid || null, null, nickname || null, avatar || null);
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
      const { openid, unionid, nickname, avatar } = req.body || {};
      if (!openid) return fail(res, 400, '缺少微信 openid');

      await bindWechatUser(req.user.id, openid, unionid || null, null, nickname || null, avatar || null);
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

  app.post('/api/wechat/template-test/unbind-success', requireAuth(), requirePermission('manage_orgs'), async (req, res) => {
    try {
      const targetUserId = req.body?.userId || req.user.id;
      const binding = await getActiveWechatBindingForTemplate(targetUserId);
      if (!binding) return fail(res, 404, '该用户未绑定微信');
      const result = await sendWechatUnbindSuccessTemplate(binding);
      await logAudit('wechat_bindings', targetUserId, 'send_unbind_success_template', req.user.id, result);
      ok(res, result, '微信模板消息已发送');
    } catch (error) {
      fail(res, error.status || 500, error.message);
    }
  });

  app.post('/api/wechat/template-test/registration-approval', requireAuth(), requirePermission('manage_orgs'), async (req, res) => {
    try {
      const { name = '测试用户', submittedAt = now(), orgId = req.user.orgId || null, branchId = req.user.branchId || null } = req.body || {};
      const result = await sendWechatRegistrationApprovalReminder({ name, submittedAt, orgId, branchId });
      await logAudit('wechat_bindings', name, 'send_registration_approval_template', req.user.id, result);
      ok(res, result, '注册审批提醒模板已发送');
    } catch (error) {
      fail(res, error.status || 500, error.message);
    }
  });

  app.post('/api/wechat/template-test/workflow-approval', requireAuth(), requirePermission('manage_orgs'), async (req, res) => {
    try {
      const {
        userId = req.user.id,
        applicantId = req.user.id,
        stepCode = 'STEP_01',
        stepName = '递交入党申请书',
        senderName = req.user.name || '系统通知',
      } = req.body || {};
      const result = await createWorkflowNotification({
        userId,
        type: 'workflow_approval_test',
        title: `${stepName}审批通知测试`,
        content: `${senderName}发起了“${stepName}”审批通知测试。`,
        relatedStepCode: stepCode,
        relatedTargetId: applicantId,
        stepName,
        senderName,
      });
      await logAudit('wechat_bindings', userId, 'send_workflow_approval_template', req.user.id, result);
      ok(res, result, '节点审批通知模板已发送');
    } catch (error) {
      fail(res, error.status || 500, error.message);
    }
  });
}

module.exports = { registerWechatRoutes };
