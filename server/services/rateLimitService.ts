import { db } from "../db";
import { abuseEvents } from "../../shared/schema";
import type { Request, Response, NextFunction } from "express";

interface SlidingWindowEntry {
  timestamps: number[];
}

const store = new Map<string, SlidingWindowEntry>();

const CLEANUP_INTERVAL_MS = 60_000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    const keys = Array.from(store.keys());
    for (const key of keys) {
      const entry = store.get(key);
      if (!entry) continue;
      entry.timestamps = entry.timestamps.filter((t: number) => now - t < 600_000);
      if (entry.timestamps.length === 0) store.delete(key);
    }
  }, CLEANUP_INTERVAL_MS);
  if (cleanupTimer.unref) cleanupTimer.unref();
}

startCleanup();

function checkSlidingWindow(key: string, limit: number, windowMs: number): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  entry.timestamps = entry.timestamps.filter(t => now - t < windowMs);

  if (entry.timestamps.length >= limit) {
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = windowMs - (now - oldestInWindow);
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(retryAfterMs, 1000) };
  }

  entry.timestamps.push(now);
  return { allowed: true, remaining: limit - entry.timestamps.length, retryAfterMs: 0 };
}

const BOT_UA_PATTERNS = [
  /bot\b/i,
  /crawler/i,
  /spider/i,
  /scraper/i,
  /curl\b/i,
  /wget\b/i,
  /python-requests/i,
  /go-http-client/i,
  /httpie/i,
  /postman/i,
  /insomnia/i,
  /node-fetch/i,
  /axios/i,
  /java\/\d/i,
  /libwww/i,
  /mechanize/i,
  /phantomjs/i,
  /headless/i,
  /selenium/i,
  /puppeteer/i,
];

const ALLOWED_UA_PATTERNS = [
  /mozilla/i,
  /chrome/i,
  /safari/i,
  /firefox/i,
  /edge/i,
  /opera/i,
];

function isSuspiciousUserAgent(ua: string | undefined): { suspicious: boolean; reason?: string } {
  if (!ua || ua.trim().length === 0) {
    return { suspicious: true, reason: "Missing User-Agent header" };
  }

  if (ua.length < 10) {
    return { suspicious: true, reason: `Suspiciously short User-Agent: "${ua}"` };
  }

  for (const pattern of BOT_UA_PATTERNS) {
    if (pattern.test(ua)) {
      return { suspicious: true, reason: `Bot User-Agent detected: "${ua}"` };
    }
  }

  const hasLegitBrowser = ALLOWED_UA_PATTERNS.some(p => p.test(ua));
  if (!hasLegitBrowser) {
    return { suspicious: true, reason: `Non-browser User-Agent: "${ua}"` };
  }

  return { suspicious: false };
}

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
    return first.trim();
  }
  return req.socket?.remoteAddress || req.ip || "unknown";
}

export type AbuseEventType = "RATE_LIMIT" | "TOKEN_GUESS" | "BOT_UA" | "SUSPICIOUS_PATTERN" | "ONE_TIME_TOKEN_REUSE";
export type AbuseEventSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export async function logAbuseEvent(event: {
  type: AbuseEventType;
  severity: AbuseEventSeverity;
  ip?: string | null;
  userAgent?: string | null;
  route?: string | null;
  method?: string | null;
  tokenHash?: string | null;
  reason: string;
  metadata?: Record<string, any> | null;
}): Promise<void> {
  try {
    await db.insert(abuseEvents).values({
      type: event.type,
      severity: event.severity,
      ip: event.ip || null,
      userAgent: event.userAgent || null,
      route: event.route || null,
      method: event.method || null,
      tokenHash: event.tokenHash || null,
      reason: event.reason,
      metadata: event.metadata || null,
    });
  } catch (err) {
    console.error("[RateLimit] Failed to log abuse event:", err);
  }
}

let captchaEnabled = process.env.RATE_LIMIT_CAPTCHA_ENABLED === "true";

export function isCaptchaEnabled(): boolean {
  return captchaEnabled;
}

export function setCaptchaEnabled(enabled: boolean): void {
  captchaEnabled = enabled;
}

export interface RateLimitConfig {
  limit: number;
  windowMs: number;
  keyPrefix?: string;
  checkUserAgent?: boolean;
  blockBots?: boolean;
  message?: string;
  severity?: AbuseEventSeverity;
  skipInTest?: boolean;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  limit: 60,
  windowMs: 60_000,
  checkUserAgent: true,
  blockBots: true,
  message: "Too many requests. Please try again later.",
  severity: "MEDIUM",
  skipInTest: false,
};

export function createRateLimiter(config: Partial<RateLimitConfig> = {}) {
  const cfg: RateLimitConfig = { ...DEFAULT_CONFIG, ...config };

  return async (req: Request, res: Response, next: NextFunction) => {
    if (cfg.skipInTest && process.env.NODE_ENV === "test") {
      return next();
    }

    const ip = getClientIp(req);
    const ua = req.headers["user-agent"] as string | undefined;

    if (cfg.checkUserAgent && cfg.blockBots) {
      const uaCheck = isSuspiciousUserAgent(ua);
      if (uaCheck.suspicious) {
        await logAbuseEvent({
          type: "BOT_UA",
          severity: "LOW",
          ip,
          userAgent: ua || null,
          route: req.originalUrl,
          method: req.method,
          reason: uaCheck.reason || "Suspicious user agent",
        });
        return res.status(403).json({
          error: "FORBIDDEN",
          message: "Request blocked",
        });
      }
    }

    const prefix = cfg.keyPrefix || req.route?.path || req.originalUrl;
    const key = `${prefix}:${ip}`;

    const result = checkSlidingWindow(key, cfg.limit, cfg.windowMs);

    res.setHeader("X-RateLimit-Limit", cfg.limit);
    res.setHeader("X-RateLimit-Remaining", result.remaining);
    res.setHeader("X-RateLimit-Reset", Math.ceil((Date.now() + cfg.windowMs) / 1000));

    if (!result.allowed) {
      res.setHeader("Retry-After", Math.ceil(result.retryAfterMs / 1000));

      await logAbuseEvent({
        type: "RATE_LIMIT",
        severity: cfg.severity || "MEDIUM",
        ip,
        userAgent: ua || null,
        route: req.originalUrl,
        method: req.method,
        reason: `Rate limit exceeded: ${cfg.limit} requests per ${cfg.windowMs / 1000}s`,
        metadata: { key, limit: cfg.limit, windowMs: cfg.windowMs },
      });

      return res.status(429).json({
        error: "RATE_LIMITED",
        message: cfg.message,
        retryAfterSeconds: Math.ceil(result.retryAfterMs / 1000),
        ...(captchaEnabled ? { captchaRequired: true } : {}),
      });
    }

    next();
  };
}

const tokenGuessStore = new Map<string, { count: number; windowStart: number }>();

export function createTokenThrottler(config: { maxAttempts?: number; windowMs?: number } = {}) {
  const maxAttempts = config.maxAttempts || 10;
  const windowMs = config.windowMs || 300_000;

  return async (req: Request, res: Response, next: NextFunction) => {
    const ip = getClientIp(req);
    const now = Date.now();
    const key = `token-guess:${ip}`;

    let entry = tokenGuessStore.get(key);
    if (!entry || now - entry.windowStart > windowMs) {
      entry = { count: 0, windowStart: now };
      tokenGuessStore.set(key, entry);
    }

    entry.count++;

    if (entry.count > maxAttempts) {
      await logAbuseEvent({
        type: "TOKEN_GUESS",
        severity: "HIGH",
        ip,
        userAgent: req.headers["user-agent"] || null,
        route: req.originalUrl,
        method: req.method,
        reason: `Excessive token lookup attempts: ${entry.count} in ${windowMs / 1000}s window`,
        metadata: { attempts: entry.count, maxAttempts, windowMs },
      });

      return res.status(429).json({
        error: "RATE_LIMITED",
        message: "Too many attempts. Please try again later.",
        retryAfterSeconds: Math.ceil((windowMs - (now - entry.windowStart)) / 1000),
      });
    }

    next();
  };
}

export const PUBLIC_RATE_LIMITS = {
  jobFeed: createRateLimiter({
    limit: 30,
    windowMs: 60_000,
    keyPrefix: "public:job-feed",
    severity: "LOW",
  }),

  jobDetail: createRateLimiter({
    limit: 60,
    windowMs: 60_000,
    keyPrefix: "public:job-detail",
    severity: "LOW",
  }),

  jobApply: createRateLimiter({
    limit: 5,
    windowMs: 300_000,
    keyPrefix: "public:job-apply",
    severity: "HIGH",
  }),

  invoicePortal: createRateLimiter({
    limit: 30,
    windowMs: 60_000,
    keyPrefix: "public:invoice-portal",
    severity: "MEDIUM",
  }),

  candidatePortal: createRateLimiter({
    limit: 20,
    windowMs: 60_000,
    keyPrefix: "portal:candidate",
    severity: "MEDIUM",
  }),

  candidateDocUpload: createRateLimiter({
    limit: 10,
    windowMs: 300_000,
    keyPrefix: "portal:candidate-upload",
    severity: "HIGH",
  }),
};

export const TOKEN_THROTTLE = createTokenThrottler({
  maxAttempts: 10,
  windowMs: 300_000,
});

export { checkSlidingWindow as _checkSlidingWindow, isSuspiciousUserAgent as _isSuspiciousUserAgent, getClientIp as _getClientIp, store as _store };
