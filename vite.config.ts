import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const projectRoot = process.cwd();
const runtimeDataDir = path.resolve(process.env.BLOG_DATA_DIR ?? path.join(projectRoot, 'data'));

function isRuntimeDataPath(filePath: string) {
  const relativePath = path.relative(runtimeDataDir, path.resolve(filePath));
  return relativePath === '' || (
    relativePath !== '..'
    && !relativePath.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relativePath)
  );
}

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
    watch: {
      ignored: isRuntimeDataPath,
    },
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
