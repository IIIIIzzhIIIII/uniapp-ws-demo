import { defineConfig } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';

const MOCK = 'http://127.0.0.1:3100';

export default defineConfig({
  plugins: [uni()],
  server: {
    port: 5180,
    host: '127.0.0.1',
    proxy: {
      '/mds2': { target: MOCK, changeOrigin: true, ws: true },
      '/api': { target: MOCK, changeOrigin: true },
      '/chat_list': { target: MOCK, changeOrigin: true },
      '/messages': { target: MOCK, changeOrigin: true },
    },
  },
});
