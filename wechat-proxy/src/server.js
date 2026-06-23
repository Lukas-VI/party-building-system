import { createServer } from 'node:http';

const env = {
  PORT: Number(process.env.PORT || 3011),
  WECHAT_SERVICE_APP_ID: process.env.WECHAT_SERVICE_APP_ID || '',
  WECHAT_SERVICE_APP_SECRET: process.env.WECHAT_SERVICE_APP_SECRET || '',
  WECHAT_PROXY_TOKEN: process.env.WECHAT_PROXY_TOKEN || '',
  WECHAT_PROXY_ALLOWED_ORIGINS: (process.env.WECHAT_PROXY_ALLOWED_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
};

let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;

function json(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function ok(res, data, message = 'ok') {
  json(res, 200, { code: 0, message, data });
}

function fail(res, status, message) {
  json(res, status, { code: status, message, data: null });
}

function isAuthorized(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return Boolean(env.WECHAT_PROXY_TOKEN && token && token === env.WECHAT_PROXY_TOKEN);
}

function assertConfigured() {
  if (!env.WECHAT_SERVICE_APP_ID || !env.WECHAT_SERVICE_APP_SECRET) {
    const error = new Error('微信服务号配置未完成');
    error.status = 501;
    throw error;
  }
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      const error = new Error('请求体过大');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('请求 JSON 格式不正确');
    error.status = 400;
    throw error;
  }
}

async function getOutboundIp() {
  try {
    const response = await fetch('https://icanhazip.com', { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return '';
    return (await response.text()).trim();
  } catch {
    return '';
  }
}

async function getWechatAccessToken() {
  assertConfigured();
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
    const error = new Error(data.errmsg || '获取微信 access_token 失败');
    error.status = 502;
    throw error;
  }

  cachedAccessToken = data.access_token;
  cachedAccessTokenExpiresAt = currentTime + Number(data.expires_in || 7200) * 1000;
  return cachedAccessToken;
}

async function sendTemplateMessage(payload) {
  const { touser, template_id: templateId, url = '', data } = payload || {};
  if (!touser) {
    const error = new Error('缺少 touser');
    error.status = 400;
    throw error;
  }
  if (!templateId) {
    const error = new Error('缺少 template_id');
    error.status = 400;
    throw error;
  }
  if (!data || typeof data !== 'object') {
    const error = new Error('缺少模板 data');
    error.status = 400;
    throw error;
  }

  const accessToken = await getWechatAccessToken();
  const response = await fetch(
    `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        touser,
        template_id: templateId,
        url,
        data,
      }),
    },
  );
  const result = await response.json();
  if (!response.ok || result.errcode) {
    const error = new Error(result.errmsg || '微信模板消息发送失败');
    error.status = 502;
    error.wechat = result;
    throw error;
  }
  return result;
}

function writeCorsHeaders(req, res) {
  const origin = req.headers.origin || '';
  if (!origin) return;
  if (env.WECHAT_PROXY_ALLOWED_ORIGINS.length && !env.WECHAT_PROXY_ALLOWED_ORIGINS.includes(origin)) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

createServer(async (req, res) => {
  writeCorsHeaders(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const requestUrl = new URL(req.url || '/', 'http://localhost');
  try {
    if (req.method === 'GET' && requestUrl.pathname === '/health') {
      ok(res, {
        configured: Boolean(env.WECHAT_SERVICE_APP_ID && env.WECHAT_SERVICE_APP_SECRET && env.WECHAT_PROXY_TOKEN),
        outboundIp: await getOutboundIp(),
      });
      return;
    }

    if (req.method === 'POST' && requestUrl.pathname === '/template/send') {
      if (!isAuthorized(req)) {
        fail(res, 401, '未授权');
        return;
      }
      const body = await readJsonBody(req);
      ok(res, await sendTemplateMessage(body), '微信模板消息已发送');
      return;
    }

    fail(res, 404, 'Not Found');
  } catch (error) {
    fail(res, error.status || 500, error.message || '服务端错误');
  }
}).listen(env.PORT, '0.0.0.0', () => {
  console.log(`wechat proxy listening at http://0.0.0.0:${env.PORT}`);
});
