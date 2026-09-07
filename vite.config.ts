import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectSrc = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'src');

// 本地联调：通过 VITE_PROXY_TARGET 指向本地/远程后端（默认仍是线上测试服，避免改动默认行为）
const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://192.6.121.16:7776';

// https://vite.dev/config/
export default defineConfig({
  build: {
    sourcemap: false,
  },
  resolve: {
    alias: {
      '@/': projectSrc + '/',
    },
  },
  server: {
    port: 5177,
    strictPort: true,
    proxy: { '/api': { target: proxyTarget, changeOrigin: true }, '/uploads': { target: proxyTarget, changeOrigin: true } },
  },
  plugins: [
    react({
      babel: {
        plugins: [
          'react-dev-locator',
        ],
      },
    }),
    tsconfigPaths()
  ],
})
