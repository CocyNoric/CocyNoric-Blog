import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';

export const archiveDownloadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '归档下载请求过多，请稍后再试' },
});

type ArchiveCapacityOptions = {
  limit?: number;
  timeoutMs?: number;
};

export function createArchiveCapacityGuard(options: ArchiveCapacityOptions = {}): RequestHandler {
  const limit = options.limit ?? 2;
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
  let active = 0;

  return (_req, res, next) => {
    if (active >= limit) {
      res.set('Retry-After', '30');
      res.status(503).json({ error: '归档下载繁忙，请稍后再试' });
      return;
    }

    active += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      active -= 1;
    };
    res.once('finish', release);
    res.once('close', release);
    res.setTimeout(timeoutMs, () => res.destroy());
    next();
  };
}

export const archiveCapacityGuard = createArchiveCapacityGuard();
