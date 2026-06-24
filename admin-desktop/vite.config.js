import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const devPort = Number(process.env.PORT || 5173);
  const previewPort = Number(process.env.PREVIEW_PORT || 4173);
  const desktopPath = env.VITE_DESKTOP_PATH || '/admin-desktop/';
  const allowedHosts = (env.ALLOWED_HOSTS || 'havensky.cn,www.havensky.cn,192.168.31.135,localhost,127.0.0.1')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  const apiProxyTarget = env.API_PROXY_TARGET || 'http://192.168.31.135:3000';
  const djApiProxyTarget = env.DJ_API_PROXY_TARGET || 'https://havensky.cn';

  return {
    base: command === 'serve' ? '/' : desktopPath,
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: devPort,
      allowedHosts,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
        '/uploads': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
        '/DJ-api': {
          target: djApiProxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    preview: {
      host: '0.0.0.0',
      port: previewPort,
      allowedHosts,
    },
  };
});
