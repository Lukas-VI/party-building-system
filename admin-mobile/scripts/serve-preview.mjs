import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PREVIEW_PORT || 1919);
const basePath = '/wx-app';
const distDir = resolve(process.cwd(), 'dist');
const indexHtml = readFileSync(join(distDir, 'index.html'));

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

function sendIndex(res) {
  res.writeHead(200, { 'Content-Type': mimeTypes['.html'] });
  res.end(indexHtml);
}

function sendFile(res, filePath) {
  const ext = extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': mimeTypes[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  createReadStream(filePath).pipe(res);
}

function resolveAsset(requestPath) {
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
  if (!requestPath.startsWith(basePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }
  if (requestPath === basePath || requestPath === `${basePath}/`) {
    sendIndex(res);
    return;
  }
  const assetPath = resolveAsset(requestPath);
  if (assetPath) {
    sendFile(res, assetPath);
    return;
  }
  sendIndex(res);
}).listen(port, host, () => {
  console.log(`wechat workbench preview server listening at http://${host}:${port}${basePath}/`);
});
