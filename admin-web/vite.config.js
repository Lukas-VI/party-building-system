import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const devPort = Number(process.env.PORT || 5173);
const previewPort = Number(process.env.PREVIEW_PORT || 4173);
const allowedHosts = ['havensky.cn', 'www.havensky.cn', '192.168.31.135', 'localhost', '127.0.0.1'];

export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/' : '/admin/',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: devPort,
    allowedHosts,
    proxy: {
      '/api': {
        target: 'http://192.168.31.135:3000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://192.168.31.135:3000',
        changeOrigin: true,
      },
      '/DJ_api': {
        target: 'https://havensky.cn',
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
}));
