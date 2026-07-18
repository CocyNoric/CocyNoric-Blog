import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { loginSchema } from '../../shared/schemas.js';
import { clearSessionCookie, createSession, destroySession, readSession, requireAuth, requireWriteProtection, setSessionCookie, verifyPassword } from '../auth.js';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '尝试次数过多，请稍后再试' },
});

authRouter.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    if (!(await verifyPassword(input.password))) {
      res.status(401).json({ error: '密码错误' });
      return;
    }
    const { token, session } = await createSession();
    setSessionCookie(res, token);
    res.json({ authenticated: true, csrfToken: session.csrfToken });
  } catch (error) {
    next(error);
  }
});

authRouter.get('/me', async (req, res) => {
  const current = await readSession(req);
  if (!current) {
    res.json({ authenticated: false });
    return;
  }
  res.json({ authenticated: true, csrfToken: current.session.csrfToken });
});

authRouter.post('/logout', requireAuth, requireWriteProtection, async (req, res, next) => {
  try {
    await destroySession(req);
    clearSessionCookie(res);
    res.json({ authenticated: false });
  } catch (error) {
    next(error);
  }
});
