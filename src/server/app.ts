import express, { type ErrorRequestHandler } from 'express';
import compression from 'compression';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { config } from './config.js';
import { serveGalleryMedia, serveMarkdownMedia, serveMedia } from './media.js';
import { accountDownload } from './traffic.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { publicRouter } from './routes/public.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxyHops);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  }));
  app.use(compression({ threshold: 1024 }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/media/gallery/:id/:filename', accountDownload, (req, res, next) => {
    void serveGalleryMedia(req, res).catch(next);
  });
  app.get('/media/markdown/{*path}', accountDownload, (req, res, next) => {
    void serveMarkdownMedia(req, res).catch(next);
  });
  app.get('/media/:filename', accountDownload, (req, res, next) => {
    void serveMedia(req, res).catch(next);
  });
  app.use('/api', publicRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);

  if (config.production) {
    app.use(express.static(config.clientDist, { index: false, maxAge: '1y', immutable: true }));
    app.get('/{*path}', (_req, res) => res.sendFile('index.html', { root: config.clientDist }));
  }

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ZodError) {
      res.status(400).json({ error: '输入内容无效', issues: error.issues.map((issue) => issue.message) });
      return;
    }
    const details = error as Error & { code?: string; status?: number };
    if (details.status && details.status >= 400 && details.status < 500) {
      res.status(details.status).json({ error: details.message });
      return;
    }
    const code = details.code;
    if (code === 'CONFLICT') {
      res.status(409).json({ error: (error as Error).message });
      return;
    }
    if (code === 'DUPLICATE_SLUG') {
      res.status(400).json({ error: (error as Error).message });
      return;
    }
    console.error(error);
    res.status(500).json({ error: config.production ? '服务器处理失败' : (error as Error).message });
  };
  app.use(errorHandler);

  return app;
}
