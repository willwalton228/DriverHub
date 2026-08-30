/**
 * DriverConnect Integration API v1 — Per-Key Rate Limiter
 *
 * Sliding window rate limiter keyed by API key ID.
 * Default: 600 requests / minute per key.
 * Responses include standard rate-limit headers.
 */
import { Request, Response, NextFunction } from 'express';

interface WindowEntry {
  timestamps: number[];
  blocked: boolean;
}

const windows = new Map<string, WindowEntry>();
const DEFAULT_LIMIT = 600;
const WINDOW_MS = 60_000; // 1 minute

// Purge stale entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [key, entry] of windows.entries()) {
    entry.timestamps = entry.timestamps.filter(t => t > cutoff);
    if (entry.timestamps.length === 0) windows.delete(key);
  }
}, 5 * 60_000);

/**
 * Factory that returns a rate-limit middleware with a configurable limit.
 */
export function v1RateLimit(limit = DEFAULT_LIMIT) {
  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    const ctx = req.v1ApiKey;
    if (!ctx) return next(); // No API key context → skip (handled by auth middleware)

    const key = ctx.apiKeyId;
    const now = Date.now();
    const windowStart = now - WINDOW_MS;

    let entry = windows.get(key);
    if (!entry) {
      entry = { timestamps: [], blocked: false };
      windows.set(key, entry);
    }

    // Slide the window
    entry.timestamps = entry.timestamps.filter(t => t > windowStart);

    const count = entry.timestamps.length;
    const remaining = Math.max(0, limit - count);
    const resetAt = entry.timestamps[0] ? Math.ceil((entry.timestamps[0] + WINDOW_MS) / 1000) : Math.ceil((now + WINDOW_MS) / 1000);

    // Set standard headers on all responses
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining - 1));
    res.setHeader('X-RateLimit-Reset', resetAt);
    res.setHeader('X-RateLimit-Policy', `${limit};w=${WINDOW_MS / 1000}`);

    if (count >= limit) {
      res.setHeader('Retry-After', Math.ceil((entry.timestamps[0] + WINDOW_MS - now) / 1000));
      return res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit of ${limit} requests per minute exceeded. Retry after the window resets.`,
        meta: {
          limit,
          window_seconds: WINDOW_MS / 1000,
          retry_after_seconds: Math.ceil((entry.timestamps[0] + WINDOW_MS - now) / 1000),
        },
      });
    }

    entry.timestamps.push(now);
    next();
  };
}

/**
 * Returns current rate-limit stats for a given API key ID (for admin use).
 */
export function getRateLimitStats(apiKeyId: string, limit = DEFAULT_LIMIT) {
  const entry = windows.get(apiKeyId);
  if (!entry) return { used: 0, remaining: limit, resetAt: null };
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const active = entry.timestamps.filter(t => t > windowStart);
  const resetAt = active[0] ? new Date(active[0] + WINDOW_MS).toISOString() : null;
  return { used: active.length, remaining: Math.max(0, limit - active.length), resetAt };
}
