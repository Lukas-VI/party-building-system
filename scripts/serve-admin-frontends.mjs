import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

/**
 * 前端统一网关。
 *
 * 设计目标：
 * - PC 后台继续挂在 /web-admin/desktop/
 * - 服务号网页 App 挂在 /wx-app/
 * - 统一由同一个 1919 入口对外暴露，便于 frp 和反代维护
 *
 * 当前这是项目自定义胶水层，不属于框架脚手架。
 * 变更路径规则时，应同步更新部署文档和移动/桌面端配置。
 */
const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PREVIEW_PORT || 1919);

const mounts = [
  { basePath: '/web-admin/desktop', distDir: resolve(process.cwd(), 'admin-web', 'dist') },
  { basePath: '/wx-app', distDir: resolve(process.cwd(), 'admin-mobile', 'dist') },
];

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function findMount(requestPath) {
  return mounts.find((mount) => requestPath === mount.basePath || requestPath.startsWith(`${mount.basePath}/`));
}

function isMobileDevice(userAgent = '') {
  return /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(userAgent);
}

function sendFile(res, filePath) {
  const ext = extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': mimeTypes[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  createReadStream(filePath).pipe(res);
}

function resolveAsset(distDir, basePath, requestPath) {
  const relativePath = requestPath.slice(basePath.length).replace(/^\/+/, '');
  const filePath = normalize(join(distDir, relativePath));
  if (!filePath.startsWith(distDir)) return null;
  if (!existsSync(filePath)) return null;
  if (!statSync(filePath).isFile()) return null;
  return filePath;
}

createServer((req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const requestPath = requestUrl.pathname;

  if (requestPath === '/web-admin' || requestPath === '/web-admin/') {
    const target = isMobileDevice(req.headers['user-agent'] || '') ? '/wx-app/' : '/web-admin/desktop/';
    res.writeHead(302, { Location: target });
    res.end();
    return;
  }

  if (requestPath === '/admin' || requestPath === '/admin/') {
    res.writeHead(302, { Location: '/web-admin/desktop/' });
    res.end();
    return;
  }

  if (requestPath === '/m-admin' || requestPath === '/m-admin/') {
    res.writeHead(302, { Location: '/wx-app/' });
    res.end();
    return;
  }

  if (requestPath === '/web-admin/mobile' || requestPath === '/web-admin/mobile/') {
    res.writeHead(302, { Location: '/wx-app/' });
    res.end();
    return;
  }

  const mount = findMount(requestPath);

  if (!mount) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }

  const indexPath = join(mount.distDir, 'index.html');
  if (!existsSync(indexPath)) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Build output missing for ${mount.basePath}`);
    return;
  }

  if (requestPath === mount.basePath || requestPath === `${mount.basePath}/`) {
    sendFile(res, indexPath);
    return;
  }

  const assetPath = resolveAsset(mount.distDir, mount.basePath, requestPath);
  if (assetPath) {
    sendFile(res, assetPath);
    return;
  }

  const html = readFileSync(indexPath);
  res.writeHead(200, { 'Content-Type': mimeTypes['.html'] });
  res.end(html);
}).listen(port, host, () => {
  console.log(`admin frontend gateway listening at http://${host}:${port}`);
  mounts.forEach((mount) => {
    console.log(` - ${mount.basePath}/ -> ${mount.distDir}`);
  });
});
