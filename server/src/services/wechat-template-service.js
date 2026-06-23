const { env } = require('../env');
const { first } = require('../db');
const { now, errorWithStatus } = require('../lib/utils');

let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;

function assertWechatServiceConfigured() {
  if (!env.WECHAT_SERVICE_APP_ID || !env.WECHAT_SERVICE_APP_SECRET) {
    throw errorWithStatus('微信服务号配置未完成', 501);
  }
}

async function getWechatAccessToken() {
  assertWechatServiceConfigured();
  const currentTime = Date.now();
  if (cachedAccessToken && cachedAccessTokenExpiresAt - 60000 > currentTime) {
    return cachedAccessToken;
  }

  const url =
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(env.WECHAT_SERVICE_APP_ID)}` +
    `&secret=${encodeURIComponent(env.WECHAT_SERVICE_APP_SECRET)}`;
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok || data.errcode) {
    throw errorWithStatus(data.errmsg || '获取微信 access_token 失败', 502);
  }

  cachedAccessToken = data.access_token;
  cachedAccessTokenExpiresAt = currentTime + Number(data.expires_in || 7200) * 1000;
  return cachedAccessToken;
}

function buildTemplateData(fields) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      {
        value: String(value ?? ''),
      },
    ]),
  );
}

function resolveWechatProxyEndpoint(pathname) {
  const baseUrl = env.WECHAT_PROXY_URL.endsWith('/') ? env.WECHAT_PROXY_URL : `${env.WECHAT_PROXY_URL}/`;
  return new URL(pathname, baseUrl).toString();
}

async function sendWechatTemplateMessage({ openid, templateId, url = '', data }) {
  if (!openid) throw errorWithStatus('缺少微信 openid', 400);
  if (!templateId) throw errorWithStatus('缺少微信模板 ID', 400);

  const payload = {
    touser: openid,
    template_id: templateId,
    url,
    data,
  };

  if (env.WECHAT_PROXY_URL) {
    if (!env.WECHAT_PROXY_TOKEN) throw errorWithStatus('微信代理 token 未配置', 501);
    const response = await fetch(resolveWechatProxyEndpoint('template/send'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WECHAT_PROXY_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const proxyResult = await response.json();
    if (!response.ok || proxyResult.code !== 0) {
      throw errorWithStatus(proxyResult.message || '微信代理发送失败', response.status || 502);
    }
    return proxyResult.data;
  }

  const accessToken = await getWechatAccessToken();
  const response = await fetch(
    `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  const result = await response.json();
  if (!response.ok || result.errcode) {
    throw errorWithStatus(result.errmsg || '微信模板消息发送失败', 502);
  }
  return result;
}

async function getActiveWechatBindingForTemplate(userId) {
  return first(
    `SELECT
        wb.openid,
        wb.bound_at AS boundAt,
        u.username
     FROM wechat_bindings wb
     INNER JOIN users u ON u.id = wb.user_id
     WHERE wb.user_id = :userId AND wb.status = 'active'`,
    { userId },
  );
}

async function sendWechatBindSuccessTemplate(userId) {
  const binding = await getActiveWechatBindingForTemplate(userId);
  if (!binding) throw errorWithStatus('该用户未绑定微信', 404);

  return sendWechatTemplateMessage({
    openid: binding.openid,
    templateId: env.WECHAT_BIND_SUCCESS_TEMPLATE_ID,
    url: 'https://havensky.cn/wx-app/#/profile',
    data: buildTemplateData({
      first: '用户账号绑定成功通知',
      character_string1: binding.username,
      time2: binding.boundAt || now(),
      remark: '可在服务号工作台「我的」中查看或解绑微信。',
    }),
  });
}

async function sendWechatUnbindSuccessTemplate(binding, unboundAt = now()) {
  if (!binding?.openid) throw errorWithStatus('缺少微信 openid', 400);
  if (!binding?.username) throw errorWithStatus('缺少用户账号', 400);

  return sendWechatTemplateMessage({
    openid: binding.openid,
    templateId: env.WECHAT_UNBIND_SUCCESS_TEMPLATE_ID,
    url: 'https://havensky.cn/wx-app/#/profile',
    data: buildTemplateData({
      first: '用户解绑成功通知',
      character_string1: binding.username,
      time2: unboundAt,
      remark: '如非本人操作，请及时联系管理员。',
    }),
  });
}

module.exports = {
  getWechatAccessToken,
  sendWechatTemplateMessage,
  sendWechatBindSuccessTemplate,
  sendWechatUnbindSuccessTemplate,
  getActiveWechatBindingForTemplate,
};
