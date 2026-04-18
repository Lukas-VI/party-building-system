import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const devPort = Number(process.env.PORT || 5173);

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: devPort,
    proxy: {
      '/api': {
        target: 'http://192.168.31.135:3000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://192.168.31.135:3000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: Number(process.env.PREVIEW_PORT || 4173),
  },
});
