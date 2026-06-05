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
  if (env.WECHAT_VERIFY_FILEPATH) {
    const filePath = path.resolve(env.WECHAT_VERIFY_FILEPATH);
    const routePath = `/${path.basename(filePath)}`;
    app.get(routePath, (_req, res) => {
      if (fs.existsSync(filePath)) {
        res.type('text/plain');
        res.sendFile(filePath);
      } else {
        fail(res, 404, '验证文件不存在');
      }
    });
  }
}

module.exports = { registerPublicRoutes };
