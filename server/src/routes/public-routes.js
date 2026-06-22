const path = require('node:path');
const fs = require('node:fs');
const { env } = require('../env');
const { ok, fail } = require('../lib/http');
const { buildPublicBootstrap } = require('../services/auth-service');

function registerPublicRoutes(app) {

  app.get('/api/public/bootstrap', async (_req, res) => {
    try {
      ok(res, await buildPublicBootstrap());
    } catch (error) {
      fail(res, 500, error.message);
    }
  });

  // 微信公众平台网页授权域名验证文件
  // 完整路径通过 .env 的 WECHAT_VERIFY_FILEPATH 配置，不配则不启用
  // 自动在 /、/api/、/uploads/ 三个前缀下注册路由
  if (env.WECHAT_VERIFY_FILEPATH) {
    const filePath = path.resolve(env.WECHAT_VERIFY_FILEPATH);
    const filename = path.basename(filePath);
    const prefixes = ['', '/api', '/uploads'];

    const serveVerifyFile = (_req, res) => {
      if (fs.existsSync(filePath)) {
        res.type('text/plain');
        res.sendFile(filePath);
      } else {
        fail(res, 404, '验证文件不存在');
      }
    };

    for (const prefix of prefixes) {
      app.get(`${prefix}/${filename}`, serveVerifyFile);
    }
  }
}

module.exports = { registerPublicRoutes };
