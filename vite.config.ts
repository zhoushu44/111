import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectSrc = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'src');

// https://vite.dev/config/
export default defineConfig({
  build: {
    sourcemap: 'hidden',
  },
  resolve: {
    alias: {
      '@/': projectSrc + '/',
    },
  },
  server: {
    port: 5177,
    strictPort: true,
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true }, '/uploads': { target: 'http://localhost:3000', changeOrigin: true } },
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
