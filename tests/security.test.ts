import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createArchiveCapacityGuard } from '../src/server/archiveProtection.js';
import { parseTrustProxyHops } from '../src/server/config.js';

class GuardResponse extends EventEmitter {
  statusCode = 200;
  headers = new Map<string, string>();
  body: unknown;
  timeoutCallback: (() => void) | null = null;

  set(name: string, value: string) {
    this.headers.set(name.toLowerCase(), value);
    return this;
  }

  status(statusCode: number) {
    this.statusCode = statusCode;
    return this;
  }

  json(body: unknown) {
    this.body = body;
    return this;
  }

  setTimeout(_timeoutMs: number, callback: () => void) {
    this.timeoutCallback = callback;
    return this;
  }

  destroy() {
    this.emit('close');
    return this;
  }
}

test('disables proxy trust by default and validates configured hop counts', () => {
  assert.equal(parseTrustProxyHops(undefined), 0);
  assert.equal(parseTrustProxyHops('0'), 0);
  assert.equal(parseTrustProxyHops('1'), 1);
  assert.equal(parseTrustProxyHops('10'), 10);
  for (const invalid of ['', '-1', '1.5', '11', 'true', ' 1']) {
    assert.throws(() => parseTrustProxyHops(invalid), /BLOG_TRUST_PROXY_HOPS/);
  }
});

test('limits concurrent archive downloads and releases finished slots', () => {
  const guard = createArchiveCapacityGuard({ limit: 1, timeoutMs: 1000 });
  const first = new GuardResponse();
  let firstAccepted = false;
  guard({} as never, first as never, () => { firstAccepted = true; });
  assert.equal(firstAccepted, true);
  assert.ok(first.timeoutCallback);

  const rejected = new GuardResponse();
  let rejectedAccepted = false;
  guard({} as never, rejected as never, () => { rejectedAccepted = true; });
  assert.equal(rejectedAccepted, false);
  assert.equal(rejected.statusCode, 503);
  assert.equal(rejected.headers.get('retry-after'), '30');

  first.emit('finish');
  first.emit('close');
  const next = new GuardResponse();
  let nextAccepted = false;
  guard({} as never, next as never, () => { nextAccepted = true; });
  assert.equal(nextAccepted, true);
  next.timeoutCallback?.();
});
