import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const allowedHosts = ['havensky.cn', 'www.havensky.cn', 'localhost', '127.0.0.1'];

export default defineConfig({
  base: '/web-admin/mobile/',
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 1919,
    allowedHosts,
  },
  preview: {
    host: '0.0.0.0',
    port: 1919,
    allowedHosts,
  },
});
