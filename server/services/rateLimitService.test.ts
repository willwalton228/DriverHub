import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { _checkSlidingWindow as checkSlidingWindow, _isSuspiciousUserAgent as isSuspiciousUserAgent, _store as store, logAbuseEvent, isCaptchaEnabled, setCaptchaEnabled } from './rateLimitService';
import { db } from '../db';
import { abuseEvents } from '../../shared/schema';
import { desc, eq, sql, ilike } from 'drizzle-orm';

const TEST_PREFIX = `__TEST_RL_${Date.now()}`;

afterAll(async () => {
  try {
    await db.delete(abuseEvents).where(ilike(abuseEvents.reason, `%${TEST_PREFIX}%`));
  } catch {}
});

describe('Sliding Window Rate Limiter', () => {
  beforeEach(() => {
    store.clear();
  });

  it('should allow requests within the limit', () => {
    const key = `${TEST_PREFIX}:test1`;
    for (let i = 0; i < 5; i++) {
      const result = checkSlidingWindow(key, 5, 60_000);
      expect(result.allowed).toBe(true);
    }
  });

  it('should block requests exceeding the limit', () => {
    const key = `${TEST_PREFIX}:test2`;
    for (let i = 0; i < 5; i++) {
      checkSlidingWindow(key, 5, 60_000);
    }
    const result = checkSlidingWindow(key, 5, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('should return correct remaining count', () => {
    const key = `${TEST_PREFIX}:test3`;
    const r1 = checkSlidingWindow(key, 3, 60_000);
    expect(r1.remaining).toBe(2);

    const r2 = checkSlidingWindow(key, 3, 60_000);
    expect(r2.remaining).toBe(1);

    const r3 = checkSlidingWindow(key, 3, 60_000);
    expect(r3.remaining).toBe(0);
  });

  it('should reset after window expires', () => {
    const key = `${TEST_PREFIX}:test4`;
    const entry = { timestamps: [Date.now() - 120_000, Date.now() - 110_000] };
    store.set(key, entry);

    const result = checkSlidingWindow(key, 2, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it('should isolate different keys', () => {
    const key1 = `${TEST_PREFIX}:ip1`;
    const key2 = `${TEST_PREFIX}:ip2`;

    for (let i = 0; i < 3; i++) {
      checkSlidingWindow(key1, 3, 60_000);
    }

    const result1 = checkSlidingWindow(key1, 3, 60_000);
    expect(result1.allowed).toBe(false);

    const result2 = checkSlidingWindow(key2, 3, 60_000);
    expect(result2.allowed).toBe(true);
  });

  it('should handle high concurrency keys independently', () => {
    const keys = Array.from({ length: 100 }, (_, i) => `${TEST_PREFIX}:concurrent:${i}`);
    for (const key of keys) {
      const result = checkSlidingWindow(key, 1, 60_000);
      expect(result.allowed).toBe(true);
    }
    for (const key of keys) {
      const result = checkSlidingWindow(key, 1, 60_000);
      expect(result.allowed).toBe(false);
    }
  });
});

describe('User Agent Detection', () => {
  it('should flag missing user agent', () => {
    const result = isSuspiciousUserAgent(undefined);
    expect(result.suspicious).toBe(true);
    expect(result.reason).toContain('Missing');
  });

  it('should flag empty user agent', () => {
    const result = isSuspiciousUserAgent('');
    expect(result.suspicious).toBe(true);
  });

  it('should flag short user agent', () => {
    const result = isSuspiciousUserAgent('abc');
    expect(result.suspicious).toBe(true);
    expect(result.reason).toContain('short');
  });

  it('should flag bot user agents', () => {
    const bots = ['Googlebot/2.1', 'python-requests/2.28', 'curl/7.68.0 libcurl', 'Scrapy/2.5 (+https://scrapy.org)', 'wget/1.21 (linux-gnu)'];
    for (const ua of bots) {
      const result = isSuspiciousUserAgent(ua);
      expect(result.suspicious).toBe(true);
    }
  });

  it('should allow legitimate browser user agents', () => {
    const browsers = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
      'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
    ];
    for (const ua of browsers) {
      const result = isSuspiciousUserAgent(ua);
      expect(result.suspicious).toBe(false);
    }
  });

  it('should flag non-browser user agents', () => {
    const result = isSuspiciousUserAgent('MyCustomApp/1.0');
    expect(result.suspicious).toBe(true);
    expect(result.reason).toContain('Non-browser');
  });
});

describe('Abuse Event Logging', () => {
  it('should log an abuse event to the database', async () => {
    const reason = `${TEST_PREFIX}_test_rate_limit_log`;
    await logAbuseEvent({
      type: 'RATE_LIMIT',
      severity: 'MEDIUM',
      ip: '192.168.1.1',
      userAgent: 'test-agent',
      route: '/api/public/test',
      method: 'POST',
      reason,
    });

    const [event] = await db.select()
      .from(abuseEvents)
      .where(eq(abuseEvents.reason, reason))
      .limit(1);

    expect(event).toBeDefined();
    expect(event.type).toBe('RATE_LIMIT');
    expect(event.severity).toBe('MEDIUM');
    expect(event.ip).toBe('192.168.1.1');
    expect(event.route).toBe('/api/public/test');
  });

  it('should log a token guess event', async () => {
    const reason = `${TEST_PREFIX}_test_token_guess`;
    await logAbuseEvent({
      type: 'TOKEN_GUESS',
      severity: 'HIGH',
      ip: '10.0.0.5',
      route: '/api/portal/candidate/fake-token',
      method: 'GET',
      reason,
      metadata: { attempts: 15 },
    });

    const [event] = await db.select()
      .from(abuseEvents)
      .where(eq(abuseEvents.reason, reason))
      .limit(1);

    expect(event).toBeDefined();
    expect(event.type).toBe('TOKEN_GUESS');
    expect(event.severity).toBe('HIGH');
    expect((event.metadata as any)?.attempts).toBe(15);
  });

  it('should log a one-time token reuse event', async () => {
    const reason = `${TEST_PREFIX}_test_ot_reuse`;
    await logAbuseEvent({
      type: 'ONE_TIME_TOKEN_REUSE',
      severity: 'HIGH',
      ip: '172.16.0.1',
      tokenHash: 'abc123hash',
      route: '/api/portal/candidate/some-token',
      method: 'GET',
      reason,
    });

    const [event] = await db.select()
      .from(abuseEvents)
      .where(eq(abuseEvents.reason, reason))
      .limit(1);

    expect(event).toBeDefined();
    expect(event.type).toBe('ONE_TIME_TOKEN_REUSE');
    expect(event.tokenHash).toBe('abc123hash');
  });
});

describe('CAPTCHA Configuration Hook', () => {
  it('should default to disabled', () => {
    expect(isCaptchaEnabled()).toBe(false);
  });

  it('should toggle captcha flag', () => {
    setCaptchaEnabled(true);
    expect(isCaptchaEnabled()).toBe(true);
    setCaptchaEnabled(false);
    expect(isCaptchaEnabled()).toBe(false);
  });
});
