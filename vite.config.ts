import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendPort = Number.parseInt(process.env.BLOG_PORT ?? '3000', 10);
const configuredProxyHost = process.env.BLOG_PROXY_HOST ?? '127.0.0.1';
const backendHost = configuredProxyHost === '0.0.0.0' ? '127.0.0.1' : configuredProxyHost;
const devHost = process.env.BLOG_DEV_HOST ?? process.env.BLOG_HOST ?? '127.0.0.1';
const devPort = Number.parseInt(process.env.BLOG_DEV_PORT ?? '5173', 10);
const backendTarget = `http://${backendHost}:${backendPort}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: devHost,
    port: devPort,
    proxy: {
      '/api': backendTarget,
      '/media': backendTarget,
    },
  },
  ssr: {
    noExternal: ['@material/material-color-utilities'],
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
});
