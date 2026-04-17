import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
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
});
