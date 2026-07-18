import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { readdir, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { NextFunction, Request, Response } from 'express';
import { parseCookie, stringifySetCookie } from 'cookie';
import { config } from './config.js';
import { dataStore } from './dataStore.js';

const scrypt = promisify(scryptCallback);
const cookieName = 'blog_session';

type AdminRecord = { salt: string; hash: string };
type SessionRecord = { csrfToken: string; createdAt: string; expiresAt: string };

export async function hashPassword(password: string): Promise<AdminRecord> {
  const salt = randomBytes(16);
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}

export async function saveAdminPassword(password: string) {
  if (password.length < 12) throw new Error('密码至少需要 12 个字符');
  await dataStore.atomicWrite(dataStore.paths.admin, `${JSON.stringify(await hashPassword(password), null, 2)}\n`);
}

export async function verifyPassword(password: string) {
  try {
    const record = JSON.parse(await readFile(dataStore.paths.admin, 'utf8')) as AdminRecord;
    const expected = Buffer.from(record.hash, 'hex');
    const actual = (await scrypt(password, Buffer.from(record.salt, 'hex'), expected.length)) as Buffer;
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function sessionPath(token: string) {
  return path.join(dataStore.paths.sessions, `${createHash('sha256').update(token).digest('hex')}.json`);
}

export async function createSession() {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  const session: SessionRecord = {
    csrfToken: randomBytes(24).toString('base64url'),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + config.sessionHours * 60 * 60 * 1000).toISOString(),
  };
  await dataStore.atomicWrite(sessionPath(token), JSON.stringify(session));
  return { token, session };
}

export async function readSession(req: Request) {
  const token = parseCookie(req.headers.cookie ?? '')[cookieName];
  if (!token) return null;
  try {
    const session = JSON.parse(await readFile(sessionPath(token), 'utf8')) as SessionRecord;
    if (Date.parse(session.expiresAt) <= Date.now()) {
      await unlink(sessionPath(token)).catch(() => undefined);
      return null;
    }
    return { token, session };
  } catch {
    return null;
  }
}

export function setSessionCookie(res: Response, token: string) {
  res.appendHeader('Set-Cookie', stringifySetCookie({
    name: cookieName,
    value: token,
    httpOnly: true,
    sameSite: 'strict',
    secure: config.secureCookie,
    path: '/',
    maxAge: config.sessionHours * 60 * 60,
  }));
}

export function clearSessionCookie(res: Response) {
  res.appendHeader('Set-Cookie', stringifySetCookie({
    name: cookieName,
    value: '',
    httpOnly: true,
    sameSite: 'strict',
    secure: config.secureCookie,
    path: '/',
    maxAge: 0,
  }));
}

export async function destroySession(req: Request) {
  const current = await readSession(req);
  if (current) await unlink(sessionPath(current.token)).catch(() => undefined);
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const current = await readSession(req);
  if (!current) {
    res.status(401).json({ error: '请先登录' });
    return;
  }
  res.locals.session = current.session;
  next();
}

function isAllowedOrigin(req: Request, origin: string | undefined) {
  if (!origin || config.publicOrigins.has(origin)) return true;
  const host = req.get('host');
  return Boolean(host && origin === `${req.protocol}://${host}`);
}

export function requireWriteProtection(req: Request, res: Response, next: NextFunction) {
  const session = res.locals.session as SessionRecord | undefined;
  const csrf = req.headers['x-csrf-token'];
  if (!session || !isAllowedOrigin(req, req.headers.origin) || csrf !== session.csrfToken) {
    res.status(403).json({ error: '请求验证失败，请刷新后重试' });
    return;
  }
  next();
}

export async function cleanExpiredSessions() {
  const names = await readdir(dataStore.paths.sessions);
  await Promise.all(names.filter((name) => name.endsWith('.json')).map(async (name) => {
    const file = path.join(dataStore.paths.sessions, name);
    try {
      const session = JSON.parse(await readFile(file, 'utf8')) as SessionRecord;
      if (Date.parse(session.expiresAt) <= Date.now()) await unlink(file);
    } catch {
      await unlink(file).catch(() => undefined);
    }
  }));
}
