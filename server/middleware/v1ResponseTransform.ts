/**
 * DriverConnect API v1 — Response Transform Middleware
 *
 * Intercepts every res.json() call on v1 routes and applies the standard
 * DriverConnect contract envelope:
 *
 * Success:   { success: true,  data: T, meta: { requestId, timestamp, ...pagination? } }
 * Error:     { success: false, error: { code, message, details? }, meta: { requestId, timestamp } }
 * Paginated: meta also includes { page, pageSize, total, hasMore }
 *
 * Also:
 *  - Sets X-Request-Id response header
 *  - Stores requestId + timestamp on req for use in route handlers
 *  - Normalises old error shape { error: "CODE", message: "..." } to new shape
 *  - Renames meta.limit → meta.pageSize
 *  - Computes meta.hasMore from page/pageSize/total
 *  - Strips legacy meta.pages field
 */
import { Request, Response, NextFunction } from 'express';

// Extend Express Request with v1 context fields
declare global {
  namespace Express {
    interface Request {
      v1RequestId?: string;
      v1Timestamp?: string;
      v1TenantId?: string;
      v1IdempotencyKey?: string;
    }
  }
}

let _counter = 0;

function generateRequestId(): string {
  const ts = Date.now().toString(36);
  const seq = (++_counter % 9999).toString(36).padStart(3, '0');
  const rand = Math.random().toString(36).slice(2, 6);
  return `req_${ts}${seq}${rand}`;
}

export function v1ResponseTransform(req: Request, res: Response, next: NextFunction): void {
  const requestId = generateRequestId();
  const timestamp = new Date().toISOString();

  // Make context available to route handlers and downstream middleware
  req.v1RequestId = requestId;
  req.v1Timestamp = timestamp;

  // Propagate as a response header for client-side logging/debugging
  res.setHeader('X-Request-Id', requestId);

  const originalJson = res.json.bind(res) as (body?: unknown) => Response;

  // Monkey-patch res.json — all subsequent calls go through this transform
  res.json = function transformedJson(body?: unknown): Response {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return originalJson(body);
    }

    const b = body as Record<string, unknown>;

    // ── SUCCESS RESPONSE ─────────────────────────────────────────────────
    if (b['success'] === true) {
      const rawMeta = (b['meta'] || {}) as Record<string, unknown>;
      const meta: Record<string, unknown> = { ...rawMeta };

      // Rename limit → pageSize (backward compat with existing routes)
      if (meta['limit'] !== undefined) {
        meta['pageSize'] = meta['limit'];
        delete meta['limit'];
      }

      // Remove legacy pages field
      delete meta['pages'];

      // Compute hasMore when pagination info is present
      if (
        typeof meta['page'] === 'number' &&
        typeof meta['pageSize'] === 'number' &&
        typeof meta['total'] === 'number'
      ) {
        meta['hasMore'] = meta['page'] * (meta['pageSize'] as number) < (meta['total'] as number);
      }

      meta['requestId'] = requestId;
      meta['timestamp'] = timestamp;

      return originalJson({ ...b, meta });
    }

    // ── OLD ERROR FORMAT  { error: "CODE", message: "..." } ─────────────
    if (typeof b['error'] === 'string') {
      const errorObj: Record<string, unknown> = {
        code: b['error'],
        message: b['message'] ?? 'An error occurred.',
      };
      if (b['details']) errorObj['details'] = b['details'];
      if (b['required_scope']) errorObj['required_scope'] = b['required_scope'];
      if (b['retry_after_seconds']) errorObj['retry_after_seconds'] = b['retry_after_seconds'];

      return originalJson({
        success: false,
        error: errorObj,
        meta: { requestId, timestamp },
      });
    }

    // ── NEW ERROR FORMAT already  { success: false, error: {...} } ───────
    if (b['success'] === false && b['error'] && typeof b['error'] === 'object') {
      const existingMeta = (b['meta'] || {}) as Record<string, unknown>;
      return originalJson({
        ...b,
        meta: { ...existingMeta, requestId, timestamp },
      });
    }

    // ── UNKNOWN FORMAT — pass through ────────────────────────────────────
    return originalJson(body);
  } as typeof res.json;

  next();
}
