import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const mobilePath = env.VITE_MOBILE_PATH || '/wx-app/';
  const allowedHosts = (env.ALLOWED_HOSTS || 'havensky.cn,www.havensky.cn,localhost,127.0.0.1')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);

  return {
    base: mobilePath,
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
  };
});
