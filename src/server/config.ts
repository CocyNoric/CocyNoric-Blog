import path from 'node:path';

const projectRoot = process.cwd();
const production = process.env.NODE_ENV === 'production';

const publicOrigins = (process.env.BLOG_PUBLIC_ORIGINS ?? process.env.BLOG_PUBLIC_ORIGIN ?? `http://127.0.0.1:${production ? '3000' : '5173'}`)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
if (!production) publicOrigins.push('http://localhost:5173');

const host = process.env.BLOG_HOST ?? (production ? '0.0.0.0' : '127.0.0.1');

if (host !== '127.0.0.1' && host !== '0.0.0.0') {
  throw new Error('BLOG_HOST 只能是 127.0.0.1 或 0.0.0.0');
}

export const config = {
  port: Number.parseInt(process.env.BLOG_PORT ?? '3000', 10),
  host,
  dataDir: path.resolve(process.env.BLOG_DATA_DIR ?? path.join(projectRoot, 'data')),
  publicOrigins: new Set(publicOrigins),
  secureCookie: process.env.BLOG_COOKIE_SECURE === undefined
    ? production
    : process.env.BLOG_COOKIE_SECURE === 'true',
  production,
  clientDist: path.join(projectRoot, 'dist', 'client'),
  sessionHours: 8,
  uploadLimit: 20 * 1024 * 1024,
  galleryUploadLimit: 25 * 1024 * 1024,
  compressionThreshold: 5 * 1024 * 1024,
};

if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
  throw new Error('BLOG_PORT 必须是有效端口号');
}
